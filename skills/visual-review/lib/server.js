'use strict';
// Local review server: serves review pages with the comment overlay injected,
// queues browser feedback, and hands it to `review.js wait` exactly once.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createStore } = require('./store');
const { idFor } = require('./ids');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};
const ASSETS = new Set(['base.css', 'overlay.js']);
// Page assets that may be served from the review folder. No .html/.json/.txt: a review folder can be
// a big directory (even the home folder), and other pages would run on this origin.
const SERVABLE = new Set(['.css', '.js', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff2']);
const fold = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
const MAX_BODY = 1_000_000;

const httpError = (code, message) => Object.assign(new Error(message), { code });

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size <= MAX_BODY) chunks.push(c);
    });
    req.on('end', () => {
      if (size > MAX_BODY) return reject(httpError(413, 'feedback is too large (over 1 MB)'));
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(httpError(400, 'invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, code, body) {
  res.writeHead(code, { 'content-type': MIME['.json'], 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function sendFile(res, file) {
  fs.readFile(file, (err, buf) => {
    if (err) return sendJson(res, 404, { status: 'error', message: 'not found' });
    res.writeHead(200, {
      'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(buf);
  });
}

function injectOverlay(html, id) {
  const tag = `<script src="/_vr/overlay.js" data-vr-id="${id}" defer></script>`;
  // Search the original string: lower-casing can change its length ('İ' becomes two characters).
  let i = -1;
  for (const m of html.matchAll(/<\/body\s*>/gi)) i = m.index;
  return i === -1 ? html + tag : html.slice(0, i) + tag + html.slice(i);
}

function cleanText(value, max) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text.slice(0, max) : null;
}

function cleanNotes(notes) {
  if (!Array.isArray(notes)) return [];
  return notes
    .map((n) => ({
      section: cleanText(n && n.section, 200),
      quote: cleanText(n && n.quote, 1000),
      note: cleanText(n && n.note, 5000),
    }))
    .filter((n) => n.note);
}

function createServer({ port = 4390, stateDir, assetsDir, idleMs = 30 * 60 * 1000, emptyGraceMs = 3000, onIdle = () => {} }) {
  const store = createStore(stateDir);
  const sessions = new Map();
  let actualPort = port;
  let emptyTimer = null;
  let lastActive = Date.now();

  const statusOf = (s) => (s.ended ? 'ended' : s.waiter ? 'listening' : 'working');

  function persist() {
    const data = {};
    for (const s of sessions.values()) data[s.id] = { file: s.file, pending: s.pending, ended: s.ended, approved: s.approved, replies: s.replies };
    store.save(data);
  }

  function broadcast(s, event, data) {
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of s.clients) res.write(frame);
  }
  const pushStatus = (s) => broadcast(s, 'status', { status: statusOf(s) });

  // Watch the folder, not the file: editors and agents often save by delete-and-recreate.
  function watchFile(s) {
    const base = path.basename(s.file).toLowerCase();
    try {
      const watcher = fs.watch(s.dir, (_event, name) => {
        if (name && name.toString().toLowerCase() !== base) return;
        clearTimeout(s.reloadTimer);
        s.reloadTimer = setTimeout(() => broadcast(s, 'reload', {}), 150);
      });
      watcher.on('error', () => {});
      return watcher;
    } catch {
      return null;
    }
  }

  function addSession(file, saved = {}) {
    const s = {
      id: idFor(file),
      file,
      dir: path.dirname(file),
      pending: saved.pending || [],
      ended: !!saved.ended,
      approved: !!saved.approved,
      replies: saved.replies || [],
      waiter: null,
      clients: new Set(),
      watcher: null,
      reloadTimer: null,
    };
    s.watcher = watchFile(s);
    sessions.set(s.id, s);
    return s;
  }

  function removeSession(s) {
    if (s.watcher) s.watcher.close();
    clearTimeout(s.reloadTimer);
    for (const res of s.clients) res.end();
    sessions.delete(s.id);
    persist();
    clearTimeout(emptyTimer);
    if (sessions.size === 0) {
      emptyTimer = setTimeout(() => sessions.size === 0 && onIdle(), emptyGraceMs);
      emptyTimer.unref();
    }
  }

  // Hand queued notes (or the end of the review) to the waiting `review.js wait`, exactly once.
  function deliver(s) {
    if (!s.waiter || (!s.pending.length && !s.ended)) return;
    const res = s.waiter;
    s.waiter = null;
    const body = s.pending.length
      ? { status: 'feedback', notes: s.pending, ...(s.ended ? { ended: true } : {}) }
      : { status: s.approved ? 'approved' : 'ended' };
    s.pending = [];
    sendJson(res, 200, body);
    pushStatus(s);
    if (s.ended) removeSession(s);
    else persist();
  }

  const idleTimer = setInterval(() => {
    const busy = [...sessions.values()].some((s) => s.waiter || s.clients.size);
    if (busy) lastActive = Date.now();
    else if (Date.now() - lastActive >= idleMs) onIdle();
  }, Math.min(60000, idleMs));
  idleTimer.unref();

  const allowed = (hostPort) => hostPort === `127.0.0.1:${actualPort}` || hostPort === `localhost:${actualPort}`;

  function session(id) {
    const s = sessions.get(id);
    if (!s) throw httpError(404, 'no open review for this file - run `review.js open` first');
    return s;
  }

  function servePage(s, rawRel, res) {
    let rel;
    try {
      rel = decodeURIComponent(rawRel);
    } catch {
      throw httpError(400, 'bad path');
    }
    if (rel.includes('\0')) throw httpError(400, 'bad path');
    const target = path.resolve(s.dir, rel);
    const root = s.dir.endsWith(path.sep) ? s.dir : s.dir + path.sep;
    const isPage = fold(target) === fold(s.file);
    if (!isPage) {
      if (!fold(target).startsWith(fold(root))) throw httpError(403, 'outside the review folder');
      if (rel.split(/[\\/]/).some((seg) => seg.startsWith('.'))) throw httpError(403, 'hidden files are not served');
      if (!SERVABLE.has(path.extname(target).toLowerCase())) throw httpError(403, 'only page assets (css, js, images, fonts) are served');
      return sendFile(res, target);
    }
    fs.readFile(s.file, 'utf8', (err, html) => {
      if (err) return sendJson(res, 404, { status: 'error', message: 'review page is missing' });
      res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' });
      res.end(injectOverlay(html, s.id));
    });
  }

  async function handle(req, res) {
    if (!allowed(req.headers.host)) return sendJson(res, 403, { status: 'error', message: 'forbidden host' });
    const origin = req.headers.origin;
    if (origin && !allowed(origin.replace(/^http:\/\//, ''))) {
      return sendJson(res, 403, { status: 'error', message: 'forbidden origin' });
    }
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    // Tags like <img src> send no Origin, so also trust the browser's own verdict where it gives one.
    const site = req.headers['sec-fetch-site'];
    if ((p.startsWith('/_vr/api/') || p === '/_vr/events') && site && site !== 'same-origin' && site !== 'none') {
      return sendJson(res, 403, { status: 'error', message: 'forbidden origin' });
    }
    const id = url.searchParams.get('id');
    const route = `${req.method} ${p}`;

    if (route === 'GET /_vr/health') return sendJson(res, 200, { ok: true, app: 'visual-review' });
    if (req.method === 'GET' && p.startsWith('/_vr/') && ASSETS.has(p.slice(5))) {
      return sendFile(res, path.join(assetsDir, p.slice(5)));
    }

    if (route === 'POST /_vr/api/open') {
      const body = await readJson(req);
      const file = body.file ? path.resolve(String(body.file)) : '';
      if (!file || !fs.existsSync(file)) return sendJson(res, 400, { status: 'error', message: `file not found: ${file || '(none)'}` });
      if (!/\.html?$/i.test(file)) return sendJson(res, 400, { status: 'error', message: 'only .html review pages can be opened' });
      const s = sessions.get(idFor(file)) || addSession(file);
      s.ended = false;
      s.approved = false;
      clearTimeout(emptyTimer);
      persist();
      pushStatus(s);
      // Built from the stored spelling so a differently-cased path still maps to the page route.
      const url = `http://127.0.0.1:${actualPort}/r/${s.id}/${encodeURIComponent(path.basename(s.file))}`;
      return sendJson(res, 200, { status: 'opened', id: s.id, url, browserConnected: s.clients.size > 0 });
    }

    if (route === 'GET /_vr/api/wait') {
      // A wait takes the notes and replaces the agent's own wait, so only review.js may start one.
      // Another site cannot send a custom header without a CORS preflight, which is never answered.
      if (req.headers['x-visual-review'] !== 'cli') return sendJson(res, 403, { status: 'error', message: 'wait is only for review.js' });
      const s = session(id);
      // Not an error: the agent must not react by opening/waiting again, or two waits would replace each other forever.
      if (s.waiter) sendJson(s.waiter, 200, { status: 'superseded', message: 'a newer wait is already running for this review' });
      s.waiter = res;
      res.on('close', () => {
        if (s.waiter === res) {
          s.waiter = null;
          pushStatus(s);
        }
      });
      pushStatus(s);
      return deliver(s);
    }

    if (route === 'GET /_vr/api/state') {
      const s = session(id);
      return sendJson(res, 200, { status: statusOf(s), replies: s.replies });
    }

    if (route === 'GET /_vr/events') {
      const s = session(id);
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write('retry: 2000\n\n');
      s.clients.add(res);
      res.on('close', () => s.clients.delete(res));
      return res.write(`event: status\ndata: ${JSON.stringify({ status: statusOf(s) })}\n\n`);
    }

    if (route === 'POST /_vr/api/feedback') {
      const body = await readJson(req);
      const s = session(body.id);
      if (s.ended) return sendJson(res, 409, { status: 'error', message: 'this review has already ended' });
      const notes = cleanNotes(body.notes);
      if (!notes.length && !body.end) return sendJson(res, 400, { status: 'error', message: 'nothing to send' });
      if (body.approved && notes.length) {
        return sendJson(res, 400, { status: 'error', message: 'Looks good sends no notes - send or remove your queued notes first' });
      }
      s.pending.push(...notes);
      if (body.end) s.ended = true;
      if (body.approved) s.approved = true;
      persist();
      sendJson(res, 200, { status: 'ok' });
      pushStatus(s);
      return deliver(s);
    }

    if (route === 'POST /_vr/api/reply') {
      const body = await readJson(req);
      const s = session(body.id);
      const text = cleanText(body.text, 5000);
      if (!text) return sendJson(res, 400, { status: 'error', message: 'reply text is empty' });
      const reply = { text, at: Date.now() };
      s.replies.push(reply);
      persist();
      broadcast(s, 'reply', reply);
      return sendJson(res, 200, { status: 'ok' });
    }

    if (route === 'POST /_vr/api/end') {
      const body = await readJson(req);
      const s = session(body.id);
      const dropped = s.pending.length;
      s.ended = true;
      s.pending = [];
      pushStatus(s);
      if (s.waiter) {
        sendJson(s.waiter, 200, { status: 'ended' });
        s.waiter = null;
      }
      removeSession(s);
      return sendJson(res, 200, { status: 'ok', dropped });
    }

    const page = req.method === 'GET' && p.match(/^\/r\/([0-9a-f]{12})\/(.+)$/);
    if (page) return servePage(session(page[1]), page[2], res);
    return sendJson(res, 404, { status: 'error', message: 'not found' });
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      if (res.headersSent) return res.end();
      sendJson(res, typeof err.code === 'number' ? err.code : 500, { status: 'error', message: err.message });
    });
  });

  return {
    listen() {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => {
          actualPort = server.address().port;
          for (const saved of Object.values(store.load())) {
            if (saved && saved.file && fs.existsSync(saved.file)) addSession(saved.file, saved);
          }
          persist();
          resolve(actualPort);
        });
      });
    },
    close() {
      clearInterval(idleTimer);
      clearTimeout(emptyTimer);
      for (const s of sessions.values()) {
        if (s.watcher) s.watcher.close();
        clearTimeout(s.reloadTimer);
        if (s.waiter) sendJson(s.waiter, 503, { status: 'error', message: 'review server stopped - run `review.js open` again' });
        for (const c of s.clients) c.end();
      }
      return new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
    },
  };
}

module.exports = { createServer, injectOverlay };

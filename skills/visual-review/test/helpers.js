'use strict';
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../lib/server');

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function within(promise, ms, what) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => (timer = setTimeout(() => reject(new Error(`timed out: ${what}`)), ms))),
  ]).finally(() => clearTimeout(timer));
}

async function start(opts = {}) {
  const stateDir = opts.stateDir || fs.mkdtempSync(path.join(os.tmpdir(), 'vr-state-'));
  const srv = createServer({
    port: 0,
    stateDir,
    assetsDir: path.join(__dirname, '..'),
    idleMs: opts.idleMs || 60000,
    emptyGraceMs: opts.emptyGraceMs || 3000,
    onIdle: opts.onIdle || (() => {}),
  });
  const port = await srv.listen();
  return { srv, port, stateDir };
}

function request(port, method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method,
        path: urlPath,
        headers: {
          host: `127.0.0.1:${port}`,
          ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}),
          ...headers,
        },
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (text += c));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {}
          resolve({ status: res.statusCode, headers: res.headers, text, json });
        });
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function tmpDoc(name = 'plan.review.html', html = '<html><body><h2>Plan</h2><p>hello</p></body></html>') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vr-doc-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, html);
  return { dir, file };
}

// Minimal SSE client: next(name) resolves with the data of the next event with that name.
function sse(port, id) {
  const events = [];
  const waiters = [];
  const flush = () => {
    for (const w of [...waiters]) {
      const i = events.findIndex((e) => e.event === w.name && (!w.match || w.match(e.data)));
      if (i === -1) continue;
      const e = events.splice(0, i + 1)[i];
      waiters.splice(waiters.indexOf(w), 1);
      clearTimeout(w.timer);
      w.resolve(e.data);
    }
  };
  const req = http.get(
    { host: '127.0.0.1', port, path: `/_vr/events?id=${id}`, headers: { host: `127.0.0.1:${port}` } },
    (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf('\n\n')) !== -1) {
          const frame = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = /^event: (.+)$/m.exec(frame);
          const data = /^data: (.+)$/m.exec(frame);
          if (ev) events.push({ event: ev[1], data: data ? JSON.parse(data[1]) : null });
        }
        flush();
      });
    },
  );
  req.on('error', () => {});
  return {
    next(name, match, ms = 3000) {
      return new Promise((resolve, reject) => {
        const w = { name, match, resolve, timer: setTimeout(() => reject(new Error(`no "${name}" event in ${ms}ms`)), ms) };
        waiters.push(w);
        flush();
      });
    },
    close: () => req.destroy(),
  };
}

module.exports = { delay, within, start, request, tmpDoc, sse };

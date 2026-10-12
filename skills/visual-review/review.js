#!/usr/bin/env node
'use strict';
// visual-review CLI. Every command prints one JSON object to stdout.
//   open <page.html>            start the server if needed, open the page in the browser
//   wait <page.html>            block until the user sends feedback or ends the review
//   reply <page.html> <text…>   show a short agent reply in the page's side panel
//   end <page.html>             end the review from the agent side
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { idFor } = require('./lib/ids');

const PORT = Number(process.env.VISUAL_REVIEW_PORT) || 4390;
const STATE_DIR = process.env.VISUAL_REVIEW_STATE_DIR || path.join(os.homedir(), '.visual-review');

function print(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
  if (obj.status === 'error') process.exitCode = 1;
}

function call(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port: PORT,
        method,
        path: urlPath,
        headers: {
          'x-visual-review': 'cli',
          ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}),
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
          resolve({ status: res.statusCode, json });
        });
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function health() {
  try {
    const r = await call('GET', '/_vr/health');
    return r.json && r.json.app === 'visual-review' ? 'ours' : 'other';
  } catch (err) {
    return err.code === 'ECONNREFUSED' ? 'none' : 'other';
  }
}

async function ensureServer() {
  const state = await health();
  if (state === 'ours') return;
  if (state === 'other') throw new Error(`Port ${PORT} is used by another program. Set VISUAL_REVIEW_PORT to a free port and try again.`);
  spawn(process.execPath, [__filename, 'serve'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if ((await health()) === 'ours') return;
  }
  throw new Error('The review server did not start within 5 seconds.');
}

function openBrowser(url) {
  if (process.env.VISUAL_REVIEW_NO_OPEN === '1') return;
  // rundll32 avoids cmd.exe re-parsing % and & in the URL
  const [cmd, args] =
    process.platform === 'win32'
      ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

function serve() {
  const { createServer } = require('./lib/server');
  const srv = createServer({
    port: PORT,
    stateDir: STATE_DIR,
    assetsDir: __dirname,
    onIdle: () => srv.close().then(() => process.exit(0)),
  });
  srv.listen().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

async function main() {
  const [cmd, file, ...rest] = process.argv.slice(2);
  if (cmd === 'serve') return serve();
  if (!['open', 'wait', 'reply', 'end'].includes(cmd) || !file) {
    return print({ status: 'error', message: 'usage: review.js open|wait|reply|end <page.review.html> ["message"]' });
  }
  const abs = path.resolve(file);
  const id = idFor(abs);
  try {
    if (cmd === 'open') {
      if (!fs.existsSync(abs)) throw new Error(`file not found: ${abs}`);
      await ensureServer();
      const r = await call('POST', '/_vr/api/open', { file: abs });
      if (r.status !== 200) throw new Error((r.json && r.json.message) || `open failed (HTTP ${r.status})`);
      // A tab already showing this review will pick up changes by itself; don't pile up new tabs.
      if (!r.json.browserConnected) openBrowser(r.json.url);
      return print(r.json);
    }
    if (cmd === 'wait') {
      const r = await call('GET', `/_vr/api/wait?id=${id}`);
      return print(r.json || { status: 'error', message: `unexpected response (HTTP ${r.status})` });
    }
    if (cmd === 'reply') {
      const text = rest.join(' ').trim();
      if (!text) throw new Error('reply needs a message');
      const r = await call('POST', '/_vr/api/reply', { id, text });
      return print(r.json || { status: 'error', message: `unexpected response (HTTP ${r.status})` });
    }
    const r = await call('POST', '/_vr/api/end', { id });
    return print(r.json || { status: 'error', message: `unexpected response (HTTP ${r.status})` });
  } catch (err) {
    const message = err.code === 'ECONNREFUSED' ? 'the review server is not running - run `review.js open <page>` again' : err.message;
    print({ status: 'error', message });
  }
}

main();

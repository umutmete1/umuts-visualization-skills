'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { delay, request, tmpDoc } = require('./helpers');

const CLI = path.join(__dirname, '..', 'review.js');

async function freePort() {
  const s = net.createServer();
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const { port } = s.address();
  await new Promise((r) => s.close(r));
  return port;
}

function envFor(port) {
  return {
    ...process.env,
    VISUAL_REVIEW_PORT: String(port),
    VISUAL_REVIEW_STATE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'vr-cli-state-')),
    VISUAL_REVIEW_NO_OPEN: '1',
  };
}

function run(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], { env });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('close', (code) => {
      let json = null;
      try {
        json = JSON.parse(out);
      } catch {}
      resolve({ code, json, out });
    });
  });
}

async function serverGone(port, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      await request(port, 'GET', '/_vr/health');
    } catch {
      return true;
    }
    await delay(200);
  }
  return false;
}

test('open → wait → reply → end runs the whole loop and the server exits', async (t) => {
  const port = await freePort();
  const env = envFor(port);
  const { file } = tmpDoc();
  t.after(() => request(port, 'POST', '/_vr/api/end', { id: 'cleanup' }).catch(() => {}));

  const opened = await run(['open', file], env);
  assert.equal(opened.code, 0, opened.out);
  assert.equal(opened.json.status, 'opened');
  assert.match(opened.json.url, new RegExp(`^http://127\\.0\\.0\\.1:${port}/r/[0-9a-f]{12}/plan\\.review\\.html$`));

  const waiting = run(['wait', file], env);
  await delay(300);
  await request(port, 'POST', '/_vr/api/feedback', { id: opened.json.id, notes: [{ section: 'Plan', quote: 'hello', note: 'shorter' }] });
  const waited = await waiting;
  assert.equal(waited.code, 0, waited.out);
  assert.deepEqual(waited.json, { status: 'feedback', notes: [{ section: 'Plan', quote: 'hello', note: 'shorter' }] });

  const replied = await run(['reply', file, 'Made', 'it', 'shorter'], env);
  assert.equal(replied.json.status, 'ok');
  const state = await request(port, 'GET', `/_vr/api/state?id=${opened.json.id}`);
  assert.equal(state.json.replies[0].text, 'Made it shorter');

  const ended = await run(['end', file], env);
  assert.equal(ended.json.status, 'ok');
  assert.ok(await serverGone(port, 8000), 'server should exit after the last review ends');
});

test('open refuses a port used by another program', async (t) => {
  const port = await freePort();
  const other = http.createServer((_req, res) => res.end('hello'));
  await new Promise((r) => other.listen(port, '127.0.0.1', r));
  t.after(() => other.close());
  const r = await run(['open', tmpDoc().file], envFor(port));
  assert.equal(r.code, 1);
  assert.equal(r.json.status, 'error');
  assert.match(r.json.message, /VISUAL_REVIEW_PORT/);
});

test('wait without a running server says so clearly', async () => {
  const r = await run(['wait', tmpDoc().file], envFor(await freePort()));
  assert.equal(r.code, 1);
  assert.match(r.json.message, /not running/);
});

test('open with a missing file fails clearly', async () => {
  const r = await run(['open', path.join(os.tmpdir(), 'vr-does-not-exist.html')], envFor(await freePort()));
  assert.equal(r.code, 1);
  assert.match(r.json.message, /file not found/);
});

test('unknown command prints usage', async () => {
  const r = await run(['bogus'], envFor(await freePort()));
  assert.equal(r.code, 1);
  assert.match(r.json.message, /usage/);
});

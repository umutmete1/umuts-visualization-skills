'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { delay, within, start, request, tmpDoc, sse } = require('./helpers');
const { injectOverlay } = require('../lib/server');

const note = (text) => ({ section: 'Plan', quote: 'hello', note: text });
async function openDoc(port, file) {
  const r = await request(port, 'POST', '/_vr/api/open', { file });
  assert.equal(r.status, 200, r.text);
  return r.json;
}
const wait = (port, id) => request(port, 'GET', `/_vr/api/wait?id=${id}`, undefined, { 'x-visual-review': 'cli' });
const feedback = (port, body) => request(port, 'POST', '/_vr/api/feedback', body);

// ---- feedback loop

test('open registers a session and returns its url', async (t) => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  const o = await openDoc(port, tmpDoc().file);
  assert.equal(o.status, 'opened');
  assert.match(o.id, /^[0-9a-f]{12}$/);
  assert.equal(o.url, `http://127.0.0.1:${port}/r/${o.id}/plan.review.html`);
});

test('open rejects a missing file', async (t) => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  const r = await request(port, 'POST', '/_vr/api/open', { file: path.join(tmpDoc().dir, 'nope.html') });
  assert.equal(r.status, 400);
  assert.match(r.json.message, /file not found/);
});

test('feedback sent before wait is returned as soon as wait starts', async (t) => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  const o = await openDoc(port, tmpDoc().file);
  assert.equal((await feedback(port, { id: o.id, notes: [note('a')] })).status, 200);
  assert.deepEqual((await wait(port, o.id)).json, { status: 'feedback', notes: [note('a')] });
});

test('wait blocks until feedback arrives, and each note is delivered once', async (t) => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  const o = await openDoc(port, tmpDoc().file);
  const first = wait(port, o.id);
  await delay(50);
  await feedback(port, { id: o.id, notes: [note('first')] });
  assert.deepEqual((await first).json.notes, [note('first')]);
  const second = wait(port, o.id);
  await delay(50);
  await feedback(port, { id: o.id, notes: [note('second')] });
  assert.deepEqual((await second).json.notes, [note('second')]);
});

test('Send & Done delivers the notes with ended:true and closes the session', async (t) => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  const o = await openDoc(port, tmpDoc().file);
  await feedback(port, { id: o.id, notes: [note('last')], end: true });
  assert.deepEqual((await wait(port, o.id)).json, { status: 'feedback', notes: [note('last')], ended: true });
  assert.equal((await request(port, 'GET', `/_vr/api/state?id=${o.id}`)).status, 404);
});

test('Done with no notes makes wait return ended', async (t) => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  const o = await openDoc(port, tmpDoc().file);
  await feedback(port, { id: o.id, notes: [], end: true });
  assert.deepEqual((await wait(port, o.id)).json, { status: 'ended' });
});

test('Looks good ends the review as approved', async (t) => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  const o = await openDoc(port, tmpDoc().file);
  assert.equal((await feedback(port, { id: o.id, notes: [], end: true, approved: true })).status, 200);
  assert.deepEqual((await wait(port, o.id)).json, { status: 'approved' });
  assert.equal((await request(port, 'GET', `/_vr/api/state?id=${o.id}`)).status, 404);
});

test('approving together with notes is refused, so notes are never silently dropped', async (t) => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  const o = await openDoc(port, tmpDoc().file);
  const r = await feedback(port, { id: o.id, notes: [note('x')], end: true, approved: true });
  assert.equal(r.status, 400);
  assert.equal((await request(port, 'GET', `/_vr/api/state?id=${o.id}`)).json.status, 'working');
});

test('feedback after the review ended is refused', async (t) => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  const o = await openDoc(port, tmpDoc().file);
  await feedback(port, { id: o.id, notes: [], end: true });
  assert.equal((await feedback(port, { id: o.id, notes: [note('late')] })).status, 409);
});

test('agent end releases a pending wait with ended', async (t) => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  const o = await openDoc(port, tmpDoc().file);
  const pending = wait(port, o.id);
  await delay(50);
  assert.equal((await request(port, 'POST', '/_vr/api/end', { id: o.id })).status, 200);
  assert.deepEqual((await pending).json, { status: 'ended' });
});

test('a newer wait replaces an older one', async (t) => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  const o = await openDoc(port, tmpDoc().file);
  const older = wait(port, o.id);
  await delay(50);
  const newer = wait(port, o.id);
  assert.deepEqual((await older).json, { status: 'superseded', message: 'a newer wait is already running for this review' });
  await feedback(port, { id: o.id, notes: [note('x')] });
  assert.deepEqual((await newer).json.notes, [note('x')]);
});

test('blank notes are dropped, fields are cleaned, and an empty send is rejected', async (t) => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  const o = await openDoc(port, tmpDoc().file);
  assert.equal((await feedback(port, { id: o.id, notes: [{ note: '   ' }] })).status, 400);
  await feedback(port, { id: o.id, notes: [{ section: '', quote: 5, note: '  x  ' }] });
  assert.deepEqual((await wait(port, o.id)).json.notes, [{ section: null, quote: null, note: 'x' }]);
});

test('feedback over 1 MB is rejected with 413', async (t) => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  const o = await openDoc(port, tmpDoc().file);
  const r = await feedback(port, { id: o.id, notes: [note('x'.repeat(1_100_000))] });
  assert.equal(r.status, 413);
});

test('replies are stored and reported in state', async (t) => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  const o = await openDoc(port, tmpDoc().file);
  assert.equal((await request(port, 'POST', '/_vr/api/reply', { id: o.id, text: 'Done: moved auth' })).status, 200);
  const s = await request(port, 'GET', `/_vr/api/state?id=${o.id}`);
  assert.equal(s.json.status, 'working');
  assert.equal(s.json.replies[0].text, 'Done: moved auth');
});

test('wait for an unknown review returns 404', async (t) => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  const r = await wait(port, 'abcdefabcdef');
  assert.equal(r.status, 404);
  assert.match(r.json.message, /review\.js open/);
});

// ---- serving & security

test('the review page is served with the overlay injected', async (t) => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  const o = await openDoc(port, tmpDoc().file);
  const r = await request(port, 'GET', `/r/${o.id}/plan.review.html`);
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /text\/html/);
  assert.match(r.text, /<p>hello<\/p>/);
  assert.match(r.text, new RegExp(`<script src="/_vr/overlay.js" data-vr-id="${o.id}" defer></script></body>`));
});

test('the overlay lands right before </body> even when the text contains İ', () => {
  // 'İ'.toLowerCase() is two characters long, which used to shift the insertion point
  assert.equal(
    injectOverlay('<p>İİ test</p></BODY>', 'abc'),
    '<p>İİ test</p><script src="/_vr/overlay.js" data-vr-id="abc" defer></script></BODY>',
  );
});

test('opening the same file with different letter case still serves the overlay', { skip: process.platform !== 'win32' }, async (t) => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  const { dir } = tmpDoc('Plan.review.html');
  await openDoc(port, path.join(dir, 'Plan.review.html'));
  const o = await openDoc(port, path.join(dir, 'plan.review.html'));
  const r = await request(port, 'GET', new URL(o.url).pathname);
  assert.match(r.text, /data-vr-id=/);
});

test('dotfiles and non-page file types in the review folder are not served', async (t) => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  const { dir, file } = tmpDoc();
  fs.writeFileSync(path.join(dir, '.env'), 'SECRET=1');
  fs.mkdirSync(path.join(dir, '.ssh'));
  fs.writeFileSync(path.join(dir, '.ssh', 'id_rsa.png'), 'key');
  fs.writeFileSync(path.join(dir, 'data.json'), '{"secret":1}');
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'secret');
  const o = await openDoc(port, file);
  for (const p of ['.env', '.ssh/id_rsa.png', 'data.json', 'notes.txt']) {
    const r = await request(port, 'GET', `/r/${o.id}/${p}`);
    assert.equal(r.status, 403, p);
    assert.doesNotMatch(r.text, /secret|key/i, p);
  }
});

test('open only accepts .html pages', async (t) => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  const { dir } = tmpDoc();
  fs.writeFileSync(path.join(dir, '.env'), 'SECRET=1');
  const r = await request(port, 'POST', '/_vr/api/open', { file: path.join(dir, '.env') });
  assert.equal(r.status, 400);
  assert.match(r.json.message, /\.html/);
});

test('open reports whether a browser tab is already connected', async (t) => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  const { file } = tmpDoc();
  const first = await openDoc(port, file);
  assert.equal(first.browserConnected, false);
  const events = sse(port, first.id);
  t.after(() => events.close());
  await events.next('status');
  assert.equal((await openDoc(port, file)).browserConnected, true);
});

test('the overlay is appended when the page has no </body>', () => {
  assert.equal(injectOverlay('<p>x</p>', 'abc'), '<p>x</p><script src="/_vr/overlay.js" data-vr-id="abc" defer></script>');
});

test('files next to the page are served, files outside are refused', async (t) => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  const { dir, file } = tmpDoc();
  fs.mkdirSync(path.join(dir, 'img'));
  fs.writeFileSync(path.join(dir, 'img', 'logo.svg'), '<svg/>');
  const secret = path.join(path.dirname(dir), `vr-secret-${process.pid}.txt`);
  fs.writeFileSync(secret, 'secret');
  t.after(() => fs.rmSync(secret, { force: true }));
  const o = await openDoc(port, file);
  const ok = await request(port, 'GET', `/r/${o.id}/img/logo.svg`);
  assert.equal(ok.status, 200);
  assert.match(ok.headers['content-type'], /image\/svg\+xml/);
  const bad = await request(port, 'GET', `/r/${o.id}/..%2F${path.basename(secret)}`);
  assert.equal(bad.status, 403);
  assert.doesNotMatch(bad.text, /secret/);
});

test('file names with spaces and accents work', async (t) => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  const o = await openDoc(port, tmpDoc('my plan é.review.html').file);
  const r = await request(port, 'GET', new URL(o.url).pathname);
  assert.equal(r.status, 200);
  assert.match(r.text, /hello/);
});

test('only the overlay assets are exposed under /_vr/', async (t) => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  assert.equal((await request(port, 'GET', '/_vr/base.css')).status, 200);
  assert.equal((await request(port, 'GET', '/_vr/overlay.js')).status, 200);
  assert.equal((await request(port, 'GET', '/_vr/icons.svg')).status, 404);
  assert.equal((await request(port, 'GET', '/_vr/SPEC.md')).status, 404);
  assert.equal((await request(port, 'GET', '/_vr/lib%2Fserver.js')).status, 404);
});

test('requests with a foreign Host are refused', async (t) => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  assert.equal((await request(port, 'GET', '/_vr/health', undefined, { host: 'evil.example' })).status, 403);
});

test('POSTs from a foreign Origin are refused, same-origin POSTs work', async (t) => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  const o = await openDoc(port, tmpDoc().file);
  const body = { id: o.id, notes: [note('x')] };
  assert.equal((await request(port, 'POST', '/_vr/api/feedback', body, { origin: 'http://evil.example' })).status, 403);
  assert.equal((await request(port, 'POST', '/_vr/api/feedback', body, { origin: `http://127.0.0.1:${port}` })).status, 200);
});

test('a web page cannot take over the wait: only the CLI header is accepted', async (t) => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  const o = await openDoc(port, tmpDoc().file);
  const real = wait(port, o.id);
  await delay(50);
  // What <img src> or a no-cors fetch from any site sends: a plain GET, no custom header.
  assert.equal((await request(port, 'GET', `/_vr/api/wait?id=${o.id}`)).status, 403);
  await feedback(port, { id: o.id, notes: [note('mine')] });
  assert.deepEqual((await within(real, 2000, 'real wait')).json.notes, [note('mine')]);
});

test('cross-site GETs to the API and event stream are refused', async (t) => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  const { file } = tmpDoc();
  const o = await openDoc(port, file);
  const state = `/_vr/api/state?id=${o.id}`;
  const events = `/_vr/events?id=${o.id}`;
  assert.equal((await request(port, 'GET', state, undefined, { origin: 'http://evil.example' })).status, 403);
  assert.equal((await request(port, 'GET', state, undefined, { 'sec-fetch-site': 'cross-site' })).status, 403);
  // Another localhost port is "same-site" to a browser, but still not this page.
  assert.equal((await request(port, 'GET', events, undefined, { 'sec-fetch-site': 'same-site' })).status, 403);
  assert.equal((await request(port, 'GET', state, undefined, { 'sec-fetch-site': 'same-origin' })).status, 200);
  assert.equal((await openDoc(port, file)).browserConnected, false);
});

// ---- lifecycle

test('undelivered notes survive a server restart', async (t) => {
  const a = await start();
  const o = await openDoc(a.port, tmpDoc().file);
  await feedback(a.port, { id: o.id, notes: [note('kept')] });
  await a.srv.close();
  const b = await start({ stateDir: a.stateDir });
  t.after(() => b.srv.close());
  assert.deepEqual((await wait(b.port, o.id)).json.notes, [note('kept')]);
});

test('sessions whose file was deleted are dropped on restart', async (t) => {
  const a = await start();
  const { file } = tmpDoc();
  const o = await openDoc(a.port, file);
  await a.srv.close();
  fs.unlinkSync(file);
  const b = await start({ stateDir: a.stateDir });
  t.after(() => b.srv.close());
  assert.equal((await wait(b.port, o.id)).status, 404);
});

test('saving the page pushes a reload event, including delete-and-recreate saves', async (t) => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  const { file } = tmpDoc();
  const o = await openDoc(port, file);
  const events = sse(port, o.id);
  t.after(() => events.close());
  await events.next('status');
  fs.writeFileSync(file, '<html><body>v2</body></html>');
  await events.next('reload');
  await delay(300);
  fs.unlinkSync(file);
  fs.writeFileSync(file, '<html><body>v3</body></html>');
  await events.next('reload');
});

test('status changes and replies are pushed to the browser', async (t) => {
  const { srv, port } = await start();
  t.after(() => srv.close());
  const o = await openDoc(port, tmpDoc().file);
  const events = sse(port, o.id);
  t.after(() => events.close());
  await events.next('status', (d) => d.status === 'working');
  const pending = wait(port, o.id);
  await events.next('status', (d) => d.status === 'listening');
  await request(port, 'POST', '/_vr/api/reply', { id: o.id, text: 'hi there' });
  assert.equal((await events.next('reply')).text, 'hi there');
  await request(port, 'POST', '/_vr/api/end', { id: o.id });
  await pending;
});

test('onIdle fires shortly after the last review ends', async () => {
  let idle;
  const fired = new Promise((r) => (idle = r));
  const { srv, port } = await start({ emptyGraceMs: 50, onIdle: () => idle() });
  const o = await openDoc(port, tmpDoc().file);
  await request(port, 'POST', '/_vr/api/end', { id: o.id });
  await within(fired, 2000, 'onIdle after last end');
  await srv.close();
});

test('onIdle fires after idleMs with nothing connected', async () => {
  let idle;
  const fired = new Promise((r) => (idle = r));
  const { srv, port } = await start({ idleMs: 100, onIdle: () => idle() });
  await openDoc(port, tmpDoc().file);
  await within(fired, 2000, 'onIdle after idleMs');
  await srv.close();
});

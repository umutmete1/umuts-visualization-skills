'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStore } = require('../lib/store');
const { idFor } = require('../lib/ids');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vr-store-'));

test('load returns {} when nothing was saved', () => {
  assert.deepEqual(createStore(tmp()).load(), {});
});

test('save then load round-trips, creating the directory', () => {
  const dir = path.join(tmp(), 'nested');
  const store = createStore(dir);
  store.save({ a: { file: 'x', pending: [{ note: 'hi' }] } });
  assert.deepEqual(store.load(), { a: { file: 'x', pending: [{ note: 'hi' }] } });
});

test('a corrupt state file loads as {}', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'sessions.json'), '{not json');
  assert.deepEqual(createStore(dir).load(), {});
});

test('idFor is 12 hex chars, stable, and distinct per file', () => {
  const a = idFor('/docs/plan.review.html');
  assert.match(a, /^[0-9a-f]{12}$/);
  assert.equal(idFor('/docs/plan.review.html'), a);
  assert.notEqual(idFor('/docs/other.review.html'), a);
});

test('idFor ignores case on Windows', { skip: process.platform !== 'win32' }, () => {
  assert.equal(idFor('C:\\Docs\\Plan.review.html'), idFor('c:\\docs\\plan.review.html'));
});

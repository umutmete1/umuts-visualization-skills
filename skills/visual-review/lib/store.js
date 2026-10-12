'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Persists sessions (undelivered notes, replies) so a server restart loses nothing.
function createStore(dir) {
  const file = path.join(dir, 'sessions.json');
  return {
    load() {
      try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch {
        return {};
      }
    },
    save(data) {
      fs.mkdirSync(dir, { recursive: true });
      const text = JSON.stringify(data, null, 2);
      const tmp = `${file}.${process.pid}.tmp`;
      try {
        fs.writeFileSync(tmp, text);
        fs.renameSync(tmp, file);
      } catch {
        // rename can fail on Windows if another process holds the file; fall back to a direct write
        fs.writeFileSync(file, text);
      }
    },
  };
}

module.exports = { createStore };

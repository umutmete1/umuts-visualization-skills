'use strict';
const crypto = require('node:crypto');
const path = require('node:path');

// One review session per page file; Windows paths are case-insensitive.
function idFor(file) {
  const abs = path.resolve(file);
  const key = process.platform === 'win32' ? abs.toLowerCase() : abs;
  return crypto.createHash('sha1').update(key).digest('hex').slice(0, 12);
}

module.exports = { idFor };

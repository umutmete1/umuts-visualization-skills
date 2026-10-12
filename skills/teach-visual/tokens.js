#!/usr/bin/env node
// Adds up the tokens this Claude Code session has used to build a lesson.
// Reads the session transcript; prints one JSON object.
//
//   node tokens.js                 count from the last "teach me ..." prompt
//   node tokens.js --since <ISO>   count from a given time instead
//
// Subagent transcripts are not included.
const fs = require("fs");
const path = require("path");
const os = require("os");

function fail(message) {
  console.log(JSON.stringify({ status: "error", message }));
  process.exit(1);
}

const sessionId = process.env.CLAUDE_CODE_SESSION_ID;
if (!sessionId) fail("CLAUDE_CODE_SESSION_ID is not set");

const projects = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"), "projects");
let file = null;
for (const dir of fs.existsSync(projects) ? fs.readdirSync(projects) : []) {
  const candidate = path.join(projects, dir, sessionId + ".jsonl");
  if (fs.existsSync(candidate)) { file = candidate; break; }
}
if (!file) fail("no transcript found for this session");

const entries = [];
for (const line of fs.readFileSync(file, "utf8").split("\n")) {
  if (!line) continue;
  try { entries.push(JSON.parse(line)); } catch { /* a line still being written */ }
}

const arg = process.argv.indexOf("--since");
let since = arg > -1 ? process.argv[arg + 1] : null;
if (since && Number.isNaN(Date.parse(since))) fail("--since needs an ISO time, e.g. 2026-10-12T13:00:00Z");
if (!since) {
  const prompt = entries.filter((e) =>
    e.type === "user" && !e.isSidechain && typeof e.message?.content === "string" && /teach me/i.test(e.message.content)).pop();
  if (!prompt) fail('no "teach me" prompt in this session; pass --since <ISO time>');
  since = prompt.timestamp;
}

// The transcript repeats a request's line as it streams; the last one has the final usage.
const requests = new Map();
for (const e of entries) {
  if (e.type !== "assistant" || e.isSidechain || !e.message?.usage) continue;
  if (Date.parse(e.timestamp) < Date.parse(since)) continue;
  requests.set(e.message.id, e);
}
if (!requests.size) fail("no requests recorded since " + since);

const sum = { input: 0, cache_write: 0, cache_read: 0, output: 0 };
const models = new Set();
let until = since;
for (const e of requests.values()) {
  const u = e.message.usage;
  sum.input += u.input_tokens || 0;
  sum.cache_write += u.cache_creation_input_tokens || 0;
  sum.cache_read += u.cache_read_input_tokens || 0;
  sum.output += u.output_tokens || 0;
  if (e.message.model) models.add(e.message.model);
  if (e.timestamp > until) until = e.timestamp;
}

console.log(JSON.stringify({
  status: "ok",
  requests: requests.size,
  ...sum,
  total: sum.input + sum.cache_write + sum.cache_read + sum.output,
  models: [...models],
  since,
  until,
}));

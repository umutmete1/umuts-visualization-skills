---
name: visual-review
description: Use when the user asks to see a plan, spec, design doc or other long document visually, or to review and comment on it in the browser - e.g. "/visual-review docs/plan.md", "show me this visually". Only when asked, never automatically.
---

# Visual review

Turn a long markdown doc into a short visual summary page, open it in the user's browser, and run a comment loop: the user clicks parts of the page, writes notes, hits Send; you apply them to the doc and the page.

`review.js` is in this skill's base directory (shown when the skill loads). Below, `RJS` means `node "<base directory>/review.js"`. Every command prints one JSON object.

## 1. Source doc
- The markdown doc is the source of truth. If the user named a file, use it.
- If the content only exists in the conversation, first save it as `visual-review/<topic>.md` under the current project and tell the user the path. If the current directory is the user's home folder (not a project), use the session scratchpad instead - the review folder is served to the browser, so it must never be the home folder.

## 2. Build the page
Write `<doc-name>.review.html` next to the doc (`docs/plan.md` → `docs/plan.review.html`). Goal: the user gets the doc in about 2 minutes, so the text visible without expanding anything is **at most ~400 words**, however long the doc is. Everything else goes in `<details>`.

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Plan name</title>
  <link rel="stylesheet" href="/_vr/base.css">
</head>
<body>
<main class="vr-page">
  <header class="vr-header"><h1>Plan name</h1><p class="vr-meta">Source: docs/plan.md</p></header>
  <section class="tldr" data-vr-section="TL;DR"><h2>TL;DR</h2><ul><li>…</li></ul></section>
  <section data-vr-section="Key decisions"><h2>Key decisions</h2><div class="cards">…</div></section>
  <!-- more sections -->
</main>
</body>
</html>
```

**Before writing the page, read `components.md` in this skill's base directory.** It has copy-ready snippets and a "pick by content" table.

The page is made of:
1. Header, then **stat tiles** with the doc's key numbers.
2. **TL;DR** (3-5 bullets).
3. One section per topic, each shown with the component the table picks for that content. **Any plan or design with moving parts gets at least one real SVG diagram** (architecture, sequence or mind map).
4. **Open questions as clickable decisions**, one block per question.
5. Remaining detail in `<details>`.

- Put `data-vr-section="<name>"` on every major block so notes arrive labelled.
- Long detail goes in `<details><summary>…</summary>…</details>`, but nothing important lives only there.
- Summarize - don't copy the doc word for word. Keep code only where it carries a decision.
- Images and other assets go next to the page, referenced with relative paths.

## 3. Open and wait
1. Run `RJS open <page.html>`. If it prints `"status": "error"`, tell the user the `message` and stop.
2. Tell the user in one line: the review is open in their browser - switch to **Comment**, click or select, then **Send**. (If `browserConnected` is `true`, say their open review tab has it instead.)
3. Run `RJS wait <page.html>` with **`run_in_background: true`**. You are woken when it finishes. Don't poll, don't sleep, don't run it in the foreground.

**Exactly one background `wait` per review.** Start a new one only after the previous one has finished.

## 4. When `wait` finishes
- `"status": "approved"` - the user clicked **Looks good**: the doc is approved as it is. Change nothing, tell the user in one line it's approved, and continue with whatever the doc was for (e.g. implementing the plan, if that's what they asked for).
- `"status": "feedback"` - each note has `section` + `quote` (where) and `note` (what). A note like `Answer: 90 days` whose `quote` is a question is the user's pick on a clickable decision: record the decision in the doc and turn that decision block into a normal statement. Update the **markdown doc first**, then the page to match (the browser reloads itself). If the `wait` output had `"ended": true`, the page is closed: don't reply, just summarize the changes in chat and stop. Otherwise reply (below) and start the next background `wait`.
- `"status": "ended"` - the review is over. If the user clicked Done, summarize the changes in chat in a few lines. If you ended it yourself with `end`, you already told the user - say nothing more.
- `"status": "superseded"` - another `wait` is already running for this review. Do nothing; that one will wake you.
- `"status": "error"` - if the message says the server is not running or stopped, run `RJS open` and start one background `wait`; otherwise tell the user the `message`.

To reply, run `RJS reply <page.html> '<1-2 sentences on what you changed>'` - single quotes, and no `'` inside the message.

If a note is unclear, ask with `reply` and wait for the answer instead of guessing.
If the user gives feedback in the terminal while a `wait` is running, apply it the same way and `reply` - but don't start another `wait`; the running one still covers the browser.
If the user says in the terminal they're done, run `RJS end <page.html>`.

## Never
- Open a review the user didn't ask for.
- Change only the page - the doc must always match it.

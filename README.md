# Umut's visualization skills

Two [Claude Code](https://claude.com/claude-code) skills that turn text into visual HTML pages.

| Skill | Say | You get |
|---|---|---|
| `teach-visual` | "teach me how goroutines work in Go" | One self-contained HTML lesson: diagrams, step-through animations, a quiz, and the sources it was checked against. |
| `visual-review` | "/visual-review docs/plan.md" | A short visual summary of a long plan or spec, opened in your browser. Click any part, write a note, hit Send, and Claude updates the doc and the page. |

Both run only when you ask for them.

> **Work in progress.** Both skills are still being built and tested. They can make mistakes: a lesson can contain a wrong fact or a misleading diagram, and a review page can leave out something that mattered in the doc. Check anything important against the original. See [Known limits](#known-limits).

## Why I made these

The main reason for both skills is to close the gap between people and AI. AI agents write a lot of text, and people don't read most of it. I thought that if the AI showed its work visually instead, it would be easier to work with.

**visual-review.** I noticed that nobody actually reads long `.md` files. An agent writes a long plan or spec, you skim it, say "looks good", and find out what was in it later. So this skill turns the doc into a page you can take in within about two minutes, and lets you answer by clicking on the part you disagree with instead of writing a paragraph back.

**teach-visual.** I want to use AI models and agents to teach myself new things. I tried learning new tech with AI agents before and it did not work that well: I got long explanations and little understanding. So I tried making it visual: diagrams of the real mechanism, animations you step through yourself, and a quiz that checks whether the idea landed.

## Install

In Claude Code:

```
/plugin marketplace add umutmete1/umuts-visualization-skills
/plugin install umuts-visualization-skills@umuts-visualization-skills
```

The skills are then available as `/umuts-visualization-skills:teach-visual` and `/umuts-visualization-skills:visual-review`.

Prefer the short names (`/teach-visual`, `/visual-review`)? Copy the two folders from `skills/` into `~/.claude/skills/` instead.

### Requirements

- Node.js 18 or newer. No npm packages are needed.
- `teach-visual` reuses two other plugins for the drawing work and stops if they are missing: [visual-explainer](https://github.com/nicobailon/visual-explainer) and [diagram-design](https://github.com/cathrynlavery/diagram-design).
- `teach-visual` checks the finished page in a browser, so a browser tool such as the Playwright plugin helps.

## visual-review

```
/visual-review docs/plan.md
```

or just "show me this plan visually".

### What happens

1. Claude reads the markdown doc and writes `plan.review.html` next to it. The text you see without expanding anything is kept to about 400 words, however long the doc is. The rest sits in collapsed sections.
2. The page opens in your browser.
3. You switch to **Comment** mode (or press Ctrl+I), click a section or select some text, write a note and queue it. Queue as many as you like.
4. You hit **Send**. Claude gets each note with the section and the text it points at.
5. Claude updates the markdown doc first, then the page. The browser reloads by itself and shows a short reply saying what changed.
6. Repeat until you are happy, then end the review.

The markdown doc stays the source of truth. The page is a view of it and is never changed alone.

### What the page is built from

Claude picks the component that fits each part of the doc:

| The doc has | Shown as |
|---|---|
| Key numbers (phases, days, cost, risks) | Stat tiles |
| Phases or milestones with durations | Timeline |
| Systems and services that talk to each other | Architecture diagram |
| A flow over time between actors | Sequence diagram |
| Risks | Risk matrix |
| Options and trade-offs | Comparison table |
| A task list with status | Progress bar and checklist |
| A few key points or decisions | Status cards |
| A change from the current state to a new one | Before / after |
| Shares, splits, budgets | Charts |
| The big picture of a broad topic | Mind map |
| Open questions you have to answer | Clickable decisions: one click queues your answer |

Any plan with moving parts gets at least one real diagram.

### Buttons

| Button | What it does |
|---|---|
| **Queue note** | Adds your note to the list. Nothing is sent yet. |
| **Send** | Sends the queued notes. The review stays open for another round. |
| **Send & Done** | Sends the notes and ends the review. |
| **Looks good** | Approves the doc as it is. Claude changes nothing. |

The panel also shows whether the agent is listening or working. Queued notes survive a page reload.

### Under the hood

- `review.js` starts a small server on your own machine (`127.0.0.1`, port 4390) and serves the review page. Nothing is sent anywhere else.
- Set `VISUAL_REVIEW_PORT` if port 4390 is taken.
- The server stops by itself when no review is open, or after 30 minutes idle.
- Notes that were sent but not yet delivered are kept in `~/.visual-review/`.

Run the tests with:

```
cd skills/visual-review
node --test
```

## teach-visual

```
teach me how goroutines work in Go
```

### What happens

1. **Research.** Claude reads the official docs, specs and source for the topic and keeps a list of every claim with the URL that supports it. A claim with no source is left out or labelled "Not verified".
2. **Curriculum.** 4 to 7 short sections, from the simplest idea to the deepest. Each section teaches one idea.
3. **Visuals.** Each section gets the form that teaches it fastest: a diagram for structure, a step-through animation for a process, a small chart for numbers, plain prose for a definition.
4. **Assemble.** Everything goes into one HTML file at `~/teach-visual/<topic>.html`.
5. **Verify.** Claude opens the page in a real browser and checks it at laptop and phone width, in light and dark, before showing it to you.

### What the lesson page contains

| Part | What it is |
|---|---|
| Header | The topic, one sentence on what it is, and the version it was checked against |
| Sections | The lesson itself, with diagrams and step-through animations (Play, Next, Back) |
| Quiz | 3 to 5 questions that ask you to apply an idea to a new case. Each answer explains why. |
| Sources | Every URL the lesson relied on, and what it was used for |
| Token count | How many tokens it cost to build the page |

The page is a single file with no web fonts, scripts or images from the network, so it opens from disk and works offline.

## Known limits

- **A lesson can be wrong.** Claims are checked against sources, but the model still writes the page. Use the Sources list.
- **A summary leaves things out.** That is the point of `visual-review`, and also its risk. The full doc is still there.
- `teach-visual` is the newer one and has had one full run so far. It has not been run by a fresh agent in a clean session.
- Lessons were checked in Chromium only. Not tested: a real phone, other browsers, print, screen readers.
- On a phone, wide diagrams scroll sideways inside their frame.
- A lesson is not cheap in tokens: loading the two drawing plugins costs roughly 25 to 30 thousand tokens before any research starts.
- `visual-review` has some known rough edges, for example long notes can be cut short.
- Everything was built and tested on Windows.

## Feedback

Please try them and tell me what you think: what worked, what broke, what you would change. [Open an issue](https://github.com/umutmete1/umuts-visualization-skills/issues) with the prompt you used and, if you can, a screenshot of the page.

## Credits

- `teach-visual` builds on [visual-explainer](https://github.com/nicobailon/visual-explainer) by nicobailon and [diagram-design](https://github.com/cathrynlavery/diagram-design) by Cathryn Lavery, both MIT.
- `visual-review` was inspired by [lavish-axi](https://github.com/kunchenguid/lavish-axi) by kunchenguid.

## License

MIT, see [LICENSE](LICENSE).

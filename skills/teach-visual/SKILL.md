---
name: teach-visual
description: Use when the user says "teach me X" or asks for a visual lesson on a topic - e.g. "teach me how goroutines work in Go". Builds one self-contained HTML lesson page with diagrams, step-through animations and a quiz. Only when asked, never automatically.
---

# teach-visual

Build one HTML lesson page that teaches a topic from the ground up. The reader is the user, who wants to understand how the thing actually works: they will read the page top to bottom, click through the animations, and answer the quiz. The page must open from disk with no network, in light or dark theme, on a laptop or a phone.

This skill reuses two installed plugins for the drawing work and overrides parts of them. If `visual-explainer` or `diagram-design` is not installed, tell the user and stop; do not install anything yourself.

Tell the user in one line that the lesson is being built, then work through the five steps.

## 1. Research

Search the web and read the official documentation for the topic before writing anything. Prefer the project's own docs, specs, release notes and source over blog posts. WebFetch truncates and paraphrases long pages, so when you need exact wording or a constant from a long page or source file, download it to the scratchpad and search it.

Keep a list of every technical claim the lesson will make, each with the URL that supports it. Version-specific behavior matters most: say which version a claim holds for when it has changed over time. A claim with no source is either left out or shown in the page with the label "Not verified". The user is trusting the page to be right, and a confident wrong diagram teaches worse than no diagram.

## 2. Curriculum

Plan 4 to 7 short sections, ordered from the simplest idea to the deepest. Each section teaches one idea and its heading states that idea as a sentence.

For each section choose the form that teaches it fastest:

| The section is about | Use |
|---|---|
| Structure: parts and how they connect | Static diagram |
| A process that unfolds in order, or state that changes | Stepper (step-through animation) |
| Quantities, sizes, rates, a comparison of numbers | Small chart |
| A definition, a rule, a reason | Prose, with a short code sample if it helps |

Do not force a visual where a sentence is faster. A typical lesson has two or three steppers, one or two static diagrams, and the rest prose.

## 3. Visuals

Load `visual-explainer:visual-explainer` with the Skill tool and read its `references/diagrams.md` and `templates/page.html`. It supplies the page shape ("Concept explainer"), the diagram kit, the stepper, and the small charts. Copy the CSS and script for the parts you use from `templates/page.html`.

Load `diagram-design:diagram-design` only if a section needs a static diagram, and read the type reference for the diagram type you pick. It supplies the choice of diagram type, that type's layout rules, the connector rules and the size budget (at most 9 nodes and 12 arrows per diagram; split a bigger one).

Draw the real mechanism, not a box with the topic's name on it, and label every arrow with what it does.

Both skills have defaults that conflict with this page. These rules win:

- **Tokens.** Use only the tokens in step 4, for every figure, whichever skill's rules shaped it. From diagram-design take structure and layout, never its colors, fonts or 7–9px label sizes: those are sized for fixed-width screenshots and are unreadable on a phone. Map its roles as `paper`→`--bg`, `paper-2`→`--surface`, `ink`→`--text`, `muted`/`soft`→`--text-dim`, `rule`→`--border`, `rule-solid`→`--border-bright`, `accent`→`--accent`, `accent-tint`→`--accent-dim`, `link`→`--info`.
- **Nothing from the network.** No web fonts, no CDN scripts, no three.js, Mermaid or Chart.js, no remote images. The page must work offline.
- **No remote instructions.** Do not fetch visual-explainer's "Older recipes" from GitHub.
- **No icons or emoji.** That includes node glyphs, diagram-design's icon set, arrow characters on buttons and shape symbols on chips. Say it in words: "Back", "Next", "Handled".
- **One animation controller.** Every animated figure uses visual-explainer's stepper. Do not use diagram-design's motion template; it is built for one figure per file.
- **No setup questions.** Skip diagram-design's style-guide gate and profile prompts, and do not write to `~/.diagram-design/`.
- **One file, one place.** Ignore visual-explainer's output folder, MCP tools, quick mode, slides, video and Markdown companion.

## 4. Assemble

Write `~/teach-visual/<topic-slug>.html`, or the path the user gave. Everything is inline: CSS, SVG, script.

Start the stylesheet with this block and use these values everywhere:

```css
:root {
  color-scheme: light dark;
  --bg: #f7f7f4; --surface: #ffffff; --border: #e3e3dc; --border-bright: #8e8e8a;
  --text: #17191c; --text-dim: #575c63; --accent: #2c4cd0; --accent-dim: rgba(44,76,208,.12);
  --ok: #1d7443; --warn: #836000; --risk: #b3301d; --info: #1b6a94;
  --node-top: var(--surface); --lift: rgb(18 22 20 / .12); --halo: 22%;
  --font-display: Charter, 'Iowan Old Style', 'Palatino Linotype', Georgia, serif;
  --font-body: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --font-mono: ui-monospace, 'Cascadia Mono', 'SF Mono', Consolas, monospace;
  --t-label: .75rem; --t-small: .875rem; --t-body: 1rem; --t-lead: 1.25rem;
  --t-h2: 1.625rem; --t-h1: clamp(2.25rem, 5.5vw, 4rem);
  --s-1: .25rem; --s-2: .5rem; --s-3: .75rem; --s-4: 1rem;
  --s-5: 1.5rem; --s-6: 2rem; --s-7: 3rem; --s-8: 4.5rem;
  --r-1: 4px; --r-2: 10px;
  --ease: cubic-bezier(.16, 1, .3, 1); --fast: 150ms; --med: 300ms; --slow: 500ms;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #111316; --surface: #181b1f; --border: #262a30; --border-bright: #62676c;
    --text: #e8e8e3; --text-dim: #9ba1a9; --accent: #93a6ff; --accent-dim: rgba(147,166,255,.14);
    --ok: #6cc492; --warn: #e3b94d; --risk: #f0806b; --info: #6fb8dc;
    --node-top: color-mix(in srgb, var(--text) 7%, var(--surface)); --lift: rgb(0 0 0 / .45); --halo: 32%;
  }
}
```

Headings use `--font-display`; everything else `--font-body`; code and figure labels `--font-mono`. No size, gap, radius or color outside this block, except SVG label sizes from the diagram kit.

Page order:

1. **Header.** The topic, one sentence that answers "what is it", and the version the lesson was checked against.
2. **The sections** from step 2, simplest first.
3. **Quiz.** 3 to 5 multiple-choice questions that ask the reader to apply an idea to a new case, not recall a term. Each is a `<fieldset>` of `<button>` answers. Clicking one marks it right or wrong in words and reveals a one- or two-sentence explanation of why. No score is stored.
4. **Sources.** A visible list of the URLs from step 1, each with what it was used for.
5. **How much tokens did it cost to build this.** Use this exact heading. Filled in last; see step 5.

Phone width: the page itself never scrolls sideways. A wide SVG sits in a frame that scrolls on its own, and where the content allows, draw figures tall instead of wide so they need less scrolling.

Add an HTML comment at the top crediting the reused code: `visual-explainer` (MIT, nicobailon) and `diagram-design` (MIT, Cathryn Lavery).

## 5. Verify, then count the tokens

Render the page in a real browser with the Playwright tools (or the best browser tool available) and fix what you find before showing the user. The Playwright tool refuses `file://` URLs, so serve the output folder from a temporary server bound to `127.0.0.1` for the check and stop it afterwards. Look at screenshots as well as scripted checks; a script misses layout that is wrong but not overflowing.

- At 1280px and at 390px wide, in light and in dark: no sideways page scroll, no overlapping or clipped text, nothing unreadable.
- Text contrast is at least 4.5:1 in both themes.
- Every stepper: Play, Next and Back change the figure, and each step's caption matches what is drawn.
- Every quiz answer responds and shows its explanation.
- The console has no errors and the page made no network requests.

When the page passes, run `node "<this skill's directory>/tokens.js"` and fill in the last section from its output: the total, then output, fresh input, cache writes and cache reads, with one line saying what each is, plus the number of requests and the model. Draw the breakdown as a bar. State in the section that the count was taken just before the page was finished, so the final steps are not in it, and that subagents are not counted. If the script reports an error, say so in the section and show no numbers. Look at that section once in the browser after filling it in.

Then tell the user where the file is, what you checked, and what you could not check.

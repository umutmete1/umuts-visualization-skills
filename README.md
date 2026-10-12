# Umut's visualization skills

Two [Claude Code](https://claude.com/claude-code) skills that turn text into visual HTML pages.

| Skill | Say | You get |
|---|---|---|
| `teach-visual` | "teach me how goroutines work in Go" | One self-contained HTML lesson: diagrams, step-through animations, a quiz, and the sources it was checked against. |
| `visual-review` | "/visual-review docs/plan.md" | A short visual summary of a long plan or spec, opened in your browser. Click any part, write a note, hit Send, and Claude updates the doc and the page. |

Both run only when you ask for them.

## Install

In Claude Code:

```
/plugin marketplace add umutmete1/umuts-visualization-skills
/plugin install umuts-visualization-skills@umuts-visualization-skills
```

The skills are then available as `/umuts-visualization-skills:teach-visual` and `/umuts-visualization-skills:visual-review`.

Prefer the short names (`/teach-visual`, `/visual-review`)? Copy the two folders from `skills/` into `~/.claude/skills/` instead.

## Requirements

- Node.js 18 or newer. No npm packages are needed.
- `teach-visual` reuses two other plugins for the drawing work and stops if they are missing: [visual-explainer](https://github.com/nicobailon/visual-explainer) and [diagram-design](https://github.com/cathrynlavery/diagram-design).
- `teach-visual` checks the finished page in a browser, so a browser tool such as the Playwright plugin helps.

## How visual-review works

`review.js` starts a small local server bound to your own machine, serves the review page, and waits for your notes. Nothing is sent anywhere else. Review state is kept in `~/.visual-review/`.

Run its tests with:

```
cd skills/visual-review
node --test
```

## Credits

- `teach-visual` builds on [visual-explainer](https://github.com/nicobailon/visual-explainer) by nicobailon and [diagram-design](https://github.com/cathrynlavery/diagram-design) by Cathryn Lavery, both MIT.
- `visual-review` was inspired by [lavish-axi](https://github.com/kunchenguid/lavish-axi) by kunchenguid.

## License

MIT, see [LICENSE](LICENSE).

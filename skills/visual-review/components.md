# visual-review components

All styles come from `/_vr/base.css`. Colours: use classes `c1`…`c6` (indigo, sky, amber, green, pink, violet) on bars/legend items; `good` / `warn` / `bad` for status. Don't hard-code colours.

## Pick by content

| The doc has… | Use |
|---|---|
| Key numbers (phases, days, cost, risks) | **Stat tiles** — top of the page, right after the title |
| Phases / milestones with durations | **Timeline** |
| Systems, services, data stores that talk to each other | **Architecture diagram** |
| A flow over time between actors (request → response) | **Sequence diagram** |
| Risks | **Risk matrix** (3+ risks) or status cards (1–2) |
| Options / alternatives / trade-offs | **Comparison table** |
| Task list with status | **Progress + checklist** |
| 2–4 key points, principles, decisions | **Status cards** |
| A change from current state to new state | **Before / after** |
| Shares, splits, budgets, effort per part | **Charts** |
| The big picture of a broad topic | **Mind map** |
| Open questions the user must answer | **Clickable decisions** (always) |

No icons: don't add icon images or emoji.

## Stat tiles
```html
<div class="stats">
  <div class="stat"><b>4</b><span>phases</span></div>
  <div class="stat warn"><b>3</b><span>risks, 1 high</span></div>
</div>
```

## Timeline
Set `--cols` to the number of ticks; each bar's `grid-column` is `<tick + 1> / span <length>`.
```html
<div class="gantt" style="--cols:9">
  <span></span><span class="tick">D1</span><span class="tick">D2</span>…<span class="tick">D9</span>
  <span class="lbl">Accounts</span><div class="bar c1" style="grid-column: 2 / span 2">2 days</div>
  <span class="lbl">Screens</span><div class="bar c3" style="grid-column: 6 / span 3">3 days</div>
</div>
```

## Architecture diagram
Boxes `rect.box` (`.accent` for the main one), labels `text.t` + `text.s`, arrows `path.line` with the marker. Keep a 760-wide viewBox; leave ≥ 60px between boxes for arrow labels.
```html
<div class="diagram"><svg viewBox="0 0 760 230" role="img" aria-label="Architecture">
  <defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path class="head" d="M0,0 L10,5 L0,10 z"/></marker></defs>
  <rect class="box" x="20" y="80" width="150" height="70" rx="12"/>
  <text class="t" x="95" y="112" text-anchor="middle">App</text><text class="s" x="95" y="132" text-anchor="middle">browser</text>
  <rect class="box accent" x="300" y="80" width="170" height="70" rx="12"/>
  <text class="t" x="385" y="112" text-anchor="middle">API server</text>
  <path class="line" d="M170 115 H298" marker-end="url(#ah)"/><text class="s" x="234" y="105" text-anchor="middle">HTTPS</text>
</svg></div>
```
Curved arrow to a box above/below: `d="M470 105 C530 105 530 55 588 55"`. Dashed (async/optional): add class `dash`.

## Sequence diagram
Actors on top, dashed lifelines, numbered `path.msg` arrows going down in time (~40px apart).
```html
<div class="diagram"><svg viewBox="0 0 760 260" role="img" aria-label="Login sequence">
  <defs><marker id="am" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path class="head accent" d="M0,0 L10,5 L0,10 z"/></marker></defs>
  <rect class="box" x="40" y="10" width="140" height="40" rx="10"/><text class="t" x="110" y="35" text-anchor="middle">User</text>
  <rect class="box accent" x="310" y="10" width="140" height="40" rx="10"/><text class="t" x="380" y="35" text-anchor="middle">Server</text>
  <line class="life" x1="110" y1="50" x2="110" y2="250"/><line class="life" x1="380" y1="50" x2="380" y2="250"/>
  <path class="msg" d="M110 85 H376" marker-end="url(#am)"/><text class="s" x="245" y="77" text-anchor="middle">1 · email + password</text>
  <path class="msg" d="M380 125 H114" marker-end="url(#am)"/><text class="s" x="245" y="117" text-anchor="middle">2 · session cookie</text>
</svg></div>
```
Use a unique marker `id` per diagram on the same page.

## Risk matrix
Rows top → bottom = high → low impact; columns = unlikely → likely. Cells: `lo` green, default amber, `hi` red.
```html
<div class="matrix">
  <div class="ax">High<br>impact</div><div class="cell"></div><div class="cell hi"><span class="dot">Data dupes</span></div><div class="cell hi"></div>
  <div class="ax">Medium</div><div class="cell lo"></div><div class="cell"><span class="dot">No reset</span></div><div class="cell hi"></div>
  <div class="ax">Low</div><div class="cell lo"><span class="dot">Guessing</span></div><div class="cell lo"></div><div class="cell"></div>
  <div></div><div class="ax">Unlikely</div><div class="ax">Possible</div><div class="ax">Likely</div>
</div>
```

## Comparison table
```html
<table class="compare">
  <tr><th>Option</th><th>Effort</th><th>Security</th></tr>
  <tr class="pick"><td><b>Email + password</b></td><td class="m">~9 days</td><td class="y">Good</td></tr>
  <tr><td><b>Magic link</b></td><td class="m">~6 days</td><td class="n">Weak</td></tr>
</table>
```

## Progress + checklist
Pills: `done`, `doing`, `blocked`, or none (to do).
```html
<div class="progress"><i style="width:30%"></i></div>
<ul class="checklist">
  <li class="is-done"><span>Create users table</span><span class="pill done">done</span></li>
  <li><span>POST /signup</span><span class="pill doing">in progress</span></li>
  <li><span>POST /login</span><span class="pill">to do</span></li>
</ul>
```

## Status cards
Coloured top edge: `good`, `warn`, `bad`, or `accent`.
```html
<div class="cards">
  <div class="card warn"><h3>Migration risk</h3><p>Guest data could duplicate.</p></div>
  <div class="card good"><h3>Secure by default</h3><p>argon2 hashes, HttpOnly cookies.</p></div>
</div>
```

## Before / after
```html
<div class="beforeafter">
  <div class="side"><h3>Today</h3><ul><li>Trades on one device</li></ul></div>
  <div class="mid"></div>
  <div class="side after"><h3>After</h3><ul><li>Sign in anywhere</li></ul></div>
</div>
```

## Charts
Donut: `conic-gradient` stops are cumulative percentages, colours `var(--c1)`…; bars: `width` = share.
```html
<div class="chart">
  <div class="donut" style="background: conic-gradient(var(--c1) 0 22%, var(--c2) 22% 44%, var(--c3) 44% 78%, var(--c4) 78% 100%)"><span>9 days</span></div>
  <ul class="legend"><li class="c1">Accounts · 2d</li><li class="c2">Sessions · 2d</li><li class="c3">Screens · 3d</li><li class="c4">Guest data · 2d</li></ul>
  <div class="hbars">
    <div class="hbar c3"><span>Screens</span><span class="track"><i style="width:34%"></i></span><span>3d</span></div>
  </div>
</div>
```

## Mind map
Centre `rect.box.accent` (pill, `rx` = half height), 3–6 branches with curved `path.line`, drawn **before** the boxes so lines sit behind them.
```html
<div class="diagram"><svg viewBox="0 0 760 260" role="img" aria-label="Mind map">
  <path class="line" d="M380 130 C300 130 260 50 170 50"/><path class="line" d="M380 130 C460 130 500 210 590 210"/>
  <rect class="box accent" x="300" y="105" width="160" height="50" rx="25"/><text class="t" x="380" y="135" text-anchor="middle">Login</text>
  <rect class="box" x="60" y="28" width="150" height="44" rx="10"/><text class="t" x="135" y="55" text-anchor="middle">Accounts</text>
  <rect class="box" x="550" y="188" width="150" height="44" rx="10"/><text class="t" x="625" y="215" text-anchor="middle">Guest data</text>
</svg></div>
```

## Clickable decisions
One block per open question. A click queues `Answer: <data-vr-answer>` as a note (quote = the question); picking again replaces it. Works in Read and Comment mode.
```html
<div class="decision" data-vr-question="How long should remember-me last?">
  <p class="q">How long should "remember me" last?</p>
  <button type="button" data-vr-answer="30 days"><b>30 days</b><span>Safer; sign in monthly</span></button>
  <button type="button" data-vr-answer="90 days"><b>90 days</b><span>Less friction</span></button>
</div>
```

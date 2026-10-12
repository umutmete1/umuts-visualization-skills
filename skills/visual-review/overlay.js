// visual-review comment overlay. Injected by the review server at serve time; never saved into the page.
(() => {
  'use strict';
  const me = document.querySelector('script[data-vr-id]');
  if (!me || window.__visualReview) return;
  window.__visualReview = true;

  const id = me.getAttribute('data-vr-id');
  const PANEL_W = 340;
  const key = (k) => `vr:${id}:${k}`;
  const store = {
    get(k, fallback) {
      try {
        const v = localStorage.getItem(key(k));
        return v == null ? fallback : JSON.parse(v);
      } catch {
        return fallback;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(key(k), JSON.stringify(v));
      } catch {
        // storage unavailable (private window etc.): state lives in memory only
      }
    },
  };

  let queue = store.get('queue', []);
  let mode = store.get('mode', 'read');
  let collapsed = store.get('collapsed', false);
  let draft = store.get('draft', null);
  let status = 'working';
  let ended = false;
  let busy = false;
  let replies = [];
  let boxOpenedAt = 0;

  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    [hidden] { display: none !important; }
    .panel, .box, .fab { --bg: #fff; --fg: #1d1d1f; --muted: #6b6b70; --line: #e3e3e0; --soft: #f5f5f3; --accent: #4f46e5;
      cursor: auto; pointer-events: auto; color: var(--fg); font-size: 14px; line-height: 1.45; }
    @media (prefers-color-scheme: dark) {
      .panel, .box, .fab { --bg: #1d1d20; --fg: #ececef; --muted: #9a9aa3; --line: #2e2e33; --soft: #26262a; --accent: #8b8cf8; }
    }
    .hl { position: fixed; border: 2px solid #4f46e5; background: rgba(79, 70, 229, .08); border-radius: 6px; pointer-events: none; }
    .pin { position: fixed; width: 22px; height: 22px; border-radius: 50%; background: #4f46e5; color: #fff; font: 700 12px/22px system-ui, sans-serif;
      text-align: center; box-shadow: 0 1px 4px rgba(0, 0, 0, .3); pointer-events: auto; cursor: default; }
    .box { position: fixed; width: 360px; background: var(--bg); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 8px 32px rgba(0, 0, 0, .18); padding: 12px; }
    .box-head { font-size: 12px; color: var(--muted); margin-bottom: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    textarea { width: 100%; resize: vertical; border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; background: var(--soft); color: var(--fg); font-size: 14px; }
    textarea:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
    .hint { font-size: 11px; color: var(--muted); margin: 6px 0 10px; }
    .row { display: flex; gap: 8px; justify-content: flex-end; }
    button { font-size: 13px; border: 1px solid var(--line); background: var(--bg); color: var(--fg); border-radius: 8px; padding: 7px 12px; cursor: pointer; }
    button:hover:not(:disabled) { background: var(--soft); }
    button:disabled { opacity: .45; cursor: default; }
    button.primary, .modes button.on { background: var(--accent); border-color: var(--accent); color: #fff; }
    button.primary:hover:not(:disabled) { background: var(--accent); filter: brightness(1.08); }
    button.icon { border: none; padding: 2px 8px; font-size: 16px; line-height: 1; background: transparent; }
    .panel { position: fixed; top: 0; right: 0; bottom: 0; width: ${PANEL_W}px; background: var(--bg); border-left: 1px solid var(--line);
      box-shadow: -4px 0 24px rgba(0, 0, 0, .08); display: flex; flex-direction: column; }
    header { padding: 14px 16px 12px; border-bottom: 1px solid var(--line); }
    .title { display: flex; justify-content: space-between; align-items: center; font-weight: 700; font-size: 15px; margin-bottom: 10px; }
    .modes { display: flex; gap: 6px; align-items: center; }
    .kbd { margin-left: auto; font-size: 11px; color: var(--muted); }
    .status { display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 13px; color: var(--muted); }
    .dot { width: 9px; height: 9px; border-radius: 50%; background: #d97706; }
    .panel[data-status="listening"] .dot { background: #16a34a; }
    .panel[data-status="ended"] .dot, .panel[data-status="offline"] .dot { background: #9ca3af; }
    .panel[data-status="working"] .dot { animation: pulse 1.2s ease-in-out infinite; }
    @keyframes pulse { 50% { opacity: .35; } }
    .scroll { flex: 1; overflow-y: auto; padding: 4px 16px 16px; }
    h4 { font-size: 11px; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); margin: 16px 0 8px; }
    .reply { background: var(--soft); border-radius: 10px; padding: 8px 10px; margin-bottom: 6px; white-space: pre-wrap; }
    .queue { list-style: none; margin: 0; padding: 0; }
    .queue li { border: 1px solid var(--line); border-radius: 10px; padding: 8px; margin-bottom: 8px; }
    .q-head { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; font-size: 12px; color: var(--muted); }
    .q-num { flex: none; width: 20px; height: 20px; border-radius: 50%; background: var(--accent); color: #fff; font-weight: 700; font-size: 11px; display: grid; place-items: center; }
    .q-where { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .empty { color: var(--muted); font-size: 13px; margin: 0; }
    footer { border-top: 1px solid var(--line); padding: 12px 16px; }
    .msg { font-size: 12px; color: var(--muted); min-height: 16px; margin-bottom: 8px; }
    .msg.err { color: #dc2626; }
    footer .row button { flex: 1; }
    button.approve { width: 100%; margin-top: 8px; background: #16a34a; border-color: #16a34a; color: #fff; font-weight: 600; }
    button.approve:hover:not(:disabled) { background: #16a34a; filter: brightness(1.08); }
    .fab { position: fixed; right: 16px; bottom: 16px; background: var(--accent); color: #fff; border: none; border-radius: 999px; padding: 10px 16px;
      font-size: 15px; box-shadow: 0 4px 16px rgba(0, 0, 0, .2); }
  `;

  const host = document.createElement('div');
  host.setAttribute('data-vr-overlay', '');
  host.style.cssText = 'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${STYLE}</style>
    <div class="hl" hidden></div>
    <div class="pins"></div>
    <div class="box" hidden>
      <div class="box-head"></div>
      <textarea rows="4" placeholder="Your note…"></textarea>
      <div class="hint">Enter to queue · Shift+Enter for a new line · Esc to cancel</div>
      <div class="row"><button type="button" data-act="cancel">Cancel</button><button type="button" class="primary" data-act="queue">Queue note</button></div>
    </div>
    <button type="button" class="fab" data-act="expand" hidden></button>
    <aside class="panel">
      <header>
        <div class="title">Visual review <button type="button" class="icon" data-act="collapse" title="Hide panel">&#x27E9;</button></div>
        <div class="modes"><button type="button" data-mode="read">Read</button><button type="button" data-mode="comment">Comment</button><span class="kbd">Ctrl+I</span></div>
        <div class="status"><span class="dot"></span><span class="status-text"></span></div>
      </header>
      <div class="scroll">
        <section class="replies-wrap" hidden><h4>Agent</h4><div class="replies"></div></section>
        <section><h4>Queued notes <span class="count"></span></h4><ol class="queue"></ol>
          <p class="empty">Switch to <b>Comment</b>, then click any part of the page or select text to leave a note.</p></section>
        <section><h4>General message</h4><textarea class="general" rows="3" placeholder="Feedback not tied to one spot…"></textarea></section>
      </div>
      <footer>
        <div class="msg" role="status"></div>
        <div class="row"><button type="button" class="primary" data-act="send">Send</button><button type="button" data-act="done">Send &amp; Done</button></div>
        <button type="button" class="approve" data-act="approve" title="Approve the document as it is - no changes">Looks good &#x2713;</button>
      </footer>
    </aside>`;
  (document.body || document.documentElement).appendChild(host);

  const cursorStyle = document.createElement('style');
  cursorStyle.textContent = 'html.vr-commenting, html.vr-commenting body * { cursor: crosshair !important; }';
  (document.head || document.documentElement).appendChild(cursorStyle);

  const $ = (s) => root.querySelector(s);
  const hl = $('.hl');
  const pins = $('.pins');
  const box = $('.box');
  const boxHead = $('.box-head');
  const boxText = $('.box textarea');
  const panel = $('.panel');
  const fab = $('.fab');
  const statusText = $('.status-text');
  const repliesWrap = $('.replies-wrap');
  const repliesEl = $('.replies');
  const queueEl = $('.queue');
  const countEl = $('.count');
  const emptyEl = $('.empty');
  const general = $('.general');
  const msg = $('.msg');
  const sendBtn = $('[data-act="send"]');
  const doneBtn = $('[data-act="done"]');
  const approveBtn = $('[data-act="approve"]');
  let picks = store.get('picks', {}); // question -> answer, for clickable decisions
  general.value = store.get('general', '');

  // ---- helpers
  const oneLine = (s, n) => {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n - 1) + '…' : t;
  };
  const isOurs = (e) => e.composedPath().includes(host);
  function el(tag, props = {}, ...kids) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    node.append(...kids);
    return node;
  }

  const TARGETS = 'li, p, tr, td, th, h1, h2, h3, h4, h5, h6, pre, figure, blockquote, summary, img, svg, .card, .node, dt, dd';
  function targetOf(node) {
    const start = node && (node.nodeType === 1 ? node : node.parentElement);
    if (!start || start === host || start === document.body || start === document.documentElement) return null;
    return start.closest(TARGETS) || start.closest('section, article, details, [data-vr-section]') || start;
  }

  function sectionOf(target) {
    const tagged = target.closest('[data-vr-section]');
    if (tagged) return tagged.getAttribute('data-vr-section');
    let best = null;
    for (const h of document.querySelectorAll('h1, h2, h3, h4')) {
      if (h === target || h.contains(target) || h.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING) best = h;
      else break;
    }
    return best ? oneLine(best.textContent, 200) : null;
  }

  function selectorOf(target) {
    const parts = [];
    let node = target;
    while (node && node.nodeType === 1 && node !== document.body) {
      if (node.id) {
        parts.unshift('#' + CSS.escape(node.id));
        return parts.join(' > ');
      }
      const tag = node.tagName.toLowerCase();
      const same = node.parentElement ? [...node.parentElement.children].filter((c) => c.tagName === node.tagName) : [];
      parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(node) + 1})` : tag);
      node = node.parentElement;
    }
    return ['body', ...parts].join(' > ');
  }

  const snippet = (target) =>
    oneLine(target.innerText || target.textContent || target.getAttribute('alt') || target.getAttribute('aria-label') || target.tagName.toLowerCase(), 160);

  function place(node, rect, pad = 3) {
    node.style.top = rect.top - pad + 'px';
    node.style.left = rect.left - pad + 'px';
    node.style.width = rect.width + pad * 2 + 'px';
    node.style.height = rect.height + pad * 2 + 'px';
  }

  const saveQueue = () => store.set('queue', queue);
  function say(text, isError = false) {
    msg.textContent = text;
    msg.classList.toggle('err', isError);
  }

  // ---- note box
  function openBox(target, quote) {
    draft = { selector: selectorOf(target), section: sectionOf(target), quote: quote || snippet(target), text: '' };
    boxOpenedAt = Date.now();
    showBox(target.getBoundingClientRect());
  }

  function showBox(rect) {
    boxHead.textContent = (draft.section ? draft.section + ' · ' : '') + '“' + oneLine(draft.quote, 90) + '”';
    const maxLeft = window.innerWidth - (collapsed ? 0 : PANEL_W) - 372;
    box.style.left = Math.max(8, Math.min(rect.left, maxLeft)) + 'px';
    box.style.top = Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 210)) + 'px';
    box.hidden = false;
    hl.hidden = true;
    boxText.value = draft.text || '';
    boxText.focus();
    store.set('draft', draft);
  }

  function closeBox() {
    box.hidden = true;
    draft = null;
    store.set('draft', null);
  }

  function queueDraft() {
    const text = boxText.value.trim();
    if (!draft || !text) return;
    queue.push({ selector: draft.selector, section: draft.section, quote: draft.quote, note: text });
    saveQueue();
    closeBox();
    render();
  }

  // Keep a half-typed note rather than replacing it with a new box.
  const boxBusy = () => !box.hidden && boxText.value.trim();

  // ---- rendering
  const STATUS = { listening: 'Agent is listening', working: 'Agent is working…', ended: 'Review ended', offline: 'Can’t reach the review server' };

  function renderPins() {
    pins.textContent = '';
    queue.forEach((q, i) => {
      let target = null;
      try {
        target = q.selector && document.querySelector(q.selector);
      } catch {}
      if (!target) return;
      const r = target.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      const pin = el('div', { className: 'pin', textContent: String(i + 1), title: q.note });
      pin.style.top = Math.max(4, r.top - 10) + 'px';
      pin.style.left = Math.max(4, r.right - 12) + 'px'; // top-right corner: top-left often holds the element's own marker
      pins.append(pin);
    });
  }

  function renderQueue() {
    queueEl.textContent = '';
    queue.forEach((q, i) => {
      const text = el('textarea', { rows: 2, value: q.note });
      text.addEventListener('input', () => {
        q.note = text.value;
        saveQueue();
      });
      const del = el('button', { type: 'button', className: 'icon', textContent: '×', title: 'Remove note' });
      del.addEventListener('click', () => {
        queue.splice(i, 1);
        saveQueue();
        if (q.qkey) {
          delete picks[q.qkey];
          store.set('picks', picks);
        }
        render();
      });
      const where = (q.section ? q.section + ' · ' : '') + '“' + oneLine(q.quote, 60) + '”';
      queueEl.append(
        el('li', {}, el('div', { className: 'q-head' }, el('span', { className: 'q-num', textContent: String(i + 1) }), el('span', { className: 'q-where', textContent: where }), del), text),
      );
    });
    countEl.textContent = queue.length ? `(${queue.length})` : '';
    emptyEl.hidden = queue.length > 0;
  }

  function renderReplies() {
    repliesEl.textContent = '';
    for (const r of replies) repliesEl.append(el('div', { className: 'reply', textContent: r.text }));
    repliesWrap.hidden = replies.length === 0;
    if (repliesEl.lastChild) repliesEl.lastChild.scrollIntoView({ block: 'nearest' });
  }

  function render() {
    for (const b of root.querySelectorAll('[data-mode]')) b.classList.toggle('on', b.dataset.mode === mode);
    document.documentElement.classList.toggle('vr-commenting', mode === 'comment' && !ended);
    panel.hidden = collapsed;
    fab.hidden = !collapsed;
    fab.textContent = '💬' + (queue.length ? ' ' + queue.length : '');
    if (document.body) document.body.style.marginRight = collapsed ? '' : PANEL_W + 'px';
    panel.dataset.status = status;
    statusText.textContent = STATUS[status] || status;
    sendBtn.textContent = queue.length ? `Send (${queue.length})` : 'Send';
    sendBtn.disabled = busy || ended || (!queue.length && !general.value.trim());
    doneBtn.disabled = busy || ended;
    // Approving means "no changes", so it only makes sense with nothing queued.
    approveBtn.disabled = busy || ended || queue.length > 0 || !!general.value.trim();
    approveBtn.title = approveBtn.disabled && !ended ? 'Send or remove your queued notes first' : 'Approve the document as it is - no changes';
    general.disabled = ended;
    for (const dq of document.querySelectorAll('[data-vr-question]')) {
      const picked = picks[dq.getAttribute('data-vr-question')];
      for (const b of dq.querySelectorAll('[data-vr-answer]')) b.classList.toggle('picked', b.getAttribute('data-vr-answer') === picked);
    }
    for (const b of root.querySelectorAll('[data-mode]')) b.disabled = ended;
    renderQueue();
    renderPins();
  }

  function setMode(next) {
    if (ended) return;
    mode = next;
    store.set('mode', mode);
    hl.hidden = true;
    render();
  }

  function setEnded() {
    ended = true;
    status = 'ended';
    mode = 'read';
    closeBox();
    hl.hidden = true;
  }

  // ---- clickable decisions: one click queues the answer; a new pick replaces the old one
  function pickAnswer(question, answerEl) {
    const q = question.getAttribute('data-vr-question');
    const answer = answerEl.getAttribute('data-vr-answer');
    queue = queue.filter((n) => n.qkey !== q);
    queue.push({ selector: selectorOf(question), section: sectionOf(question), quote: q, note: `Answer: ${answer}`, qkey: q });
    picks[q] = answer;
    saveQueue();
    store.set('picks', picks);
    say(`Queued your answer: ${answer}`);
    render();
  }

  async function approve() {
    busy = true;
    render();
    say('Sending…');
    try {
      const r = await fetch('/_vr/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, notes: [], end: true, approved: true }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message || `HTTP ${r.status}`);
      setEnded();
      say('Approved as it is - no changes. The agent will carry on.');
    } catch (err) {
      say(`Couldn’t approve (${err.message}).`, true);
    } finally {
      busy = false;
      render();
    }
  }

  // ---- sending
  async function send(end) {
    const notes = queue.map(({ section, quote, note }) => ({ section, quote, note })).filter((n) => n.note.trim());
    const g = general.value.trim();
    if (g) notes.push({ section: null, quote: null, note: g });
    if (!notes.length && !end) return;
    busy = true;
    render();
    say('Sending…');
    try {
      const r = await fetch('/_vr/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, notes, end }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message || `HTTP ${r.status}`);
      queue = [];
      saveQueue();
      general.value = '';
      store.set('general', '');
      if (end) setEnded();
      say(end ? 'Sent. This review is finished.' : 'Sent - the agent is on it.');
    } catch (err) {
      say(`Couldn’t send (${err.message}). Your notes are still queued.`, true);
    } finally {
      busy = false;
      render();
    }
  }

  // ---- events
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.mode) return setMode(b.dataset.mode);
    const act = b.dataset.act;
    if (act === 'queue') queueDraft();
    else if (act === 'cancel') closeBox();
    else if (act === 'send') send(false);
    else if (act === 'done') send(true);
    else if (act === 'approve') approve();
    else if (act === 'collapse' || act === 'expand') {
      collapsed = act === 'collapse';
      store.set('collapsed', collapsed);
      render();
    }
  });

  boxText.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      queueDraft();
    } else if (e.key === 'Escape' && !boxText.value.trim()) closeBox();
  });
  boxText.addEventListener('input', () => {
    if (!draft) return;
    draft.text = boxText.value;
    store.set('draft', draft);
  });
  general.addEventListener('input', () => {
    store.set('general', general.value);
    sendBtn.disabled = busy || ended || (!queue.length && !general.value.trim());
    approveBtn.disabled = busy || ended || queue.length > 0 || !!general.value.trim();
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      setMode(mode === 'comment' ? 'read' : 'comment');
    }
  }, true);

  document.addEventListener('mousemove', (e) => {
    if (mode !== 'comment' || ended || !box.hidden || isOurs(e)) {
      hl.hidden = true;
      return;
    }
    const t = targetOf(e.target);
    if (t) {
      place(hl, t.getBoundingClientRect());
      hl.hidden = false;
    } else hl.hidden = true;
  }, true);

  document.addEventListener('mouseup', (e) => {
    if (mode !== 'comment' || ended || isOurs(e) || boxBusy()) return;
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : '';
    if (!text) return;
    const t = targetOf(sel.anchorNode);
    if (t) openBox(t, text.slice(0, 1000));
  }, true);

  document.addEventListener('click', (e) => {
    if (isOurs(e)) return;
    // Decision buttons work in both Read and Comment mode.
    const answerEl = e.target.closest && e.target.closest('[data-vr-answer]');
    const question = answerEl && answerEl.closest('[data-vr-question]');
    if (question) {
      e.preventDefault();
      e.stopPropagation();
      if (!ended) pickAnswer(question, answerEl);
      return;
    }
    if (mode !== 'comment' || ended) return;
    e.preventDefault();
    e.stopPropagation();
    if (Date.now() - boxOpenedAt < 400) return; // this click ended a text selection
    if (boxBusy()) return boxText.focus();
    const t = targetOf(e.target);
    if (t) openBox(t, null);
  }, true);

  // Other tabs of the same review share one queue: pick up their changes instead of overwriting them.
  window.addEventListener('storage', (e) => {
    if (e.key === key('queue')) queue = store.get('queue', []);
    else if (e.key === key('general')) general.value = store.get('general', '');
    else if (e.key === key('picks')) picks = store.get('picks', {});
    else return;
    render();
  });

  let raf = 0;
  const reflow = () => {
    if (!raf) raf = requestAnimationFrame(() => ((raf = 0), renderPins()));
  };
  window.addEventListener('scroll', reflow, true);
  window.addEventListener('resize', reflow);

  // ---- server connection
  function connect() {
    const es = new EventSource(`/_vr/events?id=${id}`);
    es.addEventListener('status', (e) => {
      status = JSON.parse(e.data).status;
      if (status === 'ended') setEnded();
      render();
    });
    es.addEventListener('reply', (e) => {
      replies.push(JSON.parse(e.data));
      renderReplies();
    });
    es.addEventListener('reload', () => {
      try {
        sessionStorage.setItem(key('scroll'), String(window.scrollY));
      } catch {}
      location.reload();
    });
    es.onerror = () => {
      if (ended) return es.close();
      status = 'offline';
      render();
    };
  }

  fetch(`/_vr/api/state?id=${id}`)
    .then((r) => r.json())
    .then((j) => {
      if (Array.isArray(j.replies)) replies = j.replies;
      if (j.status) status = j.status;
      if (status === 'ended') setEnded();
      renderReplies();
      render();
    })
    .catch(() => {});
  connect();
  render();

  try {
    const y = sessionStorage.getItem(key('scroll'));
    if (y !== null) {
      sessionStorage.removeItem(key('scroll'));
      window.addEventListener('load', () => window.scrollTo(0, Number(y)));
    }
  } catch {}

  if (draft) {
    let target = null;
    try {
      target = draft.selector && document.querySelector(draft.selector);
    } catch {}
    showBox(target ? target.getBoundingClientRect() : { left: 24, bottom: 80 });
  }
})();

export const CARD_STYLES = `
  :host { all: initial; }

  .sh-card {
    position: fixed;
    z-index: 2147483647;
    display: block;
    width: 320px;
    box-sizing: border-box;
    font-family: ui-monospace, 'JetBrains Mono', Menlo, monospace;
    font-size: 12px;
    line-height: 1.45;
    border: 1px solid var(--sh-line);
    border-radius: 8px;
    padding: 12px;
    color: var(--sh-ink);
    background: var(--sh-bg);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
    color-scheme: light dark;

    --sh-human: #6ed07a;
    --sh-ai: #ff6a48;
    --sh-light: #e8c15a;
    --sh-heavy: #ff9a63;
    --sh-accent: #ff7043;
  }

  .sh-card.dark {
    --sh-bg: #0f0f11;
    --sh-bg-2: #17171b;
    --sh-ink: #ecebe4;
    --sh-ink-2: #b2b0a6;
    --sh-line: #2a2a2f;
    --sh-muted: #8a8a90;
  }

  .sh-card.light {
    --sh-bg: #fafaf7;
    --sh-bg-2: #f1f0ea;
    --sh-ink: #17171a;
    --sh-ink-2: #4a4a50;
    --sh-line: #d8d5cc;
    --sh-muted: #6d6a61;
    --sh-human: #2f7a3a;
    --sh-light: #b88a1a;
    --sh-heavy: #c2521a;
    --sh-ai: #b8341a;
    --sh-accent: #d94e1f;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
  }

  .sh-card * { box-sizing: border-box; }

  .sh-truncation {
    margin-top: 4px;
    font-size: 10px;
    letter-spacing: 0.02em;
    color: var(--sh-heavy);
  }
  .sh-card[data-state="idle"] { display: none; }
  .hide { display: none !important; }

  /* view: minimised — hide everything except the head */
  .sh-card[data-view="minimised"] .sh-truncation,
  .sh-card[data-view="minimised"] .sh-preview,
  .sh-card[data-view="minimised"] .loading-row,
  .sh-card[data-view="minimised"] .sh-verdict,
  .sh-card[data-view="minimised"] .sh-mode,
  .sh-card[data-view="minimised"] .sh-advanced,
  .sh-card[data-view="minimised"] .error-box,
  .sh-card[data-view="minimised"] .sh-actions {
    display: none !important;
  }

  /* ---- head ---- */
  .sh-head {
    display: flex; align-items: center; justify-content: space-between;
    gap: 8px; margin-bottom: 10px;
    cursor: grab;
    user-select: none;
  }
  .sh-card[data-dragging="true"] .sh-head { cursor: grabbing; }
  .sh-brand {
    display: inline-flex; align-items: center; gap: 7px;
    font-weight: 600; font-size: 11.5px; letter-spacing: 0.02em;
  }
  .sh-mark {
    display: inline-block; width: 14px; height: 14px;
    background: var(--sh-accent); position: relative;
    transform: rotate(-12deg);
  }
  .sh-mark::after {
    content: ""; position: absolute; left: 50%; top: 100%;
    transform: translateX(-50%);
    width: 2px; height: 7px; background: var(--sh-ink);
  }
  .sh-brand .ver { color: var(--sh-muted); font-weight: 400; margin-left: 4px; font-size: 10px; }
  .sh-head-actions { display: inline-flex; gap: 2px; align-items: center; }
  .sh-icon-btn {
    all: unset;
    cursor: pointer;
    color: var(--sh-muted);
    font-family: inherit;
    font-size: 12px;
    padding: 3px 6px;
    border-radius: 3px;
    letter-spacing: 0.04em;
  }
  .sh-icon-btn:hover { background: var(--sh-bg-2); color: var(--sh-ink); }

  /* ---- preview ---- */
  .sh-preview {
    display: flex; justify-content: space-between; align-items: baseline;
    gap: 8px; padding: 6px 8px; margin-bottom: 12px;
    background: var(--sh-bg-2);
    border-radius: 4px; font-size: 11px; color: var(--sh-muted);
  }
  .sh-preview .prev { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sh-preview .wc { white-space: nowrap; }

  /* ---- loading ---- */
  .loading-row {
    display: flex; align-items: center; gap: 8px;
    padding: 22px 4px; justify-content: center;
    color: var(--sh-muted);
    font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase;
  }
  .spinner {
    display: inline-block; width: 10px; height: 10px; border-radius: 50%;
    border: 2px solid var(--sh-line); border-top-color: var(--sh-accent);
    animation: sh-spin 0.8s linear infinite;
    vertical-align: -1px;
  }
  @keyframes sh-spin { to { transform: rotate(360deg); } }

  /* ---- verdict hero ---- */
  .sh-verdict {
    position: relative;
    padding: 14px 12px 12px;
    border-radius: 6px;
    background: var(--sh-bg-2);
    border: 1px solid var(--sh-line);
    overflow: hidden;
  }
  .sh-verdict::before {
    content: ""; position: absolute; inset: 0;
    background: linear-gradient(180deg, var(--sh-verdict-wash, transparent) 0%, transparent 80%);
    opacity: 0.18; pointer-events: none;
  }
  .sh-verdict[data-verdict="human"] { --sh-verdict-wash: var(--sh-human); }
  .sh-verdict[data-verdict="ai"] { --sh-verdict-wash: var(--sh-ai); }
  .sh-verdict[data-verdict="near"] { --sh-verdict-wash: var(--sh-light); }

  .sh-verdict .v-head {
    display: flex; align-items: center; justify-content: space-between;
    gap: 8px; margin-bottom: 8px;
  }
  .sh-verdict .v-label {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase;
    color: var(--sh-muted); font-weight: 500;
  }
  .sh-verdict .v-label::before {
    content: ""; display: inline-block;
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--sh-verdict-wash);
  }
  .sh-verdict .conf-chip {
    font-size: 9.5px; letter-spacing: 0.08em;
    color: var(--sh-muted); text-transform: uppercase;
    padding: 2px 6px; border: 1px solid var(--sh-line);
    border-radius: 10px;
  }
  .sh-verdict .big {
    display: flex; align-items: baseline; gap: 6px;
    font-size: 36px; line-height: 1; font-weight: 700;
    letter-spacing: -0.02em; color: var(--sh-ink);
    font-variant-numeric: tabular-nums;
  }
  .sh-verdict .big .unit { font-size: 16px; font-weight: 500; color: var(--sh-muted); }
  .sh-verdict .verdict-text {
    margin-top: 4px;
    font-size: 14px; font-weight: 600;
    letter-spacing: -0.005em;
    color: var(--sh-verdict-wash);
  }
  .sh-binary-bar {
    position: relative; height: 6px; margin-top: 12px;
    border-radius: 3px; overflow: hidden;
    background: var(--sh-bg);
  }
  .sh-binary-bar .human-part,
  .sh-binary-bar .ai-part {
    position: absolute; top: 0; bottom: 0;
    width: 0%;
  }
  .sh-binary-bar .human-part { left: 0; background: var(--sh-human); }
  .sh-binary-bar .ai-part    { right: 0; background: var(--sh-ai); }
  .sh-binary-legend {
    display: flex; justify-content: space-between;
    margin-top: 5px;
    font-size: 9.5px; letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--sh-muted); font-variant-numeric: tabular-nums;
  }
  .sh-binary-legend .side { display: inline-flex; align-items: center; gap: 5px; }

  /* ---- mode row ---- */
  .sh-mode {
    display: flex; align-items: center; justify-content: space-between;
    margin-top: 12px; padding-top: 10px;
    border-top: 1px dashed var(--sh-line);
    font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--sh-muted);
  }
  .sh-mode .toggle {
    all: unset; cursor: pointer;
    display: inline-flex; align-items: center; gap: 6px;
    font-family: inherit; font-size: 10px;
    letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--sh-muted);
    padding: 3px 7px; border: 1px solid var(--sh-line);
    border-radius: 3px;
  }
  .sh-mode .toggle:hover { color: var(--sh-ink); border-color: var(--sh-muted); }
  .sh-mode .toggle[aria-pressed="true"] {
    background: var(--sh-accent); color: #fff; border-color: var(--sh-accent);
  }
  .sh-mode .toggle .chev { transition: transform 120ms ease; display: inline-block; }
  .sh-mode .toggle[aria-pressed="true"] .chev { transform: rotate(180deg); }

  /* ---- advanced drawer ---- */
  .sh-advanced {
    margin-top: 12px;
    overflow: hidden;
    max-height: 0;
    opacity: 0;
    transition: max-height 180ms ease, opacity 160ms ease;
  }
  .sh-card[data-mode="advanced"] .sh-advanced:not(.hide) {
    max-height: 360px;
    opacity: 1;
  }
  .sh-advanced .adv-head {
    display: flex; justify-content: space-between; align-items: baseline;
    font-size: 9.5px; letter-spacing: 0.1em; text-transform: uppercase;
    color: var(--sh-muted);
    margin-bottom: 8px;
  }
  .sh-advanced .stack { display: flex; flex-direction: column; gap: 5px; }
  .sh-advanced .row {
    display: grid; grid-template-columns: 78px 1fr 40px;
    align-items: center; gap: 8px;
    font-size: 10.5px;
  }
  .sh-advanced .name { color: var(--sh-muted); letter-spacing: 0.02em; }
  .sh-advanced .track {
    position: relative; height: 8px;
    background: var(--sh-bg);
    border: 1px solid var(--sh-line);
    border-radius: 2px; overflow: hidden;
    display: block;
  }
  .sh-advanced .fill {
    position: absolute; top: 0; bottom: 0; left: 0;
    width: 0%;
    border-radius: 1px;
    display: block;
  }
  .sh-advanced .fill[data-bucket="0"] { background: var(--sh-human); }
  .sh-advanced .fill[data-bucket="1"] { background: var(--sh-light); }
  .sh-advanced .fill[data-bucket="2"] { background: var(--sh-heavy); }
  .sh-advanced .fill[data-bucket="3"] { background: var(--sh-ai); }
  .sh-advanced .val {
    text-align: right; color: var(--sh-muted); font-variant-numeric: tabular-nums;
  }
  .sh-advanced .row[data-winner="true"] .name,
  .sh-advanced .row[data-winner="true"] .val { color: var(--sh-ink); font-weight: 700; }
  .sh-advanced .adv-meta {
    display: grid;
    gap: 3px;
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px dashed var(--sh-line);
    color: var(--sh-muted);
    font-size: 9.5px;
    letter-spacing: 0.04em;
  }

  /* ---- error box ---- */
  .error-box {
    padding: 14px; text-align: center;
    border: 1px dashed var(--sh-ai); border-radius: 4px;
    background: color-mix(in oklch, var(--sh-ai) 8%, transparent);
  }
  .error-box .big { color: var(--sh-ai); font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; }
  .error-box .msg { color: var(--sh-ink-2); font-size: 11px; margin-top: 4px; }

  /* ---- actions ---- */
  .sh-actions {
    display: grid; grid-template-columns: 1fr 1fr; gap: 6px;
    margin-top: 12px;
  }
  .sh-actions.single { grid-template-columns: 1fr; }
  .sh-btn {
    all: unset; display: block; box-sizing: border-box;
    text-align: center; cursor: pointer;
    padding: 8px 10px;
    font-family: inherit; font-size: 10.5px; font-weight: 600;
    letter-spacing: 0.08em; text-transform: uppercase;
    border-radius: 4px;
    border: 1px solid var(--sh-line);
    color: var(--sh-ink-2);
    background: transparent;
  }
  .sh-btn:hover { color: var(--sh-ink); border-color: var(--sh-muted); background: var(--sh-bg-2); }
`

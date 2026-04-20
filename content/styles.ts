export const CARD_STYLES = `
  :host {
    all: initial;
  }
  [data-testid="card-root"] {
    position: fixed;
    z-index: 2147483647;
    width: 320px;
    background: #0f0f11;
    color: #e8e8ea;
    border: 1px solid #2a2a2f;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
    padding: 12px;
    font-size: 13px;
    line-height: 1.4;
    font-family: ui-monospace, Menlo, monospace;
    color-scheme: dark;
  }
  [data-testid="card-root"][data-state="idle"] { display: none; }
  .row { display: flex; gap: 8px; align-items: baseline; }
  [data-testid="preview"] {
    color: #8a8a90;
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 8px;
  }
  [data-testid="word-count"] { color: #8a8a90; font-size: 11px; }
  [data-testid="spinner"] {
    width: 12px; height: 12px; border-radius: 50%;
    border: 2px solid #3a3a40; border-top-color: #a5ffa5;
    animation: slop-spin 0.8s linear infinite;
    display: inline-block;
  }
  @keyframes slop-spin { to { transform: rotate(360deg); } }
  [data-testid="primary-pct"] { font-size: 28px; font-weight: 600; color: #a5ffa5; }
  [data-testid="primary-label"] { color: #e8e8ea; font-size: 14px; margin-left: 6px; }
  .bars { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 10px; font-size: 11px; }
  .bars > div { background: #1a1a1e; border: 1px solid #2a2a2f; border-radius: 4px; padding: 4px 6px; text-align: center; }
  .bars > div[data-pct="100"] { background: #1e2e1e; border-color: #a5ffa5; color: #a5ffa5; }
  .raw-grid {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 2px 12px;
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid #2a2a2f;
    font-size: 11px;
  }
  .raw-grid .raw-row { display: contents; }
  .raw-grid .raw-name { color: #8a8a90; }
  .raw-grid .raw-value { color: #e8e8ea; text-align: right; font-variant-numeric: tabular-nums; }
  [data-testid="error-message"] { color: #ff8080; margin-top: 6px; }
  [data-testid="dismiss-button"] {
    margin-top: 10px; padding: 4px 10px;
    background: #1a1a1e; color: #e8e8ea;
    border: 1px solid #3a3a40; border-radius: 4px;
    font: inherit; cursor: pointer;
  }
  [data-testid="card-root"] .hide { display: none; }
`

// Placement torture fixtures for #37. Each section reproduces one way the
// result card ends up somewhere the reader is not looking — or nowhere at all.
// Sections are a viewport apart so a selection can be scrolled to any position.
//
// Only rendering lives here, so the same page is served by `pnpm test-page`
// (for `pnpm qa:placement` and manual checks) and routed into the Playwright
// placement spec, without either importing a running server.
export function renderPlacementPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>SlopHammer — placement torture</title>
  <style>
    body { font: 16px/1.6 system-ui, sans-serif; margin: 0; padding: 24px; max-width: 900px; }
    section { margin: 60vh 0; padding: 16px; border: 1px solid #ccc; }
    h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: #666; margin: 0 0 8px; }
    /* A transform makes this the containing block for fixed descendants. */
    #xform { transform: translateZ(0); }
    /* Paint containment does the same, and clips painting to the box. */
    #containpaint { contain: paint; }
    dialog::backdrop { background: rgba(0,0,0,.6); }
    /* Large and centred on purpose: the card placed below its text must land
       inside this box, so the test can tell whether it paints above it. */
    #pop { width: 80vw; height: 80vh; border: 2px solid #333; padding: 40px; overflow: auto; }
    textarea { width: 100%; height: 120px; font: inherit; }
    iframe { width: 100%; height: 200px; border: 1px solid #999; }
    #fs { background: #eef; padding: 40px; }
  </style>
</head>
<body>
<p id="top">Placement torture fixtures. Each section is one failure mode.</p>

<section id="c-plain"><h2>1 plain</h2><p class="t">The quick brown fox jumps over the lazy dog while the committee deliberates at length about matters of no consequence whatsoever, producing minutes that nobody reads and decisions that nobody implements, which is roughly how these things tend to go in practice.</p></section>

<section id="xform"><h2>2 transformed ancestor</h2><p class="t">A transform on an ancestor makes it the containing block for fixed descendants, so naive viewport offsets land in the wrong coordinate space entirely, and the card renders somewhere far from where the reader is actually looking on the page.</p></section>

<section id="containpaint"><h2>3 contain: paint ancestor</h2><p class="t">Paint containment establishes a containing block for fixed and absolute descendants and clips painting to the box, which is another way an overlay can be silently displaced or cropped without any error being raised anywhere at all.</p></section>

<section id="c-shadow"><h2>4 open shadow root</h2><div id="shadowhost"></div></section>

<section id="c-iframe"><h2>5 same-origin iframe</h2><iframe id="frame" src="/placement/frame"></iframe></section>

<section id="c-textarea"><h2>6 textarea</h2><textarea id="ta">Selecting text inside a form control does not produce a document Range in Chrome, so an overlay that anchors to getSelection has nothing to measure and must fall back to some fixed corner of the viewport instead.</textarea></section>

<section id="c-multi"><h2>7 multi-block selection</h2><p class="t">First paragraph of a selection that spans more than one block element.</p><p class="t2">Second paragraph, which means the bounding rect is the union of both and its left edge may sit far from where the visible text actually starts.</p></section>

<section id="c-dialog"><h2>8 modal dialog (top layer)</h2><button id="opendialog">open modal</button>
<dialog id="dlg"><p class="t">Cookie banners and consent walls increasingly use the dialog element, which renders in the top layer above every z-index on the page including the maximum value an extension can set.</p></dialog></section>

<section id="c-popover"><h2>9 popover (top layer)</h2><button id="openpop">open popover</button>
<div id="pop" popover="manual"><p class="t">Popover elements also render in the top layer, so anything painted in the normal stacking context sits behind them regardless of z-index.</p></div></section>

<section id="c-fullscreen"><h2>10 fullscreen element</h2><button id="gofs">go fullscreen</button>
<div id="fs"><p class="t">When an element enters fullscreen only its subtree is rendered, so an overlay mounted on document.body is not composited at all and the user sees nothing happen.</p></div></section>

<p id="bottom">end</p>
<script>
  const sh = document.getElementById('shadowhost').attachShadow({ mode: 'open' })
  sh.innerHTML = '<p class="t">Text living inside an open shadow root is invisible to a naive window.getSelection call, which returns a collapsed or re-scoped range and therefore no usable rectangle to anchor against.</p>'
  document.getElementById('opendialog').onclick = () => document.getElementById('dlg').showModal()
  document.getElementById('openpop').onclick = () => document.getElementById('pop').showPopover()
  document.getElementById('gofs').onclick = () => document.getElementById('fs').requestFullscreen()
</script>
</body>
</html>`
}

export function renderPlacementFrame() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>frame</title></head>
<body style="font:16px/1.6 system-ui, sans-serif">
<p class="t">A selection made inside an iframe is invisible to a content script that only runs in the top frame, so there is no rectangle available and the card cannot be anchored to the text the user actually highlighted.</p>
</body></html>`
}

import http from 'node:http'

const PORT = 8765
const HOSTILE_CSS = `
    :not(:defined) { visibility: hidden; }
`

const SAMPLES = [
  {
    label: 'Ambiguous — developer rant (prior benchmark: AI-Assisted)',
    text: `got pulled into a meeting today. apparently we're adding an Agentic AI to the team. it will learn our environment, handle tasks autonomously, and integrate via API. it does not need onboarding, a desk, or health insurance. Great.

i have one question nobody in that meeting could answer. how does it actually work? not philosophically. like what is the system. because from what i can tell it's an LLM with tools strapped to it, some kind of memory layer nobody can fully explain, and a control loop that lets it run without a human saying yes to every step. which means somewhere in my company's stack there is now a process with access to our tools, our data, and apparently a better performance review than me, and i genuinely do not understand the architecture.`,
  },
  {
    label: 'Obvious AI — LinkedIn-style',
    text: `In today's rapidly evolving digital landscape, leveraging artificial intelligence to drive transformative business outcomes has become not just an advantage, but a necessity. Organizations that proactively embrace cutting-edge AI solutions are uniquely positioned to unlock unprecedented value, streamline operational efficiency, and foster a culture of continuous innovation. By seamlessly integrating machine learning capabilities into existing workflows, enterprises can harness actionable insights, empower their workforce, and ultimately deliver exceptional experiences that resonate with stakeholders across every touchpoint of the customer journey.`,
  },
  {
    label: 'Mixed — technical explanation',
    text: `An agentic AI system is essentially three components stitched together with duct tape and reinforcement learning. First, you have a large language model — the brain, if you want to be generous about it. Second, a tool layer that lets the model actually do things: read files, call APIs, execute code. Third, a control loop that keeps asking the model "what should I do next?" until it decides it's done. The memory part is where it gets interesting. Sometimes it's just shoved into the context window. Sometimes it's a vector database of embeddings. Sometimes it's fine-tuning, which is technically learning but mostly expensive.`,
  },
  {
    label: 'Human — blog-style personal story',
    text: `I moved to Lisbon last summer and I still haven't figured out how to buy bread. Not metaphorically. Like, the actual act of buying bread. The bakery near my apartment has one of those numbered ticket dispensers but it only turns on sometimes. When it's off you're supposed to just know the order. I asked the woman behind the counter once if there was a system and she laughed and said yes, but refused to explain. Six months in and I still walk in, panic, and leave with whatever the person in front of me bought.`,
  },
  {
    label: 'Short — under the 75-char minimum (should toast)',
    text: `This is too short.`,
  },
]

function escapeHtml(text) {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}

function renderPage({ hostile = false } = {}) {
  const where = hostile ? 'hostile fixtures' : 'test fixtures'
  const title = `Slop Hammer — ${where}`
  const intro = hostile
    ? 'This route simulates site CSS that hides undefined custom elements.'
    : 'Select a paragraph below.'

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    :root {
      --bg: #fafaf7;
      --bg-2: #f1f0ea;
      --fg: #17171a;
      --fg-2: #4a4a50;
      --muted: #6d6a61;
      --panel: #ffffff;
      --line: #d8d5cc;
      --line-2: #eceae2;
      --accent: #d94e1f;
      --radius: 6px;
      --mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    html[data-theme="dark"] {
      --bg: #0f0f11;
      --bg-2: #17171b;
      --fg: #ecebe4;
      --fg-2: #b2b0a6;
      --muted: #8a8a90;
      --panel: #17171b;
      --line: #2a2a2f;
      --line-2: #222226;
      --accent: #ff7043;
    }

    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    html { background: var(--bg); }
    body {
      background: var(--bg);
      color: var(--fg);
      font-family: var(--mono);
      font-size: 13px;
      line-height: 1.5;
      padding: 32px 28px 120px;
      max-width: 780px;
    }

    .page-head {
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px; margin-bottom: 22px;
    }
    .brand {
      display: inline-flex; align-items: center; gap: 10px;
      font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase;
      color: var(--accent); font-weight: 600;
    }
    .brand .mark {
      display: inline-block; width: 14px; height: 14px;
      background: var(--accent); position: relative;
      transform: rotate(-12deg);
    }
    .brand .mark::after {
      content: ""; position: absolute; left: 50%; top: 100%;
      transform: translateX(-50%);
      width: 2px; height: 7px; background: var(--fg);
    }
    .brand .sep { color: var(--muted); font-weight: 400; letter-spacing: 0.08em; }
    .brand .where { color: var(--fg); }
    .page-head .theme-toggle {
      all: unset;
      cursor: pointer;
      font-family: inherit;
      font-size: 10.5px; letter-spacing: 0.08em;
      color: var(--muted);
      padding: 4px 10px;
      border: 1px solid var(--line);
      border-radius: 4px;
      text-transform: uppercase;
    }
    .page-head .theme-toggle:hover { color: var(--fg); border-color: var(--muted); }

    .intro {
      color: var(--muted);
      font-size: 12px;
      margin: 0 0 24px;
      padding-bottom: 14px;
      border-bottom: 1px dashed var(--line-2);
    }
    .intro b { color: var(--fg); font-weight: 600; }

    section {
      margin: 14px 0;
      padding: 16px 18px;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: var(--panel);
    }
    section h2 {
      font-size: 10.5px; letter-spacing: 0.14em; text-transform: uppercase;
      color: var(--muted); font-weight: 600;
      margin: 0 0 10px;
      display: flex; align-items: baseline; gap: 10px;
    }
    section h2 .idx {
      font-variant-numeric: tabular-nums;
      color: var(--muted); opacity: .7;
      letter-spacing: 0.08em;
    }
    section p {
      white-space: pre-wrap;
      font-family: 'Iowan Old Style', Georgia, 'Times New Roman', serif;
      font-size: 15px;
      line-height: 1.6;
      color: var(--fg);
      margin: 0;
    }
    .hint {
      color: var(--muted);
      font-size: 10.5px;
      letter-spacing: 0.06em;
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px dashed var(--line-2);
      font-variant-numeric: tabular-nums;
    }
${hostile ? HOSTILE_CSS : ''}
  </style>
</head>
<body>
  <div class="page-head">
    <div class="brand">
      <span class="mark"></span>
      slop<span class="sep">/</span>hammer
      <span class="sep">—</span>
      <span class="where">${where}</span>
    </div>
    <button class="theme-toggle" type="button" data-testid="theme-toggle">toggle theme</button>
  </div>
  <p class="intro">
    ${intro} Right-click a 75+ character selection and pick <b>Check with Slop Hammer</b>.
  </p>
  ${SAMPLES.map(
    (s, i) => `
  <section>
    <h2><span class="idx">${String(i + 1).padStart(2, '0')}</span><span>${s.label}</span></h2>
    <p>${escapeHtml(s.text)}</p>
    <div class="hint">${s.text.length} chars · ${s.text.trim().split(/\s+/).length} words</div>
  </section>`,
  ).join('')}
  <script>
    (function () {
      const root = document.documentElement
      const mql = window.matchMedia('(prefers-color-scheme: dark)')
      const apply = (dark) => { root.dataset.theme = dark ? 'dark' : 'light' }
      apply(mql.matches)
      mql.addEventListener('change', (e) => apply(e.matches))
      document.querySelector('[data-testid="theme-toggle"]').addEventListener('click', () => {
        root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark'
      })
    })()
  </script>
</body>
</html>`
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`)
  // Chrome always asks for this; a 404 puts a permanent red error in the
  // console during QA, which hides the errors we actually care about.
  if (url.pathname === '/favicon.ico') {
    res.writeHead(204)
    res.end()
    return
  }
  if (url.pathname !== '/' && url.pathname !== '/hostile') {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Not found')
    return
  }

  const html = renderPage({ hostile: url.pathname === '/hostile' })
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(html)
})
server.listen(PORT, '127.0.0.1', () => {
  console.log(`test page: http://127.0.0.1:${PORT}/`)
  console.log(`hostile page: http://127.0.0.1:${PORT}/hostile`)
})

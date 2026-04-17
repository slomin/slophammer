import http from 'node:http'

const PORT = 8765

const SAMPLES = [
  {
    label: 'Human — frustrated developer rant',
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

const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Slop Hammer — test fixtures</title>
  <style>
    html, body { margin: 0; padding: 0; background: #0f0f11; color: #e8e8ea; font-family: ui-monospace, Menlo, monospace; }
    body { padding: 32px; max-width: 780px; line-height: 1.6; }
    h1 { font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase; color: #a5ffa5; }
    section { margin: 24px 0; padding: 16px; border: 1px solid #2a2a2f; border-radius: 6px; background: #151517; }
    section h2 { font-size: 13px; color: #a5ffa5; margin: 0 0 10px; letter-spacing: 0.03em; }
    p { white-space: pre-wrap; font-family: Georgia, serif; font-size: 15px; color: #d8d8da; margin: 0; }
    .hint { color: #8a8a90; font-size: 12px; margin-top: 10px; font-family: ui-monospace, Menlo, monospace; }
  </style>
</head>
<body>
  <h1>Slop Hammer — test fixtures</h1>
  <p style="font-family:ui-monospace; color:#8a8a90; font-size:13px">
    Select a paragraph below, right-click, and pick <b>Check with Slop Hammer</b>.
  </p>
  ${SAMPLES.map(
    (s, i) => `
  <section>
    <h2>${i + 1}. ${s.label}</h2>
    <p>${s.text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])}</p>
    <div class="hint">${s.text.length} chars · ${s.text.trim().split(/\\s+/).length} words</div>
  </section>`,
  ).join('')}
</body>
</html>`

const server = http.createServer((_, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(html)
})
server.listen(PORT, '127.0.0.1', () => {
  console.log(`test page: http://127.0.0.1:${PORT}/`)
})

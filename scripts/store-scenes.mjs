// Chrome Web Store scenes: the designed surroundings for real product captures.
//
// Every scene is a pure function from captures to HTML. The captures — the
// result card in Basic/Advanced and light/dark, and the options page — are real
// screenshots of the built extension taken by capture-store-assets.mjs; nothing
// here redraws product UI. Only the canvas around them is designed.
//
// Sizes follow the Store's listing rules: screenshots 1280x800 (square corners,
// full bleed), small promo tile 440x280, marquee 1400x560. Promo tiles carry
// the mark and wordmark only — the Store asks promo images to avoid text and to
// stay legible at half size.
import { buildIconSvg } from './generate-icons.mjs'

export const PALETTE = Object.freeze({
  paper: '#fafaf7',
  paper2: '#f1f0ea',
  panel: '#ffffff',
  ink: '#17171a',
  ink2: '#4a4a50',
  muted: '#6d6a61',
  line: '#d8d5cc',
  line2: '#eceae2',
  accent: '#d94e1f',
  accentSoft: 'rgba(217, 78, 31, 0.16)',
  night: '#0f0f11',
  nightLine: '#2a2a2f',
  nightInk: '#ecebe4',
})

export const MARK_DATA_URI = `data:image/svg+xml;utf8,${encodeURIComponent(buildIconSvg())}`

const SERIF = `'Iowan Old Style', 'Palatino Linotype', Georgia, 'Times New Roman', serif`
const MONO = `ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace`

const SAMPLE_BEFORE = 'In today’s rapidly evolving digital landscape, '
const SAMPLE_SELECTED =
  'leveraging artificial intelligence to drive transformative business outcomes has become not just an advantage, but a necessity. Organizations that proactively embrace cutting-edge AI solutions are uniquely positioned to unlock unprecedented value'
const SAMPLE_AFTER =
  ', streamline operational efficiency, and foster a culture of continuous innovation across every touchpoint of the customer journey.'

function baseCss(width, height) {
  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: ${width}px; height: ${height}px; overflow: hidden; }
    body {
      position: relative;
      background: ${PALETTE.paper};
      color: ${PALETTE.ink};
      font-family: ${MONO};
      font-size: 13px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }
    .grid {
      position: absolute; inset: 0;
      background-image: radial-gradient(${PALETTE.line} 1px, transparent 1.2px);
      background-size: 26px 26px;
      opacity: 0.5;
    }
    .glow {
      position: absolute; inset: 0;
      background:
        radial-gradient(ellipse 46% 40% at 88% 108%, rgba(217, 78, 31, 0.2), transparent 70%),
        radial-gradient(ellipse 30% 30% at 4% -6%, rgba(217, 78, 31, 0.08), transparent 70%);
    }
    .brand {
      position: absolute; display: flex; align-items: center; gap: 12px;
      color: ${PALETTE.accent}; font-weight: 700; letter-spacing: 0.14em; font-size: 14px;
    }
    .brand img { display: block; border-radius: 22%; box-shadow: 0 4px 12px rgba(0,0,0,0.18); }
    .display {
      font-family: ${SERIF}; font-weight: 500; letter-spacing: -0.012em;
      color: ${PALETTE.ink};
    }
    .sub { font-family: ${SERIF}; color: ${PALETTE.ink2}; }
    .chips { display: flex; flex-wrap: wrap; gap: 10px; }
    .chip {
      font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase;
      color: ${PALETTE.ink2}; border: 1px solid ${PALETTE.line}; border-radius: 999px;
      padding: 6px 12px; background: rgba(255,255,255,0.6);
    }
    .chip b { color: ${PALETTE.accent}; font-weight: 700; }
    .foot {
      position: absolute; left: 48px; right: 48px; bottom: 30px;
      display: flex; justify-content: space-between;
      font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; color: ${PALETTE.muted};
      border-top: 1px dashed ${PALETTE.line}; padding-top: 12px;
    }
    .panel {
      position: absolute; background: ${PALETTE.panel};
      border: 1px solid ${PALETTE.line}; border-radius: 10px;
      box-shadow: 0 18px 48px rgba(23, 23, 26, 0.08), 0 2px 6px rgba(23, 23, 26, 0.05);
    }
    .article { font-family: ${SERIF}; color: ${PALETTE.ink}; }
    .article h2 { font-family: ${SERIF}; font-weight: 500; }
    .article .kicker {
      font-family: ${MONO}; font-size: 10.5px; letter-spacing: 0.14em; text-transform: uppercase;
      color: ${PALETTE.muted}; margin-bottom: 14px;
    }
    mark {
      background: ${PALETTE.accentSoft}; color: inherit; padding: 1px 0;
      -webkit-box-decoration-break: clone; box-decoration-break: clone;
      border-bottom: 2px solid rgba(217, 78, 31, 0.55);
    }
    .capture { position: absolute; display: block; }
    .steps { position: absolute; display: flex; gap: 24px; }
    .step {
      flex: 1; background: ${PALETTE.panel}; border: 1px solid ${PALETTE.line}; border-radius: 10px;
      padding: 22px 24px; position: relative; overflow: hidden;
      box-shadow: 0 14px 36px rgba(23, 23, 26, 0.06);
    }
    .step .n {
      font-size: 11px; letter-spacing: 0.14em; color: ${PALETTE.accent}; font-weight: 700;
    }
    .step h3 { font-family: ${SERIF}; font-weight: 500; font-size: 23px; line-height: 1.15; margin: 8px 0 14px; }
    .callouts { position: absolute; display: grid; gap: 18px; }
    .callout { display: grid; grid-template-columns: 34px 1fr; gap: 14px; align-items: start; }
    .callout .dot {
      width: 34px; height: 34px; border-radius: 50%; background: ${PALETTE.accent}; color: #fff;
      font-weight: 700; font-size: 12px; display: grid; place-items: center; letter-spacing: 0.06em;
    }
    .callout h4 { font-family: ${SERIF}; font-weight: 500; font-size: 21px; line-height: 1.2; }
    .callout p { color: ${PALETTE.ink2}; font-size: 12.5px; margin-top: 4px; line-height: 1.5; }
    .menu {
      border: 1px solid ${PALETTE.line}; border-radius: 8px; background: ${PALETTE.panel};
      box-shadow: 0 12px 30px rgba(23, 23, 26, 0.12); padding: 6px; font-size: 12.5px; width: 268px;
      font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: ${PALETTE.ink2};
    }
    .menu div { padding: 7px 12px; border-radius: 5px; display: flex; align-items: center; gap: 10px; }
    .menu .sep { height: 1px; padding: 0; margin: 5px 8px; background: ${PALETTE.line2}; }
    .menu .hot { background: ${PALETTE.accent}; color: #fff; font-weight: 600; }
    .menu img { width: 16px; height: 16px; border-radius: 3px; }
    .window {
      position: absolute; background: ${PALETTE.panel}; border: 1px solid ${PALETTE.line};
      border-radius: 12px; overflow: hidden;
      box-shadow: 0 24px 60px rgba(23, 23, 26, 0.12), 0 2px 8px rgba(23, 23, 26, 0.06);
    }
    .window .bar {
      height: 36px; background: ${PALETTE.paper2}; border-bottom: 1px solid ${PALETTE.line};
      display: flex; align-items: center; gap: 7px; padding: 0 14px;
    }
    .window .bar i { width: 11px; height: 11px; border-radius: 50%; background: ${PALETTE.line}; display: block; }
    .window .bar span {
      margin-left: 12px; font-size: 11px; color: ${PALETTE.muted}; letter-spacing: 0.04em;
      background: ${PALETTE.panel}; border: 1px solid ${PALETTE.line2}; border-radius: 6px; padding: 3px 10px;
    }
    .window img { display: block; }
  `
}

function page(width, height, body, extraCss = '') {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>SlopHammer store scene</title>
<style>${baseCss(width, height)}${extraCss}</style>
</head>
<body>
<div class="grid"></div>
<div class="glow"></div>
${body}
</body>
</html>`
}

function brand(left, top, size = 40, fontSize = 14) {
  return `<div class="brand" style="left:${left}px;top:${top}px;font-size:${fontSize}px">
    <img src="${MARK_DATA_URI}" width="${size}" height="${size}" alt="">
    <span>SlopHammer</span>
  </div>`
}

function foot(left = 'Local inference · WebGPU with a CPU fallback', right = 'Verified SlopHammer 350M · 40+ words') {
  return `<div class="foot"><span>${left}</span><span>${right}</span></div>`
}

// A capture is { dataUri, width, height } in CSS pixels (the PNG itself is 2x).
function capture(c, { left, top, scale = 1, extra = '' }) {
  const w = Math.round(c.width * scale)
  const h = Math.round(c.height * scale)
  return `<img class="capture" src="${c.dataUri}" width="${w}" height="${h}" style="left:${left}px;top:${top}px;${extra}" alt="">`
}

function sampleParagraph() {
  return `${SAMPLE_BEFORE}<mark>${SAMPLE_SELECTED}</mark>${SAMPLE_AFTER}`
}

export function renderHero(c) {
  const card = c.cardBasicLight
  return page(
    1280,
    800,
    `${brand(48, 40)}
    <h1 class="display" style="position:absolute;left:48px;top:168px;width:560px;font-size:58px;line-height:1.04">
      Checks selected text on your device.
    </h1>
    <p class="sub" style="position:absolute;left:48px;top:420px;width:520px;font-size:22px;line-height:1.45">
      Nothing leaves Chrome. A verified 350M classifier runs in the browser, and the result card lands next to the text you picked.
    </p>
    <div class="chips" style="position:absolute;left:48px;top:560px;width:540px">
      <span class="chip"><b>Local</b> · WebGPU or CPU</span>
      <span class="chip"><b>40+</b> words</span>
      <span class="chip"><b>Right-click</b> to check</span>
      <span class="chip">No account</span>
    </div>
    <div class="panel article" style="left:664px;top:118px;width:568px;height:590px;padding:40px 44px">
      <div class="kicker">Opinion · 6 min read</div>
      <h2 style="font-size:30px;line-height:1.15;margin-bottom:20px">Why every roadmap now ends with the same paragraph</h2>
      <p style="font-size:17.5px;line-height:1.62;color:${PALETTE.ink2}">${sampleParagraph()}</p>
    </div>
    ${capture(card, { left: 1232 - card.width + 10, top: 328 })}
    ${foot()}`,
  )
}

export function renderAdvanced(c) {
  const card = c.cardAdvancedLight
  const scale = 1.04
  const top = Math.round((800 - card.height * scale) / 2) + 8
  return page(
    1280,
    800,
    `${brand(48, 40)}
    <h1 class="display" style="position:absolute;left:48px;top:150px;width:560px;font-size:52px;line-height:1.06">
      See the whole distribution.
    </h1>
    <p class="sub" style="position:absolute;left:48px;top:290px;width:520px;font-size:20px;line-height:1.45">
      Basic shows the verdict. Advanced opens the raw numbers behind it.
    </p>
    <div class="callouts" style="left:48px;top:392px;width:540px">
      <div class="callout"><div class="dot">01</div><div><h4>Four raw buckets</h4><p>Human · Lightly AI · Moderately AI · Fully AI, exactly as the model scored them.</p></div></div>
      <div class="callout"><div class="dot">02</div><div><h4>Local analysis time</h4><p>How long inference took on this machine, and nothing else about it.</p></div></div>
      <div class="callout"><div class="dot">03</div><div><h4>Copy and Share</h4><p>Export the detector heading and the raw distribution — no selected text.</p></div></div>
    </div>
    ${capture(card, { left: 720, top, scale })}
    ${foot()}`,
  )
}

export function renderFlow(c) {
  const card = c.cardBasicLight
  const scale = 0.74
  return page(
    1280,
    800,
    `${brand(48, 40)}
    <h1 class="display" style="position:absolute;left:48px;top:112px;width:900px;font-size:48px;line-height:1.06">
      Three steps. No account, no upload.
    </h1>
    <div class="steps" style="left:48px;top:222px;width:1184px;height:476px">
      <div class="step article">
        <div class="n">01</div>
        <h3>Select at least 40 words</h3>
        <p style="font-size:15px;line-height:1.6;color:${PALETTE.ink2}">${sampleParagraph()}</p>
      </div>
      <div class="step">
        <div class="n">02</div>
        <h3>Right-click and choose<br>Check with SlopHammer</h3>
        <div class="menu" style="margin-top:22px">
          <div>Copy</div>
          <div>Search Google for “leveraging artif…”</div>
          <div>Print…</div>
          <div class="sep"></div>
          <div class="hot"><img src="${MARK_DATA_URI}" alt="">Check with SlopHammer</div>
          <div class="sep"></div>
          <div>Inspect</div>
        </div>
      </div>
      <div class="step">
        <div class="n">03</div>
        <h3>Read the result in place</h3>
        ${capture(card, { left: 24 - 32 * scale, top: 112 - 32 * scale, scale })}
      </div>
    </div>
    ${foot()}`,
  )
}

export function renderOptions(c) {
  const shot = c.options
  // Fit the whole capture: width-limited or height-limited, never cropped.
  const scale = Math.min(600 / shot.width, 576 / shot.height)
  const frameW = Math.round(shot.width * scale)
  const imgH = Math.round(shot.height * scale)
  const frameH = imgH
  return page(
    1280,
    800,
    `${brand(48, 40)}
    <h1 class="display" style="position:absolute;left:48px;top:150px;width:520px;font-size:52px;line-height:1.06">
      Install once. Everything stays in Chrome.
    </h1>
    <p class="sub" style="position:absolute;left:48px;top:356px;width:500px;font-size:20px;line-height:1.45">
      One verified download from Hugging Face, checked against its SHA-256 before a single file is written. Result detail, card position and theme are settings, not defaults you have to live with.
    </p>
    <div class="chips" style="position:absolute;left:48px;top:540px;width:520px">
      <span class="chip">SHA-256 verified</span>
      <span class="chip">Basic / Advanced</span>
      <span class="chip">Next to the text / Pinned</span>
    </div>
    <div class="window" style="left:${1232 - frameW - 2}px;top:104px;width:${frameW + 2}px;height:${frameH + 38}px">
      <div class="bar"><i></i><i></i><i></i><span>SlopHammer — options</span></div>
      <img src="${shot.dataUri}" width="${frameW}" height="${imgH}" alt="">
    </div>
    ${foot()}`,
  )
}

export function renderThemes(c) {
  const light = c.cardBasicLight
  const dark = c.cardBasicDark
  const scale = 0.94
  const lightTop = 318
  const darkTop = 318
  return page(
    1280,
    800,
    `<div style="position:absolute;left:640px;top:0;width:640px;height:800px;background:${PALETTE.night}"></div>
    ${brand(48, 40)}
    <h1 class="display" style="position:absolute;left:48px;top:112px;width:540px;font-size:48px;line-height:1.06">
      Light, dark, or whatever your system says.
    </h1>
    <p class="sub" style="position:absolute;left:48px;top:236px;width:500px;font-size:18px;line-height:1.45">
      The card follows the theme you choose in options — or your OS, if you let it.
    </p>
    ${capture(light, { left: Math.round((640 - light.width * scale) / 2) + 24, top: lightTop, scale })}
    ${capture(dark, { left: 640 + Math.round((640 - dark.width * scale) / 2), top: darkTop, scale })}
    <div class="foot" style="color:${PALETTE.muted};border-color:${PALETTE.line}"><span>Light · warm paper, high-contrast ink</span><span style="color:#8a8a90">Dark · near-black canvas, softened neutrals</span></div>`,
    `.foot { border-image: linear-gradient(to right, ${PALETTE.line} 50%, ${PALETTE.nightLine} 50%) 1; }`,
  )
}

export function renderPromoSmall(c) {
  const card = c.cardBasicLight
  const scale = 0.62
  return page(
    440,
    280,
    `${brand(26, 26, 44, 15)}
    <div class="display" style="position:absolute;left:26px;top:96px;width:190px;font-size:30px;line-height:1.08">
      AI-text check,<br>on your device.
    </div>
    ${capture(card, { left: 440 - Math.round(card.width * scale) + 14, top: 66, scale })}`,
    `.glow { background: radial-gradient(ellipse 60% 60% at 96% 100%, rgba(217,78,31,0.26), transparent 70%); }`,
  )
}

export function renderMarquee(c) {
  const light = c.cardBasicLight
  const dark = c.cardBasicDark
  const scale = 0.92
  return page(
    1400,
    560,
    `${brand(64, 56, 64, 20)}
    <div class="display" style="position:absolute;left:64px;top:196px;width:560px;font-size:58px;line-height:1.04">
      Checks selected text<br>on your device.
    </div>
    <div class="chips" style="position:absolute;left:64px;top:372px;width:560px">
      <span class="chip"><b>Local</b> · WebGPU or CPU</span>
      <span class="chip"><b>40+</b> words</span>
      <span class="chip">Verified 350M model</span>
    </div>
    ${capture(light, { left: 640, top: 56, scale })}
    ${capture(dark, { left: 1010, top: 124, scale })}`,
    `.glow { background: radial-gradient(ellipse 40% 70% at 92% 100%, rgba(217,78,31,0.22), transparent 70%); }`,
  )
}

export const SCENES = [
  { name: 'screenshot-1-hero-1280x800', width: 1280, height: 800, render: renderHero },
  { name: 'screenshot-2-advanced-1280x800', width: 1280, height: 800, render: renderAdvanced },
  { name: 'screenshot-3-flow-1280x800', width: 1280, height: 800, render: renderFlow },
  { name: 'screenshot-4-options-1280x800', width: 1280, height: 800, render: renderOptions },
  { name: 'screenshot-5-themes-1280x800', width: 1280, height: 800, render: renderThemes },
  { name: 'promo-small-440x280', width: 440, height: 280, render: renderPromoSmall, allowBleed: true },
  { name: 'promo-marquee-1400x560', width: 1400, height: 560, render: renderMarquee },
]

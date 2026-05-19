import {
  install,
  Browser,
  resolveBuildId,
  detectBrowserPlatform,
} from '@puppeteer/browsers'
import fs from 'node:fs'
import path from 'node:path'

const cacheDir = path.resolve('chrome-for-testing')
const platform = detectBrowserPlatform()
if (!platform) {
  console.error('unsupported platform')
  process.exit(1)
}
const buildId = await resolveBuildId(Browser.CHROME, platform, 'stable')
console.log(`installing chrome@${buildId} for ${platform} into ${cacheDir}`)
const result = await install({ browser: Browser.CHROME, cacheDir, buildId })
fs.mkdirSync(cacheDir, { recursive: true })
fs.writeFileSync(path.join(cacheDir, 'bin-path.txt'), result.executablePath)
console.log('chrome binary:', result.executablePath)

// Hand-written declarations so the unit spec can import the scene module
// without enabling allowJs.
export interface SceneCapture {
  dataUri: string
  width: number
  height: number
}
export interface SceneCaptures {
  cardBasicLight: SceneCapture
  cardAdvancedLight: SceneCapture
  cardBasicDark: SceneCapture
  options: SceneCapture
}
export interface Scene {
  name: string
  width: number
  height: number
  render: (captures: SceneCaptures) => string
  allowBleed?: boolean
}
export const PALETTE: Readonly<Record<string, string>>
export const MARK_DATA_URI: string
export const SCENES: readonly Scene[]
export function renderHero(c: SceneCaptures): string
export function renderAdvanced(c: SceneCaptures): string
export function renderFlow(c: SceneCaptures): string
export function renderOptions(c: SceneCaptures): string
export function renderThemes(c: SceneCaptures): string
export function renderPromoSmall(c: SceneCaptures): string
export function renderMarquee(c: SceneCaptures): string

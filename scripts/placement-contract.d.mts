// Hand-written declarations so the TypeScript spec and unit test can import
// the shared oracle without enabling allowJs.
export const GAP: number
export const MARGIN: number
export const TOLERANCE: number
export const PIXEL_TOLERANCE: number
export const CARD_BG: { dark: readonly number[]; light: readonly number[] }
export function near(a: number, b: number): boolean
export interface ContractRect {
  top: number
  bottom: number
  left: number
  right: number
}
export function placementProblem(
  card: ContractRect & { placement: string | null },
  sel: ContractRect | null,
  vp: { width: number; height: number },
): string | null
export function isCardBackground(px: ArrayLike<number>, theme?: 'dark' | 'light'): boolean

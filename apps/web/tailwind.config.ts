import type { Config } from 'tailwindcss'

// Shared design system — single source of truth (packages/ui/preset.cjs).
// ESM import, not require(): on Node ≥22 a cold `next dev` boot executes this
// file as an ES module (it has `export default`), where `require` is
// undefined — that crash killed the dev server on its first CSS compile.
import presetCjs from '../../packages/ui/preset.cjs'

// The preset is plain CommonJS; its inferred shape is looser than Config.
const preset = presetCjs as unknown as Partial<Config>

const config: Config = {
  presets: [preset],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
}

export default config

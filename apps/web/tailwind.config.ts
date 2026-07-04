import type { Config } from 'tailwindcss'

// Shared design system — single source of truth (packages/ui/preset.cjs).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const preset = require('../../packages/ui/preset.cjs')

const config: Config = {
  presets: [preset],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
}

export default config

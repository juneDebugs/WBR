import type { Config } from 'tailwindcss'

// Shared design system — single source of truth (packages/ui/preset.cjs).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const preset = require('../../packages/ui/preset.cjs')

const config: Config = {
  presets: [preset],
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
}

export default config

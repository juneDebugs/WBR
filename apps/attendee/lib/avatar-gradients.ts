// Shared avatar-gradient palette + selection helpers.
// Deduplicated from SessionCard.tsx / SpeakersClient.tsx / speakers/[id]/page.tsx —
// shared constants only, no behavioural change.

export const AVATAR_GRADIENTS: [string, string][] = [
  ['#4338ca', '#6366f1'],
  ['#6366f1', '#3b82f6'],
  ['#818cf8', '#f43f5e'],
  ['#f59e0b', '#f97316'],
  ['#14b8a6', '#06b6d4'],
  ['#10b981', '#14b8a6'],
  ['#a5b4fc', '#818cf8'],
  ['#38bdf8', '#818cf8'],
]

export function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

export function avatarGradient(name: string): [string, string] {
  return AVATAR_GRADIENTS[hashString(name) % AVATAR_GRADIENTS.length]
}

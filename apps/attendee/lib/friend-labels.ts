import type { FriendStatus } from '@conference/db'

// Shared screen-reader labels for friend-action controls (feed post button,
// people-list rows, profile action tile). Visible button copy stays
// per-surface (feed: "Friend", rows: "Add", profile tile: "Add Friend") —
// only the aria strings are shared so assistive tech hears one consistent
// description of the same relationship everywhere.
export function friendAriaLabel(
  status: FriendStatus,
  name: string,
  opts?: { removable?: boolean }
): string {
  switch (status) {
    case 'none':
      return `Send friend request to ${name}`
    case 'pending_outgoing':
      return `Cancel friend request to ${name}`
    case 'pending_incoming':
      return `Accept friend request from ${name}`
    case 'friends':
      return opts?.removable ? `Remove ${name} as a friend` : `Friends with ${name}`
  }
}

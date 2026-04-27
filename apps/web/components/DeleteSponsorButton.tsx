'use client'

interface Props {
  action: () => Promise<void>
}

export function DeleteSponsorButton({ action }: Props) {
  return (
    <form action={action}>
      <button
        type="submit"
        className="btn-danger text-sm px-3"
        onClick={e => { if (!confirm('Delete this sponsor and all their meetings?')) e.preventDefault() }}
      >
        Delete
      </button>
    </form>
  )
}

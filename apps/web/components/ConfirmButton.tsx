'use client'

interface Props {
  children: React.ReactNode
  message?: string
  className?: string
}

export function ConfirmButton({ children, message = 'Are you sure?', className }: Props) {
  return (
    <button
      type="submit"
      onClick={(e) => { if (!confirm(message)) e.preventDefault() }}
      className={className}
    >
      {children}
    </button>
  )
}

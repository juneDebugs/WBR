'use client'

interface Props {
  children: React.ReactNode
  message?: string
  className?: string
  formAction?: (formData: FormData) => void
}

export function ConfirmButton({ children, message = 'Are you sure?', className, formAction }: Props) {
  return (
    <button
      type="submit"
      formAction={formAction}
      onClick={(e) => { if (!confirm(message)) e.preventDefault() }}
      className={className}
    >
      {children}
    </button>
  )
}

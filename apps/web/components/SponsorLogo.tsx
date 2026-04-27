'use client'

interface Props {
  name: string
  logoUrl: string | null
  className?: string
  fallbackClassName?: string
}

export function SponsorLogo({ name, logoUrl, className, fallbackClassName }: Props) {
  if (!logoUrl) {
    return <span className={fallbackClassName ?? 'text-gray-500 font-bold text-sm'}>{name[0]}</span>
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt={name}
      className={className}
      onError={e => {
        const img = e.currentTarget
        img.style.display = 'none'
        const fallback = img.nextElementSibling as HTMLElement | null
        if (fallback) fallback.style.display = ''
      }}
    />
  )
}

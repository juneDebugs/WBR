export default function FullscreenLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: '#f0ece4' }}>
      {children}
    </div>
  )
}

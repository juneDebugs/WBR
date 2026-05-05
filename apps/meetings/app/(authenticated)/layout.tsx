import { SessionProvider } from '../session-provider'

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}

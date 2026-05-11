import { ChatClient } from '@/components/chat/ChatClient'

// Data is fetched client-side via useChatData() hook in ChatClient.
// Do NOT add blocking server-side fetches here — it causes white screen delays.
// The BackgroundPrefetch component in the layout pre-warms the cache.
export default function ChatPage() {
  return <ChatClient />
}

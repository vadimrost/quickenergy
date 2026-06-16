import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { AiAgentChat } from '@/features/ai-agent/AiAgentChat'

interface AppLayoutProps {
  children: ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex min-h-screen bg-bg-base">
      <Sidebar />
      <main className="flex-1 min-w-0 md:ml-16 px-4 py-6 md:px-10 md:py-8 min-h-screen pb-24 md:pb-8">
        {children}
      </main>
      <AiAgentChat />
    </div>
  )
}

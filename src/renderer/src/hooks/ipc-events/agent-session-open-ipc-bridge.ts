import { openAgentSession } from '@/lib/agent-session/open-agent-session'

export function registerAgentSessionOpenIpcBridge(unsubs: (() => void)[]): void {
  unsubs.push(
    window.api.ui.onOpenAgentSession(({ requestId, ...target }) => {
      void openAgentSession(target)
        .catch((error: unknown) => {
          console.error('Failed to open agent session:', error)
          return 'not_found' as const
        })
        // Why: main holds the plugin's call open until this reply, so a failure must still answer.
        .then((outcome) => window.api.ui.replyAgentSessionOpen({ requestId, outcome }))
    })
  )
}

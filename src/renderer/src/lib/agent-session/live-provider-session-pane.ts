import {
  resolveOriginalPaneTarget,
  type AiVaultOriginalPaneTarget,
  type OriginalPaneState
} from '@/components/right-sidebar/ai-vault-original-pane'

/** The terminal pane running, parked or sleeping on this provider conversation, matched by id alone. */
export function findLiveProviderSessionPane(
  state: OriginalPaneState,
  agents: readonly string[],
  providerSessionId: string
): AiVaultOriginalPaneTarget | null {
  const candidates = [
    ...Object.values(state.agentStatusByPaneKey).map((entry) => ({
      agentType: entry.agentType,
      providerSessionId: entry.providerSession?.id,
      paneKey: entry.paneKey,
      worktreeIdHint: entry.worktreeId,
      tabIdHint: entry.tabId
    })),
    ...Object.values(state.retainedAgentsByPaneKey).map((retained) => ({
      agentType: retained.agentType,
      providerSessionId: retained.entry.providerSession?.id,
      paneKey: retained.entry.paneKey,
      worktreeIdHint: retained.worktreeId,
      tabIdHint: retained.entry.tabId ?? retained.tab.id
    })),
    ...Object.values(state.sleepingAgentSessionsByPaneKey).map((record) => ({
      agentType: record.agent,
      providerSessionId: record.providerSession.id,
      paneKey: record.paneKey,
      worktreeIdHint: record.worktreeId,
      tabIdHint: record.tabId
    }))
  ]
  for (const candidate of candidates) {
    if (
      candidate.providerSessionId !== providerSessionId ||
      !agents.some((agent) => agent === candidate.agentType)
    ) {
      continue
    }
    const target = resolveOriginalPaneTarget({
      state,
      paneKey: candidate.paneKey,
      worktreeIdHint: candidate.worktreeIdHint,
      tabIdHint: candidate.tabIdHint
    })
    if (target) {
      return target
    }
  }
  return null
}

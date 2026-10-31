import { activateTabAndFocusPane } from '@/lib/activate-tab-and-focus-pane'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import { findStructuredAgentSessionTab } from '@/lib/agent-session/structured-agent-session-tab-activation'
import {
  activateAiVaultStructuredSession,
  reopenAiVaultStructuredSession
} from '@/lib/activate-ai-vault-structured-session'
import { findLiveProviderSessionPane } from '@/lib/agent-session/live-provider-session-pane'
import { resumeAgentSessionHistoryRow } from '@/lib/agent-session/resume-agent-session-history-row'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { useAppStore } from '@/store'
import {
  aiVaultHistoryAgents,
  isAiVaultAgent,
  type AiVaultListResult,
  type AiVaultSession
} from '../../../../shared/ai-vault-types'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'
import type {
  AgentSessionOpenOutcome,
  AgentSessionOpenTarget
} from '../../../../shared/agent-session-open'
import type { AiVaultOriginalPaneTarget } from '@/components/right-sidebar/ai-vault-original-pane'

/**
 * Brings a past or running agent session up: focuses the tab already running it in any
 * workspace, else resumes it where its directory lives. `not_found` leaves the window alone.
 */
export async function openAgentSession(
  target: AgentSessionOpenTarget
): Promise<AgentSessionOpenOutcome> {
  if (!isAiVaultAgent(target.agent)) {
    return 'not_found'
  }
  const agents = aiVaultHistoryAgents(target.agent)
  const live = findLiveProviderSessionPane(useAppStore.getState(), agents, target.sessionId)
  if (live && focusLivePane(live)) {
    return 'focused'
  }
  const row = await findHistoryRow(target, agents)
  if (!row) {
    return 'not_found'
  }
  const structured = row.structuredSession
  if (structured) {
    // Why: a chat that owns the conversation is the one place it runs, open or closed.
    if (
      findStructuredAgentSessionTab(useAppStore.getState().unifiedTabsByWorktree, {
        workspaceId: structured.workspaceId,
        sessionId: structured.sessionId
      })
    ) {
      await activateAiVaultStructuredSession(row)
      return 'focused'
    }
    return (await reopenAiVaultStructuredSession(structured)) === 'activated'
      ? 'resumed'
      : 'not_found'
  }
  return resumeAgentSessionHistoryRow(row, target.cwd)
}

function focusLivePane(pane: AiVaultOriginalPaneTarget): boolean {
  if (activateAndRevealWorkspace(pane.worktreeId) === false) {
    return false
  }
  useAppStore.getState().setActiveTabType('terminal', pane.worktreeId)
  activateTabAndFocusPane(pane.tabId, pane.leafId, {
    flashFocusedPane: true,
    scrollToBottomIfOutputSinceLastView: true
  })
  return true
}

/** The history row for the session; a cwd narrows the scan first, then the search widens. */
async function findHistoryRow(
  target: AgentSessionOpenTarget,
  agents: readonly string[]
): Promise<AiVaultSession | null> {
  const scopes: (readonly string[] | undefined)[] = target.cwd
    ? [[target.cwd], undefined]
    : [undefined]
  for (const scopePaths of scopes) {
    const listed = await listLocalSessions(scopePaths)
    const row = listed?.sessions.find(
      (session) =>
        !session.subagent &&
        session.sessionId === target.sessionId &&
        agents.includes(session.agent)
    )
    if (row) {
      return row
    }
  }
  return null
}

async function listLocalSessions(
  scopePaths: readonly string[] | undefined
): Promise<AiVaultListResult | null> {
  // Why: a scan another caller superseded answers empty and cancelled; one retry covers the overlap.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await window.api.aiVault.listSessions({
      unlimited: true,
      includeAntigravityIdeSessions: true,
      executionHostScope: LOCAL_EXECUTION_HOST_ID,
      requestToken: createBrowserUuid(),
      ...(scopePaths ? { scopePaths } : {})
    })
    if (!result.cancelled) {
      return result
    }
  }
  return null
}

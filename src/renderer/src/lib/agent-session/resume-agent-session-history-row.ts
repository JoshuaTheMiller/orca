import { getIndexedAllWorktrees } from '@/store/worktree-repo-index'
import { useAppStore } from '@/store'
import { selectFolderWorkspaces, selectWorktreesByRepo } from '@/store/workspace-record-selectors'
import { resolveAgentSessionLaunchRoute } from '@/lib/agent-session-launch-plan'
import { worktreeLaunchWorkspace } from '@/lib/agent-launch-route-input'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import {
  buildAiVaultResumeStartupForWorktree,
  getAiVaultAgentProviderSession
} from '@/lib/ai-vault-resume-command'
import {
  dropDeletedRemoteResumeCwd,
  prepareAiVaultSessionForTerminalResume
} from '@/lib/ai-vault-session-resume-preparation'
import { describeAiVaultResumeFailure } from '@/lib/ai-vault-resume-refusal'
import { launchAiVaultSessionAndReveal } from '@/lib/launch-ai-vault-session-and-reveal'
import { notifyAiVaultSessionPreparationFailure } from '@/components/right-sidebar/ai-vault-session-launch-feedback'
import { resolveAiVaultSessionLaunchTarget } from '@/components/right-sidebar/ai-vault-session-launch-target'
import { resolveAiVaultHistoryRowResume } from '@/components/right-sidebar/ai-vault-session-resume-in-chat-workspace'
import { resumeAiVaultSessionInNewChat } from '@/components/right-sidebar/ai-vault-session-resume-in-chat-launch'
import {
  aiVaultSessionOwnerWorkspaces,
  canJumpToAiVaultSessionWorktree,
  resolveAiVaultSessionWorktreeInfo
} from '@/components/right-sidebar/ai-vault-session-worktree'
import {
  isAiVaultSessionResumableContent,
  type AiVaultSession
} from '../../../../shared/ai-vault-types'
import type { AgentSessionOpenOutcome } from '../../../../shared/agent-session-open'
import { isResumableTuiAgent } from '../../../../shared/agent-session-resume'
import {
  adoptsCliConversations,
  CLI_CONVERSATION_ADOPTING_AGENTS
} from '../../../../shared/structured-agent-cli-conversation-adoption'

/**
 * Resumes a history row in the workspace that holds `cwd` (else the row's recorded cwd),
 * as a chat when the user's Chat | CLI choice and the row allow it, otherwise in a terminal.
 */
export async function resumeAgentSessionHistoryRow(
  row: AiVaultSession,
  cwd: string | undefined
): Promise<AgentSessionOpenOutcome> {
  if (!isAiVaultSessionResumableContent(row)) {
    return 'not_found'
  }
  const state = useAppStore.getState()
  const workspaces = aiVaultSessionOwnerWorkspaces(
    getIndexedAllWorktrees(selectWorktreesByRepo(state)),
    selectFolderWorkspaces(state)
  )
  const worktreeInfo = resolveAiVaultSessionWorktreeInfo({
    // Why: only the owner lookup sees the caller's directory; the launch keeps the recorded one.
    session: cwd ? { ...row, cwd, cwdAliases: undefined } : row,
    repos: state.repos,
    worktrees: workspaces,
    activeWorktreeId: null
  })
  const workspaceId = canJumpToAiVaultSessionWorktree(worktreeInfo)
    ? worktreeInfo?.worktreeId
    : null
  if (
    !workspaceId ||
    resolveAiVaultSessionLaunchTarget({
      sessionFilePath: row.filePath,
      sessionExecutionHostId: row.executionHostId,
      activeWorktreeId: null,
      targetWorktreeId: workspaceId,
      targetState: state
    }).status !== 'ready'
  ) {
    return 'not_found'
  }
  const { resumeInChat } = resolveAiVaultHistoryRowResume({
    session: row,
    worktreeInfo,
    activeWorktreeId: workspaceId,
    worktrees: workspaces,
    repos: state.repos,
    targetState: state,
    settings: state.settings
  })
  if (
    resumeInChat.available &&
    adoptsCliConversations(row.agent) &&
    CLI_CONVERSATION_ADOPTING_AGENTS[row.agent].some(
      (agent) =>
        resolveAgentSessionLaunchRoute(state, {
          agent,
          workspace: worktreeLaunchWorkspace(workspaceId)
        }) === 'structured-native-chat'
    )
  ) {
    void resumeAiVaultSessionInNewChat(row, row.agent, workspaceId, newAgentLaunchRequestId())
    return 'resumed'
  }
  if (!isResumableTuiAgent(row.agent) || !getAiVaultAgentProviderSession(row)) {
    return 'not_found'
  }
  try {
    const prepared = await dropDeletedRemoteResumeCwd(
      await prepareAiVaultSessionForTerminalResume(row)
    )
    const startup = buildAiVaultResumeStartupForWorktree({
      state: useAppStore.getState(),
      worktreeId: workspaceId,
      session: prepared,
      commandOverride: state.settings?.agentCmdOverrides?.[row.agent]
    })
    void launchAiVaultSessionAndReveal(
      { agent: row.agent, worktreeId: workspaceId, ...startup },
      (message) => describeAiVaultResumeFailure(new Error(message), row.agent)
    )
    return 'resumed'
  } catch (error) {
    notifyAiVaultSessionPreparationFailure(error, row.agent)
    return 'not_found'
  }
}

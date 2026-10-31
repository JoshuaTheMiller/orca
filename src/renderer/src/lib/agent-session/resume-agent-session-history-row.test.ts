import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import type * as ResumeCommandModule from '@/lib/ai-vault-resume-command'
import { makeWorktree } from '@/components/worktree-jump-palette-test-fixtures'

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  resumeInChat: vi.fn(),
  route: vi.fn(),
  launchTarget: vi.fn(),
  resumeInNewChat: vi.fn(),
  prepare: vi.fn(),
  buildStartup: vi.fn(),
  launchTerminal: vi.fn(),
  notifyFailure: vi.fn()
}))

vi.mock('@/store', () => ({ useAppStore: { getState: () => mocks.state } }))
vi.mock('@/lib/agent-session-launch-plan', () => ({
  resolveAgentSessionLaunchRoute: mocks.route
}))
vi.mock('@/components/right-sidebar/ai-vault-session-resume-in-chat-workspace', () => ({
  resolveAiVaultHistoryRowResume: mocks.resumeInChat
}))
vi.mock('@/components/right-sidebar/ai-vault-session-launch-target', () => ({
  resolveAiVaultSessionLaunchTarget: mocks.launchTarget
}))
vi.mock('@/components/right-sidebar/ai-vault-session-resume-in-chat-launch', () => ({
  resumeAiVaultSessionInNewChat: mocks.resumeInNewChat
}))
vi.mock('@/components/right-sidebar/ai-vault-session-launch-feedback', () => ({
  notifyAiVaultSessionPreparationFailure: mocks.notifyFailure
}))
vi.mock('@/lib/ai-vault-session-resume-preparation', () => ({
  prepareAiVaultSessionForTerminalResume: mocks.prepare,
  dropDeletedRemoteResumeCwd: async (session: unknown) => session
}))
vi.mock('@/lib/ai-vault-resume-command', async (importOriginal) => ({
  ...(await importOriginal<typeof ResumeCommandModule>()),
  buildAiVaultResumeStartupForWorktree: mocks.buildStartup
}))
vi.mock('@/lib/launch-ai-vault-session-and-reveal', () => ({
  launchAiVaultSessionAndReveal: mocks.launchTerminal
}))
vi.mock('@/lib/ai-vault-resume-refusal', () => ({ describeAiVaultResumeFailure: () => '' }))
vi.mock('@/lib/agent-launch-request-id', () => ({ newAgentLaunchRequestId: () => 'req-1' }))

import { resumeAgentSessionHistoryRow } from './resume-agent-session-history-row'

const REPO_PATH = '/work/repo'
const OTHER_PATH = '/work/other'

function row(overrides: Partial<AiVaultSession> = {}): AiVaultSession {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: only the fields resume reads are staged.
  return {
    id: 'row-1',
    agent: 'claude',
    sessionId: 'session-1',
    executionHostId: 'local',
    cwd: REPO_PATH,
    filePath: '/home/me/.claude/projects/p/session-1.jsonl',
    messageCount: 4,
    previewMessages: [{ role: 'user', text: 'hello' }],
    subagent: null,
    ...overrides
  } as unknown as AiVaultSession
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state = {
    repos: [{ id: 'repo-1' }],
    folderWorkspaces: [],
    settings: {},
    worktreesByRepo: {
      'repo-1': [
        makeWorktree('repo-1::/work/repo', 'repo', { path: REPO_PATH }),
        makeWorktree('repo-1::/work/other', 'other', { path: OTHER_PATH })
      ]
    }
  }
  mocks.launchTarget.mockReturnValue({ status: 'ready', worktreeId: 'x' })
  mocks.resumeInChat.mockReturnValue({ resumeInChat: { available: false, reason: 'workspace' } })
  mocks.route.mockReturnValue('terminal-tui')
  mocks.prepare.mockImplementation(async (session: unknown) => session)
  mocks.buildStartup.mockReturnValue({ command: 'claude --resume session-1' })
})

describe('resumeAgentSessionHistoryRow', () => {
  it('resumes in the terminal of the workspace holding the recorded cwd', async () => {
    await expect(resumeAgentSessionHistoryRow(row(), undefined)).resolves.toBe('resumed')

    expect(mocks.buildStartup).toHaveBeenCalledWith(
      expect.objectContaining({ worktreeId: 'repo-1::/work/repo' })
    )
    expect(mocks.launchTerminal).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'claude',
        worktreeId: 'repo-1::/work/repo',
        command: 'claude --resume session-1'
      }),
      expect.any(Function)
    )
    expect(mocks.resumeInNewChat).not.toHaveBeenCalled()
  })

  it('picks the workspace containing the caller cwd and keeps the recorded cwd for the launch', async () => {
    await expect(resumeAgentSessionHistoryRow(row(), `${OTHER_PATH}/packages/app`)).resolves.toBe(
      'resumed'
    )

    expect(mocks.launchTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ worktreeId: 'repo-1::/work/other' }),
      expect.any(Function)
    )
    expect(mocks.prepare).toHaveBeenCalledWith(expect.objectContaining({ cwd: REPO_PATH }))
  })

  it('answers not_found without side effects when no workspace holds the cwd', async () => {
    await expect(resumeAgentSessionHistoryRow(row(), '/elsewhere/project')).resolves.toBe(
      'not_found'
    )

    expect(mocks.launchTerminal).not.toHaveBeenCalled()
    expect(mocks.resumeInNewChat).not.toHaveBeenCalled()
  })

  it('answers not_found when the workspace cannot host the recorded session', async () => {
    mocks.launchTarget.mockReturnValue({ status: 'unsupported', targetStatus: 'ssh' })

    await expect(resumeAgentSessionHistoryRow(row(), undefined)).resolves.toBe('not_found')
    expect(mocks.launchTerminal).not.toHaveBeenCalled()
  })

  it('answers not_found for a session with no turns to resume', async () => {
    await expect(
      resumeAgentSessionHistoryRow(row({ messageCount: 0, previewMessages: [] }), undefined)
    ).resolves.toBe('not_found')
    expect(mocks.launchTerminal).not.toHaveBeenCalled()
  })

  it('answers not_found for an agent that has no terminal resume command', async () => {
    await expect(resumeAgentSessionHistoryRow(row({ agent: 'openclaw' }), undefined)).resolves.toBe(
      'not_found'
    )
    expect(mocks.launchTerminal).not.toHaveBeenCalled()
  })

  it('resumes in a new chat when the row is eligible and the Chat | CLI choice says chat', async () => {
    mocks.resumeInChat.mockReturnValue({
      resumeInChat: { available: true, workspaceId: 'repo-1::/work/repo' }
    })
    mocks.route.mockReturnValue('structured-native-chat')
    const recorded = row()

    await expect(resumeAgentSessionHistoryRow(recorded, undefined)).resolves.toBe('resumed')

    expect(mocks.resumeInNewChat).toHaveBeenCalledWith(
      recorded,
      'claude',
      'repo-1::/work/repo',
      'req-1'
    )
    expect(mocks.launchTerminal).not.toHaveBeenCalled()
  })

  it('falls back to the terminal when the user prefers the CLI', async () => {
    mocks.resumeInChat.mockReturnValue({
      resumeInChat: { available: true, workspaceId: 'repo-1::/work/repo' }
    })
    mocks.route.mockReturnValue('terminal-tui')

    await expect(resumeAgentSessionHistoryRow(row(), undefined)).resolves.toBe('resumed')

    expect(mocks.resumeInNewChat).not.toHaveBeenCalled()
    expect(mocks.launchTerminal).toHaveBeenCalledTimes(1)
  })

  it('reports not_found and tells the user when preparing the terminal resume fails', async () => {
    mocks.prepare.mockRejectedValue(new Error('no account home'))

    await expect(resumeAgentSessionHistoryRow(row(), undefined)).resolves.toBe('not_found')

    expect(mocks.notifyFailure).toHaveBeenCalledTimes(1)
    expect(mocks.launchTerminal).not.toHaveBeenCalled()
  })
})

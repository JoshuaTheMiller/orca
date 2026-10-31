import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'

const mocks = vi.hoisted(() => ({
  state: { unifiedTabsByWorktree: {} as Record<string, unknown[]>, setActiveTabType: vi.fn() },
  live: vi.fn(),
  reveal: vi.fn(),
  focusPane: vi.fn(),
  structuredTab: vi.fn(),
  activateStructured: vi.fn(),
  reopenStructured: vi.fn(),
  resumeRow: vi.fn(),
  listSessions: vi.fn()
}))

vi.mock('@/store', () => ({ useAppStore: { getState: () => mocks.state } }))
vi.mock('@/lib/agent-session/live-provider-session-pane', () => ({
  findLiveProviderSessionPane: mocks.live
}))
vi.mock('@/lib/worktree-activation', () => ({ activateAndRevealWorkspace: mocks.reveal }))
vi.mock('@/lib/activate-tab-and-focus-pane', () => ({ activateTabAndFocusPane: mocks.focusPane }))
vi.mock('@/lib/agent-session/structured-agent-session-tab-activation', () => ({
  findStructuredAgentSessionTab: mocks.structuredTab
}))
vi.mock('@/lib/activate-ai-vault-structured-session', () => ({
  activateAiVaultStructuredSession: mocks.activateStructured,
  reopenAiVaultStructuredSession: mocks.reopenStructured
}))
vi.mock('@/lib/agent-session/resume-agent-session-history-row', () => ({
  resumeAgentSessionHistoryRow: mocks.resumeRow
}))

import { openAgentSession } from './open-agent-session'

const PANE = { paneKey: 'tab-1:leaf-1', worktreeId: 'wt-live', tabId: 'tab-1', leafId: 'leaf-1' }

function historyRow(overrides: Partial<AiVaultSession> = {}): AiVaultSession {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: only the fields lookup reads are staged.
  return {
    id: 'row-1',
    agent: 'claude',
    sessionId: 'session-1',
    subagent: null,
    ...overrides
  } as unknown as AiVaultSession
}

function listing(sessions: AiVaultSession[], extra: Record<string, unknown> = {}) {
  return { sessions, issues: [], scannedAt: '', ...extra }
}

const OWNED = { sessionId: 'chat-1', workspaceId: 'wt-chat' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('window', { api: { aiVault: { listSessions: mocks.listSessions } } })
  mocks.live.mockReturnValue(null)
  mocks.reveal.mockReturnValue(true)
  mocks.structuredTab.mockReturnValue(null)
  mocks.reopenStructured.mockResolvedValue('activated')
  mocks.resumeRow.mockResolvedValue('resumed')
  mocks.listSessions.mockResolvedValue(listing([historyRow()]))
})

describe('openAgentSession', () => {
  it('focuses the live terminal pane in whichever workspace runs the session', async () => {
    mocks.live.mockReturnValue(PANE)

    await expect(openAgentSession({ agent: 'claude', sessionId: 'session-1' })).resolves.toBe(
      'focused'
    )

    expect(mocks.reveal).toHaveBeenCalledWith('wt-live')
    expect(mocks.state.setActiveTabType).toHaveBeenCalledWith('terminal', 'wt-live')
    expect(mocks.focusPane).toHaveBeenCalledWith('tab-1', 'leaf-1', expect.any(Object))
    expect(mocks.listSessions).not.toHaveBeenCalled()
    expect(mocks.resumeRow).not.toHaveBeenCalled()
  })

  it('matches both OpenCode spellings of one session store', async () => {
    await openAgentSession({ agent: 'opencode', sessionId: 'session-1' })

    expect(mocks.live).toHaveBeenCalledWith(mocks.state, ['opencode', 'opencode2'], 'session-1')
  })

  it('answers not_found for an agent Orca does not list sessions for', async () => {
    await expect(openAgentSession({ agent: 'not-an-agent', sessionId: 'x' })).resolves.toBe(
      'not_found'
    )

    expect(mocks.listSessions).not.toHaveBeenCalled()
  })

  it('focuses an open chat that owns the conversation', async () => {
    const owned = historyRow({ structuredSession: OWNED })
    mocks.listSessions.mockResolvedValue(listing([owned]))
    mocks.structuredTab.mockReturnValue({ id: 'tab-chat' })
    mocks.activateStructured.mockResolvedValue(true)

    await expect(openAgentSession({ agent: 'claude', sessionId: 'session-1' })).resolves.toBe(
      'focused'
    )

    expect(mocks.activateStructured).toHaveBeenCalledWith(owned)
    expect(mocks.reopenStructured).not.toHaveBeenCalled()
  })

  it('reopens a closed chat that owns the conversation as a resume', async () => {
    mocks.listSessions.mockResolvedValue(listing([historyRow({ structuredSession: OWNED })]))

    await expect(openAgentSession({ agent: 'claude', sessionId: 'session-1' })).resolves.toBe(
      'resumed'
    )

    expect(mocks.reopenStructured).toHaveBeenCalledWith(OWNED)
  })

  it('answers not_found when a closed chat cannot be reopened', async () => {
    mocks.listSessions.mockResolvedValue(listing([historyRow({ structuredSession: OWNED })]))
    mocks.reopenStructured.mockResolvedValue('gone')

    await expect(openAgentSession({ agent: 'claude', sessionId: 'session-1' })).resolves.toBe(
      'not_found'
    )
  })

  it('resumes a past CLI session through the history row, handing over the caller cwd', async () => {
    await expect(
      openAgentSession({ agent: 'claude', sessionId: 'session-1', cwd: '/work/repo' })
    ).resolves.toBe('resumed')

    expect(mocks.listSessions).toHaveBeenCalledTimes(1)
    expect(mocks.listSessions).toHaveBeenCalledWith(
      expect.objectContaining({ unlimited: true, scopePaths: ['/work/repo'] })
    )
    expect(mocks.resumeRow).toHaveBeenCalledWith(historyRow(), '/work/repo')
  })

  it('widens the search past the cwd scope before giving up', async () => {
    mocks.listSessions
      .mockResolvedValueOnce(listing([]))
      .mockResolvedValueOnce(listing([historyRow()]))

    await expect(
      openAgentSession({ agent: 'claude', sessionId: 'session-1', cwd: '/work/repo' })
    ).resolves.toBe('resumed')

    expect(mocks.listSessions.mock.calls[1][0]).not.toHaveProperty('scopePaths')
  })

  it('ignores subagent rows and other sessions, answering not_found', async () => {
    mocks.listSessions.mockResolvedValue(
      listing([
        historyRow({ subagent: { id: 'child' } as unknown as AiVaultSession['subagent'] }),
        historyRow({ sessionId: 'other' }),
        historyRow({ agent: 'codex' })
      ])
    )

    await expect(openAgentSession({ agent: 'claude', sessionId: 'session-1' })).resolves.toBe(
      'not_found'
    )

    expect(mocks.resumeRow).not.toHaveBeenCalled()
  })

  it('retries one superseded scan, then gives up', async () => {
    mocks.listSessions.mockResolvedValue(listing([], { cancelled: true }))

    await expect(openAgentSession({ agent: 'claude', sessionId: 'session-1' })).resolves.toBe(
      'not_found'
    )

    expect(mocks.listSessions).toHaveBeenCalledTimes(2)
    expect(mocks.resumeRow).not.toHaveBeenCalled()
  })
})

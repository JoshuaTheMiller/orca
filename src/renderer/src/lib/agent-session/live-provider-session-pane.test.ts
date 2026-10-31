import { describe, expect, it } from 'vitest'
import { findLiveProviderSessionPane } from './live-provider-session-pane'
import type { OriginalPaneState } from '@/components/right-sidebar/ai-vault-original-pane'

const LEAF_ID = '11111111-1111-4111-8111-111111111111'
const PANE_KEY = `tab-1:${LEAF_ID}`

function stateWith(partial: Record<string, unknown>): OriginalPaneState {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: only the slices the finder reads are staged.
  return {
    agentStatusByPaneKey: {},
    retainedAgentsByPaneKey: {},
    sleepingAgentSessionsByPaneKey: {},
    tabsByWorktree: { 'wt-1': [{ id: 'tab-1' }] },
    terminalLayoutsByTabId: { 'tab-1': { root: { type: 'leaf', leafId: LEAF_ID } } },
    ...partial
  } as unknown as OriginalPaneState
}

const running = (agentType: string, id: string) => ({
  [PANE_KEY]: {
    agentType,
    paneKey: PANE_KEY,
    worktreeId: 'wt-1',
    tabId: 'tab-1',
    providerSession: { id }
  }
})

describe('findLiveProviderSessionPane', () => {
  it('finds the pane running the provider session by id', () => {
    const state = stateWith({ agentStatusByPaneKey: running('claude', 'abc') })

    expect(findLiveProviderSessionPane(state, ['claude'], 'abc')).toEqual({
      paneKey: PANE_KEY,
      worktreeId: 'wt-1',
      tabId: 'tab-1',
      leafId: LEAF_ID
    })
  })

  it('does not match another id or another agent', () => {
    const state = stateWith({ agentStatusByPaneKey: running('claude', 'abc') })

    expect(findLiveProviderSessionPane(state, ['claude'], 'other')).toBeNull()
    expect(findLiveProviderSessionPane(state, ['codex'], 'abc')).toBeNull()
  })

  it('finds a sleeping session whose workspace was parked', () => {
    const state = stateWith({
      sleepingAgentSessionsByPaneKey: {
        [PANE_KEY]: {
          agent: 'codex',
          paneKey: PANE_KEY,
          worktreeId: 'wt-1',
          tabId: 'tab-1',
          providerSession: { key: 'session_id', id: 'abc' }
        }
      }
    })

    expect(findLiveProviderSessionPane(state, ['codex'], 'abc')?.worktreeId).toBe('wt-1')
  })

  it('ignores a pane whose tab is gone', () => {
    const state = stateWith({
      agentStatusByPaneKey: running('claude', 'abc'),
      tabsByWorktree: {}
    })

    expect(findLiveProviderSessionPane(state, ['claude'], 'abc')).toBeNull()
  })
})

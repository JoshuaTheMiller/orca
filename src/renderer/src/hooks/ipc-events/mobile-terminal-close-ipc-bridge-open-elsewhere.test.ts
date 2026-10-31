import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeNavigationTarget } from '../../../../shared/runtime-navigation'
import { FLOATING_TERMINAL_WORKTREE_ID, getDefaultSettings } from '../../../../shared/constants'
import { createTestStore, makeWorktree, seedStore } from '../../store/slices/store-test-helpers'
import { createStoreSessionMockApi } from '../../store/slices/store-session-test-harness'
import type * as HostPersistence from '@/lib/workspace-session-host-persistence'
import {
  drawTabsFromMain,
  type TabsDrawnFromMain
} from '../../store/slices/tabs-drawn-from-main.test-fixture'

const { storeRef } = vi.hoisted(() => {
  const ref: { current: ReturnType<typeof createTestStore> | null } = { current: null }
  return { storeRef: ref }
})

function testStore(): ReturnType<typeof createTestStore> {
  if (!storeRef.current) {
    throw new Error('test store not created')
  }
  return storeRef.current
}

vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }))
vi.mock('../../store', () => ({
  useAppStore: {
    getState: () => testStore().getState(),
    subscribe: (...args: Parameters<ReturnType<typeof createTestStore>['subscribe']>) =>
      testStore().subscribe(...args),
    setState: (...args: Parameters<ReturnType<typeof createTestStore>['setState']>) =>
      testStore().setState(...args)
  }
}))
vi.mock('@/components/terminal-pane/closed-terminal-leaf-notice', () => ({
  applyClosedTerminalLeafNotice: vi.fn()
}))
vi.mock('@/components/terminal/terminal-tab-actions', () => ({ closeTerminalTab: vi.fn() }))
vi.mock('@/components/sidebar/sleep-worktree-flow', () => ({ runSleepWorktree: vi.fn() }))
vi.mock('@/runtime/runtime-rpc-client', async (importOriginal) =>
  (
    await import('@/runtime/layout-apply-test-transport.test-fixture')
  ).runtimeRpcClientWithLayoutApply(await importOriginal())
)
vi.mock('@/runtime/runtime-layout-client', async (importOriginal) =>
  (
    await import('@/runtime/layout-apply-test-transport.test-fixture')
  ).runtimeLayoutClientWithTestFrames(await importOriginal())
)
vi.mock('@/lib/workspace-session-host-persistence', async (importOriginal) => ({
  ...(await importOriginal<typeof HostPersistence>()),
  persistWorkspaceSessionByHost: vi.fn()
}))

import { registerMobileAndTerminalCloseIpcBridge } from './mobile-terminal-close-ipc-bridge'

type OpenFilePayload = {
  worktreeId: string
  filePath: string
  relativePath: string
  runtimeEnvironmentId?: string | null
  navigation?: RuntimeNavigationTarget
  position?: { line: number; column?: number }
}
type TestStore = ReturnType<typeof createTestStore>

const VIEWED = 'repo1::/repo1/viewed'
const BACKGROUND = 'repo1::/repo1/background'
const VIEWED_FILE = '/repo1/viewed/notes.md'
const APP_TS = { filePath: '/repo1/background/src/app.ts', relativePath: 'src/app.ts' }

let main: TabsDrawnFromMain | null = null

afterEach(() => {
  main?.close()
  main = null
})

async function setup(): Promise<{
  openFile: (payload: OpenFilePayload) => Promise<void>
  store: TestStore
}> {
  const listeners: { openFile?: (payload: OpenFilePayload) => void } = {}
  vi.stubGlobal('window', {
    api: {
      ...createStoreSessionMockApi(),
      ui: {
        onOpenFileFromMobile: (cb: (payload: OpenFilePayload) => void) => {
          listeners.openFile = cb
          return () => {}
        },
        onOpenDiffFromMobile: () => () => {},
        onCloseTerminal: () => () => {},
        onWorkspaceSleep: () => () => {},
        onResumeSleepingAgents: () => () => {}
      }
    }
  })
  const store = createTestStore()
  storeRef.current = store
  seedStore(store, {
    worktreesByRepo: {
      repo1: [
        makeWorktree({ id: VIEWED, repoId: 'repo1', path: '/repo1/viewed' }),
        makeWorktree({ id: BACKGROUND, repoId: 'repo1', path: '/repo1/background' })
      ]
    }
  })
  store.getState().setActiveWorktree(VIEWED)
  main = await drawTabsFromMain(store)
  store.getState().openFile({
    filePath: VIEWED_FILE,
    relativePath: 'notes.md',
    worktreeId: VIEWED,
    language: 'markdown',
    runtimeEnvironmentId: null,
    mode: 'edit'
  })
  await main.settle()
  store.setState({ activeView: 'terminal', pendingRevealWorktree: null })
  registerMobileAndTerminalCloseIpcBridge([], vi.fn())
  const { openFile } = listeners
  if (!openFile) {
    throw new Error('file-open listener was not registered')
  }
  return {
    openFile: async (payload) => {
      openFile(payload)
      await main?.settle()
    },
    store
  }
}

function tabEntityIds(store: TestStore, worktreeId: string): string[] {
  return (store.getState().unifiedTabsByWorktree[worktreeId] ?? []).map((tab) => tab.entityId)
}

function activeEditorEntityId(store: TestStore, worktreeId: string): string | undefined {
  const state = store.getState()
  const group = state.groupsByWorktree[worktreeId]?.find(
    (candidate) => candidate.id === state.activeGroupIdByWorktree[worktreeId]
  )
  return state.unifiedTabsByWorktree[worktreeId]?.find((tab) => tab.id === group?.activeTabId)
    ?.entityId
}

describe('opening a file another workspace already shows', () => {
  const frames: FrameRequestCallback[] = []
  beforeEach(() => {
    frames.length = 0
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      frames.push(callback)
    )
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })
  function flushFrames(): void {
    while (frames.length) {
      frames.shift()?.(0)
    }
  }
  const SHARED = { filePath: VIEWED_FILE, relativePath: VIEWED_FILE }

  it('reveals the tab in the other workspace instead of creating a sibling tab', async () => {
    const { openFile, store } = await setup()
    store.getState().setActiveWorktree(BACKGROUND)
    const openFilesBefore = store.getState().openFiles.length

    await openFile({ worktreeId: BACKGROUND, ...SHARED })

    const state = store.getState()
    expect(state.activeWorktreeId).toBe(VIEWED)
    expect(activeEditorEntityId(store, VIEWED)).toBe(VIEWED_FILE)
    expect(tabEntityIds(store, BACKGROUND)).not.toContain(VIEWED_FILE)
    expect(state.openFiles).toHaveLength(openFilesBefore)
  })

  it('matches the same file regardless of slash style and, on Windows paths, case', async () => {
    const { openFile, store } = await setup()
    store.getState().openFile({
      filePath: String.raw`C:\Notes\Plan.md`,
      relativePath: String.raw`C:\Notes\Plan.md`,
      worktreeId: VIEWED,
      language: 'markdown',
      runtimeEnvironmentId: null,
      mode: 'edit'
    })
    store.getState().setActiveWorktree(BACKGROUND)

    await openFile({
      worktreeId: BACKGROUND,
      filePath: 'c:/notes/plan.md',
      relativePath: 'c:/notes/plan.md'
    })

    expect(store.getState().activeWorktreeId).toBe(VIEWED)
    expect(tabEntityIds(store, BACKGROUND)).toEqual([])
  })

  it('reveals a tab held by the floating workspace', async () => {
    const { openFile, store } = await setup()
    store.setState({
      settings: { ...getDefaultSettings('/tmp'), floatingTerminalEnabled: true },
      floatingWorkspacePath: '/tmp/floating'
    })
    await openFile({
      worktreeId: FLOATING_TERMINAL_WORKTREE_ID,
      filePath: '/tmp/floating/only.ts',
      relativePath: 'only.ts',
      navigation: 'caller'
    })
    store.setState({ floatingWorkspacePanelOpen: false })
    const dispatchEvent = vi.fn()
    vi.stubGlobal('window', { ...window, dispatchEvent })

    await openFile({
      worktreeId: BACKGROUND,
      filePath: '/tmp/floating/only.ts',
      relativePath: '/tmp/floating/only.ts'
    })

    // Why: revealing the floating workspace toggles its panel open.
    expect(dispatchEvent).toHaveBeenCalledTimes(1)
    expect(tabEntityIds(store, BACKGROUND)).toEqual([])
  })

  it('opens a file no workspace shows as usual', async () => {
    const { openFile, store } = await setup()

    await openFile({ worktreeId: BACKGROUND, ...APP_TS, navigation: 'all' })

    expect(tabEntityIds(store, BACKGROUND)).toContain(APP_TS.filePath)
  })

  it('applies the line and column to the revealed tab', async () => {
    const { openFile, store } = await setup()
    store.getState().setActiveWorktree(BACKGROUND)

    await openFile({ worktreeId: BACKGROUND, ...SHARED, position: { line: 9, column: 3 } })
    flushFrames()

    expect(store.getState().pendingEditorReveal).toMatchObject({
      fileId: VIEWED_FILE,
      line: 9,
      column: 3
    })
  })
})

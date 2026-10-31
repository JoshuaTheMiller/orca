import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PluginService } from '../plugins/plugin-service'

const electronMocks = vi.hoisted(() => ({ handle: vi.fn() }))
vi.mock('electron', () => ({ ipcMain: { handle: electronMocks.handle } }))

import { registerPluginSidebarCardHandlers } from './plugin-sidebar-cards'

type Handler = (event: unknown, args: unknown) => Promise<unknown>

function setup(overrides: { action?: unknown; outcome?: unknown } = {}) {
  const findItem = vi.fn().mockReturnValue(
    overrides.action === undefined
      ? {
          id: 'row',
          title: 'Row',
          action: {
            kind: 'openFile',
            path: '/tmp/a.md',
            placement: 'active-workspace'
          }
        }
      : { id: 'row', title: 'Row', action: overrides.action }
  )
  const executeHostCall = vi
    .fn()
    .mockResolvedValue(overrides.outcome ?? { ok: true, value: { opened: true } })
  const setWindowCard = vi.fn()
  const service = {
    whenReady: vi.fn().mockResolvedValue(undefined),
    executeHostCall,
    sidebarCards: {
      findItem,
      getItems: vi.fn().mockReturnValue([]),
      setWindowCard,
      dropWindow: vi.fn()
    }
  }
  // SAFETY: the handlers only touch the members stubbed above.
  // oxlint-disable-next-line typescript/consistent-type-assertions
  registerPluginSidebarCardHandlers(service as unknown as PluginService)
  const handlers = new Map(
    electronMocks.handle.mock.calls.map(([name, fn]) => [name, fn as Handler])
  )
  return { handlers, findItem, executeHostCall, setWindowCard }
}

const card = { pluginKey: 'samples.demo', cardId: 'issues' }

beforeEach(() => electronMocks.handle.mockReset())

describe('sidebar card IPC', () => {
  it('opens a row file with the path main holds, not one the window sends', async () => {
    const { handlers, executeHostCall, findItem } = setup()
    const outcome = await handlers.get('plugins:openSidebarCardFile')!(
      {},
      { ...card, itemId: 'row', path: '/etc/passwd' }
    )
    expect(outcome).toEqual({ ok: true })
    expect(findItem).toHaveBeenCalledWith('samples.demo', 'issues', 'row')
    expect(executeHostCall).toHaveBeenCalledWith(
      'samples.demo',
      'editor.openFile',
      { path: '/tmp/a.md', placement: 'active-workspace' },
      'worker'
    )
  })

  it('reports a plugin without editor:open as a failure the window can toast', async () => {
    const { handlers } = setup({
      outcome: {
        ok: false,
        code: 'capability_denied',
        error: 'plugin does not have the "editor:open" capability'
      }
    })
    await expect(
      handlers.get('plugins:openSidebarCardFile')!({}, { ...card, itemId: 'row' })
    ).resolves.toEqual({
      ok: false,
      error: 'plugin does not have the "editor:open" capability'
    })
  })

  it('does not open anything for a row that is gone or runs a command', async () => {
    for (const action of [{ kind: 'command', command: 'tracker.open' }, null]) {
      electronMocks.handle.mockReset()
      const { handlers, executeHostCall } = setup({ action })
      await expect(
        handlers.get('plugins:openSidebarCardFile')!({}, { ...card, itemId: 'row' })
      ).resolves.toMatchObject({ ok: false })
      expect(executeHostCall).not.toHaveBeenCalled()
    }
  })

  it('records the card a window shows by its sender id, and validates the reference', async () => {
    const { handlers, setWindowCard } = setup()
    const sender = { id: 5, once: vi.fn(), removeListener: vi.fn() }
    await handlers.get('plugins:setSidebarCardShown')!({ sender }, card)
    expect(setWindowCard).toHaveBeenCalledWith(5, card)
    await handlers.get('plugins:setSidebarCardShown')!({ sender }, null)
    expect(setWindowCard).toHaveBeenLastCalledWith(5, null)
    await expect(
      handlers.get('plugins:setSidebarCardShown')!({ sender }, { pluginKey: 'bad', cardId: 'x' })
    ).rejects.toThrow()
  })
})

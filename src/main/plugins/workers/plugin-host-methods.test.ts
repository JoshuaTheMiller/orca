import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { PLUGIN_WORKSPACE_TERMINAL_LIMIT } from '../../../shared/plugins/workers/plugin-host-api'
import { bindPluginHostServices, type PluginRuntimeDelegate } from './plugin-host-service-bindings'
import { executePluginHostCall, type PluginHostServices } from './plugin-host-methods'

function createServices(storageSet: PluginHostServices['storage']['set']): PluginHostServices {
  return {
    resolveActiveWorktreeContext: vi.fn().mockResolvedValue(null),
    listWorktreeTerminals: vi.fn().mockResolvedValue([]),
    sendTerminalText: vi.fn().mockResolvedValue({ accepted: true }),
    openAgentSession: vi.fn().mockResolvedValue('not_found'),
    dispatchPluginNotification: vi.fn().mockResolvedValue({ delivered: true }),
    openEditorFile: vi.fn().mockResolvedValue({ opened: true }),
    sidebarNavValues: vi.fn().mockReturnValue({}),
    openLink: vi.fn().mockResolvedValue({ opened: true }),
    setSidebarCardItems: vi.fn().mockReturnValue({ ok: true }),
    projectItems: { setDetail: vi.fn().mockReturnValue({ ok: true }) },
    storage: {
      get: vi.fn(),
      set: storageSet,
      delete: vi.fn(),
      keys: vi.fn().mockReturnValue([])
    },
    secrets: {
      get: vi.fn().mockReturnValue({ ok: true, value: null }),
      set: vi.fn().mockReturnValue({ ok: true }),
      delete: vi.fn()
    },
    settings: {
      getAll: vi.fn().mockReturnValue({}),
      set: vi.fn().mockReturnValue({ ok: true })
    }
  }
}

describe('executePluginHostCall mutation auditing', () => {
  it('rejects prototype-sensitive storage keys before any host service call', async () => {
    const storageSet = vi.fn().mockReturnValue({ ok: true })
    const outcome = await executePluginHostCall({
      pluginId: 'samples.demo',
      method: 'storage.set',
      params: { key: '__proto__', value: 42 },
      surface: 'worker',
      grantedCapabilities: ['storage:own'],
      services: createServices(storageSet),
      audit: { record: vi.fn().mockResolvedValue(undefined) }
    })

    expect(outcome).toMatchObject({ ok: false, code: 'invalid_params' })
    expect(storageSet).not.toHaveBeenCalled()
  })

  it('rejects non-JSON storage values before any host service call', async () => {
    const storageSet = vi.fn().mockReturnValue({ ok: true })
    const outcome = await executePluginHostCall({
      pluginId: 'samples.demo',
      method: 'storage.set',
      params: { key: 'created', value: new Date() },
      surface: 'worker',
      grantedCapabilities: ['storage:own'],
      services: createServices(storageSet),
      audit: { record: vi.fn().mockResolvedValue(undefined) }
    })

    expect(outcome).toMatchObject({ ok: false, code: 'invalid_params' })
    expect(storageSet).not.toHaveBeenCalled()
  })

  it('fails closed before a mutation when the audit intent cannot be recorded', async () => {
    const storageSet = vi.fn().mockReturnValue({ ok: true })
    const outcome = await executePluginHostCall({
      pluginId: 'samples.demo',
      method: 'storage.set',
      params: { key: 'answer', value: 42 },
      surface: 'worker',
      grantedCapabilities: ['storage:own'],
      services: createServices(storageSet),
      audit: { record: vi.fn().mockRejectedValue(new Error('disk full')) }
    })

    expect(outcome).toMatchObject({ ok: false, code: 'action_failed' })
    expect(storageSet).not.toHaveBeenCalled()
  })

  it('records an intent before the mutation and its outcome afterward', async () => {
    const order: string[] = []
    const storageSet = vi.fn(() => {
      order.push('mutation')
      return { ok: true as const }
    })
    const record = vi.fn(async (entry: { outcome: string }) => {
      order.push(`audit:${entry.outcome}`)
    })

    const outcome = await executePluginHostCall({
      pluginId: 'samples.demo',
      method: 'storage.set',
      params: { key: 'answer', value: 42 },
      surface: 'worker',
      grantedCapabilities: ['storage:own'],
      services: createServices(storageSet),
      audit: { record }
    })

    expect(outcome).toEqual({ ok: true, value: { ok: true } })
    expect(order).toEqual(['audit:attempt', 'mutation', 'audit:ok'])
  })

  it('refuses mutations when no audit writer is configured', async () => {
    const storageSet = vi.fn().mockReturnValue({ ok: true })
    const outcome = await executePluginHostCall({
      pluginId: 'samples.demo',
      method: 'storage.set',
      params: { key: 'answer', value: 42 },
      surface: 'worker',
      grantedCapabilities: ['storage:own'],
      services: createServices(storageSet)
    })

    expect(outcome).toMatchObject({ ok: false, code: 'unavailable' })
    expect(storageSet).not.toHaveBeenCalled()
  })
})

function createTerminalHarness(terminalHandles: string[]): {
  delegate: PluginRuntimeDelegate
  services: PluginHostServices
} {
  const delegate: PluginRuntimeDelegate = {
    resolveActiveWorktreeContext: vi.fn().mockResolvedValue({
      worktreeId: 'worktree-1',
      path: '/Users/private/repo',
      branch: 'main',
      displayName: 'Repo'
    }),
    listTerminals: vi.fn().mockResolvedValue({
      terminals: terminalHandles.map((handle) => ({ handle, title: null }))
    }),
    sendTerminal: vi.fn().mockResolvedValue({ accepted: true }),
    dispatchPluginNotification: vi.fn().mockResolvedValue({ delivered: true }),
    openLocalAbsoluteFile: vi.fn().mockResolvedValue({ worktree: 'worktree-1' }),
    openAgentSession: vi.fn().mockResolvedValue('not_found')
  }
  return {
    delegate,
    services: bindPluginHostServices({
      delegate,
      pluginsDataDir: join(tmpdir(), 'plugin-host-methods-test'),
      sidebarNavValues: () => ({}),
      setSidebarCardItems: () => ({ ok: true }),
      settings: { getAll: () => ({}), set: () => ({ ok: true }) },
      projectItems: { setDetail: () => ({ ok: true }) }
    })
  }
}

async function sendTerminalText(
  services: PluginHostServices,
  terminalId: string
): ReturnType<typeof executePluginHostCall> {
  return executePluginHostCall({
    pluginId: 'samples.demo',
    method: 'terminal.sendText',
    params: { terminalId, text: 'echo hi', enter: true },
    surface: 'worker',
    grantedCapabilities: ['terminal:send'],
    services,
    audit: { record: vi.fn().mockResolvedValue(undefined) }
  })
}

describe('terminal.sendText panel surface', () => {
  it('refuses a sandboxed panel even with terminal:send granted', async () => {
    const { delegate, services } = createTerminalHarness(['term-1'])
    const outcome = await executePluginHostCall({
      pluginId: 'orca-samples.demo',
      method: 'terminal.sendText',
      params: { terminalId: 'term-1', text: 'echo hi', enter: true },
      surface: 'panel',
      grantedCapabilities: ['terminal:send'],
      services,
      audit: { record: vi.fn().mockResolvedValue(undefined) }
    })
    expect(outcome).toMatchObject({ ok: false, code: 'not_permitted' })
    expect(delegate.sendTerminal).not.toHaveBeenCalled()
  })
})

describe('host API surfaces and strict params', () => {
  const call = (method: string, params: unknown, surface: 'worker' | 'panel' | 'editor') =>
    executePluginHostCall({
      pluginId: 'samples.demo',
      method,
      params,
      surface,
      grantedCapabilities: ['storage:own', 'notifications:show'],
      services: createServices(vi.fn().mockReturnValue({ ok: true })),
      audit: { record: vi.fn().mockResolvedValue(undefined) }
    })

  it('lets each surface call only the methods that list it', async () => {
    await expect(call('storage.keys', {}, 'editor')).resolves.toMatchObject({
      ok: false,
      code: 'not_permitted'
    })
    await expect(call('storage.keys', {}, 'worker')).resolves.toEqual({
      ok: true,
      value: { keys: [] }
    })
    await expect(call('notifications.show', { title: 'Hi' }, 'editor')).resolves.toEqual({
      ok: true,
      value: { delivered: true }
    })
  })

  it('refuses a param this host does not know instead of dropping it', async () => {
    const outcome = await call('notifications.show', { title: 'Hi', silent: true }, 'worker')
    expect(outcome).toMatchObject({ ok: false, code: 'invalid_params' })
    expect(!outcome.ok && outcome.error).toContain('silent')
  })
})

describe('terminal.sendText explicit worktree routing', () => {
  it('performs one bounded list and zero sends when the terminal is outside the worktree', async () => {
    const { delegate, services } = createTerminalHarness(['terminal:local:other'])

    const outcome = await sendTerminalText(services, 'terminal:ssh:requested')

    expect(outcome).toMatchObject({ ok: false, code: 'action_failed' })
    expect(delegate.resolveActiveWorktreeContext).toHaveBeenCalledTimes(1)
    expect(delegate.listTerminals).toHaveBeenCalledTimes(1)
    expect(delegate.listTerminals).toHaveBeenCalledWith(
      'id:worktree-1',
      PLUGIN_WORKSPACE_TERMINAL_LIMIT,
      { includeVisualLayouts: false }
    )
    expect(delegate.sendTerminal).not.toHaveBeenCalled()
  })

  it.each(['terminal:local:one', 'terminal:ssh:opaque-provider-id'])(
    'performs one bounded list and one send for provider-agnostic id %s',
    async (terminalId) => {
      const { delegate, services } = createTerminalHarness([terminalId])

      const outcome = await sendTerminalText(services, terminalId)

      expect(outcome).toEqual({ ok: true, value: { accepted: true } })
      expect(delegate.resolveActiveWorktreeContext).toHaveBeenCalledTimes(1)
      expect(delegate.listTerminals).toHaveBeenCalledTimes(1)
      expect(delegate.listTerminals).toHaveBeenCalledWith(
        'id:worktree-1',
        PLUGIN_WORKSPACE_TERMINAL_LIMIT,
        { includeVisualLayouts: false }
      )
      expect(delegate.sendTerminal).toHaveBeenCalledTimes(1)
      expect(delegate.sendTerminal).toHaveBeenCalledWith(
        terminalId,
        {
          text: 'echo hi',
          enter: true
        },
        { inputKind: 'driving' }
      )
      expect(vi.mocked(delegate.listTerminals).mock.invocationCallOrder[0]!).toBeLessThan(
        vi.mocked(delegate.sendTerminal).mock.invocationCallOrder[0]!
      )
    }
  )

  it('bounds workspace.readContext and omits the provider path', async () => {
    const handles = Array.from(
      { length: PLUGIN_WORKSPACE_TERMINAL_LIMIT + 10 },
      (_, index) => `terminal:local:${index}`
    )
    const { delegate, services } = createTerminalHarness(handles)

    const outcome = await executePluginHostCall({
      pluginId: 'samples.demo',
      method: 'workspace.readContext',
      params: {},
      surface: 'panel',
      grantedCapabilities: ['workspace:read'],
      services
    })

    expect(outcome).toMatchObject({
      ok: true,
      value: { branch: 'main', displayName: 'Repo' }
    })
    expect(outcome).not.toHaveProperty('value.path')
    expect(outcome).not.toHaveProperty('value.worktreeId')
    expect(outcome.ok && (outcome.value as { terminals: unknown[] }).terminals).toHaveLength(
      PLUGIN_WORKSPACE_TERMINAL_LIMIT
    )
    expect(delegate.listTerminals).toHaveBeenCalledTimes(1)
  })
})

describe('terminal.sendText', () => {
  it('returns the runtime send acceptance', async () => {
    const { delegate, services } = createTerminalHarness(['terminal:local:one'])

    const outcome = await sendTerminalText(services, 'terminal:local:one')

    expect(outcome).toEqual({ ok: true, value: { accepted: true } })
    expect(delegate.sendTerminal).toHaveBeenCalledTimes(1)
  })
})

describe('editor.openFile', () => {
  const openFile = (
    params: unknown,
    options: {
      surface?: 'worker' | 'panel' | 'editor'
      granted?: 'editor:open'[]
      services?: PluginHostServices
    } = {}
  ) => {
    const audit = { record: vi.fn().mockResolvedValue(undefined) }
    const services = options.services ?? createServices(vi.fn())
    return {
      audit,
      services,
      outcome: executePluginHostCall({
        pluginId: 'samples.demo',
        method: 'editor.openFile',
        params,
        surface: options.surface ?? 'worker',
        grantedCapabilities: options.granted ?? ['editor:open'],
        services,
        audit
      })
    }
  }

  it('opens the file with its position and audits the file name only', async () => {
    const { outcome, services, audit } = openFile({
      path: '/Users/private/notes/graph.json',
      line: 4,
      column: 2
    })

    await expect(outcome).resolves.toEqual({
      ok: true,
      value: { opened: true }
    })
    expect(services.openEditorFile).toHaveBeenCalledWith('/Users/private/notes/graph.json', {
      line: 4,
      column: 2
    })
    const summaries = audit.record.mock.calls.map(([entry]) => entry.summary)
    expect(summaries).toEqual(['file=graph.json', 'file=graph.json'])
  })

  it('passes the placement on and rejects an unknown one', async () => {
    const { outcome, services } = openFile({
      path: '/a.md',
      placement: 'active-workspace'
    })

    await outcome
    expect(services.openEditorFile).toHaveBeenCalledWith('/a.md', undefined, 'active-workspace')
    await expect(openFile({ path: '/a.md', placement: 'floating' }).outcome).resolves.toMatchObject(
      { ok: false, code: 'invalid_params' }
    )
  })

  it('ignores a column given without a line', async () => {
    const { outcome, services } = openFile({
      path: String.raw`C:\notes\a.md`,
      column: 3
    })

    await outcome
    expect(services.openEditorFile).toHaveBeenCalledWith(String.raw`C:\notes\a.md`, undefined)
  })

  it('serves the panel and editor surfaces too', async () => {
    for (const surface of ['panel', 'editor'] as const) {
      await expect(openFile({ path: '/a.md' }, { surface }).outcome).resolves.toEqual({
        ok: true,
        value: { opened: true }
      })
    }
  })

  it('refuses a relative path and a missing capability', async () => {
    await expect(openFile({ path: 'notes/a.md' }).outcome).resolves.toMatchObject({
      ok: false,
      code: 'invalid_params'
    })
    await expect(
      openFile({ path: '/a.md' }, { granted: [] as never }).outcome
    ).resolves.toMatchObject({
      ok: false,
      code: 'capability_denied'
    })
  })

  it('reports a file the runtime cannot open as action_failed', async () => {
    const services = createServices(vi.fn())
    vi.mocked(services.openEditorFile).mockRejectedValue(new Error('file not found: a.md'))

    await expect(openFile({ path: '/gone/a.md' }, { services }).outcome).resolves.toEqual({
      ok: false,
      code: 'action_failed',
      error: 'file not found: a.md'
    })
  })

  it('binds the service to the runtime delegate', async () => {
    const { delegate, services } = createTerminalHarness([])

    await expect(openFile({ path: '/w/a.md', line: 1 }, { services }).outcome).resolves.toEqual({
      ok: true,
      value: { opened: true }
    })
    expect(delegate.openLocalAbsoluteFile).toHaveBeenCalledWith('/w/a.md', {
      line: 1
    })
  })

  it('opens in the active workspace when asked and refuses when none is active', async () => {
    const { delegate, services } = createTerminalHarness([])

    await expect(
      openFile({ path: '/w/a.md', placement: 'active-workspace' }, { services }).outcome
    ).resolves.toEqual({ ok: true, value: { opened: true } })
    expect(delegate.openLocalAbsoluteFile).toHaveBeenCalledWith('/w/a.md', undefined, {
      activeWorktreeId: 'worktree-1'
    })

    vi.mocked(delegate.resolveActiveWorktreeContext).mockResolvedValue(null)
    vi.mocked(delegate.openLocalAbsoluteFile).mockClear()
    await expect(
      openFile({ path: '/w/a.md', placement: 'active-workspace' }, { services }).outcome
    ).resolves.toEqual({
      ok: false,
      code: 'action_failed',
      error: 'no active workspace is available to open the file in'
    })
    expect(delegate.openLocalAbsoluteFile).not.toHaveBeenCalled()
  })

  it('keeps auto placement on the default route', async () => {
    const { delegate, services } = createTerminalHarness([])

    await openFile({ path: '/w/a.md', placement: 'auto' }, { services }).outcome
    expect(delegate.openLocalAbsoluteFile).toHaveBeenCalledWith('/w/a.md', undefined)
    expect(delegate.resolveActiveWorktreeContext).not.toHaveBeenCalled()
  })
})

describe('sidebarNav.getValues', () => {
  const getValues = (
    surface: 'worker' | 'panel' | 'editor',
    granted: 'settings:own'[] = ['settings:own'],
    params: unknown = {}
  ) => {
    const services = createServices(vi.fn())
    vi.mocked(services.sidebarNavValues).mockReturnValue({
      'show-details': true,
      verbose: false
    })
    return {
      services,
      outcome: executePluginHostCall({
        pluginId: 'samples.demo',
        method: 'sidebarNav.getValues',
        params,
        surface,
        grantedCapabilities: granted,
        services
      })
    }
  }

  it('returns the plugin own values on every surface, scoped to its key', async () => {
    for (const surface of ['worker', 'panel', 'editor'] as const) {
      const { outcome, services } = getValues(surface)
      await expect(outcome).resolves.toEqual({
        ok: true,
        value: { values: { 'show-details': true, verbose: false } }
      })
      expect(services.sidebarNavValues).toHaveBeenCalledWith('samples.demo')
    }
  })

  it('needs settings:own and takes no params', async () => {
    await expect(getValues('worker', []).outcome).resolves.toMatchObject({
      ok: false,
      code: 'capability_denied'
    })
    await expect(
      getValues('worker', ['settings:own'], { plugin: 'other' }).outcome
    ).resolves.toMatchObject({ ok: false, code: 'invalid_params' })
  })
})

describe('sidebarCards.setItems', () => {
  const setItems = (
    params: unknown,
    options: {
      surface?: 'worker' | 'panel'
      granted?: never[]
      result?: unknown
    } = {}
  ) => {
    const services = createServices(vi.fn())
    if (options.result) {
      vi.mocked(services.setSidebarCardItems).mockReturnValue(
        options.result as ReturnType<PluginHostServices['setSidebarCardItems']>
      )
    }
    const audit = { record: vi.fn().mockResolvedValue(undefined) }
    return {
      services,
      audit,
      outcome: executePluginHostCall({
        pluginId: 'samples.demo',
        method: 'sidebarCards.setItems',
        params,
        surface: options.surface ?? 'worker',
        grantedCapabilities: options.granted ?? [],
        services,
        audit
      })
    }
  }

  it('needs no capability and is not audited as a mutation', async () => {
    const { outcome, services, audit } = setItems({
      cardId: 'issues',
      items: [
        {
          id: 'a',
          title: 'First',
          action: { kind: 'command', command: 'open' }
        }
      ]
    })
    await expect(outcome).resolves.toEqual({ ok: true, value: { ok: true } })
    expect(services.setSidebarCardItems).toHaveBeenCalledWith('samples.demo', 'issues', [
      {
        id: 'a',
        title: 'First',
        action: { kind: 'command', command: 'open' }
      }
    ])
    expect(audit.record).not.toHaveBeenCalled()
  })

  it('answers invalid_params for a card the plugin did not declare', async () => {
    const { outcome } = setItems(
      { cardId: 'other', items: [] },
      {
        result: {
          ok: false,
          error: 'other is not a declared sidebar card',
          invalid: true
        }
      }
    )
    await expect(outcome).resolves.toMatchObject({
      ok: false,
      code: 'invalid_params'
    })
  })

  it('refuses frames, duplicate row ids, unknown fields and more than 500 rows', async () => {
    await expect(
      setItems({ cardId: 'issues', items: [] }, { surface: 'panel' }).outcome
    ).resolves.toMatchObject({
      ok: false,
      code: 'not_permitted'
    })
    const bad: unknown[] = [
      {
        cardId: 'issues',
        items: [
          { id: 'a', title: 'A' },
          { id: 'a', title: 'B' }
        ]
      },
      { cardId: 'issues', items: [{ id: 'a', title: 'A', color: 'red' }] },
      {
        cardId: 'issues',
        items: [
          {
            id: 'a',
            title: 'A',
            action: { kind: 'openFile', path: 'relative.txt' }
          }
        ]
      },
      { cardId: 'issues', items: [{ id: 'a', title: 'x'.repeat(161) }] },
      {
        cardId: 'issues',
        items: Array.from({ length: 501 }, (_, index) => ({
          id: `row-${index}`,
          title: 'Row'
        }))
      }
    ]
    for (const params of bad) {
      await expect(setItems(params).outcome).resolves.toMatchObject({
        ok: false,
        code: 'invalid_params'
      })
    }
    const full = Array.from({ length: 500 }, (_, index) => ({
      id: `row-${index}`,
      title: 'Row'
    }))
    await expect(setItems({ cardId: 'issues', items: full }).outcome).resolves.toMatchObject({
      ok: true
    })
  })
})

describe('projectItems.setDetail', () => {
  const setDetail = (
    surface: 'worker' | 'panel' | 'editor',
    params: unknown,
    granted: 'settings:own'[] = ['settings:own'],
    result: ReturnType<PluginHostServices['projectItems']['setDetail']> = { ok: true }
  ) => {
    const services = createServices(vi.fn())
    vi.mocked(services.projectItems.setDetail).mockReturnValue(result)
    return {
      services,
      outcome: executePluginHostCall({
        pluginId: 'samples.demo',
        method: 'projectItems.setDetail',
        params,
        surface,
        grantedCapabilities: granted,
        services
      })
    }
  }
  const valid = { itemId: 'board', projectId: 'repo-1', text: '3/7' }

  it('hands the detail to the service under the calling plugin key', async () => {
    const { outcome, services } = setDetail('worker', valid)
    await expect(outcome).resolves.toEqual({ ok: true, value: { ok: true } })
    expect(services.projectItems.setDetail).toHaveBeenCalledWith('samples.demo', valid)
  })

  it('is worker-only and needs settings:own', async () => {
    for (const surface of ['panel', 'editor'] as const) {
      await expect(setDetail(surface, valid).outcome).resolves.toMatchObject({ ok: false })
    }
    await expect(setDetail('worker', valid, []).outcome).resolves.toMatchObject({
      ok: false,
      code: 'capability_denied'
    })
  })

  it('refuses text over 16 characters but accepts an empty string to clear', async () => {
    await expect(
      setDetail('worker', { ...valid, text: 'x'.repeat(17) }).outcome
    ).resolves.toMatchObject({ ok: false, code: 'invalid_params' })
    await expect(setDetail('worker', { ...valid, text: '' }).outcome).resolves.toMatchObject({
      ok: true
    })
  })

  it('reports an item the plugin does not declare as invalid params', async () => {
    const { outcome } = setDetail('worker', valid, ['settings:own'], {
      ok: false,
      error: 'board is not a project item of this plugin',
      invalid: true
    })
    await expect(outcome).resolves.toMatchObject({ ok: false, code: 'invalid_params' })
  })
})

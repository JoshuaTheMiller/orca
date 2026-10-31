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
    dispatchPluginNotification: vi.fn().mockResolvedValue({ delivered: true }),
    openEditorFile: vi.fn().mockResolvedValue({ opened: true }),
    sidebarNavValues: vi.fn().mockReturnValue({}),
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
    openLocalAbsoluteFile: vi.fn().mockResolvedValue({ worktree: 'worktree-1' })
  }
  return {
    delegate,
    services: bindPluginHostServices({
      delegate,
      pluginsDataDir: join(tmpdir(), 'plugin-host-methods-test'),
      sidebarNavValues: () => ({})
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

    await expect(outcome).resolves.toEqual({ ok: true, value: { opened: true } })
    expect(services.openEditorFile).toHaveBeenCalledWith('/Users/private/notes/graph.json', {
      line: 4,
      column: 2
    })
    const summaries = audit.record.mock.calls.map(([entry]) => entry.summary)
    expect(summaries).toEqual(['file=graph.json', 'file=graph.json'])
  })

  it('ignores a column given without a line', async () => {
    const { outcome, services } = openFile({ path: String.raw`C:\notes\a.md`, column: 3 })

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
    expect(delegate.openLocalAbsoluteFile).toHaveBeenCalledWith('/w/a.md', { line: 1 })
  })
})

describe('sidebarNav.getValues', () => {
  const getValues = (
    surface: 'worker' | 'panel' | 'editor',
    granted: 'settings:own'[] = ['settings:own'],
    params: unknown = {}
  ) => {
    const services = createServices(vi.fn())
    vi.mocked(services.sidebarNavValues).mockReturnValue({ 'show-details': true, verbose: false })
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

import { describe, expect, it, vi } from 'vitest'
import { pluginHostMethodsFor } from '../../../shared/plugins/workers/plugin-host-api'
import { PLUGIN_SURFACES } from '../../../shared/plugins/frames/plugin-protocol'
import { executePluginHostCall, type PluginHostServices } from './plugin-host-methods'

function servicesWith(openPluginPage: PluginHostServices['openPluginPage']): PluginHostServices {
  return {
    resolveActiveWorktreeContext: vi.fn().mockResolvedValue(null),
    listWorktreeTerminals: vi.fn().mockResolvedValue([]),
    sendTerminalText: vi.fn().mockResolvedValue({ accepted: true }),
    dispatchPluginNotification: vi.fn().mockResolvedValue({ delivered: true }),
    openAgentSession: vi.fn().mockResolvedValue('not_found'),
    openEditorFile: vi.fn().mockResolvedValue({ opened: true }),
    sidebarNavValues: vi.fn().mockReturnValue({}),
    openLink: vi.fn().mockResolvedValue({ opened: true }),
    setSidebarCardItems: vi.fn().mockReturnValue({ ok: true }),
    projectItems: { setDetail: vi.fn().mockReturnValue({ ok: true }) },
    openPluginPage,
    storage: { get: vi.fn(), set: vi.fn(), delete: vi.fn(), keys: vi.fn().mockReturnValue([]) },
    secrets: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
    settings: { getAll: vi.fn().mockReturnValue({}), set: vi.fn() }
  }
}

function open(
  surface: (typeof PLUGIN_SURFACES)[number],
  params: unknown,
  openPluginPage = vi.fn().mockResolvedValue(undefined),
  grantedCapabilities: readonly never[] | null = []
) {
  return {
    openPluginPage,
    outcome: executePluginHostCall({
      pluginId: 'samples.demo',
      method: 'pages.open',
      params,
      surface,
      grantedCapabilities,
      services: servicesWith(openPluginPage)
    })
  }
}

describe('page surface', () => {
  it('may call the read-only and safe methods a panel may', () => {
    const forPanel = pluginHostMethodsFor('panel')
    expect(pluginHostMethodsFor('page')).toEqual(forPanel)
    expect(pluginHostMethodsFor('page')).toEqual([
      'workspace.readContext',
      'pages.open',
      'notifications.show'
    ])
  })

  it('cannot reach worker-only methods', async () => {
    const outcome = await executePluginHostCall({
      pluginId: 'samples.demo',
      method: 'terminal.sendText',
      params: { terminalId: 't', text: 'ls' },
      surface: 'page',
      grantedCapabilities: ['terminal:send'],
      services: servicesWith(vi.fn())
    })
    expect(outcome).toMatchObject({ ok: false, code: 'not_permitted' })
  })
})

describe('pages.open', () => {
  it.each(PLUGIN_SURFACES)('is offered to the %s surface', async (surface) => {
    const { outcome, openPluginPage } = open(surface, { pageId: 'notes' })
    await expect(outcome).resolves.toEqual({ ok: true, value: { opened: true } })
    expect(openPluginPage).toHaveBeenCalledWith({ pluginId: 'samples.demo', pageId: 'notes' })
  })

  it('passes an absolute path through and needs no capability', async () => {
    const { outcome, openPluginPage } = open('worker', {
      pageId: 'notes',
      path: '/home/me/notes.txt'
    })
    await expect(outcome).resolves.toMatchObject({ ok: true })
    expect(openPluginPage).toHaveBeenCalledWith({
      pluginId: 'samples.demo',
      pageId: 'notes',
      path: '/home/me/notes.txt'
    })
  })

  it.each(['C:\\Users\\me\\notes.txt', 'C:/Users/me/notes.txt', '\\\\server\\share\\notes.txt'])(
    'accepts the absolute Windows path %s',
    async (path) => {
      const { outcome } = open('page', { pageId: 'notes', path })
      await expect(outcome).resolves.toMatchObject({ ok: true })
    }
  )

  it.each(['notes.txt', './notes.txt', '../notes.txt', '~/notes.txt', '', 'a\u0000b'])(
    'refuses the path %j before opening anything',
    async (path) => {
      const { outcome, openPluginPage } = open('worker', { pageId: 'notes', path })
      await expect(outcome).resolves.toMatchObject({ ok: false, code: 'invalid_params' })
      expect(openPluginPage).not.toHaveBeenCalled()
    }
  )

  it('refuses unknown params and a missing page id', async () => {
    for (const params of [{}, { pageId: 'notes', title: 'x' }, { pageId: '' }]) {
      const { outcome, openPluginPage } = open('worker', params)
      await expect(outcome).resolves.toMatchObject({ ok: false, code: 'invalid_params' })
      expect(openPluginPage).not.toHaveBeenCalled()
    }
  })

  it('still requires the plugin to be enabled with current consent', async () => {
    const { outcome, openPluginPage } = open('worker', { pageId: 'notes' }, undefined, null)
    await expect(outcome).resolves.toMatchObject({ ok: false, code: 'consent_required' })
    expect(openPluginPage).not.toHaveBeenCalled()
  })

  it('reports a page that cannot be shown as a failed action', async () => {
    const { outcome } = open(
      'worker',
      { pageId: 'missing' },
      vi.fn().mockRejectedValue(new Error('plugin has no page "missing"'))
    )
    await expect(outcome).resolves.toEqual({
      ok: false,
      code: 'action_failed',
      error: 'plugin has no page "missing"'
    })
  })

  it('does not write to the audit log, since it changes no user data', async () => {
    const record = vi.fn()
    await executePluginHostCall({
      pluginId: 'samples.demo',
      method: 'pages.open',
      params: { pageId: 'notes' },
      surface: 'worker',
      grantedCapabilities: [],
      services: servicesWith(vi.fn().mockResolvedValue(undefined)),
      audit: { record }
    })
    expect(record).not.toHaveBeenCalled()
  })
})

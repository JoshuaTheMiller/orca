import { describe, expect, it, vi } from 'vitest'
import { PLUGIN_OPEN_LINK_CHANNEL } from '../../../shared/plugins/workers/plugin-host-links-schema'
import { createPluginLinkOpener } from '../plugin-open-link'
import { bindPluginHostServices, type PluginRuntimeDelegate } from './plugin-host-service-bindings'
import { executePluginHostCall, type PluginHostServices } from './plugin-host-methods'

function createHarness(openLink: (request: { url: string; external: boolean }) => boolean) {
  // SAFETY: links.open touches only the openLink binding; the runtime delegate is never called.
  // oxlint-disable-next-line typescript/consistent-type-assertions
  const delegate = {} as PluginRuntimeDelegate
  const services: PluginHostServices = bindPluginHostServices({
    delegate,
    pluginsDataDir: 'unused',
    sidebarNavValues: () => ({}),
    openLink
  })
  const audit = { record: vi.fn().mockResolvedValue(undefined) }
  const call = (
    params: unknown,
    options: { surface?: 'worker' | 'panel' | 'editor'; granted?: 'links:open'[] } = {}
  ) =>
    executePluginHostCall({
      pluginId: 'samples.demo',
      method: 'links.open',
      params,
      surface: options.surface ?? 'worker',
      grantedCapabilities: options.granted ?? ['links:open'],
      services,
      audit
    })
  return { call, audit }
}

describe('links.open', () => {
  it('hands an https link to the window as an internal open by default', async () => {
    const openLink = vi.fn().mockReturnValue(true)
    const { call } = createHarness(openLink)
    await expect(call({ url: 'https://example.com/a?b=1' })).resolves.toEqual({
      ok: true,
      value: { opened: true }
    })
    expect(openLink).toHaveBeenCalledWith({ url: 'https://example.com/a?b=1', external: false })
  })

  it('passes external through so the window forces the system browser', async () => {
    const openLink = vi.fn().mockReturnValue(true)
    const { call } = createHarness(openLink)
    await call({ url: 'http://localhost:3000', external: true })
    expect(openLink).toHaveBeenCalledWith({ url: 'http://localhost:3000', external: true })
  })

  it('reports opened false when no window can take the link', async () => {
    const { call } = createHarness(vi.fn().mockReturnValue(false))
    await expect(call({ url: 'https://example.com' })).resolves.toEqual({
      ok: true,
      value: { opened: false }
    })
  })

  it.each(['file:///etc/passwd', 'javascript:alert(1)', 'vscode://open', 'not a url', ''])(
    'refuses %j before reaching the window',
    async (url) => {
      const openLink = vi.fn().mockReturnValue(true)
      const { call, audit } = createHarness(openLink)
      await expect(call({ url })).resolves.toMatchObject({ ok: false, code: 'invalid_params' })
      expect(openLink).not.toHaveBeenCalled()
      expect(audit.record).not.toHaveBeenCalled()
    }
  )

  it('refuses unknown params', async () => {
    const { call } = createHarness(vi.fn().mockReturnValue(true))
    await expect(call({ url: 'https://example.com', focus: true })).resolves.toMatchObject({
      ok: false,
      code: 'invalid_params'
    })
  })

  it('needs the links:open capability and consent', async () => {
    const openLink = vi.fn().mockReturnValue(true)
    const { call } = createHarness(openLink)
    await expect(call({ url: 'https://example.com' }, { granted: [] })).resolves.toMatchObject({
      ok: false,
      code: 'capability_denied'
    })
    expect(openLink).not.toHaveBeenCalled()
  })

  it.each(['worker', 'panel', 'editor'] as const)(
    'is callable from the %s surface',
    async (surface) => {
      const { call } = createHarness(vi.fn().mockReturnValue(true))
      await expect(call({ url: 'https://example.com' }, { surface })).resolves.toMatchObject({
        ok: true
      })
    }
  )

  it('audits the host and flags, never the full URL', async () => {
    const { call, audit } = createHarness(vi.fn().mockReturnValue(true))
    await call({ url: 'https://example.com/private/path?token=secret', external: true })
    const summaries = audit.record.mock.calls.map(([entry]) => entry.summary)
    expect(summaries).toEqual(['host=example.com external=true', 'host=example.com external=true'])
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain('secret')
  })
})

describe('createPluginLinkOpener', () => {
  it('sends the request to the window on the plugin open-link channel', () => {
    const send = vi.fn()
    const open = createPluginLinkOpener(() => ({ isDestroyed: () => false, webContents: { send } }))
    expect(open({ url: 'https://example.com', external: true })).toBe(true)
    expect(send).toHaveBeenCalledWith(PLUGIN_OPEN_LINK_CHANNEL, {
      url: 'https://example.com',
      external: true
    })
  })

  it('returns false without a live window or when the send throws', () => {
    const request = { url: 'https://example.com', external: false }
    expect(createPluginLinkOpener(() => null)(request)).toBe(false)
    expect(
      createPluginLinkOpener(() => ({
        isDestroyed: () => true,
        webContents: { send: vi.fn() }
      }))(request)
    ).toBe(false)
    expect(
      createPluginLinkOpener(() => ({
        isDestroyed: () => false,
        webContents: {
          send: () => {
            throw new Error('gone')
          }
        }
      }))(request)
    ).toBe(false)
  })
})

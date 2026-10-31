import { describe, expect, it, vi } from 'vitest'
import {
  PLUGIN_HOST_API,
  PLUGIN_HOST_API_MINOR,
  pluginHostMethodsFor
} from '../../../shared/plugins/workers/plugin-host-api'
import type { PluginCapabilityKind } from '../../../shared/plugins/capabilities/plugin-capabilities'
import type { PluginSurface } from '../../../shared/plugins/frames/plugin-protocol'
import type { PluginAuditLog } from '../plugin-audit-log'
import { PluginHostError } from './plugin-host-error'
import { executePluginHostCall, type PluginHostServices } from './plugin-host-methods'

function call(
  params: unknown,
  options: {
    pickFolder?: PluginHostServices['pickFolder']
    surface?: PluginSurface
    granted?: readonly PluginCapabilityKind[] | null
    audit?: Pick<PluginAuditLog, 'record'>
  } = {}
) {
  // SAFETY: only pickFolder is read by this method.
  // oxlint-disable-next-line typescript/consistent-type-assertions
  const services = { pickFolder: options.pickFolder } as PluginHostServices
  return executePluginHostCall({
    pluginId: 'samples.demo',
    method: 'dialogs.pickFolder',
    params,
    surface: options.surface ?? 'worker',
    grantedCapabilities: options.granted === undefined ? ['dialogs:open'] : options.granted,
    services,
    audit: options.audit
  })
}

describe('dialogs.pickFolder host method', () => {
  it('bumps the host API minor and is offered on every surface', () => {
    expect(PLUGIN_HOST_API['dialogs.pickFolder'].since).toBe(7)
    expect(PLUGIN_HOST_API_MINOR).toBeGreaterThanOrEqual(7)
    for (const surface of ['worker', 'panel', 'editor'] as const) {
      expect(pluginHostMethodsFor(surface)).toContain('dialogs.pickFolder')
    }
  })

  it('returns the picker result and forwards the plugin id and params', async () => {
    const pickFolder = vi.fn().mockResolvedValue({ path: '/x' })
    const outcome = await call(
      { title: 'Pick', defaultPath: '/home/me', createIfMissing: true },
      { pickFolder, surface: 'panel' }
    )
    expect(outcome).toEqual({ ok: true, value: { path: '/x' } })
    expect(pickFolder).toHaveBeenCalledWith({
      pluginId: 'samples.demo',
      title: 'Pick',
      defaultPath: '/home/me',
      createIfMissing: true
    })
  })

  it('passes a cancelled picker through as a null path', async () => {
    const pickFolder = vi.fn().mockResolvedValue({ path: null })
    await expect(call({}, { pickFolder, surface: 'editor' })).resolves.toEqual({
      ok: true,
      value: { path: null }
    })
  })

  it.each([
    [{ title: '' }],
    [{ title: 'x'.repeat(121) }],
    [{ defaultPath: 'relative/dir' }],
    [{ createIfMissing: 'yes' }],
    [{ extra: true }]
  ])('rejects invalid params %j before showing anything', async (params) => {
    const pickFolder = vi.fn()
    await expect(call(params, { pickFolder })).resolves.toMatchObject({
      ok: false,
      code: 'invalid_params'
    })
    expect(pickFolder).not.toHaveBeenCalled()
  })

  it('accepts POSIX, drive and UNC absolute paths', async () => {
    const pickFolder = vi.fn().mockResolvedValue({ path: null })
    for (const defaultPath of ['/home/me', 'C:\\Users\\me', 'C:/Users/me', '\\\\host\\share']) {
      await expect(call({ defaultPath }, { pickFolder })).resolves.toMatchObject({ ok: true })
    }
  })

  it('is denied without the dialogs:open capability, or without consent', async () => {
    const pickFolder = vi.fn()
    await expect(call({}, { pickFolder, granted: ['notifications:show'] })).resolves.toMatchObject({
      code: 'capability_denied'
    })
    await expect(call({}, { pickFolder, granted: null })).resolves.toMatchObject({
      code: 'consent_required'
    })
    expect(pickFolder).not.toHaveBeenCalled()
  })

  it('surfaces a coded refusal from the picker under its own code', async () => {
    const pickFolder = vi.fn().mockRejectedValue(new PluginHostError('conflict', 'already open'))
    await expect(call({}, { pickFolder })).resolves.toMatchObject({ ok: false, code: 'conflict' })
  })

  it('is unavailable where no window can show a dialog', async () => {
    await expect(call({})).resolves.toMatchObject({ ok: false, code: 'unavailable' })
  })

  it('audits the title only, never the default path', async () => {
    const record = vi.fn<PluginAuditLog['record']>().mockResolvedValue(undefined)
    const pickFolder = vi.fn().mockResolvedValue({ path: '/chosen' })
    await call({ title: 'Pick', defaultPath: '/secret' }, { pickFolder, audit: { record } })
    expect(record).toHaveBeenCalledTimes(1)
    expect(record.mock.calls[0][0]).toMatchObject({
      method: 'dialogs.pickFolder',
      summary: 'title="Pick"',
      outcome: 'ok'
    })
  })

  it('still shows the picker when no audit log is available', async () => {
    const pickFolder = vi.fn().mockResolvedValue({ path: null })
    await expect(call({}, { pickFolder })).resolves.toMatchObject({ ok: true })
  })
})

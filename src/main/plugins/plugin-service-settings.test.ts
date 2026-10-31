import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fingerprintPluginConsent } from '../../shared/plugins/approval/plugin-consent-fingerprint'
import { pluginManifestSchema } from '../../shared/plugins/manifest/plugin-manifest'
import { devFolderConsentIdentity } from './plugin-discovery'
import { PluginService } from './plugin-service'
import type { PluginRuntimeDelegate } from './workers/plugin-host-service-bindings'
import type { PluginWorkerHandle } from './workers/plugin-host-process'
import type { PluginWorkerFactory } from './workers/plugin-worker-manager'

const roots: string[] = []
const services: PluginService[] = []
const pluginKey = 'samples.demo'

const manifest = pluginManifestSchema.parse({
  manifestVersion: 2,
  execution: 'trusted-worker',
  id: 'demo',
  publisher: 'samples',
  name: 'Demo',
  version: '1.0.0',
  engines: { orca: '>=1.4.249' },
  main: 'worker.js',
  contributes: {
    events: [{ on: 'settings.changed' }],
    settings: [
      { id: 'verbose', title: 'Verbose', type: 'boolean', default: false },
      { id: 'nickname', title: 'Nickname', type: 'string', default: 'orca', maxLength: 8 },
      {
        id: 'layout',
        title: 'Layout',
        type: 'enum',
        default: 'tree',
        options: [
          { value: 'tree', label: 'Tree' },
          { value: 'radial', label: 'Radial' }
        ]
      }
    ]
  },
  capabilities: [{ kind: 'settings:own' }]
})

type Surface = 'worker' | 'panel' | 'editor'

async function createService() {
  const root = await mkdtemp(join(tmpdir(), 'orca-plugin-settings-'))
  roots.push(root)
  await writeFile(join(root, 'orca-plugin.json'), JSON.stringify(manifest))
  await writeFile(join(root, 'worker.js'), 'export default async function () {}')
  const consent = fingerprintPluginConsent(manifest, await devFolderConsentIdentity(root))
  const deliverEvent = vi.fn()
  const onPluginSettingChanged = vi.fn()
  const handle: PluginWorkerHandle = {
    commands: [],
    invokeCommand: vi.fn(async () => null),
    deliverEvent,
    lastActivityAt: () => 0,
    inFlightCount: () => 0,
    dispose: vi.fn(async () => undefined),
    kill: vi.fn(),
    onExit: vi.fn()
  }
  const service = new PluginService({
    userDataPath: root,
    hostVersion: '1.4.249',
    isPluginSystemEnabled: () => true,
    getDisabledPlugins: () => [],
    getPluginConsents: () => ({ [pluginKey]: consent }),
    getDevPluginPaths: () => [root],
    onPluginSettingChanged,
    workerFactory: vi.fn<PluginWorkerFactory>(async () => handle)
  })
  // SAFETY: the host calls under test never reach the runtime delegate.
  // oxlint-disable-next-line typescript/consistent-type-assertions
  service.setRuntimeDelegate({} as PluginRuntimeDelegate)
  services.push(service)
  await service.initialize()
  const call = (method: string, params: unknown, surface: Surface = 'worker') =>
    service.executeHostCall(pluginKey, method, params, surface)
  return { service, call, deliverEvent, onPluginSettingChanged }
}

afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.dispose()))
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('PluginService declared settings', () => {
  it('answers settings.get with declared defaults on every surface', async () => {
    const { call } = await createService()

    for (const surface of ['worker', 'panel', 'editor'] as const) {
      await expect(call('settings.get', {}, surface)).resolves.toEqual({
        ok: true,
        value: { settings: { verbose: false, nickname: 'orca', layout: 'tree' } }
      })
    }
  })

  it('merges stored values and untyped keys over the defaults', async () => {
    const { call } = await createService()

    await call('settings.set', { key: 'verbose', value: true })
    await call('settings.set', { key: 'free-form', value: { any: ['json'] } })

    await expect(call('settings.get', {}, 'panel')).resolves.toEqual({
      ok: true,
      value: {
        settings: {
          verbose: true,
          nickname: 'orca',
          layout: 'tree',
          'free-form': { any: ['json'] }
        }
      }
    })
  })

  it('refuses a value that does not fit the declaration with invalid_params', async () => {
    const { call, onPluginSettingChanged } = await createService()

    for (const params of [
      { key: 'verbose', value: 'yes' },
      { key: 'nickname', value: 7 },
      { key: 'nickname', value: 'far too long' },
      { key: 'layout', value: 'spiral' },
      { key: 'layout', value: true }
    ]) {
      await expect(call('settings.set', params)).resolves.toMatchObject({
        ok: false,
        code: 'invalid_params'
      })
    }
    expect(onPluginSettingChanged).not.toHaveBeenCalled()
    await expect(call('settings.get', {})).resolves.toMatchObject({
      value: { settings: { verbose: false, nickname: 'orca', layout: 'tree' } }
    })
  })

  it('keeps settings.set worker-only', async () => {
    const { call } = await createService()

    await expect(
      call('settings.set', { key: 'verbose', value: true }, 'panel')
    ).resolves.toMatchObject({ ok: false, code: 'not_permitted' })
  })

  it('delivers settings.changed only to the owning plugin, once per effective change', async () => {
    const { call, service, deliverEvent, onPluginSettingChanged } = await createService()

    // Queued in order, so the owning plugin's event arriving alone shows the other was skipped.
    service.emitEvent('settings.changed', { key: 'verbose', value: true }, 'samples.other')
    await call('settings.set', { key: 'verbose', value: true })
    await vi.waitFor(() => expect(deliverEvent).toHaveBeenCalled(), { timeout: 10_000 })
    expect(deliverEvent).toHaveBeenCalledOnce()
    expect(deliverEvent).toHaveBeenCalledWith('settings.changed', { key: 'verbose', value: true })
    expect(onPluginSettingChanged).toHaveBeenCalledWith({
      pluginKey,
      key: 'verbose',
      value: true
    })

    // The same value again, and the default written while it already holds, are not changes.
    await call('settings.set', { key: 'verbose', value: true })
    await call('settings.set', { key: 'layout', value: 'tree' })
    expect(onPluginSettingChanged).toHaveBeenCalledOnce()
  })

  it('announces a change made from Settings, and a reset to the default', async () => {
    const { service, onPluginSettingChanged, deliverEvent } = await createService()

    expect(service.settings.set(pluginKey, 'layout', 'radial')).toEqual({ ok: true })
    expect(service.settings.set(pluginKey, 'layout', 'oblique')).toMatchObject({
      ok: false,
      invalid: true
    })
    expect(service.settings.reset(pluginKey, 'layout')).toEqual({ ok: true })
    expect(service.settings.reset(pluginKey, 'not-declared')).toMatchObject({ ok: false })

    expect(onPluginSettingChanged.mock.calls.map(([change]) => change)).toEqual([
      { pluginKey, key: 'layout', value: 'radial' },
      { pluginKey, key: 'layout', value: 'tree' }
    ])
    await vi.waitFor(() => expect(deliverEvent).toHaveBeenCalledTimes(2), { timeout: 10_000 })
    expect(deliverEvent).toHaveBeenLastCalledWith('settings.changed', {
      key: 'layout',
      value: 'tree'
    })
  })

  it('announces a change to an undeclared key written by the plugin', async () => {
    const { call, onPluginSettingChanged } = await createService()

    await call('settings.set', { key: 'cursor', value: 3 })

    expect(onPluginSettingChanged).toHaveBeenCalledWith({ pluginKey, key: 'cursor', value: 3 })
  })
})

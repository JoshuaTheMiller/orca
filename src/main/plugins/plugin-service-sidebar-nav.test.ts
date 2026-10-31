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
  engines: { orca: '>=1.4.247' },
  main: 'worker.js',
  contributes: {
    events: [{ on: 'sidebarNav.valueChanged' }],
    sidebarNavItems: [
      { id: 'details', title: 'Details', kind: 'toggle', setting: 'show-details' },
      {
        id: 'labels',
        title: 'Labels',
        kind: 'checkbox',
        setting: 'show-labels',
        default: true,
        parent: 'details'
      }
    ]
  },
  capabilities: [{ kind: 'settings:own' }]
})

async function createService(stored: Record<string, boolean>) {
  const root = await mkdtemp(join(tmpdir(), 'orca-plugin-nav-'))
  roots.push(root)
  await writeFile(join(root, 'orca-plugin.json'), JSON.stringify(manifest))
  await writeFile(join(root, 'worker.js'), 'export default async function () {}')
  const consent = fingerprintPluginConsent(manifest, await devFolderConsentIdentity(root))
  const deliverEvent = vi.fn()
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
    hostVersion: '1.4.247',
    isPluginSystemEnabled: () => true,
    getDisabledPlugins: () => [],
    getPluginConsents: () => ({ [pluginKey]: consent }),
    getDevPluginPaths: () => [root],
    getSidebarNavValues: () => stored,
    workerFactory: vi.fn<PluginWorkerFactory>(async () => handle)
  })
  // SAFETY: the host call under test never reaches the runtime delegate.
  // oxlint-disable-next-line typescript/consistent-type-assertions
  service.setRuntimeDelegate({} as PluginRuntimeDelegate)
  services.push(service)
  await service.initialize()
  return { service, deliverEvent }
}

afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.dispose()))
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('PluginService sidebar nav values', () => {
  it('answers sidebarNav.getValues with stored values over defaults, on every surface', async () => {
    const { service } = await createService({
      'samples.demo/show-details': true,
      'samples.other/show-labels': false
    })

    for (const surface of ['worker', 'panel', 'editor'] as const) {
      await expect(
        service.executeHostCall(pluginKey, 'sidebarNav.getValues', {}, surface)
      ).resolves.toEqual({
        ok: true,
        value: { values: { 'show-details': true, 'show-labels': true } }
      })
    }
  })

  it('delivers sidebarNav.valueChanged only to the plugin the value belongs to', async () => {
    const { service, deliverEvent } = await createService({})
    const payload = { setting: 'show-details', value: true }

    // Both are queued in order, so the one for this plugin arriving alone proves the other was skipped.
    service.emitEvent(
      'sidebarNav.valueChanged',
      { setting: 'show-details', value: false },
      'samples.other'
    )
    service.emitEvent('sidebarNav.valueChanged', payload, pluginKey)
    await vi.waitFor(() => expect(deliverEvent).toHaveBeenCalled())
    expect(deliverEvent).toHaveBeenCalledOnce()
    expect(deliverEvent).toHaveBeenCalledWith('sidebarNav.valueChanged', payload)
  })
})

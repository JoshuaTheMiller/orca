import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { pluginManifestSchema } from '../../shared/plugins/manifest/plugin-manifest'
import type { PluginCapabilityKind } from '../../shared/plugins/capabilities/plugin-capabilities'
import { deliverPluginEvent } from './plugin-event-delivery'
import type { ValidDiscoveredPlugin } from './plugin-discovery'
import type { PluginWorkerController } from './workers/plugin-worker-controller'

function plugin(id: string, events: string[]): ValidDiscoveredPlugin {
  return {
    pluginKey: `samples.${id}`,
    rootDir: join(tmpdir(), 'plugins', `samples.${id}`),
    manifest: pluginManifestSchema.parse({
      manifestVersion: 2,
      execution: 'trusted-worker',
      id,
      publisher: 'samples',
      name: id,
      version: '1.0.0',
      engines: { orca: '>=1.4.247' },
      main: 'main.mjs',
      contributes: { events: events.map((on) => ({ on })) },
      capabilities: [{ kind: 'settings:own' }, { kind: 'workspace:read' }]
    }),
    consentFingerprint: 'sha256-current',
    contentHash: null,
    isDev: true
  }
}

function deliver(options: {
  plugins: ValidDiscoveredPlugin[]
  granted?: PluginCapabilityKind[] | null
  payload?: unknown
}) {
  const deliverEvent = vi.fn().mockResolvedValue(undefined)
  const ensure = vi.fn().mockResolvedValue({ deliverEvent })
  deliverPluginEvent({
    event: 'sidebarNav.valueChanged',
    payload: options.payload ?? { setting: 'show-details', value: true },
    plugins: options.plugins,
    // SAFETY: delivery only calls `ensure` on the controller.
    // oxlint-disable-next-line typescript/consistent-type-assertions
    workerController: { ensure } as unknown as PluginWorkerController,
    isRuntimeApproved: () => true,
    grantedCapabilities: () => (options.granted === undefined ? ['settings:own'] : options.granted),
    logWarning: () => () => undefined
  })
  return { ensure, deliverEvent }
}

describe('deliverPluginEvent sidebarNav.valueChanged', () => {
  it('can be declared and reaches a subscribed plugin that holds settings:own', async () => {
    const { ensure, deliverEvent } = deliver({
      plugins: [plugin('graph', ['sidebarNav.valueChanged'])]
    })
    await vi.waitFor(() => expect(deliverEvent).toHaveBeenCalledOnce())
    expect(ensure).toHaveBeenCalledOnce()
    expect(deliverEvent).toHaveBeenCalledWith('sidebarNav.valueChanged', {
      setting: 'show-details',
      value: true
    })
  })

  it('skips plugins that did not subscribe or lack the capability', () => {
    expect(
      deliver({ plugins: [plugin('quiet', ['workspace.created'])] }).ensure
    ).not.toHaveBeenCalled()
    expect(
      deliver({ plugins: [plugin('graph', ['sidebarNav.valueChanged'])], granted: ['agent:read'] })
        .ensure
    ).not.toHaveBeenCalled()
    expect(
      deliver({ plugins: [plugin('graph', ['sidebarNav.valueChanged'])], granted: null }).ensure
    ).not.toHaveBeenCalled()
  })

  it('drops a payload that fails its schema', () => {
    const { ensure } = deliver({
      plugins: [plugin('graph', ['sidebarNav.valueChanged'])],
      payload: { setting: 'show-details', value: 'yes' }
    })
    expect(ensure).not.toHaveBeenCalled()
  })
})

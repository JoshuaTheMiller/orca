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
const issues = { pluginKey, cardId: 'issues' }

function manifestWith(contributes: Record<string, unknown>, capabilities: { kind: string }[]) {
  return pluginManifestSchema.parse({
    manifestVersion: 2,
    execution: 'trusted-worker',
    id: 'demo',
    publisher: 'samples',
    name: 'Demo',
    version: '1.0.0',
    engines: { orca: '>=1.4.250' },
    main: 'worker.js',
    contributes: {
      settings: [{ id: 'show', title: 'Show', type: 'boolean', default: true }],
      sidebarCards: [{ id: 'issues', title: 'Issues', when: 'show' }],
      ...contributes
    },
    capabilities
  })
}

async function createService(
  contributes: Record<string, unknown> = {},
  options: {
    disabled?: () => string[]
    capabilities?: { kind: string }[]
  } = {}
) {
  const manifest = manifestWith(contributes, options.capabilities ?? [{ kind: 'editor:open' }])
  const root = await mkdtemp(join(tmpdir(), 'orca-plugin-cards-'))
  roots.push(root)
  await writeFile(join(root, 'orca-plugin.json'), JSON.stringify(manifest))
  await writeFile(join(root, 'worker.js'), 'export default async function () {}')
  const consent = fingerprintPluginConsent(manifest, await devFolderConsentIdentity(root))
  const deliverEvent = vi.fn()
  const dispose = vi.fn(async () => undefined)
  const handle: PluginWorkerHandle = {
    commands: [],
    invokeCommand: vi.fn(async () => null),
    deliverEvent,
    // Why 0: it is always long idle by the faked clock, so only the card's keepalive saves it.
    lastActivityAt: () => 0,
    inFlightCount: () => 0,
    dispose,
    kill: vi.fn(),
    onExit: vi.fn()
  }
  const workerFactory = vi.fn<PluginWorkerFactory>(async () => handle)
  const itemsChanged = vi.fn()
  const openLocalAbsoluteFile = vi.fn(async () => ({}))
  const service = new PluginService({
    userDataPath: root,
    hostVersion: '1.4.250',
    isPluginSystemEnabled: () => true,
    getDisabledPlugins: options.disabled ?? (() => []),
    getPluginConsents: () => ({ [pluginKey]: consent }),
    getDevPluginPaths: () => [root],
    idleReapMs: 1000,
    onSidebarCardItemsChanged: itemsChanged,
    workerFactory
  })
  // SAFETY: only openLocalAbsoluteFile is reached by the host calls under test.
  // oxlint-disable-next-line typescript/consistent-type-assertions
  service.setRuntimeDelegate({
    openLocalAbsoluteFile
  } as unknown as PluginRuntimeDelegate)
  services.push(service)
  await service.initialize()
  await service.whenReady()
  return {
    service,
    deliverEvent,
    dispose,
    workerFactory,
    itemsChanged,
    openLocalAbsoluteFile
  }
}

afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(services.splice(0).map((service) => service.dispose()))
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('PluginService sidebar cards', () => {
  it('starts the worker and sends visibilityChanged when the first window shows a card', async () => {
    const { service, deliverEvent, workerFactory } = await createService({
      events: [{ on: 'sidebarCards.visibilityChanged' }]
    })
    expect(workerFactory).not.toHaveBeenCalled()

    service.sidebarCards.setWindowCard(1, issues)
    service.sidebarCards.setWindowCard(2, issues)
    await vi.waitFor(() => expect(deliverEvent).toHaveBeenCalled())
    expect(workerFactory).toHaveBeenCalledOnce()
    expect(deliverEvent).toHaveBeenCalledOnce()
    expect(deliverEvent).toHaveBeenCalledWith('sidebarCards.visibilityChanged', {
      cardId: 'issues',
      visible: true
    })

    service.sidebarCards.setWindowCard(1, null)
    expect(deliverEvent).toHaveBeenCalledOnce()
    service.sidebarCards.setWindowCard(2, null)
    await vi.waitFor(() => expect(deliverEvent).toHaveBeenCalledTimes(2))
    expect(deliverEvent).toHaveBeenLastCalledWith('sidebarCards.visibilityChanged', {
      cardId: 'issues',
      visible: false
    })
  })

  it('still starts the worker of a card whose plugin did not subscribe to the event', async () => {
    const { service, deliverEvent, workerFactory } = await createService()
    service.sidebarCards.setWindowCard(1, issues)
    await vi.waitFor(() => expect(workerFactory).toHaveBeenCalledOnce())
    expect(deliverEvent).not.toHaveBeenCalled()
  })

  it('holds off idle reaping while a card is shown, and reaps once it is closed', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    const { service, dispose, workerFactory } = await createService()
    service.sidebarCards.setWindowCard(1, issues)
    await vi.waitFor(() => expect(workerFactory).toHaveBeenCalledOnce())

    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(dispose).not.toHaveBeenCalled()

    service.sidebarCards.setWindowCard(1, null)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('stores rows from sidebarCards.setItems per card and keeps them across a worker restart', async () => {
    const { service, itemsChanged } = await createService()
    const rows = [{ id: 'a', title: 'First', badges: [{ label: 'new', tone: 'info' }] }]

    await expect(
      service.executeHostCall(
        pluginKey,
        'sidebarCards.setItems',
        { cardId: 'issues', items: rows },
        'worker'
      )
    ).resolves.toEqual({ ok: true, value: { ok: true } })
    expect(itemsChanged).toHaveBeenCalledWith({ pluginKey, cardId: 'issues' })

    await service.deactivatePlugin(pluginKey)
    expect(service.sidebarCards.getItems(pluginKey, 'issues')).toEqual(rows)
  })

  it('refuses setItems for a card the plugin did not declare and from a panel', async () => {
    const { service } = await createService()
    await expect(
      service.executeHostCall(
        pluginKey,
        'sidebarCards.setItems',
        { cardId: 'other', items: [] },
        'worker'
      )
    ).resolves.toMatchObject({ ok: false, code: 'invalid_params' })
    await expect(
      service.executeHostCall(
        pluginKey,
        'sidebarCards.setItems',
        { cardId: 'issues', items: [] },
        'panel'
      )
    ).resolves.toMatchObject({ ok: false, code: 'not_permitted' })
  })

  it('drops rows and viewers when the plugin is disabled', async () => {
    let disabled: string[] = []
    const { service } = await createService({}, { disabled: () => disabled })
    service.sidebarCards.setItems(pluginKey, 'issues', [{ id: 'a', title: 'A' }])
    service.sidebarCards.setWindowCard(1, issues)

    disabled = [pluginKey]
    await service.reconcileActivationState()

    expect(service.sidebarCards.getItems(pluginKey, 'issues')).toEqual([])
    expect(service.sidebarCards.isShown(pluginKey)).toBe(false)
  })

  it('opens a file for a row through editor.openFile, so the capability gate applies', async () => {
    const { service, openLocalAbsoluteFile } = await createService()
    await expect(
      service.executeHostCall(pluginKey, 'editor.openFile', { path: '/tmp/notes.md' }, 'worker')
    ).resolves.toMatchObject({ ok: true })
    expect(openLocalAbsoluteFile).toHaveBeenCalledWith('/tmp/notes.md', undefined)
  })

  it('refuses to open a file for a plugin without the editor:open capability', async () => {
    const { service, openLocalAbsoluteFile } = await createService({}, { capabilities: [] })
    await expect(
      service.executeHostCall(pluginKey, 'editor.openFile', { path: '/tmp/notes.md' }, 'worker')
    ).resolves.toMatchObject({ ok: false, code: 'capability_denied' })
    expect(openLocalAbsoluteFile).not.toHaveBeenCalled()
  })
})

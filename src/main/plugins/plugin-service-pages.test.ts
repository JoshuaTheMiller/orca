import { mkdtemp, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fingerprintPluginConsent } from '../../shared/plugins/approval/plugin-consent-fingerprint'
import { pluginManifestSchema } from '../../shared/plugins/manifest/plugin-manifest'
import { hashPluginTree } from './plugin-content-hash'
import { listPluginsForClients } from './plugin-client-list'
import { PluginService } from './plugin-service'
import type { PluginRuntimeDelegate } from './workers/plugin-host-service-bindings'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

const delegate: PluginRuntimeDelegate = {
  resolveActiveWorktreeContext: vi.fn().mockResolvedValue(null),
  listTerminals: vi.fn().mockResolvedValue({ terminals: [] }),
  sendTerminal: vi.fn().mockResolvedValue({ accepted: true }),
  dispatchPluginNotification: vi.fn().mockResolvedValue({ delivered: true })
}

async function createService(options: { consented?: boolean } = {}) {
  const userDataPath = await mkdtemp(join(tmpdir(), 'orca-plugin-service-pages-'))
  roots.push(userDataPath)
  const pluginKey = 'samples.demo'
  const pluginDir = join(userDataPath, 'plugins', pluginKey)
  const stagingDir = join(pluginDir, 'staging')
  await mkdir(stagingDir, { recursive: true })
  const manifest = pluginManifestSchema.parse({
    manifestVersion: 2,
    execution: 'sandboxed-ui',
    id: 'demo',
    publisher: 'samples',
    name: 'Demo',
    version: '1.0.0',
    engines: { orca: '>=1.4.254' },
    pluginApi: 1,
    contributes: {
      pages: [
        { id: 'notes', title: 'Notes', icon: 'file-text', entry: 'page.html' },
        { id: 'log', title: 'Log', entry: 'page.html' }
      ]
    },
    capabilities: []
  })
  await writeFile(join(stagingDir, 'orca-plugin.json'), JSON.stringify(manifest))
  await writeFile(join(stagingDir, 'page.html'), '<h1>Page</h1>')
  const content = await hashPluginTree(stagingDir)
  if (!content.ok) {
    throw new Error(content.error)
  }
  await rename(stagingDir, join(pluginDir, content.hash))
  await writeFile(join(pluginDir, 'current'), content.hash)
  const fingerprint = fingerprintPluginConsent(manifest, content.hash)
  const consents: Record<string, string> = {}
  if (options.consented !== false) {
    consents[pluginKey] = fingerprint
  }
  const service = new PluginService({
    userDataPath,
    hostVersion: '1.4.254',
    isPluginSystemEnabled: () => true,
    getDisabledPlugins: () => [],
    getPluginConsents: () => consents,
    getDevPluginPaths: () => []
  })
  service.setRuntimeDelegate(delegate)
  await service.initialize()
  return { service, pluginKey }
}

describe('PluginService pages', () => {
  it('projects each declared page with the view that shows it', async () => {
    const { service, pluginKey } = await createService()
    const [entry] = await listPluginsForClients(service)
    expect(entry?.pages).toEqual([
      {
        id: 'notes',
        title: 'Notes',
        icon: 'file-text',
        viewKey: `plugin:${pluginKey}/notes`
      },
      { id: 'log', title: 'Log', viewKey: `plugin:${pluginKey}/log` }
    ])
  })

  it('asks the focused window to open a declared page, with a normalized path', async () => {
    const { service, pluginKey } = await createService()
    const opener = vi.fn().mockReturnValue(true)
    service.panels.pages.setOpener(opener)
    const path = resolve(tmpdir(), 'notes', '..', 'today.txt')

    await expect(
      service.executeHostCall(pluginKey, 'pages.open', { pageId: 'notes', path }, 'worker')
    ).resolves.toEqual({ ok: true, value: { opened: true } })
    expect(opener).toHaveBeenCalledWith({ pluginKey, pageId: 'notes', path })

    // A repeat call is the same request: the window focuses the page it already shows.
    await service.executeHostCall(pluginKey, 'pages.open', { pageId: 'notes' }, 'page')
    expect(opener).toHaveBeenLastCalledWith({ pluginKey, pageId: 'notes' })
    expect(opener).toHaveBeenCalledTimes(2)
  })

  it('routes the same call from every surface to the plugin that made it', async () => {
    const { service, pluginKey } = await createService()
    const opener = vi.fn().mockReturnValue(true)
    service.panels.pages.setOpener(opener)
    for (const surface of ['worker', 'panel', 'editor', 'page'] as const) {
      await expect(
        service.executeHostCall(pluginKey, 'pages.open', { pageId: 'log' }, surface)
      ).resolves.toMatchObject({ ok: true })
    }
    expect(opener).toHaveBeenCalledTimes(4)
    expect(opener.mock.calls.every(([request]) => request.pluginKey === pluginKey)).toBe(true)
  })

  it('refuses a page the plugin does not declare', async () => {
    const { service, pluginKey } = await createService()
    const opener = vi.fn().mockReturnValue(true)
    service.panels.pages.setOpener(opener)
    await expect(
      service.executeHostCall(pluginKey, 'pages.open', { pageId: 'other' }, 'worker')
    ).resolves.toMatchObject({ ok: false, code: 'action_failed' })
    expect(opener).not.toHaveBeenCalled()
  })

  it('fails when no window can show the page, as in a headless run', async () => {
    const { service, pluginKey } = await createService()
    await expect(
      service.executeHostCall(pluginKey, 'pages.open', { pageId: 'notes' }, 'worker')
    ).resolves.toMatchObject({ ok: false, code: 'action_failed' })
    service.panels.pages.setOpener(() => false)
    await expect(
      service.executeHostCall(pluginKey, 'pages.open', { pageId: 'notes' }, 'worker')
    ).resolves.toMatchObject({ ok: false, code: 'action_failed' })
  })

  it('does not run for a plugin without current consent', async () => {
    const { service, pluginKey } = await createService({ consented: false })
    const opener = vi.fn().mockReturnValue(true)
    service.panels.pages.setOpener(opener)
    await expect(
      service.executeHostCall(pluginKey, 'pages.open', { pageId: 'notes' }, 'worker')
    ).resolves.toMatchObject({ ok: false, code: 'consent_required' })
    expect(opener).not.toHaveBeenCalled()
  })

  it('refuses a relative path before any window is asked', async () => {
    const { service, pluginKey } = await createService()
    const opener = vi.fn().mockReturnValue(true)
    service.panels.pages.setOpener(opener)
    expect(isAbsolute('notes.txt')).toBe(false)
    await expect(
      service.executeHostCall(
        pluginKey,
        'pages.open',
        { pageId: 'notes', path: 'notes.txt' },
        'worker'
      )
    ).resolves.toMatchObject({ ok: false, code: 'invalid_params' })
    expect(opener).not.toHaveBeenCalled()
  })

  it('stops every page watch when the service shuts down', async () => {
    const { service } = await createService()
    const dispose = vi.spyOn(service.panels.pages.documents, 'dispose')
    await service.dispose()
    expect(dispose).toHaveBeenCalled()
  })
})

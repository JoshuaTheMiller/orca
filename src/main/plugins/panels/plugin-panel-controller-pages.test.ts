import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pluginManifestSchema } from '../../../shared/plugins/manifest/plugin-manifest'
import type { ValidDiscoveredPlugin } from '../plugin-discovery'
import { PluginPanelController } from './plugin-panel-controller'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function createPlugin(): Promise<ValidDiscoveredPlugin> {
  const rootDir = await mkdtemp(join(tmpdir(), 'orca-plugin-page-controller-'))
  roots.push(rootDir)
  await writeFile(join(rootDir, 'page.html'), '<h1>Page</h1>')
  await writeFile(join(rootDir, 'panel.html'), '<h1>Panel</h1>')
  return {
    pluginKey: 'samples.demo',
    rootDir,
    manifest: pluginManifestSchema.parse({
      manifestVersion: 2,
      execution: 'sandboxed-ui',
      id: 'demo',
      publisher: 'samples',
      name: 'Demo',
      version: '1.0.0',
      engines: { orca: '>=1.4.254' },
      pluginApi: 1,
      contributes: {
        panels: [{ id: 'dashboard', title: 'Dashboard', entry: 'panel.html' }],
        pages: [{ id: 'notes', title: 'Notes', entry: 'page.html' }]
      },
      capabilities: [{ kind: 'notifications:show' }]
    }),
    consentFingerprint: 'sha256-consented',
    contentHash: null,
    isDev: true
  }
}

function controllerFor(plugin: ValidDiscoveredPlugin) {
  const executeHostCall = vi.fn().mockResolvedValue({ ok: true, value: { opened: true } })
  const controller = new PluginPanelController({
    resolveApprovedPlugin: (pluginKey) => (pluginKey === plugin.pluginKey ? plugin : null),
    contentVerifier: { verify: vi.fn().mockResolvedValue(undefined) },
    executeHostCall,
    log: () => vi.fn()
  })
  return { controller, executeHostCall }
}

describe('PluginPanelController pages', () => {
  it('serves a page entry in the page shell and binds its calls to the page surface', async () => {
    const plugin = await createPlugin()
    const { controller, executeHostCall } = controllerFor(plugin)
    const entry = await controller.openPage('renderer:1', plugin.pluginKey, 'notes')
    expect(entry?.html).toContain('<h1>Page</h1>')
    expect(entry?.html).toContain('"surface":"page"')
    expect(entry?.html).toContain('Content-Security-Policy')

    await expect(
      controller.execute('renderer:1', {
        sessionToken: entry!.sessionToken,
        action: 'pages.open',
        params: { pageId: 'notes' }
      })
    ).resolves.toMatchObject({ ok: true })
    expect(executeHostCall).toHaveBeenCalledWith(
      plugin.pluginKey,
      'pages.open',
      { pageId: 'notes' },
      'page'
    )
  })

  it('does not serve a panel as a page or a page as a panel', async () => {
    const plugin = await createPlugin()
    const { controller } = controllerFor(plugin)
    await expect(controller.openPage('renderer:1', plugin.pluginKey, 'dashboard')).resolves.toBe(
      null
    )
    await expect(controller.open('renderer:1', plugin.pluginKey, 'notes')).resolves.toBe(null)
    await expect(controller.openPage('renderer:1', 'samples.other', 'notes')).resolves.toBe(null)
  })

  it('refuses a page session once the plugin no longer declares the page', async () => {
    const plugin = await createPlugin()
    let current: ValidDiscoveredPlugin | null = plugin
    const executeHostCall = vi.fn()
    const controller = new PluginPanelController({
      resolveApprovedPlugin: () => current,
      contentVerifier: { verify: vi.fn().mockResolvedValue(undefined) },
      executeHostCall,
      log: () => vi.fn()
    })
    const entry = await controller.openPage('renderer:1', plugin.pluginKey, 'notes')
    current = null
    await expect(
      controller.execute('renderer:1', {
        sessionToken: entry!.sessionToken,
        action: 'pages.open',
        params: { pageId: 'notes' }
      })
    ).resolves.toMatchObject({ ok: false, code: 'unavailable' })
    expect(executeHostCall).not.toHaveBeenCalled()
  })
})

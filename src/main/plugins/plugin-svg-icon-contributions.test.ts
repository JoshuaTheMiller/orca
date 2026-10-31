import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parsePluginManifest } from '../../shared/plugins/manifest/plugin-manifest'
import type { PluginManifest } from '../../shared/plugins/manifest/plugin-manifest'
import { PLUGIN_IMAGE_ICONS_SINCE } from '../../shared/plugins/manifest/plugin-schema-field-docs'
import { validatePluginInstallContent } from './plugin-artifact-validation'
import { readDeclaredPluginSvgIcon } from './plugin-svg-icon-artifacts'

const roots: string[] = []
const GOOD =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24z"/></svg>'
const SLOTS = ['nav-0', 'project-0', 'page-0', 'card-0']

async function plugin(): Promise<{ root: string; manifest: PluginManifest }> {
  const root = await mkdtemp(join(tmpdir(), 'orca-plugin-svg-'))
  roots.push(root)
  await mkdir(join(root, 'images'), { recursive: true })
  await writeFile(join(root, 'images', 'star.svg'), GOOD)
  await writeFile(join(root, 'page.html'), '<html></html>')
  await writeFile(join(root, 'main.mjs'), '')
  const parsed = parsePluginManifest({
    manifestVersion: 2,
    execution: 'trusted-worker',
    id: 'demo',
    publisher: 'acme',
    name: 'Demo',
    version: '1.0.0',
    engines: { orca: `>=${PLUGIN_IMAGE_ICONS_SINCE}` },
    main: 'main.mjs',
    capabilities: [],
    contributes: {
      commands: [{ id: 'go', title: 'Go' }],
      sidebarNavItems: [{ id: 'n', title: 'N', icon: 'images/star.svg', command: 'go' }],
      projectItems: [{ id: 'p', title: 'P', icon: 'images/star.svg', command: 'go' }],
      pages: [{ id: 'g', title: 'G', icon: 'images/star.svg', entry: 'page.html' }],
      sidebarCards: [{ id: 'c', title: 'C', icon: 'images/star.svg' }]
    }
  })
  if (!parsed.ok) {
    throw new Error(parsed.error)
  }
  return { root, manifest: parsed.manifest }
}

const find = (root: string, manifest: PluginManifest) => ({
  findValidPlugin: (pluginKey: string) =>
    pluginKey === 'acme.demo'
      ? {
          pluginKey,
          rootDir: root,
          manifest,
          consentFingerprint: 'x',
          contentHash: 'b'.repeat(64),
          isDev: false
        }
      : null
})

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('SVG icons on nav items, project items, pages and cards', () => {
  it('validates at install and refuses a missing or unsafe file', async () => {
    const { root, manifest } = await plugin()
    expect(await validatePluginInstallContent(root, manifest)).toEqual({ ok: true })
    await writeFile(join(root, 'images', 'star.svg'), GOOD.replace('<path', '<script/><path'))
    const unsafe = await validatePluginInstallContent(root, manifest)
    expect(unsafe.ok === false && unsafe.error).toContain('<script>')
    await rm(join(root, 'images', 'star.svg'))
    expect(await validatePluginInstallContent(root, manifest)).toMatchObject({ ok: false })
  })

  it('reads each declared slot and refuses undeclared ones', async () => {
    const { root, manifest } = await plugin()
    const service = find(root, manifest)
    for (const slot of SLOTS) {
      expect(await readDeclaredPluginSvgIcon(service, 'acme.demo', slot), slot).toBe(GOOD)
    }
    for (const slot of ['nav-1', 'project-1', 'page-1', 'card-1', 'nav', 'page.entry']) {
      expect(await readDeclaredPluginSvgIcon(service, 'acme.demo', slot), slot).toBeNull()
    }
  })

  it('does not declare a slot for a built-in icon name', async () => {
    const { root, manifest } = await plugin()
    const builtIn = {
      ...manifest,
      contributes: {
        ...manifest.contributes,
        sidebarNavItems: [{ id: 'n', title: 'N', icon: 'star' as const, command: 'go' }]
      }
    }
    expect(await readDeclaredPluginSvgIcon(find(root, builtIn), 'acme.demo', 'nav-0')).toBeNull()
  })
})

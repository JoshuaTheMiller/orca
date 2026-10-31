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

async function pluginWith(
  icon: string | Buffer
): Promise<{ root: string; manifest: PluginManifest }> {
  const root = await mkdtemp(join(tmpdir(), 'orca-plugin-svg-'))
  roots.push(root)
  await mkdir(join(root, 'images'), { recursive: true })
  await writeFile(join(root, 'images', 'star.svg'), icon)
  await writeFile(join(root, 'panel.html'), '<html></html>')
  const parsed = parsePluginManifest({
    manifestVersion: 2,
    execution: 'sandboxed-ui',
    id: 'demo',
    publisher: 'acme',
    name: 'Demo',
    version: '1.0.0',
    engines: { orca: `>=${PLUGIN_IMAGE_ICONS_SINCE}` },
    contributes: {
      panels: [{ id: 'p', title: 'P', icon: 'images/star.svg', entry: 'panel.html' }]
    }
  })
  if (!parsed.ok) {
    throw new Error(parsed.error)
  }
  return { root, manifest: parsed.manifest }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('SVG panel icon install validation', () => {
  it('accepts a safe icon', async () => {
    const { root, manifest } = await pluginWith(GOOD)
    expect(await validatePluginInstallContent(root, manifest)).toEqual({ ok: true })
  })

  it.each([
    ['a script', GOOD.replace('<path', '<script>x</script><path'), '<script>'],
    ['a handler', GOOD.replace('<path', '<path onclick="x()"'), 'event-handler'],
    ['foreignObject', GOOD.replace('<path d="M0 0h24v24z"/>', '<foreignObject/>'), 'foreignobject'],
    [
      'an external reference',
      GOOD.replace('<path', '<image href="https://x.test/a.png"/><path'),
      'something other'
    ],
    ['javascript:', GOOD.replace('<path', '<a href="javascript:x"/><path'), 'javascript:'],
    ['bad markup', '<svg><g></svg>', 'well-formed']
  ])('refuses %s with a clear error', async (_name, icon, reason) => {
    const { root, manifest } = await pluginWith(icon)
    const result = await validatePluginInstallContent(root, manifest)
    expect(result).toMatchObject({ ok: false })
    expect(result.ok === false && result.error).toContain('images/star.svg')
    expect(result.ok === false && result.error).toContain(reason)
  })

  it('refuses an icon over 32 KB', async () => {
    const { root, manifest } = await pluginWith(
      Buffer.from(`${GOOD}<!--${'a'.repeat(33 * 1024)}-->`)
    )
    expect(await validatePluginInstallContent(root, manifest)).toMatchObject({ ok: false })
  })

  it('refuses a missing icon', async () => {
    const { root, manifest } = await pluginWith(GOOD)
    await rm(join(root, 'images', 'star.svg'))
    expect(await validatePluginInstallContent(root, manifest)).toMatchObject({ ok: false })
  })
})

describe('reading a declared SVG icon', () => {
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

  it('returns the validated text for a declared slot', async () => {
    const { root, manifest } = await pluginWith(GOOD)
    expect(await readDeclaredPluginSvgIcon(find(root, manifest), 'acme.demo', 'panel-0')).toBe(GOOD)
  })

  it('returns null for an unknown plugin and for undeclared slots', async () => {
    const { root, manifest } = await pluginWith(GOOD)
    const service = find(root, manifest)
    expect(await readDeclaredPluginSvgIcon(service, 'acme.other', 'panel-0')).toBeNull()
    for (const slot of ['panel-1', 'panel-', 'editor-0', 'icon', '../images/star.svg']) {
      expect(await readDeclaredPluginSvgIcon(service, 'acme.demo', slot), slot).toBeNull()
    }
  })

  it('does not serve a file that is declared but is not an SVG icon', async () => {
    const { root, manifest } = await pluginWith(GOOD)
    await writeFile(join(root, 'secret.txt'), 'secret')
    expect(
      await readDeclaredPluginSvgIcon(find(root, manifest), 'acme.demo', 'panel.entry')
    ).toBeNull()
  })

  it('re-validates on every read', async () => {
    const { root, manifest } = await pluginWith(GOOD)
    const service = find(root, manifest)
    expect(await readDeclaredPluginSvgIcon(service, 'acme.demo', 'panel-0')).toBe(GOOD)
    await writeFile(join(root, 'images', 'star.svg'), GOOD.replace('<path', '<script/><path'))
    expect(await readDeclaredPluginSvgIcon(service, 'acme.demo', 'panel-0')).toBeNull()
    await writeFile(join(root, 'images', 'star.svg'), `${GOOD}<!--${'a'.repeat(33 * 1024)}-->`)
    expect(await readDeclaredPluginSvgIcon(service, 'acme.demo', 'panel-0')).toBeNull()
    await rm(join(root, 'images', 'star.svg'))
    expect(await readDeclaredPluginSvgIcon(service, 'acme.demo', 'panel-0')).toBeNull()
  })
})

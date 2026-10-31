import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parsePluginManifest } from '../../shared/plugins/manifest/plugin-manifest'
import type { PluginManifest } from '../../shared/plugins/manifest/plugin-manifest'
import { PLUGIN_IMAGE_ICONS_SINCE } from '../../shared/plugins/manifest/plugin-schema-field-docs'
import { pluginInstalledImageUrl } from '../../shared/plugins/images/plugin-image-url'
import { PluginImageCache } from './plugin-image-cache'
import { validatePluginInstallContent } from './plugin-artifact-validation'

vi.mock('electron', () => ({ protocol: { handle: vi.fn() } }))
const { createPluginImageRequestHandler } = await import('./plugin-image-protocol')

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

describe('SVG panel icon serving', () => {
  it('serves the icon as SVG by slot, and re-checks it on every read', async () => {
    const { root, manifest } = await pluginWith(GOOD)
    const hash = 'b'.repeat(64)
    const handler = createPluginImageRequestHandler({
      cache: new PluginImageCache(root),
      findValidPlugin: () => ({
        pluginKey: 'acme.demo',
        rootDir: root,
        manifest,
        consentFingerprint: 'x',
        contentHash: hash,
        isDev: false
      })
    })
    const url = pluginInstalledImageUrl('acme.demo', hash, 'panel-0')
    const ok = await handler(new Request(url))
    expect(ok.status).toBe(200)
    expect(ok.headers.get('content-type')).toBe('image/svg+xml')
    expect(ok.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await ok.text()).toBe(GOOD)
    const unknownSlot = await handler(
      new Request(pluginInstalledImageUrl('acme.demo', hash, 'panel-3'))
    )
    expect(unknownSlot.status).toBe(404)
    await writeFile(join(root, 'images', 'star.svg'), GOOD.replace('<path', '<script/><path'))
    expect((await handler(new Request(url))).status).toBe(404)
  })
})

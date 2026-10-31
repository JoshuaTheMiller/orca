import { describe, expect, it } from 'vitest'
import { parsePluginManifest } from '../manifest/plugin-manifest'
import {
  PLUGIN_IMAGE_ICONS_SINCE,
  PLUGIN_MANIFEST_V2_SINCE
} from '../manifest/plugin-schema-field-docs'
import {
  declaredPluginSvgIconPaths,
  isPluginSvgIconPath,
  pluginSvgIconSlotField,
  PLUGIN_SVG_ICON_MAX_BYTES,
  pluginSvgIconError
} from './plugin-svg-icon'

const bytes = (text: string) => new TextEncoder().encode(text)
const svg = (inner: string, attributes = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"${attributes}>${inner}</svg>`
const GOOD = svg('<path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z"/>')

function manifest(icon: string, orca: string) {
  return {
    manifestVersion: 2,
    execution: 'sandboxed-ui',
    id: 'demo',
    publisher: 'acme',
    name: 'Demo',
    version: '1.0.0',
    engines: { orca: `>=${orca}` },
    contributes: { panels: [{ id: 'p', title: 'P', icon, entry: 'panel.html' }] }
  }
}

describe('panel icon schema', () => {
  it('accepts a built-in name or an .svg path, and refuses anything else', () => {
    expect(parsePluginManifest(manifest('star', PLUGIN_MANIFEST_V2_SINCE))).toMatchObject({
      ok: true
    })
    expect(
      parsePluginManifest(manifest('images/star.svg', PLUGIN_IMAGE_ICONS_SINCE))
    ).toMatchObject({ ok: true })
    for (const icon of ['images/star.png', '../star.svg', 'a/../../star.svg', 'CON.svg', 'nope']) {
      expect(parsePluginManifest(manifest(icon, PLUGIN_IMAGE_ICONS_SINCE)), icon).toMatchObject({
        ok: false
      })
    }
  })

  it('needs engines.orca at the SVG icon release only when an SVG path is used', () => {
    expect(parsePluginManifest(manifest('images/star.svg', PLUGIN_MANIFEST_V2_SINCE))).toEqual({
      ok: false,
      error: `engines.orca: must be at least >=${PLUGIN_IMAGE_ICONS_SINCE}, because contributes.panels[0].icon needs Orca ${PLUGIN_IMAGE_ICONS_SINCE}`
    })
  })

  it('recognizes SVG paths', () => {
    expect(isPluginSvgIconPath('images/star.svg')).toBe(true)
    expect(isPluginSvgIconPath('star')).toBe(false)
    expect(isPluginSvgIconPath(undefined)).toBe(false)
  })
})

describe('declaredPluginSvgIconPaths', () => {
  it('names each SVG icon by contribution kind and index, skipping built-in names', () => {
    const parsed = parsePluginManifest({
      ...manifest('star', PLUGIN_IMAGE_ICONS_SINCE),
      contributes: {
        panels: [
          { id: 'a', title: 'A', icon: 'star', entry: 'a.html' },
          { id: 'b', title: 'B', icon: 'images/b.svg', entry: 'b.html' },
          { id: 'c', title: 'C', entry: 'c.html' }
        ]
      }
    })
    expect(parsed.ok && declaredPluginSvgIconPaths(parsed.manifest)).toEqual([
      { path: 'images/b.svg', slot: 'panel-1' }
    ])
    expect(pluginSvgIconSlotField('panel', 1, 'images/b.svg')).toEqual({ svgIconSlot: 'panel-1' })
    expect(pluginSvgIconSlotField('panel', 1, 'star')).toEqual({})
  })
})

describe('pluginSvgIconError', () => {
  it('accepts a plain icon, a prolog, comments and fragment references', () => {
    expect(pluginSvgIconError(bytes(GOOD))).toBeNull()
    expect(pluginSvgIconError(bytes(`<?xml version="1.0"?>\n<!-- star -->\n${GOOD}\n`))).toBeNull()
    expect(
      pluginSvgIconError(
        bytes(
          svg(
            '<defs><path id="a" d="M0 0h1"/></defs><use href="#a"/><use xlink:href="#a"/><g style="fill:url(#a)"/>',
            ' xmlns:xlink="http://www.w3.org/1999/xlink"'
          )
        )
      )
    ).toBeNull()
  })

  it.each([
    ['a script element', svg('<script>alert(1)</script>'), '<script>'],
    ['a namespaced script', svg('<x:script/>'), '<script>'],
    ['foreignObject', svg('<foreignObject><div/></foreignObject>'), '<foreignobject>'],
    ['an event handler', svg('<path d="M0 0" onclick="x()"/>'), 'event-handler'],
    ['an onload handler on the root', svg('<path/>', ' onload="x()"'), 'event-handler'],
    ['an external href', svg('<image href="https://evil.test/a.png"/>'), 'something other'],
    ['an external xlink:href', svg('<use xlink:href="a.svg#b"/>'), 'something other'],
    ['javascript: in an href', svg('<a href="javascript:alert(1)"><path/></a>'), 'javascript:'],
    ['javascript: hidden by an entity', svg('<a title="java&#115;cript:x"/>'), 'javascript:'],
    ['javascript: split by whitespace', svg('<a title="java\tscript:x"/>'), 'javascript:'],
    [
      'an external css url',
      svg('<path style="fill:url(https://evil.test/x)"/>'),
      'something other'
    ],
    ['an external url() attribute', svg('<path fill="url(http://x.test/a)"/>'), 'something other'],
    ['a css import', svg('<style>@import "x.css";</style>'), '@import'],
    ['an animated href', svg('<a><set attributeName="href" to="javascript:x"/></a>'), 'href'],
    ['a DOCTYPE', `<!DOCTYPE svg [<!ENTITY a "b">]>${GOOD}`, 'DOCTYPE'],
    ['a different root', '<html><svg/></html>', 'root'],
    ['two roots', `${GOOD}${GOOD}`, 'single root'],
    ['an unclosed element', '<svg><g></svg>', 'well-formed'],
    ['text outside the root', `hello${GOOD}`, 'outside'],
    ['no markup', 'not svg', 'outside'],
    ['an unquoted attribute', '<svg width=24></svg>', 'well-formed']
  ])('refuses %s', (_name, text, reason) => {
    expect(pluginSvgIconError(bytes(text))).toContain(reason)
  })

  it('refuses a file over the size cap and bytes that are not UTF-8', () => {
    const padded = svg(`<!--${'a'.repeat(PLUGIN_SVG_ICON_MAX_BYTES)}-->`)
    expect(pluginSvgIconError(bytes(padded))).toContain('at most 32 KB')
    expect(pluginSvgIconError(new Uint8Array([0xff, 0xfe, 0x3c]))).toContain('UTF-8')
  })
})

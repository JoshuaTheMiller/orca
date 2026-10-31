import { describe, expect, it } from 'vitest'
import { parsePluginManifest } from '../manifest/plugin-manifest'
import { PLUGIN_IMAGE_ICONS_SINCE, PLUGIN_PAGES_SINCE } from '../manifest/plugin-schema-field-docs'
import { declaredPluginSvgIconPaths, pluginSvgIconSlotField } from './plugin-svg-icon'

const SVG = 'images/star.svg'

function manifest(orca: string, contributes: Record<string, unknown>) {
  return {
    manifestVersion: 2,
    execution: 'trusted-worker',
    id: 'demo',
    publisher: 'acme',
    name: 'Demo',
    version: '1.0.0',
    engines: { orca: `>=${orca}` },
    main: 'main.mjs',
    capabilities: [],
    contributes: {
      commands: [{ id: 'go', title: 'Go' }],
      settings: [{ id: 'on', title: 'On', type: 'boolean', default: true }],
      ...contributes
    }
  }
}

const CONTRIBUTIONS: Record<string, (icon: string | undefined) => Record<string, unknown>> = {
  sidebarNavItems: (icon) => ({ sidebarNavItems: [{ id: 'n', title: 'N', icon, command: 'go' }] }),
  projectItems: (icon) => ({ projectItems: [{ id: 'p', title: 'P', icon, command: 'go' }] }),
  pages: (icon) => ({ pages: [{ id: 'g', title: 'G', icon, entry: 'page.html' }] }),
  sidebarCards: (icon) => ({ sidebarCards: [{ id: 'c', title: 'C', icon }] })
}

describe.each(Object.keys(CONTRIBUTIONS))('%s icon', (point) => {
  const build = (icon: string | undefined, orca = PLUGIN_IMAGE_ICONS_SINCE) =>
    parsePluginManifest(manifest(orca, CONTRIBUTIONS[point]!(icon)))

  it('accepts a built-in name or an .svg path, and refuses anything else', () => {
    expect(build('star', PLUGIN_PAGES_SINCE)).toMatchObject({ ok: true })
    expect(build(SVG)).toMatchObject({ ok: true })
    for (const icon of ['images/star.png', '../star.svg', 'CON.svg', 'nope']) {
      expect(build(icon), icon).toMatchObject({ ok: false })
    }
  })

  it('needs engines.orca at the SVG icon release only for an SVG path', () => {
    const result = build(SVG, PLUGIN_PAGES_SINCE)
    expect(result).toMatchObject({ ok: false })
    expect(!result.ok && result.error).toContain(`contributes.${point}[0].icon needs Orca`)
  })

  it('declares the SVG under its own slot and skips built-in names', () => {
    const parsed = build(SVG)
    const slot = {
      sidebarNavItems: 'nav-0',
      projectItems: 'project-0',
      pages: 'page-0',
      sidebarCards: 'card-0'
    }[point]
    expect(parsed.ok && declaredPluginSvgIconPaths(parsed.manifest)).toEqual([{ path: SVG, slot }])
    const builtIn = build('star')
    expect(builtIn.ok && declaredPluginSvgIconPaths(builtIn.manifest)).toEqual([])
  })
})

describe('slot fields for the other contribution kinds', () => {
  it('names the kind and index, and is empty for a built-in name', () => {
    expect(pluginSvgIconSlotField('nav', 0, SVG)).toEqual({ svgIconSlot: 'nav-0' })
    expect(pluginSvgIconSlotField('project', 2, SVG)).toEqual({ svgIconSlot: 'project-2' })
    expect(pluginSvgIconSlotField('page', 1, SVG)).toEqual({ svgIconSlot: 'page-1' })
    expect(pluginSvgIconSlotField('card', 3, 'star')).toEqual({})
  })
})

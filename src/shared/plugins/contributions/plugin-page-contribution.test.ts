import { describe, expect, it } from 'vitest'
import { parsePluginManifest } from '../manifest/plugin-manifest'
import { PLUGIN_IMAGE_ICONS_SINCE, PLUGIN_PAGES_SINCE } from '../manifest/plugin-schema-field-docs'
import { PLUGIN_SCHEMA_NEWEST_SINCE } from '../installation/plugin-host-version'
import { pluginCatalogTypes } from '../catalog/plugin-catalog-types'
import { pluginContributionSummary } from './plugin-contribution-summary'
import { requiresPluginContentApproval } from '../approval/plugin-consent-fingerprint'
import { pluginUpdateAccessGrowth } from '../approval/plugin-update-access-growth'
import { PLUGIN_PAGE_LIMIT } from './plugin-page-contribution'

const report = { id: 'report', title: 'Report', icon: 'file-text', entry: 'page/index.html' }

function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    manifestVersion: 2,
    execution: 'sandboxed-ui',
    id: 'reports',
    publisher: 'stablyai',
    name: 'Reports',
    version: '1.0.0',
    engines: { orca: `>=${PLUGIN_PAGES_SINCE}` },
    contributes: { pages: [report] },
    ...overrides
  }
}

function parsed(overrides: Record<string, unknown> = {}) {
  const result = parsePluginManifest(manifest(overrides))
  if (!result.ok) {
    throw new Error(result.error)
  }
  return result.manifest
}

describe('contributes.pages', () => {
  it('accepts a sandboxed-ui page and defaults the other points', () => {
    const result = parsed()
    expect(result.contributes.pages).toEqual([report])
    expect(result.contributes.panels).toEqual([])
  })

  it('registers its release, which this build reads along with the newer SVG icons', () => {
    expect(PLUGIN_PAGES_SINCE).toBe('1.4.254')
    expect(PLUGIN_SCHEMA_NEWEST_SINCE).toBe(PLUGIN_IMAGE_ICONS_SINCE)
  })

  it('allows at most four pages', () => {
    const pages = (count: number) =>
      Array.from({ length: count }, (_, index) => ({ ...report, id: `page-${index}` }))
    expect(
      parsePluginManifest(manifest({ contributes: { pages: pages(PLUGIN_PAGE_LIMIT) } })).ok
    ).toBe(true)
    expect(
      parsePluginManifest(manifest({ contributes: { pages: pages(PLUGIN_PAGE_LIMIT + 1) } }))
    ).toMatchObject({ ok: false })
  })

  it('refuses duplicate ids, unknown icons, stray fields and escaping entries', () => {
    for (const pages of [
      [report, report],
      [{ ...report, icon: 'not-an-icon' }],
      [{ ...report, extra: true }],
      [{ ...report, entry: '../page.html' }],
      [{ ...report, title: '' }]
    ]) {
      expect(parsePluginManifest(manifest({ contributes: { pages } }))).toMatchObject({
        ok: false
      })
    }
  })

  it('needs sandboxed-ui, like a panel', () => {
    for (const execution of ['data', 'declarative']) {
      expect(parsePluginManifest(manifest({ execution }))).toMatchObject({ ok: false })
    }
    expect(parsePluginManifest(manifest({ execution: 'sandboxed-ui' })).ok).toBe(true)
  })

  it('needs an engines.orca that includes the release that reads pages', () => {
    expect(parsePluginManifest(manifest({ engines: { orca: '>=1.4.245' } }))).toMatchObject({
      ok: false
    })
  })

  it('is listed as a panel type in catalogs, named by its title in summaries', () => {
    const result = parsed()
    expect(pluginCatalogTypes(result)).toEqual(['panel'])
    expect(pluginContributionSummary(result)).toEqual([{ kind: 'pages', name: 'Report' }])
  })

  it('binds approval to the page bytes, since its code runs in Orca', () => {
    expect(requiresPluginContentApproval(parsed())).toBe(true)
  })

  it('counts a new page as more access, but not new code under the same id', () => {
    const installed = parsed()
    const sameId = parsed({ contributes: { pages: [{ ...report, entry: 'page/v2.html' }] } })
    const another = parsed({
      contributes: { pages: [report, { ...report, id: 'other' }] }
    })
    expect(pluginUpdateAccessGrowth(installed, sameId).contributions).toEqual([])
    expect(pluginUpdateAccessGrowth(installed, another).contributions).toEqual(['pages'])
  })
})

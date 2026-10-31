import type { PluginCatalogType } from '../../../../../shared/plugins/catalog/plugin-catalog-release'
import { PLUGIN_CONTRIBUTION_POINT_POLICY } from '../../../../../shared/plugins/contributions/plugin-contribution-points'
import type { PluginContribution } from './plugin-contributions'

/** Catalog types no named row (or command) covers, e.g. a disabled plugin's theme. */
export function uncoveredCatalogTypes(
  types: readonly PluginCatalogType[],
  rows: readonly PluginContribution[],
  hasCommands: boolean
): PluginCatalogType[] {
  const covered = new Set<PluginCatalogType>(
    rows.flatMap((row) => PLUGIN_CONTRIBUTION_POINT_POLICY[row.kind].catalogType ?? [])
  )
  if (hasCommands) {
    covered.add('instructions')
  }
  // Why: background code isn't something it adds; access covers it.
  return types.filter((type) => type !== 'worker' && !covered.has(type))
}

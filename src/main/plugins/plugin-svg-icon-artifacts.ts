import type { PluginManifest } from '../../shared/plugins/manifest/plugin-manifest'
import {
  declaredPluginSvgIconPaths,
  PLUGIN_SVG_ICON_MAX_BYTES,
  pluginSvgIconError
} from '../../shared/plugins/images/plugin-svg-icon'
import { readContainedPluginArtifactBytes } from './plugin-artifact-validation'
import type { ValidDiscoveredPlugin } from './plugin-discovery'

type ReadContainedBytes = (rootDir: string, path: string, maxBytes: number) => Promise<Buffer>

/** An SVG icon's text, refused unless it passes the safety rules; throws why not. */
export async function readPluginSvgIcon(
  rootDir: string,
  path: string,
  readContainedBytes: ReadContainedBytes = readContainedPluginArtifactBytes
): Promise<string> {
  const bytes = await readContainedBytes(rootDir, path, PLUGIN_SVG_ICON_MAX_BYTES)
  const error = pluginSvgIconError(bytes)
  if (error) {
    throw new Error(error)
  }
  return new TextDecoder().decode(bytes)
}

/** Install-time check of every declared SVG icon. */
export async function validatePluginSvgIconArtifacts(
  rootDir: string,
  manifest: PluginManifest,
  readContainedBytes: ReadContainedBytes
): Promise<{ ok: true } | { ok: false; error: string }> {
  for (const icon of declaredPluginSvgIconPaths(manifest)) {
    try {
      await readPluginSvgIcon(rootDir, icon.path, readContainedBytes)
    } catch (error) {
      return {
        ok: false,
        error: `SVG icon ${icon.path}: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }
  return { ok: true }
}

/** The validated text of the SVG icon a plugin's manifest declares under `slot`; null for an
 *  unknown plugin, an undeclared slot, or a file that fails the rules now. Why re-checked on
 *  every read: the file may have changed on disk since install. */
export async function readDeclaredPluginSvgIcon(
  service: { findValidPlugin: (pluginKey: string) => ValidDiscoveredPlugin | null },
  pluginKey: string,
  slot: string
): Promise<string | null> {
  const plugin = service.findValidPlugin(pluginKey)
  const icon = plugin
    ? declaredPluginSvgIconPaths(plugin.manifest).find((candidate) => candidate.slot === slot)
    : undefined
  if (!plugin || !icon) {
    return null
  }
  try {
    return await readPluginSvgIcon(plugin.rootDir, icon.path)
  } catch {
    return null
  }
}

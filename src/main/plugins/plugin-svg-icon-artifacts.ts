import type { PluginManifest } from '../../shared/plugins/manifest/plugin-manifest'
import {
  isPluginSvgIconPath,
  PLUGIN_SVG_ICON_MAX_BYTES,
  pluginSvgIconError
} from '../../shared/plugins/images/plugin-svg-icon'

type ReadContainedBytes = (rootDir: string, path: string, maxBytes: number) => Promise<Buffer>

/** The SVG icons a manifest declares, each with the image URL slot it is served under. */
export function declaredPluginSvgIcons(manifest: PluginManifest): { path: string; slot: string }[] {
  return manifest.contributes.panels.flatMap((panel, index) =>
    isPluginSvgIconPath(panel.icon) ? [{ path: panel.icon, slot: `panel-${index}` }] : []
  )
}

/** An SVG icon's bytes, refused unless they pass the safety rules; throws why not. */
export async function readPluginSvgIcon(
  rootDir: string,
  path: string,
  readContainedBytes: ReadContainedBytes
): Promise<Buffer> {
  const bytes = await readContainedBytes(rootDir, path, PLUGIN_SVG_ICON_MAX_BYTES)
  const error = pluginSvgIconError(bytes)
  if (error) {
    throw new Error(error)
  }
  return bytes
}

/** Install-time check of every declared SVG icon. */
export async function validatePluginSvgIconArtifacts(
  rootDir: string,
  manifest: PluginManifest,
  readContainedBytes: ReadContainedBytes
): Promise<{ ok: true } | { ok: false; error: string }> {
  for (const icon of declaredPluginSvgIcons(manifest)) {
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

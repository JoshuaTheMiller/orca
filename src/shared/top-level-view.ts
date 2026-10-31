import type { PluginPageTopLevelView, StaticTopLevelView, TopLevelView } from './ui-chrome-types'
import { isQualifiedPluginKey } from './plugins/frames/plugin-tab-key'
import { isPluginManifestId } from './plugins/installation/plugin-id-format'

// Exhaustive keys make new views update every persistence/IPC validator.
const STATIC_TOP_LEVEL_VIEW_LOOKUP: Record<StaticTopLevelView, true> = {
  terminal: true,
  settings: true,
  tasks: true,
  activity: true,
  automations: true,
  space: true,
  skills: true,
  artifacts: true,
  mobile: true
}

/** The built-in views: the only ones persisted and accepted over IPC. */
export function isStaticTopLevelView(value: unknown): value is StaticTopLevelView {
  // Reject inherited prototype keys from corrupt sidecars or they can blank the main surface.
  return typeof value === 'string' && Object.hasOwn(STATIC_TOP_LEVEL_VIEW_LOOKUP, value)
}

export function pluginPageViewKey(qualifiedKey: string, pageId: string): PluginPageTopLevelView {
  return `plugin:${qualifiedKey}/${pageId}`
}

/** Splits a plugin page view; null for anything that is not one. */
export function parsePluginPageView(value: unknown): { pluginKey: string; pageId: string } | null {
  if (typeof value !== 'string' || !value.startsWith('plugin:')) {
    return null
  }
  const [pluginKey, pageId, ...extra] = value.slice('plugin:'.length).split('/')
  return extra.length === 0 &&
    pluginKey &&
    pageId &&
    isQualifiedPluginKey(pluginKey) &&
    isPluginManifestId(pageId)
    ? { pluginKey, pageId }
    : null
}

export function isPluginPageView(value: unknown): value is PluginPageTopLevelView {
  return parsePluginPageView(value) !== null
}

export function isTopLevelView(value: unknown): value is TopLevelView {
  return isStaticTopLevelView(value) || isPluginPageView(value)
}

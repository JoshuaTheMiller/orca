import type { PluginCatalogType } from './catalog/plugin-catalog-types'
import type { PluginExecutionProfile } from './contributions/plugin-execution-profile'
import type { PluginHostImages } from './images/plugin-image-url'

/** One installed plugin as main projects it for every client (preload IPC and the `plugins.list`
 *  RPC). Optional fields are absent on older hosts, so paired clients must tolerate them. */

export type PluginHostPanel = {
  id: string
  title: string
  /** Lucide icon name declared in the plugin manifest. */
  icon?: string
  tabKey: `plugin:${string}`
}

/** pending awaits consent; idle defers worker startup; errored exhausted retries or failed startup. */
export type PluginHostStatus =
  | 'running'
  | 'restarting'
  | 'idle'
  | 'pending'
  | 'disabled'
  | 'errored'
  | 'invalid'

export type PluginHostCustomEditor = {
  id: string
  title: string
  extensions: string[]
  filenames: string[]
  priority: 'default' | 'option'
  /** Absent on hosts that predate byte editors: text. */
  contentKind?: 'text' | 'bytes'
  /** orca-plugin-image URL of the editor's tab icon; absent when it declares none. */
  icon?: string
}

export type PluginHostNewFile = {
  id: string
  title: string
  /** Suffix, with the dot, of the untitled file it creates. */
  extension: string
  /** orca-plugin-image URL; absent when it declares none. */
  icon?: string
}

export type PluginHostSidebarNavItem = {
  id: string
  title: string
  /** Lucide icon name from the closed panel icon set; absent means the default. */
  icon?: string
  /** `command` when absent: older hosts only sent command items. */
  kind?: 'command' | 'toggle' | 'checkbox'
  /** Id of one of the plugin's own commands; set on command items only. */
  command?: string
  /** Key of the boolean a toggle or checkbox holds; set on those kinds only. */
  setting?: string
  /** Initial value of a toggle or checkbox. */
  default?: boolean
  /** Id of the toggle this item shows under. */
  parent?: string
  /** Id of a boolean entry in `settings` that must be true for the item to show. */
  when?: string
}

export type PluginHostSidebarCard = {
  id: string
  title: string
  /** Lucide icon name from the closed panel icon set; absent means the default. */
  icon?: string
  emptyText?: string
  /** Id of a boolean entry in `settings` that must be true for the card to be offered. */
  when?: string
}

export type PluginHostProjectItem = {
  id: string
  title: string
  /** Lucide icon name from the closed panel icon set; absent means the default. */
  icon?: string
  /** Id of one of the plugin's own commands. */
  command: string
  /** Id of a string entry in `settings` whose value is the row's default title. */
  titleSetting?: string
  /** Id of a boolean entry in `settings` that must be true for the item to show. */
  when?: string
}

export type PluginHostSetting = {
  id: string
  title: string
  description?: string
  type: 'boolean' | 'string' | 'enum'
  default: boolean | string
  options?: { value: string; label: string }[]
  maxLength?: number
}

export type PluginHostListEntry = {
  pluginKey: string
  consentFingerprint: string | null
  name: string
  version: string
  publisher: string
  description?: string
  /** The verified execution profile from the installed manifest; absent for invalid entries and
   *  on hosts that predate it. Never infer it from the plugin's contents. */
  execution?: PluginExecutionProfile
  /** What the installed manifest contributes; absent on hosts that predate it. */
  types?: readonly PluginCatalogType[]
  /** Declared images (format 2 manifests), as orca-plugin-image URLs main serves. */
  images?: PluginHostImages
  /** SPDX license expression from the manifest. */
  license?: string
  homepage?: string
  repository?: string
  status: PluginHostStatus
  needsReconsent: boolean
  error?: string
  isDev: boolean
  official: boolean
  bundled: boolean
  capabilities: { kind: string; description: string }[]
  panels: PluginHostPanel[]
  /** Absent on hosts that predate custom editors. */
  customEditors?: PluginHostCustomEditor[]
  /** Absent on hosts that predate new-file templates. */
  newFiles?: PluginHostNewFile[]
  /** Absent on hosts that predate sidebar nav items. */
  sidebarNavItems?: PluginHostSidebarNavItem[]
  /** Absent on hosts that predate plugin settings. */
  settings?: PluginHostSetting[]
  /** Absent on hosts that predate sidebar cards. */
  sidebarCards?: PluginHostSidebarCard[]
  /** Absent on hosts that predate project items. */
  projectItems?: PluginHostProjectItem[]
  commands: {
    id: string
    title: string
    // Why `worktree`: hosts from before the rename to `workspace` still send it.
    context: 'global' | 'workspace' | 'worktree'
    handler: { type: 'built-in'; action: string } | { type: 'worker' }
    keybindings: { key: string; when: 'global' | 'workspace' | 'worktree' }[]
  }[]
  hasWorker: boolean
  vmRecipes?: {
    id: string
    name: string
    description?: string
    commands: {
      phase: 'create' | 'suspend' | 'resume' | 'destroy'
      command: string
    }[]
  }[]
  restarts: number
  blockedByKillList?: { reason: string; advisoryUrl?: string }
  source?: {
    kind: 'local-path' | 'git' | 'marketplace' | 'bundled'
    reference: string
    resolvedCommit: string | null
    contentHash: string
    /** `ref` is the catalog's ref, so a client can join to the exact catalog source. */
    marketplace?: { reference: string; ref?: string; resolvedCommit: string }
  }
}

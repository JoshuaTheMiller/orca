import { ipcRenderer } from 'electron'
import type { PluginFrameEntry } from '../../shared/plugins/frames/plugin-frame-bridge'
import type { PluginHostCallOutcome } from '../../shared/plugins/frames/plugin-protocol'
import type { PluginConsentRequest } from '../../shared/plugins/approval/plugin-consent-request'
import {
  PLUGIN_OPEN_LINK_CHANNEL,
  type PluginOpenLinkRequest
} from '../../shared/plugins/workers/plugin-host-links-schema'
import type {
  PluginPageDocumentResult,
  PluginPageDocumentUpdate,
  PluginPageOpenRequest
} from '../../shared/plugins/frames/plugin-page-document-bridge'
import type { PluginChangeEvent } from '../../shared/plugins/events/plugin-change-event'
import type {
  PluginAutoUpdateEvent,
  PluginHostInstallResult,
  PluginHostInstallSource,
  PluginHostListEntry,
  PluginHostLogLine,
  PluginProjectItemDetailChange,
  PluginSettingChangedEvent,
  PluginSidebarCardRef,
  PreloadApi
} from '../api-types'

export const pluginsApi = {
  list: (): Promise<PluginHostListEntry[]> => ipcRenderer.invoke('plugins:list'),
  listLanguagePacks: () => ipcRenderer.invoke('plugins:listLanguagePacks'),
  listThemes: () => ipcRenderer.invoke('plugins:listThemes'),
  listTerminalThemes: () => ipcRenderer.invoke('plugins:listTerminalThemes'),
  listIconThemes: () => ipcRenderer.invoke('plugins:listIconThemes'),
  loadIconTheme: (id) => ipcRenderer.invoke('plugins:loadIconTheme', id),
  listSyntaxes: () => ipcRenderer.invoke('plugins:listSyntaxes'),
  loadSyntax: (id) => ipcRenderer.invoke('plugins:loadSyntax', id),
  consent: (args: PluginConsentRequest): Promise<PluginHostListEntry[]> =>
    ipcRenderer.invoke('plugins:consent', args),
  setEnabled: (args: { pluginKey: string; enabled: boolean }): Promise<PluginHostListEntry[]> =>
    ipcRenderer.invoke('plugins:setEnabled', args),
  readPanelEntry: (args: {
    pluginKey: string
    panelId: string
  }): Promise<PluginFrameEntry | null> => ipcRenderer.invoke('plugins:readPanelEntry', args),
  readPageEntry: (args: { pluginKey: string; pageId: string }): Promise<PluginFrameEntry | null> =>
    ipcRenderer.invoke('plugins:readPageEntry', args),
  openPageDocument: (args): Promise<PluginPageDocumentResult> =>
    ipcRenderer.invoke('plugins:openPageDocument', args),
  closePageDocument: (args): Promise<void> => ipcRenderer.invoke('plugins:closePageDocument', args),
  onPageDocumentChanged: (callback): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, update: PluginPageDocumentUpdate): void =>
      callback(update)
    ipcRenderer.on('plugins:pageDocumentChanged', listener)
    return () => {
      ipcRenderer.removeListener('plugins:pageDocumentChanged', listener)
    }
  },
  onOpenPageRequested: (callback): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, request: PluginPageOpenRequest): void =>
      callback(request)
    ipcRenderer.on('plugins:openPageRequested', listener)
    return () => {
      ipcRenderer.removeListener('plugins:openPageRequested', listener)
    }
  },
  readCustomEditorEntry: (args: {
    pluginKey: string
    editorId: string
  }): Promise<PluginFrameEntry | null> => ipcRenderer.invoke('plugins:readCustomEditorEntry', args),
  readNewFileTemplate: (args: { pluginKey: string; newFileId: string }): Promise<string | null> =>
    ipcRenderer.invoke('plugins:readNewFileTemplate', args),
  invokeCommand: (args: { pluginKey: string; commandId: string; args?: unknown }) =>
    ipcRenderer.invoke('plugins:invokeCommand', args),
  panelAction: (args: {
    sessionToken: string
    action: string
    params?: unknown
  }): Promise<PluginHostCallOutcome> => ipcRenderer.invoke('plugins:panelAction', args),
  resolveGitSource: (args) => ipcRenderer.invoke('plugins:resolveGitSource', args),
  install: (source: PluginHostInstallSource): Promise<PluginHostInstallResult> =>
    ipcRenderer.invoke('plugins:install', source),
  listMarketplaces: () => ipcRenderer.invoke('plugins:listMarketplaces'),
  addMarketplace: (source) => ipcRenderer.invoke('plugins:addMarketplace', source),
  removeMarketplace: (args) => ipcRenderer.invoke('plugins:removeMarketplace', args),
  refreshMarketplaces: (args = {}) => ipcRenderer.invoke('plugins:refreshMarketplaces', args),
  listMarketplacePlugins: () => ipcRenderer.invoke('plugins:listMarketplacePlugins'),
  suggestForFileType: (fileType, purpose) =>
    ipcRenderer.invoke('plugins:suggestForFileType', fileType, purpose),
  previewMarketplacePlugin: (args) => ipcRenderer.invoke('plugins:previewMarketplacePlugin', args),
  installMarketplacePlugin: (preview) =>
    ipcRenderer.invoke('plugins:installMarketplacePlugin', preview),
  previewMarketplaceUpdate: (args) => ipcRenderer.invoke('plugins:previewMarketplaceUpdate', args),
  rollbackMarketplacePlugin: (args) =>
    ipcRenderer.invoke('plugins:rollbackMarketplacePlugin', args),
  getRollbackVersion: (args) => ipcRenderer.invoke('plugins:getRollbackVersion', args),
  getInstalledManifest: (args) => ipcRenderer.invoke('plugins:getInstalledManifest', args),
  remove: (args: { pluginKey: string }): Promise<PluginHostListEntry[]> =>
    ipcRenderer.invoke('plugins:remove', args),
  getLogs: (args: { pluginKey: string }): Promise<PluginHostLogLine[]> =>
    ipcRenderer.invoke('plugins:getLogs', args),
  refresh: (): Promise<PluginHostListEntry[]> => ipcRenderer.invoke('plugins:refresh'),
  onChanged: (callback): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, change: PluginChangeEvent): void =>
      callback(change)
    ipcRenderer.on('plugins:changed', listener)
    return () => {
      ipcRenderer.removeListener('plugins:changed', listener)
    }
  },
  onOpenLink: (callback): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, request: PluginOpenLinkRequest): void =>
      callback(request)
    ipcRenderer.on(PLUGIN_OPEN_LINK_CHANNEL, listener)
    return () => {
      ipcRenderer.removeListener(PLUGIN_OPEN_LINK_CHANNEL, listener)
    }
  },
  getSettings: (args) => ipcRenderer.invoke('plugins:getSettings', args),
  setSetting: (args) => ipcRenderer.invoke('plugins:setSetting', args),
  resetSetting: (args) => ipcRenderer.invoke('plugins:resetSetting', args),
  onSettingChanged: (callback): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, change: PluginSettingChangedEvent): void =>
      callback(change)
    ipcRenderer.on('plugins:settingChanged', listener)
    return () => {
      ipcRenderer.removeListener('plugins:settingChanged', listener)
    }
  },
  getSidebarCardItems: (args) => ipcRenderer.invoke('plugins:getSidebarCardItems', args),
  setSidebarCardShown: (card) => ipcRenderer.invoke('plugins:setSidebarCardShown', card),
  openSidebarCardFile: (args) => ipcRenderer.invoke('plugins:openSidebarCardFile', args),
  onSidebarCardItemsChanged: (callback): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, change: PluginSidebarCardRef): void =>
      callback(change)
    ipcRenderer.on('plugins:sidebarCardItemsChanged', listener)
    return () => {
      ipcRenderer.removeListener('plugins:sidebarCardItemsChanged', listener)
    }
  },
  getProjectItemDetails: () => ipcRenderer.invoke('plugins:getProjectItemDetails'),
  onProjectItemDetailChanged: (callback): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      change: PluginProjectItemDetailChange
    ): void => callback(change)
    ipcRenderer.on('plugins:projectItemDetailChanged', listener)
    return () => {
      ipcRenderer.removeListener('plugins:projectItemDetailChanged', listener)
    }
  },
  reportVisibleProjectItems: (items) =>
    ipcRenderer.send('plugins:reportVisibleProjectItems', items),
  getAutoUpdateState: () => ipcRenderer.invoke('plugins:getAutoUpdateState'),
  takeUpdateReviewNotices: () => ipcRenderer.invoke('plugins:takeUpdateReviewNotices'),
  getInstallCounts: () => ipcRenderer.invoke('plugins:getInstallCounts'),
  onInstallCountsChanged: (callback): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('plugins:installCountsChanged', listener)
    return () => {
      ipcRenderer.removeListener('plugins:installCountsChanged', listener)
    }
  },
  onAutoUpdateChanged: (callback): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, change: PluginAutoUpdateEvent): void =>
      callback(change)
    ipcRenderer.on('plugins:autoUpdateChanged', listener)
    return () => {
      ipcRenderer.removeListener('plugins:autoUpdateChanged', listener)
    }
  }
} satisfies PreloadApi['plugins']

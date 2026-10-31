import { BrowserWindow, dialog } from 'electron'
import { isRepoOnCatalogHost } from '../../../shared/execution-host'
import { getRepoIdFromWorktreeId } from '../../../shared/worktree/id'
import type { Store } from '../../persistence'
import { createPluginFolderPicker } from './plugin-folder-picker'

type ActiveWorkspaceSource = {
  resolveActiveWorktreeContext(): Promise<{ worktreeId: string } | null>
}

/** Wires the picker to Electron's native dialog, parented to the focused Orca window. */
export function createElectronPluginFolderPicker(
  store: Pick<Store, 'getRepo'>,
  workspaces: ActiveWorkspaceSource | null
): ReturnType<typeof createPluginFolderPicker> {
  return createPluginFolderPicker({
    isFocusedWorkspaceLocal: async () => {
      const context = await workspaces?.resolveActiveWorktreeContext()
      const repo = context ? store.getRepo(getRepoIdFromWorktreeId(context.worktreeId)) : undefined
      return !repo || isRepoOnCatalogHost(repo)
    },
    showFolderDialog: async ({ title, defaultPath }) => {
      const options = { title, defaultPath, properties: ['openDirectory' as const] }
      const parent = BrowserWindow.getFocusedWindow()
      // Why the branch: showOpenDialog without a parent window is not modal to Orca.
      const result = parent
        ? await dialog.showOpenDialog(parent, options)
        : await dialog.showOpenDialog(options)
      return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
    }
  })
}

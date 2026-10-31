import { isAbsolute } from 'node:path'
import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import type {
  PluginPageDocumentResult,
  PluginPageDocumentUpdate
} from '../../shared/plugins/frames/plugin-page-document-bridge'
import type { PluginFrameEntry } from '../../shared/plugins/frames/plugin-frame-bridge'
import type { PluginService } from '../plugins/plugin-service'

const readPageEntryArgsSchema = z.object({
  pluginKey: z.string().min(1),
  pageId: z.string().min(1)
})

const pageDocumentArgsSchema = z.object({
  pluginKey: z.string().min(1),
  pageId: z.string().min(1),
  /** Names one mounted page, so a window can show several and each releases its own watch. */
  instanceId: z.string().min(1).max(128),
  path: z.string().min(1).max(4096)
})

const closePageDocumentArgsSchema = z.object({ instanceId: z.string().min(1).max(128) })

type Sender = IpcMainInvokeEvent['sender']

const documentOwners = new WeakSet<Sender>()

/** Drops a window's watched files when it closes, crashes or reloads (a reload loses its pages). */
function releaseDocumentsWithWindow(sender: Sender, release: () => void): void {
  if (documentOwners.has(sender)) {
    return
  }
  documentOwners.add(sender)
  sender.once('destroyed', release)
  sender.once('render-process-gone', release)
  sender.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) {
      release()
    }
  })
}

export function registerPluginPageHandlers(
  pluginService: PluginService,
  openFrameEntry: (
    sender: Sender,
    open: (ownerKey: string, isCurrent: () => boolean) => Promise<PluginFrameEntry | null>
  ) => Promise<PluginFrameEntry | null>,
  ownerOf: (webContentsId: number) => string
): void {
  const { pages } = pluginService.panels

  ipcMain.handle('plugins:readPageEntry', (event, args: unknown) => {
    const parsed = readPageEntryArgsSchema.parse(args)
    return openFrameEntry(event.sender, (ownerKey, isCurrent) =>
      pluginService.panels.openPage(ownerKey, parsed.pluginKey, parsed.pageId, isCurrent)
    )
  })

  ipcMain.handle(
    'plugins:openPageDocument',
    async (event, args: unknown): Promise<PluginPageDocumentResult> => {
      await pluginService.whenReady()
      const parsed = pageDocumentArgsSchema.parse(args)
      // Why re-check: only a declared page of an approved plugin may read a file, whoever asks.
      if (!pages.declares(parsed.pluginKey, parsed.pageId) || !isAbsolute(parsed.path)) {
        return { ok: false, reason: 'unreadable' }
      }
      const sender = event.sender
      const ownerKey = ownerOf(sender.id)
      releaseDocumentsWithWindow(sender, () => pages.documents.closeOwner(ownerKey))
      return pages.documents.open(ownerKey, parsed.instanceId, parsed.path, (result) => {
        if (!sender.isDestroyed()) {
          sender.send('plugins:pageDocumentChanged', {
            instanceId: parsed.instanceId,
            result
          } satisfies PluginPageDocumentUpdate)
        }
      })
    }
  )

  ipcMain.handle('plugins:closePageDocument', async (event, args: unknown) => {
    const parsed = closePageDocumentArgsSchema.parse(args)
    // Why wait: a page that unmounts at once sends this behind its open, which waits the same way.
    await pluginService.whenReady()
    pages.documents.close(ownerOf(event.sender.id), parsed.instanceId)
  })
}

import { ipcMain } from 'electron'
import { z } from 'zod'
import { isQualifiedPluginKey } from '../../shared/plugins/manifest/plugin-manifest'
import { pluginSidebarCardIdSchema } from '../../shared/plugins/contributions/plugin-sidebar-card-items'
import { bindPluginPanelOwnerLifecycle } from '../plugins/panels/plugin-panel-owner-lifecycle'
import type { PluginService } from '../plugins/plugin-service'

const cardSchema = z.object({
  pluginKey: z.string().refine(isQualifiedPluginKey, 'invalid qualified plugin key'),
  cardId: pluginSidebarCardIdSchema
})
const shownArgsSchema = cardSchema.nullable()
const openFileArgsSchema = cardSchema.extend({ itemId: z.string().min(1).max(256) })

export type PluginSidebarCardOpenFileOutcome = { ok: true } | { ok: false; error: string }

/** The left sidebar reads a card's rows, says which card its window shows, and opens a row's file through these. */
export function registerPluginSidebarCardHandlers(pluginService: PluginService): void {
  ipcMain.handle('plugins:getSidebarCardItems', async (_event, args: unknown) => {
    await pluginService.whenReady()
    const { pluginKey, cardId } = cardSchema.parse(args)
    return pluginService.sidebarCards.getItems(pluginKey, cardId)
  })
  ipcMain.handle('plugins:setSidebarCardShown', async (event, args: unknown) => {
    await pluginService.whenReady()
    const card = shownArgsSchema.parse(args)
    // Why bound on first use: a closed or crashed window must stop counting as a viewer.
    bindPluginPanelOwnerLifecycle(event.sender, () =>
      pluginService.sidebarCards.dropWindow(event.sender.id)
    )
    pluginService.sidebarCards.setWindowCard(event.sender.id, card)
  })
  // Why in main: the path comes from the stored row, not the window, and goes through the same
  // host call, capability gate and audit log as a worker's own editor.openFile.
  ipcMain.handle(
    'plugins:openSidebarCardFile',
    async (_event, args: unknown): Promise<PluginSidebarCardOpenFileOutcome> => {
      await pluginService.whenReady()
      const { pluginKey, cardId, itemId } = openFileArgsSchema.parse(args)
      const action = pluginService.sidebarCards.findItem(pluginKey, cardId, itemId)?.action
      if (action?.kind !== 'openFile') {
        return { ok: false, error: 'this row no longer opens a file' }
      }
      const outcome = await pluginService.executeHostCall(
        pluginKey,
        'editor.openFile',
        { path: action.path, ...(action.placement ? { placement: action.placement } : {}) },
        'worker'
      )
      return outcome.ok ? { ok: true } : { ok: false, error: outcome.error }
    }
  )
}

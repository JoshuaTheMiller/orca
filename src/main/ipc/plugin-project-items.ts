import { ipcMain } from 'electron'
import { z } from 'zod'
import { isQualifiedPluginKey } from '../../shared/plugins/manifest/plugin-manifest'
import { PLUGIN_PROJECT_ITEM_VISIBLE_PROJECT_LIMIT } from '../../shared/plugins/events/plugin-events'
import type { PluginService } from '../plugins/plugin-service'

const visibilitySchema = z
  .array(
    z.object({
      pluginKey: z.string().refine(isQualifiedPluginKey, 'invalid qualified plugin key'),
      itemId: z.string().min(1).max(64),
      projects: z
        .array(
          z.object({
            id: z.string().min(1).max(2048),
            name: z.string().max(512),
            paths: z
              .array(
                z
                  .string()
                  .min(1)
                  .max(32 * 1024)
              )
              .max(8)
          })
        )
        .max(PLUGIN_PROJECT_ITEM_VISIBLE_PROJECT_LIMIT)
    })
  )
  .max(64)

const watched = new Set<number>()

/** Windows tell main which projects each project item shows under, and read the detail text workers set. */
export function registerPluginProjectItemHandlers(pluginService: PluginService): void {
  ipcMain.handle('plugins:getProjectItemDetails', async () => {
    await pluginService.whenReady()
    return pluginService.projectItems.snapshot()
  })
  ipcMain.on('plugins:reportVisibleProjectItems', (event, args: unknown) => {
    const parsed = visibilitySchema.safeParse(args)
    if (!parsed.success) {
      return
    }
    const sender = event.sender
    const { projectItems } = pluginService
    projectItems.reportVisible(sender.id, parsed.data)
    // Why once per window: a closed window's projects must stop counting as shown.
    if (!watched.has(sender.id)) {
      watched.add(sender.id)
      sender.once('destroyed', () => {
        watched.delete(sender.id)
        projectItems.dropSender(sender.id)
      })
    }
  })
}

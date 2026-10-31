import { ipcMain } from 'electron'
import { z } from 'zod'
import { isQualifiedPluginKey } from '../../shared/plugins/manifest/plugin-manifest'
import type { PluginService } from '../plugins/plugin-service'
import type { PluginSettingWriteResult } from '../plugins/plugin-settings-access'

const pluginKeySchema = z.string().refine(isQualifiedPluginKey, 'invalid qualified plugin key')
const getArgsSchema = z.object({ pluginKey: pluginKeySchema })
const setArgsSchema = z.object({
  pluginKey: pluginKeySchema,
  key: z.string().min(1),
  value: z.union([z.boolean(), z.string()])
})
const resetArgsSchema = z.object({ pluginKey: pluginKeySchema, key: z.string().min(1) })

/** Orca's settings UI reads and writes a plugin's declared settings through these handlers. */
export function registerPluginSettingsHandlers(pluginService: PluginService): void {
  // Why declared keys only: the UI shows what the manifest declares; a plugin's untyped keys stay its own.
  const declaredIds = (pluginKey: string): string[] =>
    pluginService.findValidPlugin(pluginKey)?.manifest.contributes.settings.map((s) => s.id) ?? []
  const refuse = (key: string): PluginSettingWriteResult => ({
    ok: false,
    error: `${key} is not a declared setting`,
    invalid: true
  })

  ipcMain.handle('plugins:getSettings', async (_event, args: unknown) => {
    await pluginService.whenReady()
    const { pluginKey } = getArgsSchema.parse(args)
    const all = pluginService.settings.getAll(pluginKey)
    return Object.fromEntries(declaredIds(pluginKey).map((id) => [id, all[id]]))
  })
  ipcMain.handle('plugins:setSetting', async (_event, args: unknown) => {
    await pluginService.whenReady()
    const { pluginKey, key, value } = setArgsSchema.parse(args)
    return declaredIds(pluginKey).includes(key)
      ? pluginService.settings.set(pluginKey, key, value)
      : refuse(key)
  })
  ipcMain.handle('plugins:resetSetting', async (_event, args: unknown) => {
    await pluginService.whenReady()
    const { pluginKey, key } = resetArgsSchema.parse(args)
    return declaredIds(pluginKey).includes(key)
      ? pluginService.settings.reset(pluginKey, key)
      : refuse(key)
  })
}

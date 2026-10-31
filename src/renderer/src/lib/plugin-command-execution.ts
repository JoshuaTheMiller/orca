import type { ActivePluginCommand } from '@/store/plugin-panels'
import { dispatchAppCommand, type AppCommandSource } from './app-command-dispatch'

/**
 * Resolves with whatever a worker handler returned; built-in actions return nothing.
 * `args` reaches a worker handler only: a built-in action takes none and ignores them.
 */
export async function executePluginCommand(
  command: ActivePluginCommand,
  source: AppCommandSource,
  args?: unknown
): Promise<unknown> {
  if (command.handler.type === 'built-in') {
    if (!dispatchAppCommand(command.handler.action, source)) {
      throw new Error('built-in action is unavailable in the current context')
    }
    return undefined
  }
  return window.api.plugins.invokeCommand({
    pluginKey: command.pluginKey,
    commandId: command.id,
    ...(args === undefined ? {} : { args })
  })
}

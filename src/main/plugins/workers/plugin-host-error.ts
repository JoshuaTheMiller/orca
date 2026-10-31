import type { PluginErrorCode } from '../../../shared/plugins/frames/plugin-protocol'

/** A refusal a host method wants the plugin to see under its own code, not `action_failed`. */
export class PluginHostError extends Error {
  constructor(
    readonly code: PluginErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'PluginHostError'
  }
}

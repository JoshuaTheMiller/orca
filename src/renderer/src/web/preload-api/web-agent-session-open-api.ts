import type { PreloadApi } from '../../../../preload/api-types'
import type { UiAgentSessionOpenApi } from '../../../../preload/api/ui-agent-session-open-api'
import { noopUnsubscribe } from './web-storage'

/** The web `ui` api before the host-window requests, which are added separately. */
export type WebUiApiBase = Omit<NonNullable<Partial<PreloadApi>['ui']>, keyof UiAgentSessionOpenApi>

/** The web client has no host window for a plugin to ask, so it never hears a request. */
export const webAgentSessionOpenApi: UiAgentSessionOpenApi = {
  onOpenAgentSession: () => noopUnsubscribe,
  replyAgentSessionOpen: () => {}
}

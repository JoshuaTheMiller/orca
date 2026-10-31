import type { PreloadApi } from '../api-types'
import { uiStateAndMenuCommandsApi } from './ui-bridge-state-and-menu-commands'
import { uiTabAndBrowserCommandsApi } from './ui-bridge-tab-and-browser-commands'
import { uiTerminalAndSessionTabsApi } from './ui-bridge-terminal-and-session-tabs'
import { uiAgentSessionOpenApi } from './ui-agent-session-open-api'
import { uiClipboardAndWindowControlsApi } from './ui-bridge-clipboard-and-window-controls'

export const uiApi = {
  ...uiStateAndMenuCommandsApi,
  ...uiTabAndBrowserCommandsApi,
  ...uiTerminalAndSessionTabsApi,
  ...uiAgentSessionOpenApi,
  ...uiClipboardAndWindowControlsApi
} satisfies PreloadApi['ui']

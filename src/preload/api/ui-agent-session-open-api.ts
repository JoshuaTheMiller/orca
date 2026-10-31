import { ipcRenderer } from 'electron'
import type {
  AgentSessionOpenReply,
  AgentSessionOpenRequest
} from '../../shared/agent-session-open'

export type UiAgentSessionOpenApi = {
  onOpenAgentSession: (callback: (data: AgentSessionOpenRequest) => void) => () => void
  replyAgentSessionOpen: (reply: AgentSessionOpenReply) => void
}

export const uiAgentSessionOpenApi = {
  onOpenAgentSession: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, data: AgentSessionOpenRequest) =>
      callback(data)
    ipcRenderer.on('ui:openAgentSession', listener)
    return () => ipcRenderer.removeListener('ui:openAgentSession', listener)
  },
  replyAgentSessionOpen: (reply) => {
    ipcRenderer.send('ui:agentSessionOpenReply', reply)
  }
} satisfies UiAgentSessionOpenApi

import { randomUUID } from 'node:crypto'

import { app, ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import type {
  AgentSessionOpenOutcome,
  AgentSessionOpenReply,
  AgentSessionOpenTarget
} from '../../shared/agent-session-open'
import { addFanoutListener } from '../event-listener-fanout'
import { abortWhenRendererGone } from '../ipc/renderer-lifetime-abort'
import { focusExistingMainWindow } from './focus-existing-window'

// Why: a resume may wait on a transcript scan and a host launch before the window answers.
const AGENT_SESSION_OPEN_TIMEOUT_MS = 30_000

/** Asks the window to focus or resume the session, then raises it unless nothing was found. */
export async function openAgentSessionInWindow(
  mainWindow: BrowserWindow,
  target: AgentSessionOpenTarget
): Promise<AgentSessionOpenOutcome> {
  const outcome = await requestAgentSessionOpenFromRenderer(mainWindow, target)
  if (outcome !== 'not_found') {
    focusExistingMainWindow({
      app,
      getWindow: () => mainWindow,
      // Reveal only the answering window; never construct a replacement.
      canOpenWindow: () => false,
      openWindow: () => mainWindow
    })
  }
  return outcome
}

function requestAgentSessionOpenFromRenderer(
  mainWindow: BrowserWindow,
  target: AgentSessionOpenTarget
): Promise<AgentSessionOpenOutcome> {
  if (mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
    return Promise.reject(new Error('renderer_unavailable'))
  }
  const webContents = mainWindow.webContents
  const requestId = randomUUID()
  return new Promise<AgentSessionOpenOutcome>((resolve, reject) => {
    let settled = false
    const releaseListeners: (() => void)[] = []
    const finish = (error: Error | null, outcome: AgentSessionOpenOutcome = 'not_found'): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      for (const release of releaseListeners) {
        release()
      }
      if (error) {
        reject(error)
      } else {
        resolve(outcome)
      }
    }
    const onRendererUnavailable = (): void => finish(new Error('renderer_unavailable'))
    const timeout = setTimeout(
      () => finish(new Error('agent_session_open_timeout')),
      AGENT_SESSION_OPEN_TIMEOUT_MS
    )
    const onReply = (event: Electron.IpcMainEvent, reply: AgentSessionOpenReply): void => {
      // Visible request IDs confer no authority; only the targeted window can answer.
      if (event.sender !== webContents || reply.requestId !== requestId) {
        return
      }
      finish(null, reply.outcome)
    }
    const lifetime = abortWhenRendererGone(webContents)
    lifetime.signal.addEventListener('abort', onRendererUnavailable, { once: true })
    releaseListeners.push(
      lifetime.dispose,
      () => lifetime.signal.removeEventListener('abort', onRendererUnavailable),
      addFanoutListener(mainWindow, 'closed', onRendererUnavailable),
      addFanoutListener(ipcMain, 'ui:agentSessionOpenReply', onReply)
    )
    try {
      webContents.send('ui:openAgentSession', { ...target, requestId })
    } catch {
      finish(new Error('renderer_unavailable'))
    }
  })
}

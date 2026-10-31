import { EventEmitter } from 'node:events'
import type { BrowserWindow } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentSessionOpenRequest } from '../../shared/agent-session-open'
import type { FocusExistingMainWindowOptions } from './focus-existing-window'

const ipcEmitter = new EventEmitter()
const mocks = vi.hoisted(() => ({
  focusExistingMainWindow: vi.fn<(options: FocusExistingMainWindowOptions) => string>()
}))
const ipcMainMock = {
  on: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
    ipcEmitter.on(channel, listener)
  }),
  removeListener: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
    ipcEmitter.removeListener(channel, listener)
  })
}

vi.mock('electron', () => ({ app: {}, ipcMain: ipcMainMock }))
vi.mock('./focus-existing-window', () => ({
  focusExistingMainWindow: mocks.focusExistingMainWindow
}))

const target = { agent: 'claude', sessionId: 'session-1', cwd: '/work/repo' }

function createWindow(options: { rendererDestroyed?: boolean } = {}) {
  const webContents = Object.assign(new EventEmitter(), {
    isDestroyed: () => options.rendererDestroyed === true,
    send: vi.fn<(channel: string, request: AgentSessionOpenRequest) => void>()
  })
  const windowEvents = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    webContents
  })
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: this fixture supplies the relay's window/contents event, destruction and send surface.
  const mainWindow = windowEvents as unknown as BrowserWindow
  const sentRequest = (): AgentSessionOpenRequest => {
    const [channel, request] = webContents.send.mock.calls[0] ?? []
    expect(channel).toBe('ui:openAgentSession')
    return request ?? { ...target, requestId: '' }
  }
  return { webContents, mainWindow, windowEvents, sentRequest }
}

async function loadRelay() {
  return (await import('./agent-session-open-relay')).openAgentSessionInWindow
}

function reply(sender: unknown, requestId: string, outcome: string): void {
  ipcEmitter.emit('ui:agentSessionOpenReply', { sender }, { requestId, outcome })
}

describe('openAgentSessionInWindow', () => {
  beforeEach(() => {
    ipcEmitter.removeAllListeners()
    mocks.focusExistingMainWindow.mockReset()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it.each(['focused', 'resumed'] as const)(
    'raises the window once the renderer has answered %s',
    async (outcome) => {
      const openAgentSessionInWindow = await loadRelay()
      const { webContents, mainWindow, sentRequest } = createWindow()
      const pending = openAgentSessionInWindow(mainWindow, target)
      const { requestId } = sentRequest()
      expect(sentRequest()).toEqual({ ...target, requestId })

      // Visible request IDs confer no authority; only the targeted window can answer.
      reply({}, requestId, 'not_found')
      reply(webContents, 'other-request', 'not_found')
      reply(webContents, requestId, outcome)

      await expect(pending).resolves.toBe(outcome)
      expect(mocks.focusExistingMainWindow).toHaveBeenCalledTimes(1)
      const focus = mocks.focusExistingMainWindow.mock.calls[0]?.[0]
      expect(focus?.getWindow()).toBe(mainWindow)
      expect(focus?.canOpenWindow?.()).toBe(false)
      expect(ipcEmitter.listenerCount('ui:agentSessionOpenReply')).toBe(0)
    }
  )

  it('leaves the window where it is when the session was not found', async () => {
    const openAgentSessionInWindow = await loadRelay()
    const { webContents, mainWindow, sentRequest } = createWindow()
    const pending = openAgentSessionInWindow(mainWindow, target)

    reply(webContents, sentRequest().requestId, 'not_found')

    await expect(pending).resolves.toBe('not_found')
    expect(mocks.focusExistingMainWindow).not.toHaveBeenCalled()
  })

  it.each(['destroyed', 'render-process-gone', 'did-navigate', 'closed'])(
    'retires a pending open on %s and ignores its late reply',
    async (event) => {
      vi.useFakeTimers()
      const openAgentSessionInWindow = await loadRelay()
      const { webContents, mainWindow, windowEvents, sentRequest } = createWindow()
      const pending = openAgentSessionInWindow(mainWindow, target).then(
        () => 'resolved',
        (error: Error) => error.message
      )

      ;(event === 'closed' ? windowEvents : webContents).emit(event)

      await expect(pending).resolves.toBe('renderer_unavailable')
      reply(webContents, sentRequest().requestId, 'focused')
      expect(mocks.focusExistingMainWindow).not.toHaveBeenCalled()
      expect(ipcEmitter.listenerCount('ui:agentSessionOpenReply')).toBe(0)
      expect(vi.getTimerCount()).toBe(0)
    }
  )

  it('fails instead of waiting when the window is gone', async () => {
    const openAgentSessionInWindow = await loadRelay()
    const { webContents, mainWindow } = createWindow({ rendererDestroyed: true })

    await expect(openAgentSessionInWindow(mainWindow, target)).rejects.toThrow(
      'renderer_unavailable'
    )
    expect(webContents.send).not.toHaveBeenCalled()
  })

  it('releases the request when sending to the renderer throws', async () => {
    vi.useFakeTimers()
    const openAgentSessionInWindow = await loadRelay()
    const { webContents, mainWindow } = createWindow()
    webContents.send.mockImplementation(() => {
      throw new Error('Render frame was disposed')
    })

    await expect(openAgentSessionInWindow(mainWindow, target)).rejects.toThrow(
      'renderer_unavailable'
    )
    expect(ipcEmitter.listenerCount('ui:agentSessionOpenReply')).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('times out when the renderer never answers', async () => {
    vi.useFakeTimers()
    const openAgentSessionInWindow = await loadRelay()
    const { mainWindow } = createWindow()
    const assertion = expect(openAgentSessionInWindow(mainWindow, target)).rejects.toThrow(
      'agent_session_open_timeout'
    )

    await vi.advanceTimersByTimeAsync(30_000)

    await assertion
    expect(ipcEmitter.listenerCount('ui:agentSessionOpenReply')).toBe(0)
    expect(mocks.focusExistingMainWindow).not.toHaveBeenCalled()
  })
})

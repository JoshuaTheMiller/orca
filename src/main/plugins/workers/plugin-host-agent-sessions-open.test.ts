import { describe, expect, it, vi } from 'vitest'
import type { AgentSessionOpenOutcome } from '../../../shared/agent-session-open'
import type { PluginCapabilityKind } from '../../../shared/plugins/capabilities/plugin-capabilities'
import type { PluginSurface } from '../../../shared/plugins/frames/plugin-protocol'
import { bindPluginHostServices, type PluginRuntimeDelegate } from './plugin-host-service-bindings'
import { executePluginHostCall } from './plugin-host-methods'
import {
  PLUGIN_HOST_API,
  PLUGIN_HOST_API_MINOR
} from '../../../shared/plugins/workers/plugin-host-api'

const SESSION_ID = '0a1b2c3d-4e5f-6789-abcd-ef0123456789'

function createHarness(outcome: AgentSessionOpenOutcome = 'resumed') {
  const openAgentSession = vi.fn().mockResolvedValue(outcome)
  const delegate: PluginRuntimeDelegate = {
    resolveActiveWorktreeContext: vi.fn().mockResolvedValue(null),
    listTerminals: vi.fn().mockResolvedValue({ terminals: [] }),
    sendTerminal: vi.fn().mockResolvedValue({ accepted: true }),
    openAgentSession,
    openLocalAbsoluteFile: vi.fn().mockResolvedValue({ worktree: 'worktree-1' }),
    dispatchPluginNotification: vi.fn().mockResolvedValue({ delivered: true })
  }
  const record = vi.fn().mockResolvedValue(undefined)
  const call = (
    params: unknown,
    options: { surface?: PluginSurface; granted?: PluginCapabilityKind[] | null } = {}
  ) =>
    executePluginHostCall({
      pluginId: 'samples.demo',
      method: 'agentSessions.open',
      params,
      surface: options.surface ?? 'worker',
      grantedCapabilities: options.granted === undefined ? ['agents:open'] : options.granted,
      services: bindPluginHostServices({
        delegate,
        pluginsDataDir: 'unused',
        sidebarNavValues: () => ({}),
        setSidebarCardItems: () => ({ ok: true }),
        settings: { getAll: () => ({}), set: () => ({ ok: true }) },
        projectItems: { setDetail: () => ({ ok: true }) }
      }),
      audit: { record }
    })
  return { call, openAgentSession, record }
}

describe('host API minors', () => {
  it('gives each extension point its own minor and ends at agentSessions.open', () => {
    const minors = {
      'editor.openFile': PLUGIN_HOST_API['editor.openFile'].since,
      'sidebarNav.getValues': PLUGIN_HOST_API['sidebarNav.getValues'].since,
      'links.open': PLUGIN_HOST_API['links.open'].since,
      'settings.get': PLUGIN_HOST_API['settings.get'].revisedIn,
      'sidebarCards.setItems': PLUGIN_HOST_API['sidebarCards.setItems'].since,
      'projectItems.setDetail': PLUGIN_HOST_API['projectItems.setDetail'].since,
      'dialogs.pickFolder': PLUGIN_HOST_API['dialogs.pickFolder'].since,
      'agentSessions.open': PLUGIN_HOST_API['agentSessions.open'].since
    }
    expect(Object.values(minors)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(PLUGIN_HOST_API_MINOR).toBe(8)
  })
})

describe('agentSessions.open', () => {
  it.each(['focused', 'resumed', 'not_found'] as const)(
    'returns the window outcome %s',
    async (outcome) => {
      const { call, openAgentSession } = createHarness(outcome)

      await expect(call({ agent: 'claude', sessionId: SESSION_ID })).resolves.toEqual({
        ok: true,
        value: { outcome }
      })
      expect(openAgentSession).toHaveBeenCalledWith({ agent: 'claude', sessionId: SESSION_ID })
    }
  )

  it('passes an absolute cwd through to the window', async () => {
    const { call, openAgentSession } = createHarness()

    await call({ agent: 'claude', sessionId: SESSION_ID, cwd: 'C:\\work\\repo' })
    await call({ agent: 'claude', sessionId: SESSION_ID, cwd: '/home/me/repo' })

    expect(openAgentSession).toHaveBeenNthCalledWith(1, {
      agent: 'claude',
      sessionId: SESSION_ID,
      cwd: 'C:\\work\\repo'
    })
    expect(openAgentSession).toHaveBeenNthCalledWith(2, {
      agent: 'claude',
      sessionId: SESSION_ID,
      cwd: '/home/me/repo'
    })
  })

  it.each([
    { agent: 'claude' },
    { agent: '', sessionId: SESSION_ID },
    { agent: 'claude', sessionId: '' },
    { agent: 'claude', sessionId: SESSION_ID, cwd: 'relative/dir' },
    { agent: 'claude', sessionId: SESSION_ID, extra: true }
  ])('refuses invalid params %j before touching the window', async (params) => {
    const { call, openAgentSession, record } = createHarness()

    await expect(call(params)).resolves.toMatchObject({ ok: false, code: 'invalid_params' })
    expect(openAgentSession).not.toHaveBeenCalled()
    expect(record).not.toHaveBeenCalled()
  })

  it.each([
    { granted: null, code: 'consent_required' },
    { granted: [], code: 'capability_denied' },
    { granted: ['workspace:read', 'terminal:send'], code: 'capability_denied' }
  ] as const)('refuses without the agents:open grant ($code)', async ({ granted, code }) => {
    const { call, openAgentSession } = createHarness()

    await expect(
      call({ agent: 'claude', sessionId: SESSION_ID }, { granted: granted && [...granted] })
    ).resolves.toMatchObject({ ok: false, code })
    expect(openAgentSession).not.toHaveBeenCalled()
  })

  it.each(['worker', 'panel', 'editor'] as const)(
    'is callable from the %s surface',
    async (surface) => {
      const { call } = createHarness('focused')

      await expect(call({ agent: 'codex', sessionId: 'abc' }, { surface })).resolves.toEqual({
        ok: true,
        value: { outcome: 'focused' }
      })
    }
  )

  it('audits the agent and only the first 8 characters of the session id', async () => {
    const { call, record } = createHarness()

    await call({ agent: 'claude', sessionId: SESSION_ID, cwd: '/home/me/repo' })

    expect(record).toHaveBeenCalledTimes(2)
    expect(record.mock.calls.map(([entry]) => entry.outcome)).toEqual(['attempt', 'ok'])
    for (const [entry] of record.mock.calls) {
      expect(entry).toMatchObject({
        actor: 'plugin:samples.demo',
        method: 'agentSessions.open',
        summary: 'agent=claude session=0a1b2c3d'
      })
      expect(JSON.stringify(entry)).not.toContain('4e5f')
      expect(JSON.stringify(entry)).not.toContain('/home/me/repo')
    }
  })

  it('reports an unreachable window as a failed action and audits the error', async () => {
    const { call, openAgentSession, record } = createHarness()
    openAgentSession.mockRejectedValue(new Error('renderer_unavailable'))

    await expect(call({ agent: 'claude', sessionId: SESSION_ID })).resolves.toEqual({
      ok: false,
      code: 'action_failed',
      error: 'renderer_unavailable'
    })
    expect(record.mock.calls.map(([entry]) => entry.outcome)).toEqual(['attempt', 'error'])
  })
})

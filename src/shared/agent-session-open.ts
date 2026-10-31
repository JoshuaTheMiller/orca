import type { PLUGIN_AGENT_SESSION_OPEN_OUTCOMES } from './plugins/workers/plugin-host-api'

/** Which session a plugin asked the window to bring up. `cwd` is an absolute directory that picks the workspace to resume in. */
export type AgentSessionOpenTarget = {
  agent: string
  sessionId: string
  cwd?: string
}

export type AgentSessionOpenOutcome = (typeof PLUGIN_AGENT_SESSION_OPEN_OUTCOMES)[number]

export type AgentSessionOpenRequest = AgentSessionOpenTarget & { requestId: string }

export type AgentSessionOpenReply = { requestId: string; outcome: AgentSessionOpenOutcome }

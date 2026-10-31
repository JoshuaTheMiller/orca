import type { FolderWorkspace } from '../../../shared/folder-workspace-types'
import type { Repo } from '../../../shared/repo-types'
import { getRepoIdFromWorktreeId, getRepoMainWorktreeId } from '../../../shared/worktree/id'
import {
  folderWorkspaceKey,
  normalizeWorkspaceSessionKeyToWorkspaceId
} from '../../../shared/workspace-scope'
import { runtimeVisibleFolderWorkspaces } from '../runtime-visible-catalog'
import type { RuntimeStore } from '../runtime-store-contract'
import { UnknownProjectError } from './unknown-project-error'

export type ProjectWorkspaceResolutionHost = {
  requireStore(): RuntimeStore
  /** Rejects when the workspace is gone or its folder is unusable. */
  resolveRuntimeFileTarget(selector: string): Promise<unknown>
  /** Creates a folder workspace for a project group, the way the sidebar does. */
  createFolderWorkspace?(input: { projectGroupId: string }): Promise<FolderWorkspace>
}

/** Workspace to open a file in for a sidebar project id (repo id, or project-group id for folder projects); null when it has none. */
export async function resolveProjectWorkspaceId(
  host: ProjectWorkspaceResolutionHost,
  projectId: string
): Promise<string | null> {
  const store = host.requireStore()
  const repo = store.getRepos().find((candidate) => candidate.id === projectId)
  const group = repo
    ? undefined
    : store.getProjectGroups?.().find((entry) => entry.id === projectId)
  if (!repo && !group) {
    throw new UnknownProjectError(projectId)
  }
  const recency = visitRecency(store)
  const candidates = repo
    ? repoWorkspaceCandidates(store, repo, recency)
    : groupWorkspaceCandidates(store, projectId, recency)
  // Why: meta can outlive a deleted checkout or a missing folder, so each candidate is proven before use.
  for (const id of candidates) {
    if (await resolves(host, id)) {
      return id
    }
  }
  if (group && host.createFolderWorkspace) {
    try {
      const created = await host.createFolderWorkspace({
        projectGroupId: group.id
      })
      return folderWorkspaceKey(created.id)
    } catch {
      return null
    }
  }
  return null
}

async function resolves(
  host: ProjectWorkspaceResolutionHost,
  workspaceId: string
): Promise<boolean> {
  try {
    await host.resolveRuntimeFileTarget(`id:${workspaceId}`)
    return true
  } catch {
    return false
  }
}

function visitRecency(store: RuntimeStore): Map<string, number> {
  const recency = new Map<string, number>()
  const visited = store.getWorkspaceSession?.()?.lastVisitedAtByWorktreeId ?? {}
  for (const [key, at] of Object.entries(visited)) {
    // Why: keys may be host-qualified or legacy bare ids.
    const id = normalizeWorkspaceSessionKeyToWorkspaceId(key)
    recency.set(id, Math.max(recency.get(id) ?? 0, at))
  }
  return recency
}

function repoWorkspaceCandidates(
  store: RuntimeStore,
  repo: Repo,
  recency: Map<string, number>
): string[] {
  const rows = Object.entries(store.getAllWorktreeMeta())
    .filter(([id, meta]) => getRepoIdFromWorktreeId(id) === repo.id && !meta.isArchived)
    .map(([id, meta]) => ({
      id,
      at: Math.max(recency.get(id) ?? 0, meta.lastActivityAt ?? 0)
    }))
    .sort((a, b) => b.at - a.at)
    .map((row) => row.id)
  // Why: the main checkout is the fallback for a project whose workspaces were never visited or recorded.
  const main = getRepoMainWorktreeId(repo)
  return rows.includes(main) ? rows : [...rows, main]
}

function groupWorkspaceCandidates(
  store: RuntimeStore,
  groupId: string,
  recency: Map<string, number>
): string[] {
  return runtimeVisibleFolderWorkspaces(store)
    .filter((workspace) => workspace.projectGroupId === groupId && !workspace.isArchived)
    .map((workspace) => {
      const id = folderWorkspaceKey(workspace.id)
      return {
        id,
        at: Math.max(recency.get(id) ?? 0, workspace.lastActivityAt)
      }
    })
    .sort((a, b) => b.at - a.at)
    .map((row) => row.id)
}

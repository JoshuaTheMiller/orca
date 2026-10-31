import type { RuntimeStore } from '../runtime-store-contract'
import type { ResolvedRuntimeFileTarget, ResolvedRuntimeFileWorktree } from './file-target'
import type { ExecutionHostId } from '../../../shared/execution-host'
import type { RuntimeNavigationTarget } from '../../../shared/runtime-navigation'
import type { RuntimeFileOpenPosition } from '../../../shared/runtime-file-contracts'
import type { FolderWorkspace } from '../../../shared/folder-workspace-types'

export type RuntimeFileCommandHost = {
  getRuntimeId(): string
  requireStore(): RuntimeStore
  resolveRuntimeFileTarget(selector: string): Promise<ResolvedRuntimeFileTarget>
  resolveKnownWorkspaceFileTarget?(
    absolutePath: string,
    executionHostId: ExecutionHostId
  ): Promise<(ResolvedRuntimeFileTarget & { relativePath: string }) | null>
  resolveTerminalCwd?(terminalHandle: string): string | null | Promise<string | null>
  resolveTerminalFileUriHostname?(terminalHandle: string): string | null | Promise<string | null>
  // executionHostId distinguishes runtime/local hosts; connectionId cannot. See runtime-git/file-command-target.
  resolveRuntimeGitTarget(
    selector: string
  ): Promise<{ worktree: ResolvedRuntimeFileWorktree; executionHostId: ExecutionHostId }>
  /** Creates a folder workspace for a project group, as the sidebar does; used when a plugin opens a file for a project that has none. */
  createFolderWorkspace?(input: { projectGroupId: string }): Promise<FolderWorkspace>
  openFile(
    worktreeId: string,
    filePath: string,
    relativePath: string,
    runtimeEnvironmentId?: string | null,
    navigation?: RuntimeNavigationTarget,
    position?: RuntimeFileOpenPosition
  ): void | Promise<void>
  openDiff(
    worktreeId: string,
    filePath: string,
    relativePath: string,
    staged: boolean,
    runtimeEnvironmentId?: string | null,
    navigation?: RuntimeNavigationTarget,
    oldPath?: string
  ): void
}

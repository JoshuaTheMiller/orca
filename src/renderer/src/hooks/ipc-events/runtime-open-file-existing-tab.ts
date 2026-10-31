import { getConnectionIdForFileFromState } from '@/lib/connection-owner-resolution'
import { normalizeRuntimePathForComparison } from '../../../../shared/cross-platform-path'
import type { AppState } from '../../store/types'
import type { OpenFile } from '../../store/slices/editor/types/open-file'

export type ExistingEditorTab = { file: OpenFile; tabId: string }

// Why: two hosts can hold the same path string, so the host is part of the file's identity.
function hostKey(
  state: AppState,
  worktreeId: string,
  file: Pick<OpenFile, 'filePath' | 'runtimeEnvironmentId' | 'externalSshTargetId'>
): string {
  const ssh =
    file.externalSshTargetId ?? getConnectionIdForFileFromState(state, worktreeId, file.filePath)
  return `${file.runtimeEnvironmentId?.trim() || ''}|${ssh ?? ''}`
}

/**
 * The tab that already shows this absolute file in a workspace other than `worktreeId`, if any.
 * Why: Orca keeps one tab per file per owner, so a second tab for a file another workspace shows
 * would be re-owned onto that workspace and refused as "The sibling file is already open".
 * A tab in `worktreeId` itself is left to the normal open, which reuses it.
 */
export function findEditorTabOpenElsewhere(
  state: AppState,
  open: {
    worktreeId: string
    filePath: string
    runtimeEnvironmentId?: string | null
  }
): ExistingEditorTab | null {
  const wanted = normalizeRuntimePathForComparison(open.filePath)
  const wantedHost = hostKey(state, open.worktreeId, open)
  const shows = (file: OpenFile): boolean =>
    file.mode === 'edit' &&
    normalizeRuntimePathForComparison(file.filePath) === wanted &&
    hostKey(state, file.worktreeId, file) === wantedHost
  const tabOf = (file: OpenFile): string | undefined =>
    state.unifiedTabsByWorktree[file.worktreeId]?.find(
      (tab) => tab.contentType === 'editor' && tab.entityId === file.id
    )?.id
  const candidates = state.openFiles.filter(shows)
  if (candidates.some((file) => file.worktreeId === open.worktreeId && tabOf(file))) {
    return null
  }
  for (const file of candidates) {
    const tabId = tabOf(file)
    if (tabId) {
      return { file, tabId }
    }
  }
  return null
}

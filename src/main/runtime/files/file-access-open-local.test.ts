import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../shared/constants'
import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import { RuntimeFileAccess } from './file-access'
import { UnknownProjectError } from './unknown-project-error'

let dir: string
const openFile = vi.fn()
const resolveKnownWorkspaceFileTarget = vi.fn()

function access(): RuntimeFileAccess {
  // SAFETY: the open path touches only these host members.
  // oxlint-disable-next-line typescript/consistent-type-assertions
  return new RuntimeFileAccess({
    openFile,
    resolveKnownWorkspaceFileTarget,
    resolveRuntimeFileTarget: vi.fn()
  } as never)
}

beforeEach(async () => {
  vi.clearAllMocks()
  dir = await mkdtemp(join(tmpdir(), 'open-local-'))
  resolveKnownWorkspaceFileTarget.mockResolvedValue(null)
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('RuntimeFileAccess.openLocalAbsoluteFile', () => {
  it('opens a file outside every workspace in the floating workspace', async () => {
    const file = join(dir, 'graph.json')
    await writeFile(file, '{}')

    await access().openLocalAbsoluteFile(file, { line: 3, column: 1 })

    expect(resolveKnownWorkspaceFileTarget).toHaveBeenCalledWith(file, LOCAL_EXECUTION_HOST_ID)
    expect(openFile).toHaveBeenCalledWith(
      FLOATING_TERMINAL_WORKTREE_ID,
      file,
      'graph.json',
      null,
      undefined,
      { line: 3, column: 1 }
    )
  })

  it('refuses a missing file, a directory and a relative path without opening', async () => {
    const files = access()
    await expect(files.openLocalAbsoluteFile(join(dir, 'gone.json'))).rejects.toThrow(
      'file not found: gone.json'
    )
    await mkdir(join(dir, 'folder'))
    await expect(files.openLocalAbsoluteFile(join(dir, 'folder'))).rejects.toThrow(
      'not a file: folder'
    )
    await expect(files.openLocalAbsoluteFile('rel/a.md')).rejects.toThrow('path must be absolute')
    expect(openFile).not.toHaveBeenCalled()
  })

  it('opens a file inside a known workspace there, by its relative path', async () => {
    const file = join(dir, 'src', 'a.md')
    resolveKnownWorkspaceFileTarget.mockResolvedValue({
      worktree: { id: 'wt-1', path: dir },
      executionHostId: LOCAL_EXECUTION_HOST_ID,
      relativePath: 'src/a.md'
    })
    const files = access()
    // SAFETY: the existence check needs a real provider; only the open routing is under test.
    // oxlint-disable-next-line typescript/consistent-type-assertions
    const internals = files as unknown as { assertOpenTargetIsFile: () => Promise<void> }
    vi.spyOn(internals, 'assertOpenTargetIsFile').mockResolvedValue()

    await files.openLocalAbsoluteFile(file)

    expect(openFile).toHaveBeenCalledWith('wt-1', file, 'src/a.md', null, undefined)
  })

  describe('with an active workspace', () => {
    const resolveRuntimeFileTarget = vi.fn()
    const activeAccess = (): RuntimeFileAccess =>
      // SAFETY: the open path touches only these host members.
      // oxlint-disable-next-line typescript/consistent-type-assertions
      new RuntimeFileAccess({
        openFile,
        resolveKnownWorkspaceFileTarget,
        resolveRuntimeFileTarget
      } as never)

    beforeEach(() => {
      resolveRuntimeFileTarget.mockResolvedValue({
        worktree: { id: 'wt-active', path: join(dir, 'repo') },
        executionHostId: LOCAL_EXECUTION_HOST_ID
      })
    })

    it('opens a file outside every workspace as a tab of the active one, by absolute path', async () => {
      const file = join(dir, 'notes', 'graph.json')
      await mkdir(join(dir, 'notes'))
      await writeFile(file, '{}')

      const result = await activeAccess().openLocalAbsoluteFile(
        file,
        { line: 2 },
        { activeWorktreeId: 'wt-active' }
      )

      expect(resolveRuntimeFileTarget).toHaveBeenCalledWith('id:wt-active')
      // Why relativePath equals filePath: that is the shape of Orca's other external-file tabs.
      expect(openFile).toHaveBeenCalledWith('wt-active', file, file, null, undefined, { line: 2 })
      expect(result).toEqual({ worktree: 'wt-active' })
    })

    it('also moves a file owned by another workspace into the active one', async () => {
      const file = join(dir, 'other', 'a.md')
      await mkdir(join(dir, 'other'))
      await writeFile(file, '#')
      resolveKnownWorkspaceFileTarget.mockResolvedValue({
        worktree: { id: 'wt-other', path: join(dir, 'other') },
        executionHostId: LOCAL_EXECUTION_HOST_ID,
        relativePath: 'a.md'
      })

      await activeAccess().openLocalAbsoluteFile(file, undefined, { activeWorktreeId: 'wt-active' })

      expect(openFile).toHaveBeenCalledWith('wt-active', file, file, null, undefined)
    })

    it('keeps a file inside the active workspace on its relative path', async () => {
      const file = join(dir, 'repo', 'a.md')
      resolveKnownWorkspaceFileTarget.mockResolvedValue({
        worktree: { id: 'wt-active', path: join(dir, 'repo') },
        executionHostId: LOCAL_EXECUTION_HOST_ID,
        relativePath: 'a.md'
      })
      const files = activeAccess()
      // SAFETY: the existence check needs a real provider; only the routing is under test.
      // oxlint-disable-next-line typescript/consistent-type-assertions
      const internals = files as unknown as { assertOpenTargetIsFile: () => Promise<void> }
      vi.spyOn(internals, 'assertOpenTargetIsFile').mockResolvedValue()

      await files.openLocalAbsoluteFile(file, undefined, { activeWorktreeId: 'wt-active' })

      expect(openFile).toHaveBeenCalledWith('wt-active', file, 'a.md', null, undefined)
    })

    it('refuses a remote active workspace and a missing file without opening', async () => {
      const file = join(dir, 'graph.json')
      await writeFile(file, '{}')
      resolveRuntimeFileTarget.mockResolvedValue({
        worktree: { id: 'wt-ssh', path: '/srv/repo' },
        executionHostId: 'ssh:box'
      })
      await expect(
        activeAccess().openLocalAbsoluteFile(file, undefined, { activeWorktreeId: 'wt-ssh' })
      ).rejects.toThrow('the active workspace is not on this computer')

      resolveRuntimeFileTarget.mockResolvedValue({
        worktree: { id: 'wt-active', path: dir },
        executionHostId: LOCAL_EXECUTION_HOST_ID
      })
      await expect(
        activeAccess().openLocalAbsoluteFile(join(dir, 'gone.json'), undefined, {
          activeWorktreeId: 'wt-active'
        })
      ).rejects.toThrow('file not found: gone.json')
      expect(openFile).not.toHaveBeenCalled()
    })

    it('falls back to the floating route when the active workspace is the floating one', async () => {
      const file = join(dir, 'graph.json')
      await writeFile(file, '{}')

      await activeAccess().openLocalAbsoluteFile(file, undefined, {
        activeWorktreeId: FLOATING_TERMINAL_WORKTREE_ID
      })

      expect(openFile).toHaveBeenCalledWith(
        FLOATING_TERMINAL_WORKTREE_ID,
        file,
        'graph.json',
        null,
        undefined
      )
    })
  })
  describe('with a projectId', () => {
    const resolveRuntimeFileTarget = vi.fn()
    const createFolderWorkspace = vi.fn()
    const REPO = { id: 'repo-1', path: '/repos/one', kind: 'git' }
    let repos: unknown[]
    let groups: unknown[]
    let meta: Record<string, unknown>
    let folders: unknown[]
    let visited: Record<string, number>
    let file: string

    const projectAccess = (): RuntimeFileAccess =>
      // SAFETY: the open path touches only these host members.
      // oxlint-disable-next-line typescript/consistent-type-assertions
      new RuntimeFileAccess({
        openFile,
        resolveKnownWorkspaceFileTarget,
        resolveRuntimeFileTarget,
        createFolderWorkspace,
        requireStore: () => ({
          getRepos: () => repos,
          getProjectGroups: () => groups,
          getFolderWorkspaces: () => folders,
          getAllWorktreeMeta: () => meta,
          getWorkspaceSession: () => ({ lastVisitedAtByWorktreeId: visited })
        })
      } as never)
    const workspacesThatResolve = (...ids: string[]): void => {
      resolveRuntimeFileTarget.mockImplementation(async (selector: string) => {
        const id = selector.slice('id:'.length)
        if (!ids.includes(id)) {
          throw new Error('selector_not_found')
        }
        return { worktree: { id, path: join(dir, 'ws') }, executionHostId: LOCAL_EXECUTION_HOST_ID }
      })
    }

    beforeEach(async () => {
      repos = [REPO]
      groups = []
      folders = []
      meta = {}
      visited = {}
      file = join(dir, 'graph.json')
      await writeFile(file, '{}')
    })

    it('opens in the project workspace used most recently, as an outside-file tab', async () => {
      meta = {
        'repo-1::/a': { lastActivityAt: 10 },
        'repo-1::/b': { lastActivityAt: 20 },
        'repo-1::/c': { lastActivityAt: 5 },
        'repo-2::/z': { lastActivityAt: 99 }
      }
      visited = { 'local|repo-1::/c': 50 }
      workspacesThatResolve('repo-1::/a', 'repo-1::/b', 'repo-1::/c')

      const result = await projectAccess().openLocalAbsoluteFile(file, undefined, {
        projectId: 'repo-1',
        activeWorktreeId: 'wt-active'
      })

      // Why c wins: a visit at 50 outranks b's activity at 20.
      expect(openFile).toHaveBeenCalledWith('repo-1::/c', file, file, null, undefined)
      expect(result).toEqual({ worktree: 'repo-1::/c' })
    })

    it('skips an archived or vanished workspace and ends on the main checkout', async () => {
      meta = {
        'repo-1::/gone': { lastActivityAt: 90 },
        'repo-1::/old': { lastActivityAt: 80, isArchived: true }
      }
      const main = `repo-1::${REPO.path}`
      workspacesThatResolve('repo-1::/old', main)

      await projectAccess().openLocalAbsoluteFile(file, undefined, { projectId: 'repo-1' })

      expect(openFile).toHaveBeenCalledWith(main, file, file, null, undefined)
    })

    it('opens a folder project in its most recent folder workspace', async () => {
      repos = []
      groups = [{ id: 'group-1' }]
      folders = [
        { id: 'f1', projectGroupId: 'group-1', lastActivityAt: 5, isArchived: false },
        { id: 'f2', projectGroupId: 'group-1', lastActivityAt: 9, isArchived: false },
        { id: 'f3', projectGroupId: 'group-1', lastActivityAt: 99, isArchived: true },
        { id: 'f4', projectGroupId: 'group-2', lastActivityAt: 99, isArchived: false }
      ]
      workspacesThatResolve('folder:f1', 'folder:f2')

      await projectAccess().openLocalAbsoluteFile(file, undefined, { projectId: 'group-1' })

      expect(openFile).toHaveBeenCalledWith('folder:f2', file, file, null, undefined)
      expect(createFolderWorkspace).not.toHaveBeenCalled()
    })

    it('creates the folder workspace when a folder project has none', async () => {
      repos = []
      groups = [{ id: 'group-1' }]
      createFolderWorkspace.mockResolvedValue({ id: 'new' })
      workspacesThatResolve('folder:new')

      await projectAccess().openLocalAbsoluteFile(file, undefined, {
        projectId: 'group-1',
        activeWorktreeId: 'wt-active'
      })

      expect(createFolderWorkspace).toHaveBeenCalledWith({ projectGroupId: 'group-1' })
      expect(openFile).toHaveBeenCalledWith('folder:new', file, file, null, undefined)
    })

    it('falls to the active workspace when the project has no usable workspace', async () => {
      repos = []
      groups = [{ id: 'group-1' }]
      createFolderWorkspace.mockRejectedValue(new Error('folder_workspace_path_missing'))
      workspacesThatResolve('wt-active')

      await projectAccess().openLocalAbsoluteFile(file, undefined, {
        projectId: 'group-1',
        activeWorktreeId: 'wt-active'
      })

      expect(openFile).toHaveBeenCalledWith('wt-active', file, file, null, undefined)
    })

    it('falls to the floating workspace with no project workspace and no active one', async () => {
      repos = []
      groups = [{ id: 'group-1' }]
      createFolderWorkspace.mockRejectedValue(new Error('folder_workspace_path_missing'))
      workspacesThatResolve()

      await projectAccess().openLocalAbsoluteFile(file, undefined, { projectId: 'group-1' })

      expect(openFile).toHaveBeenCalledWith(
        FLOATING_TERMINAL_WORKTREE_ID,
        file,
        'graph.json',
        null,
        undefined
      )
    })

    it('refuses an unknown project and a remote project workspace without opening', async () => {
      workspacesThatResolve()
      await expect(
        projectAccess().openLocalAbsoluteFile(file, undefined, { projectId: 'nope' })
      ).rejects.toBeInstanceOf(UnknownProjectError)

      meta = { 'repo-1::/a': { lastActivityAt: 1 } }
      resolveRuntimeFileTarget.mockResolvedValue({
        worktree: { id: 'repo-1::/a', path: '/srv/repo' },
        executionHostId: 'ssh:box'
      })
      await expect(
        projectAccess().openLocalAbsoluteFile(file, undefined, { projectId: 'repo-1' })
      ).rejects.toThrow('the active workspace is not on this computer')
      expect(openFile).not.toHaveBeenCalled()
    })
  })
})

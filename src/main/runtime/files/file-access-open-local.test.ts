import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../shared/constants'
import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import { RuntimeFileAccess } from './file-access'

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
})

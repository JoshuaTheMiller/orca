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
})

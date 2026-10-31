import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPluginFolderPicker, type PluginFolderPickerDeps } from './plugin-folder-picker'

let root: string
let home: string
let outside: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'orca-picker-'))
  home = join(root, 'home')
  outside = join(root, 'elsewhere')
  mkdirSync(home)
  mkdirSync(outside)
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

function picker(overrides: Partial<PluginFolderPickerDeps> = {}) {
  const showFolderDialog = vi.fn().mockResolvedValue(null)
  const run = createPluginFolderPicker({
    isFocusedWorkspaceLocal: async () => true,
    showFolderDialog,
    homeDir: () => home,
    ...overrides
  })
  return { run, showFolderDialog }
}

describe('createPluginFolderPicker', () => {
  it('returns the chosen path and passes title and an existing defaultPath through', async () => {
    const { run, showFolderDialog } = picker()
    showFolderDialog.mockResolvedValue(outside)
    await expect(run({ pluginId: 'a.b', title: 'Pick', defaultPath: home })).resolves.toEqual({
      path: outside
    })
    expect(showFolderDialog).toHaveBeenCalledWith({ title: 'Pick', defaultPath: home })
  })

  it('returns null when the user cancels', async () => {
    const { run } = picker()
    await expect(run({ pluginId: 'a.b' })).resolves.toEqual({ path: null })
  })

  it('creates a missing defaultPath under home when createIfMissing is set', async () => {
    const { run, showFolderDialog } = picker()
    const target = join(home, 'notes', 'inbox')
    await run({ pluginId: 'a.b', defaultPath: target, createIfMissing: true })
    expect(existsSync(target)).toBe(true)
    expect(showFolderDialog).toHaveBeenCalledWith({ title: undefined, defaultPath: target })
  })

  it('refuses to create a missing defaultPath outside home', async () => {
    const { run, showFolderDialog } = picker()
    const target = join(outside, 'new')
    await expect(
      run({ pluginId: 'a.b', defaultPath: target, createIfMissing: true })
    ).rejects.toMatchObject({ code: 'not_permitted' })
    expect(existsSync(target)).toBe(false)
    expect(showFolderDialog).not.toHaveBeenCalled()
  })

  it('refuses a ".." path that climbs out of home', async () => {
    const { run } = picker()
    const target = join(home, '..', 'elsewhere', 'new')
    await expect(
      run({ pluginId: 'a.b', defaultPath: target, createIfMissing: true })
    ).rejects.toMatchObject({ code: 'not_permitted' })
    expect(existsSync(join(outside, 'new'))).toBe(false)
  })

  it('does not create a missing defaultPath without createIfMissing and falls back to its parent', async () => {
    const { run, showFolderDialog } = picker()
    const target = join(home, 'missing', 'deeper')
    await run({ pluginId: 'a.b', defaultPath: target })
    expect(existsSync(join(home, 'missing'))).toBe(false)
    expect(showFolderDialog).toHaveBeenCalledWith({ title: undefined, defaultPath: home })
  })

  it('rejects a second concurrent call from the same plugin only', async () => {
    const { run, showFolderDialog } = picker()
    let finish: (value: string | null) => void = () => undefined
    showFolderDialog.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    const first = run({ pluginId: 'a.b' })
    await expect(run({ pluginId: 'a.b' })).rejects.toMatchObject({ code: 'conflict' })
    await expect(run({ pluginId: 'c.d' })).resolves.toEqual({ path: null })
    finish(outside)
    await expect(first).resolves.toEqual({ path: outside })
    await expect(run({ pluginId: 'a.b' })).resolves.toEqual({ path: null })
  })

  it('releases the slot when the dialog throws', async () => {
    const { run, showFolderDialog } = picker()
    showFolderDialog.mockRejectedValueOnce(new Error('boom'))
    await expect(run({ pluginId: 'a.b' })).rejects.toThrow('boom')
    await expect(run({ pluginId: 'a.b' })).resolves.toEqual({ path: null })
  })

  it('refuses while a remote workspace is focused', async () => {
    const { run, showFolderDialog } = picker({ isFocusedWorkspaceLocal: async () => false })
    await expect(run({ pluginId: 'a.b' })).rejects.toMatchObject({ code: 'not_permitted' })
    expect(showFolderDialog).not.toHaveBeenCalled()
  })
})

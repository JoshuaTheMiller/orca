import { mkdir, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { PluginHostError } from '../workers/plugin-host-error'

export type PluginFolderPickerRequest = {
  pluginId: string
  title?: string
  defaultPath?: string
  createIfMissing?: boolean
}

export type PluginFolderPickerDeps = {
  /** False when the focused workspace lives on an SSH or paired host. */
  isFocusedWorkspaceLocal(): Promise<boolean>
  /** Orca's native folder picker; null when the user cancels. */
  showFolderDialog(options: { title?: string; defaultPath?: string }): Promise<string | null>
  homeDir?: () => string
}

async function isDirectory(target: string): Promise<boolean> {
  return stat(target).then(
    (info) => info.isDirectory(),
    () => false
  )
}

async function nearestExistingDirectory(target: string): Promise<string | null> {
  let current = target
  for (;;) {
    if (await isDirectory(current)) {
      return current
    }
    const parent = dirname(current)
    if (parent === current) {
      return null
    }
    current = parent
  }
}

function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/** Creates only the missing tail of `target`, and only when its real parent chain is inside home. */
async function createUnderHome(target: string, home: string): Promise<void> {
  const existing = await nearestExistingDirectory(target)
  if (!existing) {
    throw new PluginHostError('not_permitted', 'defaultPath cannot be created')
  }
  // Why realpath: a symlink under home must not carry the new folder outside it.
  const [realExisting, realHome] = await Promise.all([realpath(existing), realpath(home)])
  if (realExisting !== realHome && !isInside(realHome, realExisting)) {
    throw new PluginHostError(
      'not_permitted',
      'defaultPath can only be created under your home folder'
    )
  }
  await mkdir(target, { recursive: true })
}

async function resolveDefaultPath(
  request: PluginFolderPickerRequest,
  home: string
): Promise<string | undefined> {
  if (!request.defaultPath) {
    return undefined
  }
  const target = resolve(request.defaultPath)
  if (await isDirectory(target)) {
    return target
  }
  if (request.createIfMissing) {
    await createUnderHome(target, home)
    return target
  }
  // Why the nearest parent: the native dialog ignores a path that does not exist.
  return (await nearestExistingDirectory(target)) ?? undefined
}

/** Builds the `dialogs.pickFolder` implementation; one picker per plugin at a time. */
export function createPluginFolderPicker(
  deps: PluginFolderPickerDeps
): (request: PluginFolderPickerRequest) => Promise<{ path: string | null }> {
  const inFlight = new Set<string>()
  return async (request) => {
    if (inFlight.has(request.pluginId)) {
      throw new PluginHostError('conflict', 'a folder picker is already open for this plugin')
    }
    inFlight.add(request.pluginId)
    try {
      // Why local only: a native dialog browses this machine, not an SSH or paired host.
      if (!(await deps.isFocusedWorkspaceLocal())) {
        throw new PluginHostError(
          'not_permitted',
          'folder pickers are not available while a remote workspace is focused'
        )
      }
      const defaultPath = await resolveDefaultPath(request, (deps.homeDir ?? homedir)())
      return { path: await deps.showFolderDialog({ title: request.title, defaultPath }) }
    } finally {
      inFlight.delete(request.pluginId)
    }
  }
}

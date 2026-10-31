import { watch, type FSWatcher } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import {
  PLUGIN_PAGE_DOCUMENT_DEBOUNCE_MS,
  PLUGIN_PAGE_DOCUMENT_MAX_BYTES,
  type PluginPageDocumentResult
} from '../../../shared/plugins/frames/plugin-page-document-bridge'

export type PluginPageDirectoryWatch = { close: () => void }

type PluginPageDocumentWatchOptions = {
  /** Watches a directory and reports each entry name that changed (null when unknown). */
  watchDirectory?: (
    directory: string,
    onEntry: (name: string | null) => void,
    onError: () => void
  ) => PluginPageDirectoryWatch
  readDocument?: (path: string) => Promise<PluginPageDocumentResult>
}

type OpenWatch = {
  directoryWatch: PluginPageDirectoryWatch | null
  timer: ReturnType<typeof setTimeout> | null
  /** Rises per read so a slow older read never overwrites a newer one. */
  generation: number
  lastText: string | null
  closed: boolean
}

export async function readPluginPageDocument(path: string): Promise<PluginPageDocumentResult> {
  try {
    const entry = await stat(path)
    if (!entry.isFile()) {
      return { ok: false, reason: 'not_a_file' }
    }
    if (entry.size > PLUGIN_PAGE_DOCUMENT_MAX_BYTES) {
      return { ok: false, reason: 'too_large' }
    }
    const bytes = await readFile(path)
    // Why again: the file may have grown between the stat and the read.
    return bytes.byteLength > PLUGIN_PAGE_DOCUMENT_MAX_BYTES
      ? { ok: false, reason: 'too_large' }
      : { ok: true, text: bytes.toString('utf8') }
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined
    return {
      ok: false,
      reason: code === 'ENOENT' || code === 'ENOTDIR' ? 'not_found' : 'unreadable'
    }
  }
}

function watchDirectoryByName(
  directory: string,
  onEntry: (name: string | null) => void,
  onError: () => void
): PluginPageDirectoryWatch {
  let watcher: FSWatcher
  try {
    watcher = watch(directory, { persistent: false }, (_event, name) =>
      onEntry(name === null ? null : String(name))
    )
  } catch {
    onError()
    return { close: () => undefined }
  }
  watcher.on('error', onError)
  return { close: () => watcher.close() }
}

// Why case-folded off Linux: Windows and default macOS volumes report a file under any casing.
const FOLD_NAMES = process.platform !== 'linux'

function watchKey(ownerKey: string, instanceId: string): string {
  return `${ownerKey}\u0000${instanceId}`
}

/**
 * Pages opened with a file watch exactly that file while they are open: one watch per page
 * instance, closed with the page or its window. The parent directory is watched and filtered by
 * name, so an atomic replace (write a temp file, rename over the target) and a delete followed by
 * a re-create both arrive as events for the target's name.
 */
export class PluginPageDocumentWatches {
  private readonly watches = new Map<string, OpenWatch>()
  private readonly watchDirectory: NonNullable<PluginPageDocumentWatchOptions['watchDirectory']>
  private readonly readDocument: NonNullable<PluginPageDocumentWatchOptions['readDocument']>

  constructor(options: PluginPageDocumentWatchOptions = {}) {
    this.watchDirectory = options.watchDirectory ?? watchDirectoryByName
    this.readDocument = options.readDocument ?? readPluginPageDocument
  }

  get size(): number {
    return this.watches.size
  }

  /** Reads the file now, then reports each later change until closed or replaced. */
  async open(
    ownerKey: string,
    instanceId: string,
    path: string,
    onUpdate: (result: PluginPageDocumentResult) => void
  ): Promise<PluginPageDocumentResult> {
    const key = watchKey(ownerKey, instanceId)
    // Why replace: one watched file per open page, so reopening on another file drops the first.
    this.closeKey(key)
    const state: OpenWatch = {
      directoryWatch: null,
      timer: null,
      generation: 0,
      lastText: null,
      closed: false
    }
    this.watches.set(key, state)
    const target = FOLD_NAMES ? basename(path).toLowerCase() : basename(path)
    const refresh = async (): Promise<void> => {
      const generation = ++state.generation
      const result = await this.readDocument(path)
      if (state.closed || generation !== state.generation) {
        return
      }
      if (result.ok) {
        if (result.text === state.lastText) {
          return
        }
        state.lastText = result.text
      } else {
        state.lastText = null
      }
      onUpdate(result)
    }
    const schedule = (): void => {
      if (state.timer !== null) {
        clearTimeout(state.timer)
      }
      state.timer = setTimeout(() => {
        state.timer = null
        void refresh()
      }, PLUGIN_PAGE_DOCUMENT_DEBOUNCE_MS)
    }
    state.directoryWatch = this.watchDirectory(
      dirname(path),
      (name) => {
        if (name === null || (FOLD_NAMES ? name.toLowerCase() : name) === target) {
          schedule()
        }
      },
      () => {
        if (!state.closed) {
          this.closeKey(key)
          onUpdate({ ok: false, reason: 'unreadable' })
        }
      }
    )
    // Why after the watch: a change between the read and the watch would otherwise be missed.
    const generation = ++state.generation
    const initial = await this.readDocument(path)
    if (!state.closed && generation === state.generation) {
      state.lastText = initial.ok ? initial.text : null
    }
    return initial
  }

  close(ownerKey: string, instanceId: string): void {
    this.closeKey(watchKey(ownerKey, instanceId))
  }

  /** Every page of a window that went away. */
  closeOwner(ownerKey: string): void {
    const prefix = `${ownerKey}\u0000`
    for (const key of this.watches.keys()) {
      if (key.startsWith(prefix)) {
        this.closeKey(key)
      }
    }
  }

  dispose(): void {
    for (const key of this.watches.keys()) {
      this.closeKey(key)
    }
  }

  private closeKey(key: string): void {
    const state = this.watches.get(key)
    if (!state) {
      return
    }
    this.watches.delete(key)
    state.closed = true
    if (state.timer !== null) {
      clearTimeout(state.timer)
    }
    state.directoryWatch?.close()
  }
}

import { mkdtemp, mkdir, rm, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PLUGIN_PAGE_DOCUMENT_DEBOUNCE_MS,
  PLUGIN_PAGE_DOCUMENT_MAX_BYTES,
  type PluginPageDocumentResult
} from '../../../shared/plugins/frames/plugin-page-document-bridge'
import { PluginPageDocumentWatches, readPluginPageDocument } from './plugin-page-document-watch'

const FILE = '/notes/today.txt'

type FakeFs = {
  files: Map<string, string>
  read: (path: string) => Promise<PluginPageDocumentResult>
}

function createFakeFs(initial: Record<string, string> = {}): FakeFs {
  const files = new Map(Object.entries(initial))
  return {
    files,
    read: async (path) => {
      const text = files.get(path)
      return text === undefined ? { ok: false, reason: 'not_found' } : { ok: true, text }
    }
  }
}

function createFakeWatcher() {
  const watches: {
    directory: string
    emit: (name: string | null) => void
    fail: () => void
    closed: boolean
  }[] = []
  return {
    watches,
    watchDirectory: (
      directory: string,
      onEntry: (name: string | null) => void,
      onError: () => void
    ) => {
      const watch = { directory, emit: onEntry, fail: onError, closed: false }
      watches.push(watch)
      return {
        close: () => {
          watch.closed = true
        }
      }
    }
  }
}

function setup(initial: Record<string, string> = { [FILE]: 'one' }) {
  const fs = createFakeFs(initial)
  const watcher = createFakeWatcher()
  const watches = new PluginPageDocumentWatches({
    watchDirectory: watcher.watchDirectory,
    readDocument: fs.read
  })
  const updates: PluginPageDocumentResult[] = []
  return {
    fs,
    watcher,
    watches,
    updates,
    onUpdate: (r: PluginPageDocumentResult) => updates.push(r)
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('PluginPageDocumentWatches', () => {
  it('reads the file, then watches only its parent directory by name', async () => {
    const { watches, watcher, updates, onUpdate } = setup()
    await expect(watches.open('w1', 'p1', FILE, onUpdate)).resolves.toEqual({
      ok: true,
      text: 'one'
    })
    expect(watcher.watches.map((watch) => watch.directory)).toEqual(['/notes'])
    expect(watches.size).toBe(1)

    // A sibling file never causes a read.
    watcher.watches[0]!.emit('other.txt')
    await vi.advanceTimersByTimeAsync(PLUGIN_PAGE_DOCUMENT_DEBOUNCE_MS * 2)
    expect(updates).toEqual([])
  })

  it('pushes a new version once after a burst of events, 200 ms after the last one', async () => {
    const { watches, watcher, fs, updates, onUpdate } = setup()
    await watches.open('w1', 'p1', FILE, onUpdate)

    fs.files.set(FILE, 'two')
    watcher.watches[0]!.emit('today.txt')
    await vi.advanceTimersByTimeAsync(150)
    watcher.watches[0]!.emit('today.txt')
    await vi.advanceTimersByTimeAsync(150)
    // Still inside the quiet period measured from the second event.
    expect(updates).toEqual([])
    await vi.advanceTimersByTimeAsync(PLUGIN_PAGE_DOCUMENT_DEBOUNCE_MS - 150)
    expect(updates).toEqual([{ ok: true, text: 'two' }])
  })

  it('follows an atomic replace: temp file written, renamed over the target', async () => {
    const { watches, watcher, fs, updates, onUpdate } = setup()
    await watches.open('w1', 'p1', FILE, onUpdate)

    // The editor writes a sibling temp file first, then renames it onto the watched name.
    fs.files.set('/notes/.today.txt.tmp', 'three')
    watcher.watches[0]!.emit('.today.txt.tmp')
    fs.files.set(FILE, fs.files.get('/notes/.today.txt.tmp')!)
    fs.files.delete('/notes/.today.txt.tmp')
    watcher.watches[0]!.emit('today.txt')
    await vi.advanceTimersByTimeAsync(PLUGIN_PAGE_DOCUMENT_DEBOUNCE_MS)
    expect(updates).toEqual([{ ok: true, text: 'three' }])

    // The same watch still reports the next change; nothing was rebound or lost.
    fs.files.set(FILE, 'four')
    watcher.watches[0]!.emit('today.txt')
    await vi.advanceTimersByTimeAsync(PLUGIN_PAGE_DOCUMENT_DEBOUNCE_MS)
    expect(updates.at(-1)).toEqual({ ok: true, text: 'four' })
    expect(watcher.watches).toHaveLength(1)
  })

  it('reports a delete and a re-create of the file', async () => {
    const { watches, watcher, fs, updates, onUpdate } = setup()
    await watches.open('w1', 'p1', FILE, onUpdate)

    fs.files.delete(FILE)
    watcher.watches[0]!.emit('today.txt')
    await vi.advanceTimersByTimeAsync(PLUGIN_PAGE_DOCUMENT_DEBOUNCE_MS)
    expect(updates).toEqual([{ ok: false, reason: 'not_found' }])

    fs.files.set(FILE, 'back')
    watcher.watches[0]!.emit('today.txt')
    await vi.advanceTimersByTimeAsync(PLUGIN_PAGE_DOCUMENT_DEBOUNCE_MS)
    expect(updates.at(-1)).toEqual({ ok: true, text: 'back' })
  })

  it('skips an event that left the content unchanged', async () => {
    const { watches, watcher, updates, onUpdate } = setup()
    await watches.open('w1', 'p1', FILE, onUpdate)
    watcher.watches[0]!.emit('today.txt')
    await vi.advanceTimersByTimeAsync(PLUGIN_PAGE_DOCUMENT_DEBOUNCE_MS)
    expect(updates).toEqual([])
  })

  it('drops a slow older read in favor of a newer one', async () => {
    const watcher = createFakeWatcher()
    const pending: ((result: PluginPageDocumentResult) => void)[] = []
    let calls = 0
    const watches = new PluginPageDocumentWatches({
      watchDirectory: watcher.watchDirectory,
      readDocument: () => {
        calls += 1
        return calls === 1
          ? Promise.resolve({ ok: true, text: 'one' })
          : new Promise((resolve) => pending.push(resolve))
      }
    })
    const updates: PluginPageDocumentResult[] = []
    await watches.open('w1', 'p1', FILE, (result) => updates.push(result))

    watcher.watches[0]!.emit('today.txt')
    await vi.advanceTimersByTimeAsync(PLUGIN_PAGE_DOCUMENT_DEBOUNCE_MS)
    watcher.watches[0]!.emit('today.txt')
    await vi.advanceTimersByTimeAsync(PLUGIN_PAGE_DOCUMENT_DEBOUNCE_MS)
    expect(pending).toHaveLength(2)

    pending[1]!({ ok: true, text: 'newest' })
    await vi.advanceTimersByTimeAsync(0)
    pending[0]!({ ok: true, text: 'stale' })
    await vi.advanceTimersByTimeAsync(0)
    expect(updates).toEqual([{ ok: true, text: 'newest' }])
  })

  it('releases the watch and pending read when the page closes', async () => {
    const { watches, watcher, fs, updates, onUpdate } = setup()
    await watches.open('w1', 'p1', FILE, onUpdate)
    fs.files.set(FILE, 'late')
    watcher.watches[0]!.emit('today.txt')

    watches.close('w1', 'p1')
    expect(watcher.watches[0]!.closed).toBe(true)
    expect(watches.size).toBe(0)
    await vi.advanceTimersByTimeAsync(PLUGIN_PAGE_DOCUMENT_DEBOUNCE_MS * 2)
    expect(updates).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps one watched file per page, replacing it when the page opens another', async () => {
    const { watches, watcher, updates, onUpdate } = setup({ [FILE]: 'one', '/other/b.txt': 'b' })
    await watches.open('w1', 'p1', FILE, onUpdate)
    await watches.open('w1', 'p1', '/other/b.txt', onUpdate)
    expect(watches.size).toBe(1)
    expect(watcher.watches.map((watch) => watch.closed)).toEqual([true, false])
    expect(watcher.watches[1]!.directory).toBe('/other')
    expect(updates).toEqual([])
  })

  it('releases every page of a window that goes away, and only that window', async () => {
    const { watches, watcher, onUpdate } = setup()
    await watches.open('w1', 'p1', FILE, onUpdate)
    await watches.open('w1', 'p2', FILE, onUpdate)
    await watches.open('w2', 'p1', FILE, onUpdate)

    watches.closeOwner('w1')
    expect(watcher.watches.map((watch) => watch.closed)).toEqual([true, true, false])
    expect(watches.size).toBe(1)
    watches.dispose()
    expect(watcher.watches.every((watch) => watch.closed)).toBe(true)
  })

  it('reports a failed directory watch and stops watching', async () => {
    const { watches, watcher, updates, onUpdate } = setup()
    await watches.open('w1', 'p1', FILE, onUpdate)
    watcher.watches[0]!.fail()
    expect(updates).toEqual([{ ok: false, reason: 'unreadable' }])
    expect(watches.size).toBe(0)
    expect(watcher.watches[0]!.closed).toBe(true)
  })

  it('returns the initial failure for a missing file but keeps watching for it to appear', async () => {
    const { watches, watcher, fs, updates, onUpdate } = setup({})
    await expect(watches.open('w1', 'p1', FILE, onUpdate)).resolves.toEqual({
      ok: false,
      reason: 'not_found'
    })
    fs.files.set(FILE, 'created')
    watcher.watches[0]!.emit('today.txt')
    await vi.advanceTimersByTimeAsync(PLUGIN_PAGE_DOCUMENT_DEBOUNCE_MS)
    expect(updates).toEqual([{ ok: true, text: 'created' }])
  })
})

describe('readPluginPageDocument', () => {
  const roots: string[] = []
  afterEach(async () => {
    vi.useRealTimers()
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
  })

  async function root(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'orca-page-document-'))
    roots.push(directory)
    return directory
  }

  it('reads text, and reports a missing file, a directory and an oversized file', async () => {
    const directory = await root()
    await writeFile(join(directory, 'a.txt'), 'héllo')
    await mkdir(join(directory, 'folder'))
    await writeFile(join(directory, 'big.bin'), '')
    await truncate(join(directory, 'big.bin'), PLUGIN_PAGE_DOCUMENT_MAX_BYTES + 1)

    await expect(readPluginPageDocument(join(directory, 'a.txt'))).resolves.toEqual({
      ok: true,
      text: 'héllo'
    })
    await expect(readPluginPageDocument(join(directory, 'missing.txt'))).resolves.toEqual({
      ok: false,
      reason: 'not_found'
    })
    await expect(readPluginPageDocument(join(directory, 'folder'))).resolves.toEqual({
      ok: false,
      reason: 'not_a_file'
    })
    await expect(readPluginPageDocument(join(directory, 'big.bin'))).resolves.toEqual({
      ok: false,
      reason: 'too_large'
    })
  })
})

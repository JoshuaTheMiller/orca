// Sample plugin runs in a lazily forked plain-Node worker; its default export receives commands, events and capability-gated host API.
import { fileURLToPath } from 'node:url'

export default function activate(orca) {
  // pages.open shows a page the manifest declares; with a path, the page gets that file as a
  // read-only document and live updates while it stays open. Edit notes.txt to watch it change.
  orca.commands.register('hello-open-notes', async () => {
    const path = fileURLToPath(new URL('./notes.txt', import.meta.url))
    await orca.host.call('pages.open', { pageId: 'notes', path })
    return 'Opened the notes page.'
  })

  orca.commands.register('hello-ping', async () => {
    const stored = await orca.host.call('storage.get', { key: 'pings' })
    const count = (typeof stored?.value === 'number' ? stored.value : 0) + 1
    await orca.host.call('storage.set', { key: 'pings', value: count })
    // A string result is shown as-is in Orca; objects are shown as JSON.
    return count === 1 ? 'Pong! First ping.' : `Pong! ${count} pings so far.`
  })

  orca.events.on('workspace.created', async (payload) => {
    orca.log(`${payload.kind} created: ${payload.workspaceId} at ${payload.path}`)
    await orca.host.call('notifications.show', {
      title: 'Workspace created',
      body: payload.path
    })
  })

  orca.events.on('agent.status.changed', (payload) => {
    orca.log(`agent status: ${payload.state} in ${payload.workspaceId ?? 'unknown workspace'}`)
  })
}

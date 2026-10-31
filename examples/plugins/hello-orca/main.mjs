// Sample plugin runs in a lazily forked plain-Node worker; its default export receives commands, events and capability-gated host API.
export default async function activate(orca) {
  // Declared settings come back with their defaults applied; the user edits them in the plugin's page in Settings.
  let excited = (await orca.host.call('settings.get')).settings.excited === true
  orca.events.on('settings.changed', ({ key, value }) => {
    if (key === 'excited') {
      excited = value === true
    }
  })

  orca.commands.register('hello-ping', async () => {
    const stored = await orca.host.call('storage.get', { key: 'pings' })
    const count = (typeof stored?.value === 'number' ? stored.value : 0) + 1
    await orca.host.call('storage.set', { key: 'pings', value: count })
    // A string result is shown as-is in Orca; objects are shown as JSON.
    const ending = excited ? '!!!' : '.'
    return count === 1 ? `Pong! First ping${ending}` : `Pong! ${count} pings so far${ending}`
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

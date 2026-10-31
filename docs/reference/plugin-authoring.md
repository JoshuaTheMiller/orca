# Writing an Orca plugin

From an empty folder to a plugin anyone can install from a catalog. The field-by-field rules
live in the generated references: [manifest](plugin-manifest.md), [catalog](plugin-catalog.md),
[host API](plugin-host-api.md), [themes](plugin-themes.md) and [theme tokens](plugin-theme-tokens.md),
[syntaxes](plugin-syntax.md). Listed plugins must follow the
[plugin listing policy](plugin-listing-policy.md).

## 1. Write

A plugin is a folder (in practice its own Git repository) with `orca-plugin.json` at the root.
Start from `examples/plugins/orca-gleam-syntax`, which carries the JSON Schema for editor
completion, or from one of:

| Example                              | Execution        | Shows                                                                      |
| ------------------------------------ | ---------------- | -------------------------------------------------------------------------- |
| `examples/plugins/orca-gleam-syntax` | `data`           | A syntax, no code                                                          |
| `examples/plugins/hello-orca`        | `trusted-worker` | A panel, a page, a worker command, sidebar nav items, a setting and events |

Leave `publisher` out. Orca names the publisher after where the plugin comes from, the way a
[Go module path](https://go.dev/ref/mod#module-path) is its repository path: the owner of the
repository, lowercased (`acme` for `github.com/Acme/gleam-syntax`), so the plugin installs as
`acme.gleam-syntax`. Nobody can choose a publisher name that is not theirs.

| Installed from                    | Publisher                                                    |
| --------------------------------- | ------------------------------------------------------------ |
| The official or community catalog | the repository owner, set by the catalog in the entry's `id` |
| Another catalog                   | whatever that catalog's entry `id` says                      |
| A Git URL                         | the URL's owner (`.` and `_` become `-`)                     |
| A local or development folder     | `local`                                                      |

`publisher` is deprecated: Orca ignores it for catalog and Git installs. Leaving it out needs
`engines.orca` of at least `>=1.4.246`, because older Orca requires the field and refuses a
value that differs from the catalog's. To keep supporting older Orca, keep `publisher` and set it
to the repository owner; `validate:plugin` warns about it either way. An install made before
1.4.246 keeps its key, approvals and data. A local or development folder that still declares
`publisher` keeps using it until you remove it.

When copying the Gleam example, also drop its `stablyai` publisher and `orca-` id prefix: both are
reserved for Orca's own plugins, as are owners named `official`, `anthropic`, `openai`, `github`
or starting with `orca`.

Pick the lowest `execution` profile that covers what you contribute; it decides what the user is
asked to approve:

- `data`: themes, terminal themes, icon themes, syntaxes, translations. Installs in one click.
- `declarative`: commands that run Orca actions, shortcuts, sidebar nav items, VM recipes. Reviewed before they
  are enabled.
- `sandboxed-ui`: panels, pages and custom editors, in a sandboxed frame that talks to Orca only
  through `window.orca` (see [Frames](#frames-windoworca)) and can call only the host methods
  whose surfaces list `panel`, `editor` or `page`.
  Orca's colors reach frame CSS as `--orca-background`, `--orca-foreground`, `--orca-primary`
  and the rest of its panel token set, so they never collide with a frame's own variables.
- `trusted-worker`: `main` runs in a separate Node process and can call every host method its
  `capabilities` allow. There is no global switch for these full-access plugins: each one runs
  only after the user approves it on install. An enterprise policy to block full-access plugins
  may come later.

Set `engines.orca` to the newest `Since` of any field you use, and `pluginApi` (currently `1`)
only when a panel or worker calls the host API.

### Frames: `window.orca`

Before any plugin code runs, the frame shell defines a frozen `window.orca`. It is the only
supported way to talk to Orca; the messages underneath are internal and change without notice.

```js
orca.api // { major: 1, minor: 1 }: the host API this Orca implements
if (orca.host.has('workspace.readContext')) {
  // Synchronous: is the method offered to this surface by this Orca?
  const controller = new AbortController()
  try {
    const context = await orca.host.call('workspace.readContext', {}, { signal: controller.signal })
  } catch (error) {
    // error.code, error.message, error.retryable, error.retryAfterMs (rate_limited only)
  }
}
const subscription = orca.on('theme', ({ colorScheme }) => {})
subscription.dispose()
```

Methods, their surfaces and their errors are in the [host API reference](plugin-host-api.md).
Aborting the `signal` rejects the call with `cancelled`. Treat an error `code` you do not know as
`action_failed`. Params are strict: a field the running Orca does not know is refused with
`invalid_params`, so check `orca.host.has` or `orca.api.minor` before using a newer one.

Workers get the same calls on the `orca` object passed to `activate(orca)`:
`orca.api`, `orca.host.call(method, params, { signal })`, `orca.host.has(method)`, plus
`orca.commands.register(id, (args, { signal }) => …)` and `orca.events.on(event, handler)`, which
both return `{ dispose() }`. A command's `signal` aborts when Orca stops waiting for it. In
`agent.status.changed`, `state` and `mainAgent.state` are one of `working`, `blocked`, `waiting`
and `done`.

### Sidebar nav items

`contributes.sidebarNavItems` adds entries (at most 8) to the left sidebar's nav list, under
Search and beside Tasks and Automations. An entry's `kind` is one of:

- `command` (the default): `{ id, title, icon?, command }`. `icon` comes from the same closed set
  as panel icons (default `plug`), and `command` must be the id of one of the plugin's own
  `contributes.commands`, which Orca checks when it reads the manifest. A click runs that command
  exactly as the command palette does, so it can be a built-in action or a worker command.
- `toggle`: a switch. `{ id, title, icon?, kind: "toggle", setting, default? }`.
- `checkbox`: a checkbox with the same fields.

A toggle or checkbox holds a boolean named by `setting` (kebab-case, unique among the plugin's
items; `default` is `false` unless given) and takes no `command`; a command item takes no
`setting` or `default`. Clicking anywhere on the row flips the value, and Orca keeps it in the
user's settings. Any item may name a `toggle` of the same plugin as its `parent`: it then shows
indented under that toggle, and only while the toggle is on. A parent must be a toggle that has no
parent of its own (one level of nesting), and a parent that is missing, not a toggle, or itself
nested is a manifest error. Right-click an entry to hide it from the sidebar; hiding a toggle
hides its children too. Items show only while the plugin is enabled.

Any item may also carry `when`, the id of a `boolean` entry in the same plugin's
[`contributes.settings`](#settings) (below). It shows only while that setting is true and appears or
disappears the moment the user changes it. A child of a toggle needs both its toggle and its own
`when`. A `when` that names no setting, or a setting that is not a boolean, is a manifest error
(host 1.4.249 or later).

```json
{
  "contributes": {
    "commands": [{ "id": "graph.open", "title": "Graph: Open" }],
    "sidebarNavItems": [
      { "id": "graph", "title": "Graph", "icon": "database", "command": "graph.open" },
      { "id": "details", "title": "Details", "kind": "toggle", "setting": "show-details" },
      {
        "id": "details-open",
        "title": "Open details",
        "icon": "database",
        "command": "graph.open",
        "parent": "details"
      },
      {
        "id": "details-labels",
        "title": "Show labels",
        "kind": "checkbox",
        "setting": "show-labels",
        "default": true,
        "parent": "details"
      }
    ]
  }
}
```

A plugin reads its values with `sidebarNav.getValues` (host API 1.2), which needs the
`settings:own` capability because the values are the plugin's own settings. It answers
`{ values: { "show-details": false, "show-labels": true } }`, defaults applied, from a worker,
panel or custom editor. A worker with `main` and a `sidebarNav.valueChanged` entry in
`contributes.events` (also `settings:own`) is told when the user flips one:

```js
const { values } = await orca.host.call('sidebarNav.getValues')
orca.events.on('sidebarNav.valueChanged', ({ setting, value }) => {
  // Only this plugin's own settings arrive; a flip back to the same value sends nothing.
})
```

### Settings

`contributes.settings` declares typed settings (at most 32) that Orca shows in its own Settings,
on the plugin's page under the plugin list, while the plugin is enabled. It needs only the
`declarative` execution profile; reading a value from code needs `settings:own` and a surface that
can call the host API. Each entry is `{ id, title, description?, type, default, options?, maxLength? }`:

- `boolean`: a switch. `default` is `true` or `false`.
- `string`: a text field. `default` is a string; `maxLength` (default 200, at most 1000) bounds it.
- `enum`: a menu. `options` is 2 to 20 `{ value, label }` entries with distinct values, and `default`
  must be one of the values.

```json
{
  "engines": { "orca": ">=1.4.249" },
  "contributes": {
    "commands": [{ "id": "graph.open", "title": "Graph: Open" }],
    "settings": [
      { "id": "show-graph", "title": "Show the graph entry", "type": "boolean", "default": true },
      {
        "id": "layout",
        "title": "Layout",
        "description": "How nodes are arranged.",
        "type": "enum",
        "default": "tree",
        "options": [
          { "value": "tree", "label": "Tree" },
          { "value": "radial", "label": "Radial" }
        ]
      }
    ],
    "sidebarNavItems": [
      {
        "id": "graph",
        "title": "Graph",
        "icon": "database",
        "command": "graph.open",
        "when": "show-graph"
      }
    ]
  },
  "capabilities": [{ "kind": "settings:own" }]
}
```

Values live in the same per-plugin store as `settings.set`, so declared and untyped settings sit
together. The user edits them in Settings (a changed value is saved at once, and **Reset** restores
the default). A code path reads them with `settings.get`, which now answers from a worker, panel or
custom editor (host API 1.4) and returns the declared defaults merged with stored values:

```js
const { settings } = await orca.host.call('settings.get') // { "show-graph": true, "layout": "tree" }
await orca.host.call('settings.set', { key: 'layout', value: 'radial' }) // worker only
orca.events.on('settings.changed', ({ key, value }) => {
  // Fired for a change from Settings or from settings.set, for this plugin only.
})
```

`settings.set` on a declared key must match its type (and options, and `maxLength`); otherwise it
fails with `invalid_params`. Keys that are not declared stay free-form JSON. A stored value that no
longer fits its declaration (an update removed an option) reads as the default. `settings.changed`
needs a worker with `main`, a `settings.changed` entry in `contributes.events` and `settings:own`,
and carries the value now in force; resetting to the default delivers the default. A new setting
is not extra access: it holds no authority, and the plugin can read it only through
`settings:own`, so an update that adds settings keeps its approval.

### Sidebar cards

`contributes.sidebarCards` adds alternative views (at most 4) to the left sidebar. When at least
one card is available, the title in the sidebar header becomes a small menu that switches the
body between **Projects** and each card's title; the choice lasts until the window reloads, and
the sidebar returns to Projects if the card goes away (the plugin is turned off, or its `when`
turns false). A card needs a worker: it requires `main` and the `trusted-worker` execution
profile, because its rows come from the worker. Each entry is `{ id, title, icon?, emptyText?, when? }`:

- `id`: kebab-case, unique among the plugin's cards.
- `title`: up to 32 characters, shown in the switcher.
- `icon`: from the same closed set as panel icons (default `plug`).
- `emptyText`: shown while the worker has set no rows.
- `when`: the id of a `boolean` entry in the same plugin's [`contributes.settings`](#settings).
  The card is offered only while that setting is true. A `when` that names no setting, or one that
  is not a boolean, is a manifest error.

The worker fills the card with `sidebarCards.setItems` (host API 1.5), which replaces all rows of
one of the plugin's own cards and answers `{ ok: true }`:

| Row field   | Meaning                                                                                                                                                                                                                                                                                                                                |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`        | Unique among the rows, up to 256 characters.                                                                                                                                                                                                                                                                                           |
| `title`     | The row's main line, up to 160 characters.                                                                                                                                                                                                                                                                                             |
| `subtitle?` | A quieter second line, up to 240 characters.                                                                                                                                                                                                                                                                                           |
| `badges?`   | Up to 4 `{ label, tone? }`; `label` is up to 24 characters and `tone` is `neutral` (default), `info`, `warning`, `danger` or `success`.                                                                                                                                                                                                |
| `icon?`     | An icon from the panel icon set.                                                                                                                                                                                                                                                                                                       |
| `action?`   | What a click does: `{ kind: "command", command, args? }` runs one of the plugin's own commands (worker commands receive `args`, up to 4096 bytes of JSON), or `{ kind: "openFile", path, placement? }` opens an absolute path like `editor.openFile` and needs the `editor:open` capability. A row without an action is not clickable. |

A card holds at most 500 rows; one past that, or a repeated row id, an unknown field or an
over-long string, fails the whole call with `invalid_params`. Orca keeps the rows last set in
memory, per plugin and card, so reopening a card shows them at once; they are dropped when the
plugin is disabled or removed. A card with more than 100 rows renders only the rows in view.
Calling `setItems` for a card the plugin did not declare fails with `invalid_params`. A click on
an `openFile` row from a plugin without `editor:open` is refused with a toast, and a successful
open is recorded in the audit log like any `editor.openFile` call.

`sidebarCards.setItems` is worker only and needs **no capability**. Declaring the card is the
grant: the user approves it with the plugin like any other contribution, the rows are held in
memory and shown only inside that card, and nothing the user owns changes. Adding a card in an
update counts as new access, like a new panel, so the update asks for review again; renaming one
does not.

A worker learns when the user is looking at a card. Subscribe with a
`sidebarCards.visibilityChanged` entry in `contributes.events` (it needs no capability, only a
declared card) and it receives `{ cardId, visible }` when the first window shows the card
(`visible: true`) and when no window shows it any more (`visible: false`). Only the owning plugin
is told. Showing a card starts the plugin's worker if it is not running, even if the plugin did
not subscribe, and a worker is never stopped for being idle while one of its cards is shown.

```json
{
  "engines": { "orca": ">=1.4.250" },
  "main": "main.mjs",
  "contributes": {
    "commands": [{ "id": "issues.open", "title": "Issues: Open" }],
    "settings": [
      { "id": "show-issues", "title": "Show the Issues view", "type": "boolean", "default": false }
    ],
    "sidebarCards": [
      {
        "id": "issues",
        "title": "Issues",
        "icon": "bug",
        "emptyText": "No open issues.",
        "when": "show-issues"
      }
    ],
    "events": [{ "on": "sidebarCards.visibilityChanged" }]
  },
  "capabilities": [{ "kind": "editor:open" }]
}
```

```js
export default async function activate(orca) {
  async function refresh() {
    const issues = await fetchOpenIssues() // the plugin's own code
    await orca.host.call('sidebarCards.setItems', {
      cardId: 'issues',
      items: issues.map((issue) => ({
        id: String(issue.number),
        title: issue.title,
        subtitle: `#${issue.number} opened by ${issue.author}`,
        badges: issue.labels.slice(0, 2).map((label) => ({ label, tone: 'info' })),
        action: { kind: 'command', command: 'issues.open', args: { number: issue.number } }
      }))
    })
  }
  orca.commands.register('issues.open', async (args) => {
    /* open the issue */
  })
  // Rows stay in Orca while the card is closed, so refresh only when the user comes back to it.
  orca.events.on('sidebarCards.visibilityChanged', ({ cardId, visible }) => {
    if (cardId === 'issues' && visible) {
      void refresh()
    }
  })
}
```

### Project items

`contributes.projectItems` adds rows (at most 4) to the left sidebar's Projects list. Each row
appears as the **first child of every top-level project**, git repo or folder project alike, above its workspaces, styled like the other child
rows and showing only a title (no badges). It needs the `declarative` execution profile or higher
and engine `>=1.4.251`.

```json
{
  "contributes": {
    "commands": [{ "id": "board.open", "title": "Board: Open" }],
    "settings": [
      { "id": "show-board", "title": "Show board", "type": "boolean", "default": true },
      { "id": "board-name", "title": "Board name", "type": "string", "default": "Board" }
    ],
    "projectItems": [
      {
        "id": "open-board",
        "title": "Board",
        "icon": "database",
        "command": "board.open",
        "titleSetting": "board-name",
        "when": "show-board"
      }
    ]
  }
}
```

- `command` is required and must be one of the plugin's own `contributes.commands`. Clicking the row
  runs it as the command palette would; a workspace-scoped command (`when: "workspace"`) leaves the
  row disabled while no workspace is focused.
- `when` is the id of a `boolean` setting, exactly as on nav items: the row shows only while it is true.
- `titleSetting` is the id of a `string` setting. While it holds text, that text is the row's default
  title, updating live; an empty value falls back to `title`.
- `icon` is one of the panel icons and defaults to `plug`.

The command receives this argument (a worker handler gets it as its first parameter):

```js
orca.commands.register('board.open', async ({ project, itemTitle }) => {
  // project: { id, name, paths, hostId }
  //   id      the project's id in Orca
  //   name    the name Orca shows for the project
  //   paths   absolute paths on this machine (the repo root or folder); [] when the project lives
  //           on an SSH or runtime host, because a remote path means nothing to a local worker
  //   hostId  'local', 'ssh:<target>' or 'runtime:<id>'
  // itemTitle: the row's title as the user sees it (a rename wins over titleSetting over title)
})
```

A command that maps to a built-in action (`action`) takes no arguments, so it ignores these.

**Where rows appear.** Rows exist only where project headers do: the sidebar grouped by project.
Every top-level project line gets them, whether it is a git repo project or a folder project (a
non-git folder that can hold its own folder workspace and the repo projects Orca found inside it).
Projects nested inside a folder project, and nested folders, get none. They follow the header
through the sidebar's filters and search (a project the filter hides shows no rows, and the rows
never count toward a match), stay visible while the project line is collapsed as a quick way in,
and sit inside the virtualized list, so a long list costs nothing extra. A project with no
workspaces still shows them. For a folder project, `project.id` is the folder's project group id,
`name` the label Orca shows, and `paths` its folder path (`[]` when it lives on a remote host or has
no path).

**User control.** Right-click a row for **Rename…** (a name for that one project's row, kept on
this computer under the plugin, item and project; **Reset name** removes it) and **Hide from
sidebar** (hides the item under every project). A rename wins over `titleSetting` and `title`.
The plugin is not told about either, other than seeing the title in `itemTitle`.

**Detail text.** A worker can show a short, muted, right-aligned text on a row for one project
(for example `3/7`) with `projectItems.setDetail` (host API 1.6, worker only, `settings:own`):

```js
await orca.host.call('projectItems.setDetail', {
  itemId: 'open-board',
  projectId: project.id,
  text: '3/7'
})
await orca.host.call('projectItems.setDetail', {
  itemId: 'open-board',
  projectId: project.id,
  text: ''
}) // clears
```

`text` is at most 16 characters; an empty string clears it. Orca keeps details in memory per plugin,
item and project, and drops them when the plugin is disabled or removed (a restart of Orca clears
them too, so a worker sets them again). It refuses an `itemId` the plugin does not declare with
`invalid_params`. Why `settings:own` and no capability of its own: the text is display state of the
plugin's own row and touches no user data, so it is not audit-logged as a mutation.

**Knowing which projects show the item.** A worker with a `projectItems.visible` entry in
`contributes.events` (needs `workspace:read`, since the payload names projects and their local
paths) is told whenever the set of projects an item shows under changes:

```js
orca.events.on('projectItems.visible', ({ itemId, projects }) => {
  // projects: [{ id, name, paths }], empty once the item shows nowhere
  for (const project of projects) {
    // compute the detail for visible projects only
  }
})
```

The first event starts the worker, so a plugin whose rows just appeared does not need a command run
first. "Showing" means the row is in the list: hidden items, rows turned off by
`when` and filtered-out projects do not count, but a row scrolled out of view does. The event goes to
the owning plugin only.

Project items count as access growth like nav items: an update that adds one asks for approval again.

### Opening files

With the `editor:open` capability, a worker, panel or custom editor calls
`orca.host.call('editor.openFile', { path, line?, column?, placement?, projectId? })` and gets `{ opened }`.
`path` is absolute. With the default `placement: "auto"`, a file inside one of the user's
workspaces opens in an editor tab there, so a matching custom editor applies; any other file opens
in the floating workspace, the way a file opened from the operating system does.

`placement: "active-workspace"` (host API 1.2) opens the file as an editor tab of the workspace
that is focused now, even when the file lives outside it, so it sits beside that workspace's
terminals and editors. It is saved and reloaded in place like any file the user opened by name.
It fails with `action_failed` when no workspace is focused, or when the focused workspace is
remote (SSH or a paired host), because the path names a file on this computer. A file that is
inside the focused workspace opens there as usual. A path that does not exist, or is not a file,
fails with `action_failed`. `column` is used only together with `line`. Each call is recorded in
the audit log by file name.

`projectId` (host API 1.2, optional) is the id of the project the user acted on, and it takes
precedence over `placement`. Pass it from a project item click: the id is a repository id for a
git project and a project-group id for a folder project. The file opens as a tab of the project's
most recently used workspace, as with `active-workspace` even when the file lies outside that
workspace, and Orca switches the window to it. A project with no usable workspace gets, in order:
the folder workspace Orca creates for a folder project, the focused workspace, then the floating
workspace. An id that names no project fails with `invalid_params`, and a project on a remote
(SSH or paired) host fails with `action_failed` like `active-workspace` does. Without `projectId`
nothing changes, so pass it only when you know the project.

### Opening links

With the `links:open` capability, `orca.host.call('links.open', { url })` opens a web link the way Orca
opens one the user clicks: their link setting decides between Orca's built-in browser and the
system browser. Only `http` and `https` URLs are accepted; anything else is refused with
`invalid_params`. `opened` is `true` once Orca has handed the link to its window, not once the
page has loaded.

Two optional flags change the target. `alternate` means the user held Shift with the platform
modifier: Orca routes it exactly as it does for its own links, so the user's settings decide
which target that is. By default it is the system browser. If the user turned on the Shift
inversion option in Settings > Browser, it is the other target than their default: the system
browser when "Open http(s) links from anywhere in Orca in its built-in browser" is on, Orca's
built-in browser when it is off. `external: true` forces the system browser whatever the
settings say; use it only when a plugin must leave Orca. Passing both is refused with
`invalid_params`. Both are optional additions to the same method, so older plugins are unaffected.

Follow the same modifier convention for links in your own UI, so they feel like Orca's: a plain
click opens the link as above, the platform modifier (Cmd on macOS, Ctrl elsewhere) also opens it,
and the modifier plus Shift passes `alternate: true`.

```js
link.addEventListener('click', (event) => {
  event.preventDefault()
  const mod = navigator.platform.startsWith('Mac') ? event.metaKey : event.ctrlKey
  orca.host.call('links.open', { url: link.href, alternate: mod && event.shiftKey })
})
```

Check `orca.host.has('links.open')` first: older Orca versions do not offer it.

### Custom editors

A custom editor opens files that end in one of its `extensions` (with the dot, such as
`.excalidraw`) or carry one of its exact `filenames` in the editor tab, beside Source. Syntaxes
match files the same way. It runs in the same sandboxed frame as a panel (no Node, no file system), and Orca keeps
the buffer, dirty state, saving, the external-change banner, read-only tabs and remote (SSH or
paired host) files; the frame only gets the document, never a path. Editor and panel plugins are
trusted code, and an editor can read every file it opens, so install ones you trust.

An editor's `window.orca` adds `document`:

```js
const doc = await orca.document.get() // { version, readOnly, content, fileType? }
// The current document right away, then each one Orca sends when the file changes outside the editor.
orca.document.onDidChange((doc) => render(doc))
await orca.document.applyEdit({ baseVersion: doc.version, content: { kind: 'text', text } })
orca.on('editor.flush', () => sendPendingEdit()) // before a save; Orca waits for the promise
```

`content` is `{ kind: 'text', text }` for a text editor (the default `contentKind`). An edit is
the full new content, made against document `baseVersion`; send one only when the user changes
the document, never on load. `applyEdit` rejects with `conflict` when the file changed outside
the editor since that version (edit the newer document instead), `too_large` past the size cap,
and `not_permitted` when `readOnly` is true (an agent transcript, say). `version` rises with each
document Orca sends, not with your own edits.

Set `"contentKind": "bytes"` for a binary format such as a spreadsheet. Orca reads the file
itself (locally, over SSH or from a paired host) and the document's `content` is
`{ kind: 'bytes', bytes }`, where `bytes` is an `ArrayBuffer`, plus the matched suffix as
`fileType`. An edit is the whole new file the same way: `content: { kind: 'bytes', bytes }`.
Orca marks the tab dirty and saves the bytes with the tab's normal save, replacing the file
atomically; a save is refused if the file changed on disk since the document's version, and the
banner offers Reload or Overwrite. Saving to a remote host needs an Orca server new enough to
replace binary files. Source shows the binary placeholder, unsaved bytes are not kept across
restarts, and bytes tabs don't autosave.

Documents and edits are capped at 64 MiB, text or bytes, on every route (local, SSH and paired
hosts): a larger file shows "too large to open", and a larger edit is rejected with `too_large`.
Past 16 MiB the tab notes that the file may take a moment. Orca saves on its own save shortcut pressed
inside the frame, never on a call alone.

Theme changes do not reload the frame: the shell updates the `--orca-*` variables and the
`light`/`dark` class on `<html>` in place and emits `theme`. Restyle from the variables, or
listen with `orca.on('theme', …)`, to follow it.

### Asking for a folder

With the `dialogs:open` capability (Since 1.4.252, host API 1.7), a worker, panel or editor can show Orca's native folder picker. The dialog belongs to the focused Orca window.

```js
const { path } = await orca.host.call('dialogs.pickFolder', {
  title: 'Choose your notes folder', // optional, up to 120 characters
  defaultPath: '/home/me/notes', // optional, absolute: preselected in the dialog
  createIfMissing: true // optional: create defaultPath first when it is missing
})
if (path === null) {
  // The user cancelled.
}
```

- `createIfMissing` creates `defaultPath` (and any missing parents) only when it lies under the user's home folder; anywhere else the call fails with `not_permitted`. Without it, a missing `defaultPath` falls back to its nearest existing parent.
- Only one picker per plugin is open at a time: a second call fails with `conflict` until the first closes.
- The picker browses this computer, so while a remote (SSH or paired host) workspace is focused the call fails with `not_permitted`. Remote folders are not supported yet.
- The audit log records that the picker was shown and its title, never the chosen path.

### Opening agent sessions

Declare the `agents:open` capability (`engines.orca` `>=1.4.253`, host API 1.8) and call
`agentSessions.open` from a worker, panel or editor to bring an agent session up, for example from
a session list or a command:

```js
if (orca.host.has('agentSessions.open')) {
  const { outcome } = await orca.host.call('agentSessions.open', {
    agent: 'claude', // an agent id from Session History, such as claude or codex
    sessionId, // the agent's own conversation id
    cwd: '/home/me/project' // optional absolute directory that picks the workspace to resume in
  })
  // 'focused' | 'resumed' | 'not_found'
}
```

- `focused`: a tab already runs that session, in any workspace (a terminal pane, even a sleeping
  or parked one, or a native chat). Orca switches to its workspace and focuses the tab. Nothing
  new starts.
- `resumed`: no tab runs it, but Orca resumed it with its own resume path, in the workspace that
  contains `cwd` (or, without `cwd`, the directory the session recorded). Orca follows the user's
  Chat | CLI choice for that agent: a chat when the agent has one that can take the conversation
  over (Claude, Codex, Grok, OMP, OpenCode, Pi) and the user prefers it, otherwise the agent's
  own resume command in a new terminal tab. A chat that already owns the conversation is
  reopened. A failure after that point (for example the agent's CLI is missing) is reported to
  the user by Orca's own notification, as it is for a resume started from Session History.
- `not_found`: Orca could not find or resume it, and changed nothing. That covers an unknown
  agent or session id, a session with no turns, no workspace that contains the directory (or an
  archived one), a session recorded on another machine (SSH or a paired host), and an agent
  without a resume command. Agents that can be resumed: claude, codebuddy, codex, qoder, qwen-code,
  gemini, antigravity, opencode, opencode2, pi, mimo-code, droid, grok, devin, omp, prime-agent,
  copilot, cursor, kimi, muse, zcode, dsh, jcode, kiro and hermes. Any other agent only ever
  answers `focused` or `not_found`.

The call never types into a terminal, so it needs only `agents:open`, not `terminal:send`. It
raises Orca's window when it focuses or resumes, and the audit log records the agent and the first
8 characters of the session id, never the directory. It fails with `action_failed` when Orca has
no window to act in (a headless server).

### Pages

A page is a full-size view in the main area, under Orca's usual page header (a back button and
the title), like the built-in Tasks and Automations pages. Declare up to four under
`contributes.pages`; they need the `sandboxed-ui` profile and `engines.orca` of at least
`>=1.4.254`:

```json
"pages": [{ "id": "notes", "title": "Notes", "icon": "file-text", "entry": "page/index.html" }]
```

`icon` takes the same names as a panel icon. A page runs in the same sandboxed frame as a panel
(no Node, no network, no file system) with the same `--orca-*` colors, and its `window.orca` is the
frame API above with the host methods whose surfaces list `page`: `workspace.readContext`,
`notifications.show`, `settings.get`, `sidebarNav.getValues`, `editor.openFile`, `links.open`,
`dialogs.pickFolder`, `agentSessions.open` and `pages.open`. A page has no tab or shortcut of its own, so it is opened
by code: a worker command, a panel, a custom editor or another page calls `pages.open`, which
shows the page in the focused window or focuses it if it is already the current view:

```js
// In a worker (main.mjs): a command that opens the page with a file.
orca.commands.register('open-notes', async () => {
  const path = fileURLToPath(new URL('./notes.txt', import.meta.url))
  await orca.host.call('pages.open', { pageId: 'notes', path })
})
```

```js
// In page/index.html: the file arrives like a custom editor's document, read-only.
orca.document.onDidChange((doc) => render(doc.content.text)) // content.kind is always 'text'
```

`pages.open` needs no capability: a plugin can only open a page it declared, which the user
approved with the plugin, and it never writes anything. It rejects with `action_failed` when the
plugin declares no such page or no window can show it, and with `invalid_params` for a `path`
that is not absolute.

With a `path` (an absolute path to a local file), the page gets `orca.document` exactly as a
[custom editor](#custom-editors) does: `get()` and `onDidChange()` deliver `{ version, readOnly,
content }` with `readOnly: true` and `content: { kind: 'text', text }`, and `applyEdit` rejects
with `not_permitted`. The page never sees the path. While the page is open Orca watches that one
file and sends a new document when it changes, including when an editor replaces it by writing
a temporary file and renaming it over the original (updates arrive about 200 ms after the last
change). Orca stops watching when the page closes, and a page watches one file at a time: calling
`pages.open` again with another `path` replaces the file. Files are capped at 64 MiB, like
custom editor documents; a missing, unreadable or larger file shows a notice above the page and
sends no document. Without a `path`, `orca.document.get()` never resolves. A `path` on a remote
(SSH or paired host) workspace is not supported: it names a file on the machine running Orca.

A page is session-only: Orca reopens the last built-in view on restart, not the page, and when
its plugin is turned off, updated without the page or removed, Orca returns to the view the page
was opened from.

### Custom icons

The `icon` of a panel, page, sidebar nav item, project item or sidebar card is either a built-in icon name (`"plug"`, `"database"`, …) or the path of an SVG
file in your plugin, such as `"images/star.svg"`. A manifest that uses an SVG path needs
`"engines": { "orca": ">=1.4.255" }` or newer; older Orca reports the requirement instead of
loading the plugin.

```json
{ "id": "hello", "title": "Hello Orca", "icon": "images/star.svg", "entry": "panel.html" }
```

Orca draws the SVG as a single-color mask the size of the built-in icons, so it takes the theme's
text color and ignores any color in the file: only its shape counts (opaque areas and strokes).
Draw it in black on a transparent background with a `viewBox`. If the file cannot be loaded, Orca
shows the default `plug` icon. Orca reads the file itself and checks it again every time it loads
the icon, so a file edited after install is dropped if it breaks these rules. Orca refuses to install a plugin whose icon:

- is missing, over 32 KB, not UTF-8, or not well-formed SVG with an `<svg>` root;
- contains `<script>`, `<foreignObject>`, `<iframe>`, `<object>`, `<embed>`, a DOCTYPE or entity
  declaration, or an `<animate>`/`<set>` that targets an `href`;
- has an event-handler attribute (`onclick`, `onload`, …) or a `javascript:` value;
- references anything but a `#fragment` through `href`, `xlink:href`, `url(…)` or `@import`.

## 2. Load it while you work

1. Settings → Plugins: click **Turn on plugins**.
2. **Development folders…** → add the plugin folder. It loads as `local.<id>` (or under its
   deprecated `publisher` while it still declares one), and overrides an installed copy with
   the same key.
3. Review and enable it. Nothing runs before that.

From a terminal (or a coding agent), `orca plugin dev load <dir>` does the same. A content-only
plugin loads at once; anything that runs code fails with `approval_required`, which lists what it
would be granted and the command to re-run with `--approve <fingerprint>`. `orca plugin logs
<publisher.id>` prints its logs and `orca plugin dev unload <dir>` removes it.

Orca watches development folders and reloads the plugin when its manifest or files change.
Theme, syntax and translation edits show up as you save. Panels and workers are not bound to
their files in development, so saving does not ask for approval again; adding a capability or
moving to a higher execution profile does. Shortcuts and recipes are tied to their files, so
each change to them is reviewed again. Use **Restart** on the plugin row after changing a
worker, and the plugin's logs to see what it printed.

## 3. Validate

```sh
pnpm validate:plugin path/to/plugin
# or, without an Orca checkout:
orca plugin validate path/to/plugin
```

`orca plugin create <dir> --template <theme|terminal-theme|icon-theme|syntax|language-pack|editor|panel>`
scaffolds a plugin that passes these checks, and `orca plugin inspect <dir>` shows what it would be
allowed to do and its content hash.

This runs the manifest checks Orca runs, strictly: unknown keys, limits, contributions beyond the
execution profile, and an `engines.orca` too low for the fields used. On a catalog it also
checks that listed images exist and fit. It warns when the manifest still declares the deprecated
`publisher`, and, in a Git repository, when that value is not the owner of the `origin` remote.
Warnings do not fail the check. Run it in CI for the plugin and catalog repositories.

## 4. List it in the Orca plugin directory

1. `orca plugin validate .` passes, and the plugin is committed and pushed to the GitHub
   repository whose owner matches `publisher`.
2. Commit the new `version` in `orca-plugin.json`, then tag that commit and push the tag:
   `git tag -a v1.2.0 -m v1.2.0 && git push origin v1.2.0`.
3. Add the `orca-plugin` topic to the repository: `gh repo edit <owner>/<repo> --add-topic orca-plugin`.
4. Check its listing at `https://www.onorca.dev/plugins/<owner>/<repo>`.

## 5. Publish to a catalog

A catalog is a Git repository with `orca-catalog.json` at its root that lists plugins and pins
each release to an exact commit and file hash, so Orca refuses bytes the catalog did not vouch
for. Plugins in Orca's official and community catalogs must follow the
[plugin listing policy](plugin-listing-policy.md), starting with being free to install and use.

1. Commit the plugin and run `pnpm validate:plugin` on its directory. It prints the
   release entry for `HEAD`: version, full commit SHA, `contentHash`, execution profile, minimum
   Orca, contribution summary, capabilities and file types. Every field must match
   what Orca finds at install, so paste it rather than writing it by hand.
2. Add or update the plugin's entry in the catalog's `orca-catalog.json`, newest release first:

   ```json
   {
     "id": "acme.gleam-syntax",
     "source": {
       "kind": "git",
       "url": "https://github.com/acme/orca-gleam-syntax.git",
       "ref": "main"
     },
     "categories": ["languages"],
     "releases": [{ "...": "the printed entry" }]
   }
   ```

   The `id` is `<publisher>.<manifest id>`. In your own catalog you choose the publisher; use the
   repository owner, as the official and community catalogs do.

   `commit` must be a full 40-character SHA. A tag or branch name is refused by validation and
   skipped by Orca. Keep the previous release listed when you raise `engines.orca`, so older
   Orca still has something to install.

   **One repository can hold many plugins.** Put each in its own directory, such as
   `plugins/gleam-syntax/orca-plugin.json`, and add `"path": "plugins/gleam-syntax"` to its
   `source`; validating that directory prints the `path` to use. Orca installs only that
   directory, and its `contentHash` covers only its files, so commits to sibling plugins never
   change it. Moving a plugin to another directory counts as a different repository.

3. Run `pnpm validate:plugin path/to/catalog` and regenerate the older
   `orca-marketplace.json` as described in the [catalog reference](plugin-catalog.md#clients-before-format-2).
4. Users add the catalog under Settings → Plugins → ⋯ → **Catalog sources…** with its Git URL and ref.

Users approve a plugin once per level of access. An update from the same repository that asks
for nothing new, code changes included, installs without asking again and stays enabled. Orca
asks again, listing what is new, when an update adds a capability, raises the execution profile,
adds a command, shortcut, panel or event subscription, ships virtual machine recipes, or comes from
a different repository.

With **Update plugins automatically** on (the default), Orca installs such updates for enabled
catalog plugins by itself, checking at startup and every 6 hours. A release installs only once it
has been listed for 12 hours, or at once from the official catalog, so a takedown has time to land.
Only pinned catalog releases (a `releases` entry with its commit and content hash) install by
themselves; a listing without one updates only when the user clicks Update. This includes
full-access plugins: an update that asks for nothing new runs its new code with the access the user
already granted, the same way an editor's extensions update. Turn the setting off to review every
update. An update that needs approval is not installed: the current version keeps running and the
plugin shows **Update needs review**.

## Planned contribution points

These `contributes` keys are reserved: a manifest may list them only as empty arrays until
their format ships. Each is planned as declared data that Orca renders and enforces, not
arbitrary plugin UI:

- `taskSources`: issue and task providers such as Asana, Linear or Jira, filled by a worker.
- `connections`: account providers with a host-run sign-in.
- `agentHarnesses`: new coding-agent harnesses described as data.
- `statusBarItems`: declarative status bar widgets whose values a worker updates.
- `mcpServers`: MCP server definitions offered to the agents Orca launches.
- `skills`: agent skills shipped as files.
- `hooks`: agent lifecycle hooks for the agents Orca launches.

`skills`, `mcpServers` and `hooks` will mean what they mean in agent-plugin formats such as
Claude Code's. Orca does not reserve `agents`, because those formats use it for subagent files.

See [the manifest reference](plugin-manifest.md#planned-contribution-points) for details.

## Stability

Plugins are in Alpha: the manifest v2 format and catalog format are stable contracts; items
listed as experimental may change. These parts are stable and change only additively:

- manifest format 2, capability names and execution profiles;
- host API 1 (`"pluginApi": 1`): method names, params, results, surfaces and error codes;
- the frame API `window.orca` (`api`, `host.call`, `host.has`, `on`, and `document` in custom
  editors) and the document `version`/`content` shape;
- theme token names, and theme ids once published (users' settings store them);
- catalog format 2 (`orca-catalog.json`).

Experimental; these may still change without a new format:

- the `agent.status.changed` payload: `paneKey` is not yet a terminal id `terminal.sendText`
  accepts;
- the worker process model: Node version, lifecycle and the channel to Orca. Only
  `activate(orca)` and `orca.api`, `orca.host`, `orca.commands`, `orca.events` and `orca.log` are
  promised,
  and workers may be stopped at any time;
- language-pack keys, which change when Orca's source moves or its English copy changes; packs
  get best-effort coverage per release;
- `pnpm validate:plugin` output; only its exit codes (`0` valid, `1` invalid, `2` usage) are
  stable;
- manifest format 1, which is deprecated. Catalogs need format 2.

Data folders, `orca-plugin-image://` URLs, tab keys and the `pluginRoot` a worker receives are
internal.

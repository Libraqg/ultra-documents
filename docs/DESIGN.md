# ultra-documents — design

ultra-documents is a [DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh)
(dsh) plugin that gives the agent an Artifacts-like output surface: the agent
produces an HTML document, it opens in the dsh right sidebar, you comment on
any part of it, and one click hands the open comments back to the agent, which
writes the next version and answers each comment.

It is a fork of [tornado-doc/tdoc](https://github.com/tornado-doc/tdoc)
(AGPL-3.0-or-later). See [Relationship to tdoc](#relationship-to-tdoc).

## Scope

In scope:

- AI-generated HTML/SVG outputs: documents, reports, slides, diagrams, charts,
  dashboards.
- Viewing inside dsh only, in the right sidebar, with an in-app full-screen
  view.
- Anchored comments on text and on visual elements, stored locally.
- A "Send to AI" action that posts the open comments into the dsh Session the
  document is open in.
- Versioned revisions: every revision is a new immutable version.
- Direct editing of text and formatting in the sidebar, saved as a new
  version (latest version only; documents with author scripts excluded).

Out of scope (decided 2026-10-26):

- Sharing, publishing, cloud storage, accounts, teams, access control.
- A background daemon that runs agents on its own.
- Any harness other than dsh.
- Commenting on existing PDF / Office / image files.
- HTTP routes on the dsh web server, or a separate local server.

## How dsh supplies each piece

Everything below is a public dsh seam that shipped as of dsh 0.2.1-rc.2.

| Need | dsh seam |
|---|---|
| Agent creates / revises a document | Host tool registered with `ctx.tools.register(...)`. The definition is built by `lib/define-tool.js`: a plugin cannot import the runtime's `@deepseek-ai/dsh-tools`, and the registry accepts any `{ name, description, parameters, output, execute }` with JSON Schema parameters, the shape MCP tools use |
| Document appears as a card in the chat | The tool appends the same `deliverables/presented` Session event the stock `present` tool appends, so `dsh-client-ui-deliverables` renders a card; clicking it opens the file in the right sidebar |
| Rendering in the sidebar | A document-preview implementation: `ctx.documentPreviews.register({ id, extensions, priority: 'extension', loading: 'bytes-complete' })` plus a body registered on the keyed slot `sidebar.right.tab.document` (`dsh-client-ui-sidebar-documentpreview`). An `extension` registration outranks the built-in HTML renderer for the extensions it claims |
| Isolation of document scripts | The body renders the document in an `<iframe sandbox="allow-scripts">` without `allow-same-origin`, the same isolation the built-in HTML preview uses |
| Knowing which Session a document belongs to | The tab's resource address is `dsh-resource://file/session/<sessionId>/<path>` |
| Writing comments from the sidebar | A host command registered with `ctx.commands.register(...)` and executed from the client; `recordInput: false`, so nothing enters the model context |
| Send to AI | `remote.session.prompt({ requestId, sessionId, mode: 'queue', content: [{ type: 'text', text }], clientTimeZone })` from the client. Remote calls resolve to `{ ok, value }` / `{ ok: false, error }` rather than throwing |
| Full screen | A fixed-position overlay inside the dsh window that re-hosts the same sandboxed iframe; no route, no new window |

## Storage

Each document lives in the Session's workspace:

```
<workspace>/.ultra-documents/
  .gitignore            # "*" — drafts never land in a repo by accident
  <slug>/
    doc.json            # { slug, title, created_at, versions: [{ n, created_at, note }] }
    v1.ultra.html
    v2.ultra.html
    comments.json       # [{ id, version, anchor, text, created_at, status, replies: [...] }]
```

- The `.ultra.html` suffix is what the sidebar renderer claims; plain `.html`
  files keep dsh's built-in preview.
- Files are written by the host plugin with Node `fs`. The sandboxed `ctx.fs`
  checks writes against the deployment's default workspace when called from
  plugin code rather than the Session's, and refuses them. Bypassing it means
  the plugin confines itself: the store only builds paths from validated slugs
  and from version numbers it has checked in `doc.json` (the agent can write
  that file too); the adapter (`lib/files.js`) refuses any path that resolves
  outside the workspace after following symlinks, and any file that is itself
  a symlink; all writes on one `.ultra-documents/` go through one queue.
- `source_path` drafts are read only from regular files inside the workspace,
  up to the HTML size limit.
- Drafts the agent edits with its own file tools go in
  `.ultra-documents/_drafts/`; `_drafts` is not a valid slug, so it never
  collides with a document.
- Workspace placement keeps documents next to the work that produced them and
  readable through `remote.workspaceFiles` without a custom transport.

## Agent tools

| Tool | Purpose |
|---|---|
| `ultra_documents_create` | `{ title, slug?, html \| source_path }` → creates `<slug>/v1.ultra.html` and shows it as a deliverable card |
| `ultra_documents_revise` | `{ slug, html \| source_path, note?, replies: [{ comment_id, text, status: applied \| declined \| answered }] }` → writes `v(n+1)`, records the replies, marks applied comments resolved |
| `ultra_documents_comments` | `{ slug, include_resolved? }` → open comments with their anchors and the version each was made on |
| `ultra_documents_list` | Documents in the current workspace |

Comment text reaches the model as data inside a tool result, framed as
untrusted reviewer input about the document.

Authoring guidance (voice, structure, visuals, slides) comes from tdoc's
`authoring/` rules, shipped as a dsh skill.

## Comment flow

1. The sidebar body loads `vN.ultra.html`, injects tdoc's reader stylesheet
   and frame probe (`client/table-layout.js` + `client/frame-probe.js`; the
   probe calls `layoutTables()` and dies without it), and renders it in the
   sandboxed iframe. The body starts the probe in comment mode: the probe
   reports selections only in that mode.
2. Selecting text or clicking a visual element makes the probe post a
   selection (`text`, `context_before`, `context_after`, `rect`) to the body.
3. The body shows a composer; saving runs the host command, which appends to
   `comments.json`.
4. The body sends the anchors back to the probe, which highlights them.
5. **Send to AI** prompts the Session with the document slug and the open
   comment ids. The agent calls `ultra_documents_comments`, revises, calls
   `ultra_documents_revise` with one reply per comment, then `present`s the
   new version.

## Direct editing

The body switches the probe to `edit` mode, which makes the content root
(`main`, `article`, `.wrap`, …) editable and reports `tdoc:editState`. The
toolbar sends `tdoc:editFormat` (bold, italic, headings, lists, quote, undo,
redo). Saving asks the probe for `tdoc:editSerialize`; it answers with the
whole page minus every `data-tdoc-provider` node, which is why the injected
reader stylesheet and probe carry that attribute. The host command
`version-save { slug, base, html }` writes the next version and refuses when
`base` is no longer the latest, so a concurrent agent revision is never
overwritten. Documents with author scripts cannot be edited: the saved DOM
would already contain the script's output, and reopening it would run the
script again.

## Security model

There is one person: the dsh owner. No one else can write comments, so there
is no untrusted commenter. The remaining risk is the document itself: it is
model-authored HTML with scripts. It runs in an opaque-origin sandbox, cannot
reach the dsh page, its cookies, or the file APIs, and only talks to the body
through validated `postMessage` shapes.

## Relationship to tdoc

Kept and adapted:

- `authoring/` — writing, structure, visual and slide rules.
- `server/frame-probe.js` — the in-frame anchoring probe.
- Comment anchor shape and re-anchoring approach.

Removed: the Cloudflare Worker, Vercel shim, tdoc.dev publishing, sign-in,
teams, the feedback SDK, the daemon, the local `localhost:7878` server, the
React reader shell, landing pages and all Claude Code / Codex install paths.

The fork stays under AGPL-3.0-or-later. `LICENSE` keeps tdoc's licence text
and history notices; `authoring/vendor/no-ai-slop.md` keeps its MIT notice.
`NOTICE.md` records that this is a modified version, from which upstream
commit, and what changed.

## Known limitations

- Each comment action shows a one-line "ultra-documents" command card in the
  chat. It never reaches the model, but it is visible.
- The comment panel polls `doc.json` and `comments.json` every 3 seconds, so
  a saved comment or a new version can take that long to appear.
- A Session open in two dsh processes at once (say the desktop app and a
  `dsh web` profile) is write-locked by one of them; comment and edit saves
  from the other fail with "already owned by an active write handle".
- A hand-edited version is the browser's re-serialization of the page, so
  equivalent markup changes form (`<line/>` becomes `<line></line>`, `&` in
  attributes becomes `&amp;`). Rendering is unchanged.
- Local filesystem only: the host writes with Node `fs`, so a dsh profile
  whose Sessions run on a remote filesystem is not supported.
- The authoring rules are long. A model that reads all of them on every
  document spends a lot of context; `SKILL.md` asks it to read only what the
  document needs.
- dsh is a release candidate (verified on 0.2.1-rc.3); seams may move before
  1.0.

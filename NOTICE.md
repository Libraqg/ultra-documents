# Notice

ultra-documents is a modified version of **tdoc**
(<https://github.com/tornado-doc/tdoc>), Copyright (C) 2026 Serena Keyitan
and the tdoc contributors, licensed under the GNU Affero General Public
License v3.0 or later. ultra-documents is distributed under the same licence;
see [LICENSE](LICENSE), which keeps tdoc's licence text and its MIT and
Apache 2.0 history notices unchanged.

## Upstream base

Forked from tdoc `main` at commit
`686d6fcdd3ecfa82adb9ee5ad2ef31b02d353433` (2026-10-25). This repository
starts from a single commit; the upstream history is at
<https://github.com/tornado-doc/tdoc/commits/686d6fcdd3ecfa82adb9ee5ad2ef31b02d353433>.

## What changed (2026-10-26 onward, by libraqg)

- Turned into a DeepSeek Harness (dsh) plugin: new host entry (`index.js`,
  `lib/`), agent tools, a host command and a web client (`client/src/`,
  built into `client.js`).
- Local only: removed the Cloudflare Worker, Vercel shim, tdoc.dev
  publishing, sign-in, teams, sharing, the feedback SDK, the agent daemon,
  the local server, the React reader shell, landing pages, tests, brand assets
  and all Claude Code / Codex install paths.
- `server/frame-probe.js`, `server/table-layout.js` and `server/reader.css`
  moved to `client/`; all three are inlined into `client.js` unchanged.
- `authoring/` moved to `skills/ultra-documents/authoring/` and edited to
  drop references to removed tdoc commands, the template validator, the SVG
  preview tool, the Excalidraw editor and tdoc's slide presenter.
- The `data-tdoc-*` attributes and `tdoc-*` class names are kept for
  compatibility with the frame probe and reader stylesheet.

"tdoc" and "Tornado" are names of the upstream project. ultra-documents is
not affiliated with or endorsed by it.

## Third-party material

| Path | Licence | Holder |
|---|---|---|
| `skills/ultra-documents/authoring/vendor/no-ai-slop.md` | MIT (`authoring/vendor/LICENSE-no-ai-slop`) | Peter Yang |

React, the dsh runtime and its packages are supplied by DeepSeek Harness at
run time and are not bundled here.

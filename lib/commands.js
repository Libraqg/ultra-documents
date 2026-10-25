// The sidebar's write channel: `/ultra-documents <action> <json>`.
//
// The sidebar body executes this host command to add, resolve or delete a
// comment, and to save a version the user edited by hand. `recordInput: false` keeps the payload out of the Session log, and
// a command never creates a model message, so commenting costs no tokens.

import { DocumentStore, StoreError } from './store.js'
import { nodeFiles } from './files.js'

export const COMMAND_NAME = 'ultra-documents'

// The command card shows the result text in the transcript, so keep it to one
// short line; the sidebar re-reads comments.json for the details.
const ACTIONS = {
  'comment-add': async (store, p) => `comment ${(await store.addComment(p.slug, { version: p.version, anchor: p.anchor, text: p.text })).id} saved`,
  'comment-status': async (store, p) => `comment ${(await store.setStatus(p.slug, p.id, p.status)).id} marked ${p.status}`,
  'comment-delete': async (store, p) => `comment ${(await store.deleteComment(p.slug, p.id)).id} deleted`,
  'version-save': async (store, p) => `version ${(await store.saveEdit({ slug: p.slug, base: p.base, html: p.html })).version} saved`,
}

export function parseCommandInput(rawInput) {
  const text = String(rawInput || '').trim()
  const space = text.search(/\s/)
  const action = space === -1 ? text : text.slice(0, space)
  const json = space === -1 ? '' : text.slice(space + 1).trim()
  if (!Object.hasOwn(ACTIONS, action)) throw new StoreError(`unknown action "${action}"`, 'INVALID')
  let payload
  try {
    payload = json ? JSON.parse(json) : {}
  } catch {
    throw new StoreError('payload must be JSON', 'INVALID')
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new StoreError('payload must be a JSON object', 'INVALID')
  return { action, payload }
}

export function registerCommands(ctx) {
  ctx.commands.register({
    name: COMMAND_NAME,
    description: 'Used by the ultra-documents sidebar to save comments.',
    input: { hint: '<action> <json>' },
    recordInput: false,
    handler: async ({ agent, rawInput, signal }) => {
      try {
        const { action, payload } = parseCommandInput(rawInput)
        const cwd = await ctx.workingDirectory.ensure(agent, signal)
        const store = new DocumentStore(nodeFiles(cwd), cwd)
        return { kind: 'success', text: await ACTIONS[action](store, payload) }
      } catch (error) {
        return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
      }
    },
  })
}

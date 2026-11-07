import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve as resolvePath } from 'node:path'
import { registerTools } from '../lib/tools.js'

const HTML = '<!doctype html><html><head><meta name="viewport" content="width=device-width"></head><body><main><p>Hi</p></main></body></html>'

// Register the real tools against a minimal fake dsh context.
async function withTools(fn) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'ultra-tools-')))
  const outside = await realpath(await mkdtemp(join(tmpdir(), 'ultra-tools-out-')))
  const tools = new Map()
  const ctx = {
    tools: { register: tool => tools.set(tool.name, tool) },
    workingDirectory: { ensure: async () => dir },
    on: () => {},
  }
  registerTools(ctx)
  const exec = { agent: { session: {} }, signal: new AbortController().signal }
  const call = (name, args) => tools.get(name).execute(args, exec)
  try {
    await fn({ dir, outside, call })
  } finally {
    await rm(dir, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  }
}

test('create accepts a draft inside the workspace', async () => {
  await withTools(async ({ dir, call }) => {
    await mkdir(join(dir, '.ultra-documents', '_drafts'), { recursive: true })
    await writeFile(join(dir, '.ultra-documents', '_drafts', 'plan.html'), HTML)
    const text = await call('ultra_documents_create', { title: 'Plan', source_path: '.ultra-documents/_drafts/plan.html' })
    assert.match(text, /Created "Plan" \(slug plan\) version 1/)
  })
})

test('source_path outside the workspace, through a symlink or not a file is refused', async () => {
  await withTools(async ({ dir, outside, call }) => {
    await writeFile(join(outside, 'secret.txt'), 'secret')
    await assert.rejects(call('ultra_documents_create', { title: 'X', source_path: join(outside, 'secret.txt') }), /outside the workspace/)
    await assert.rejects(call('ultra_documents_create', { title: 'X', source_path: '../' + outside.split('/').pop() + '/secret.txt' }), /outside the workspace/)
    await symlink(join(outside, 'secret.txt'), join(dir, 'link.html'))
    await assert.rejects(call('ultra_documents_create', { title: 'X', source_path: 'link.html' }), /outside the workspace/)
    await mkdir(join(dir, 'folder'))
    await assert.rejects(call('ultra_documents_create', { title: 'X', source_path: 'folder' }), /not a regular file/)
    await assert.rejects(call('ultra_documents_create', { title: 'X', source_path: 'missing.html' }), /does not exist/)
  })
})

test('exactly one of html and source_path is required', async () => {
  await withTools(async ({ call }) => {
    await assert.rejects(call('ultra_documents_create', { title: 'X' }), /exactly one/)
    await assert.rejects(call('ultra_documents_create', { title: 'X', html: HTML, source_path: 'a.html' }), /exactly one/)
  })
})

// A create inside an open turn queues a deliverable card, appended once the
// tool result arrives. dsh 0.2.2 answers through agents.turnBoundaryOf; older
// hosts only through the deprecated sessionProjections.stateOf.
async function deliveredFiles(hostFace) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'ultra-deliver-')))
  try {
    const tools = new Map()
    const listeners = new Map()
    const appended = []
    const ctx = {
      tools: { register: tool => tools.set(tool.name, tool) },
      workingDirectory: { ensure: async () => dir },
      fs: { resolve: async p => resolvePath(dir, p), processPath: p => p },
      on: (name, fn) => listeners.set(name, fn),
      ...hostFace,
    }
    registerTools(ctx)
    const session = { append: (type, payload) => appended.push([type, payload]) }
    const exec = { agent: { session }, callId: 'call-1', signal: new AbortController().signal }
    await tools.get('ultra_documents_create').execute({ title: 'Plan', html: HTML }, exec)
    listeners.get('tools/result')(exec, { isError: false })
    return appended
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

const OPEN_TURN = { openTurnStartSeq: 4, lastTurn: 2 }

test('the deliverable card uses agents.turnBoundaryOf when the host has it', async () => {
  const appended = await deliveredFiles({
    agents: { turnBoundaryOf: () => OPEN_TURN },
    sessionProjections: { stateOf: () => { throw new Error('deprecated reader used') } },
  })
  assert.equal(appended.length, 1)
  assert.equal(appended[0][0], 'deliverables/presented')
  assert.equal(appended[0][1].turn, 2)
  assert.match(appended[0][1].files[0].path, /plan\/v1\.ultra\.html$/)
})

test('the deliverable card falls back to sessionProjections on older hosts', async () => {
  const appended = await deliveredFiles({ agents: {}, sessionProjections: { stateOf: (_s, key) => key === 'turnBoundary' ? OPEN_TURN : undefined } })
  assert.equal(appended.length, 1)
  assert.equal(appended[0][1].turn, 2)
})

test('no deliverable card outside an open turn', async () => {
  const appended = await deliveredFiles({ agents: { turnBoundaryOf: () => ({ openTurnStartSeq: null, lastTurn: 2 }) } })
  assert.equal(appended.length, 0)
})

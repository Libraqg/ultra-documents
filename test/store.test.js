import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DocumentStore, StoreError, normalizeAnchor, parseVersionPath, slugify } from '../lib/store.js'
import { nodeFiles } from '../lib/files.js'
import { parseCommandInput } from '../lib/commands.js'

const HTML = '<!doctype html><html><head><meta name="viewport" content="width=device-width"></head><body><main><p>Hello world</p></main></body></html>'

async function withStore(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'ultra-documents-'))
  let tick = 0
  const store = new DocumentStore(nodeFiles(dir), dir, { now: () => new Date(Date.UTC(2026, 9, 26, 0, 0, tick++)) })
  try {
    await fn(store, dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test('slugify keeps ASCII words and falls back for other scripts', () => {
  assert.equal(slugify('Q3 Onboarding Proposal!'), 'q3-onboarding-proposal')
  assert.equal(slugify('客户入职方案'), 'doc')
  assert.equal(slugify('Café déjà vu'), 'cafe-deja-vu')
})

test('parseVersionPath accepts only version files inside the store', () => {
  assert.deepEqual(parseVersionPath('/w/.ultra-documents/plan/v12.ultra.html'), { slug: 'plan', version: 12 })
  assert.equal(parseVersionPath('/w/.ultra-documents/plan/v0.ultra.html'), null)
  assert.equal(parseVersionPath('/w/docs/plan/v1.ultra.html'), null)
  assert.equal(parseVersionPath('/w/.ultra-documents/_drafts/v1.ultra.html'), null)
})

test('create writes v1, metadata, empty comments and a catch-all .gitignore', async () => {
  await withStore(async (store, dir) => {
    const created = await store.create({ title: 'Launch plan', html: HTML })
    assert.equal(created.slug, 'launch-plan')
    assert.equal(created.version, 1)
    assert.equal(await readFile(created.path, 'utf8'), HTML)
    assert.equal(await readFile(join(dir, '.ultra-documents/.gitignore'), 'utf8'), '*\n')
    const meta = JSON.parse(await readFile(join(dir, '.ultra-documents/launch-plan/doc.json'), 'utf8'))
    assert.equal(meta.title, 'Launch plan')
    assert.deepEqual(meta.versions.map(v => v.n), [1])
  })
})

test('create keeps slugs unique', async () => {
  await withStore(async store => {
    const a = await store.create({ title: '方案', html: HTML })
    const b = await store.create({ title: '方案', html: HTML })
    assert.equal(a.slug, 'doc')
    assert.equal(b.slug, 'doc-2')
  })
})

test('create prefers a valid slug hint over the title', async () => {
  await withStore(async store => {
    assert.equal((await store.create({ title: '咖啡豆', slug: 'coffee-beans', html: HTML })).slug, 'coffee-beans')
    assert.equal((await store.create({ title: '咖啡豆', slug: 'Not A Slug', html: HTML })).slug, 'doc')
    assert.equal((await store.create({ title: '咖啡豆', slug: 'coffee-beans', html: HTML })).slug, 'coffee-beans-2')
  })
})

test('comment lifecycle: add, revise with replies, list open only', async () => {
  await withStore(async store => {
    const { slug } = await store.create({ title: 'Plan', html: HTML })
    const c1 = await store.addComment(slug, { version: 1, anchor: { kind: 'text', text: 'Hello', context_before: '', context_after: ' world' }, text: 'Say hi instead' })
    const c2 = await store.addComment(slug, { version: 1, anchor: { kind: 'element', selector: 'main > p', label: 'para' }, text: 'Why this?' })
    assert.match(c1.id, /^c_[a-f0-9]{12}$/)
    assert.equal((await store.comments(slug)).comments.length, 2)

    const revised = await store.revise({
      slug,
      html: HTML.replace('Hello', 'Hi'),
      note: 'greeting',
      replies: [
        { comment_id: c1.id, status: 'applied', text: 'Changed to Hi.' },
        { comment_id: c2.id, status: 'answered', text: 'It sets the tone.' },
      ],
    })
    assert.equal(revised.version, 2)
    const open = await store.comments(slug)
    assert.equal(open.latest_version, 2)
    assert.equal(open.comments.length, 0)
    const all = await store.comments(slug, { includeResolved: true })
    assert.deepEqual(all.comments.map(c => c.status), ['applied', 'answered'])
    assert.equal(all.comments[0].replies[0].version, 2)
  })
})

test('revise rejects unknown comments and bad statuses without writing a version', async () => {
  await withStore(async store => {
    const { slug } = await store.create({ title: 'Plan', html: HTML })
    await assert.rejects(store.revise({ slug, html: HTML, replies: [{ comment_id: 'c_000000000000', status: 'applied', text: 'x' }] }), StoreError)
    const c = await store.addComment(slug, { version: 1, anchor: null, text: 'General note' })
    await assert.rejects(store.revise({ slug, html: HTML, replies: [{ comment_id: c.id, status: 'done', text: 'x' }] }), /applied, declined or answered/)
    assert.equal((await store.meta(slug)).versions.length, 1)
  })
})

test('addComment validates version and text; status and delete work', async () => {
  await withStore(async store => {
    const { slug } = await store.create({ title: 'Plan', html: HTML })
    await assert.rejects(store.addComment(slug, { version: 2, anchor: null, text: 'x' }), /no version 2/)
    await assert.rejects(store.addComment(slug, { version: 1, anchor: null, text: '   ' }), /non-empty/)
    const c = await store.addComment(slug, { version: 1, anchor: null, text: 'note' })
    assert.equal((await store.setStatus(slug, c.id, 'resolved')).status, 'resolved')
    await store.deleteComment(slug, c.id)
    assert.equal((await store.comments(slug, { includeResolved: true })).comments.length, 0)
  })
})

test('saveEdit writes the next version from the latest and refuses a stale base', async () => {
  await withStore(async store => {
    const { slug } = await store.create({ title: 'Plan', html: HTML })
    const saved = await store.saveEdit({ slug, base: 1, html: HTML.replace('Hello', 'Hey') })
    assert.equal(saved.version, 2)
    const meta = await store.meta(slug)
    assert.deepEqual(meta.versions[1], { n: 2, created_at: meta.versions[1].created_at, author: 'user', note: 'Edited by hand' })
    await assert.rejects(store.saveEdit({ slug, base: 1, html: HTML }), /newer version 2/)
    assert.equal((await store.meta(slug)).versions.length, 2)
  })
})

test('list summarizes documents and ignores drafts', async () => {
  await withStore(async (store, dir) => {
    await store.create({ title: 'Alpha', html: HTML })
    await nodeFiles(dir).write(join(dir, '.ultra-documents/_drafts/alpha.html'), HTML)
    const docs = await store.list()
    assert.deepEqual(docs.map(d => [d.slug, d.latest_version, d.open_comments]), [['alpha', 1, 0]])
  })
})

test('concurrent writes are serialized', async () => {
  await withStore(async store => {
    const { slug } = await store.create({ title: 'Plan', html: HTML })
    await Promise.all(Array.from({ length: 10 }, (_, i) => store.addComment(slug, { version: 1, anchor: null, text: `n${i}` })))
    assert.equal((await store.comments(slug)).comments.length, 10)
  })
})

test('normalizeAnchor drops malformed anchors and clamps fields', () => {
  assert.equal(normalizeAnchor({ kind: 'text', text: '  ' }), null)
  assert.equal(normalizeAnchor({ kind: 'element' }), null)
  const a = normalizeAnchor({ kind: 'text', text: 'x'.repeat(5000), context_before: 'b', occurrence: 2, extra: 1 })
  assert.equal(a.text.length, 2000)
  assert.equal(a.occurrence, 2)
  assert.equal('extra' in a, false)
})

test('parseCommandInput accepts known actions with a JSON object', () => {
  assert.deepEqual(parseCommandInput(' comment-delete {"slug":"a","id":"c_1"}'), { action: 'comment-delete', payload: { slug: 'a', id: 'c_1' } })
  assert.throws(() => parseCommandInput('rm -rf {}'), /unknown action/)
  assert.throws(() => parseCommandInput('comment-add [1]'), /JSON object/)
  assert.throws(() => parseCommandInput('comment-add {nope'), /must be JSON/)
})

test('a tampered doc.json cannot steer writes outside the document directory', async () => {
  await withStore(async (store, dir) => {
    const { slug } = await store.create({ title: 'Plan', html: HTML })
    const metaFile = join(dir, '.ultra-documents', slug, 'doc.json')
    const meta = JSON.parse(await readFile(metaFile, 'utf8'))
    meta.versions = [{ n: '/../../../../tmp/x', created_at: meta.created_at }]
    await writeFile(metaFile, JSON.stringify(meta))
    await assert.rejects(store.revise({ slug, html: HTML }), /malformed/)
    meta.versions = []
    await writeFile(metaFile, JSON.stringify(meta))
    await assert.rejects(store.saveEdit({ slug, base: 1, html: HTML }), /malformed/)
    assert.deepEqual(await store.list(), [])
  })
})

test('the file adapter refuses symlinks and paths outside the workspace', async () => {
  await withStore(async (store, dir) => {
    const outside = await mkdtemp(join(tmpdir(), 'ultra-outside-'))
    try {
      const files = nodeFiles(dir)
      await assert.rejects(files.write(join(outside, 'x.txt'), 'x'), /outside the workspace/)
      await symlink(outside, join(dir, '.ultra-documents'))
      await assert.rejects(store.create({ title: 'Plan', html: HTML }), /outside the workspace/)
      await rm(join(dir, '.ultra-documents'))
      await mkdir(join(dir, '.ultra-documents', 'plan'), { recursive: true })
      await symlink(join(outside, 'target.json'), join(dir, '.ultra-documents', 'plan', 'doc.json'))
      await assert.rejects(files.write(join(dir, '.ultra-documents', 'plan', 'doc.json'), '{}'), /outside the workspace/)
      await assert.rejects(files.read(join(dir, '.ultra-documents', 'plan', 'doc.json')), /outside the workspace/)
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })
})

test('stores on the same directory share one queue', async () => {
  await withStore(async (store, dir) => {
    const { slug } = await store.create({ title: 'Plan', html: HTML })
    const other = () => new DocumentStore(nodeFiles(dir), dir)
    await Promise.all(Array.from({ length: 8 }, (_, i) => other().addComment(slug, { version: 1, anchor: null, text: `n${i}` })))
    assert.equal((await store.comments(slug)).comments.length, 8)
    const results = await Promise.allSettled([
      other().saveEdit({ slug, base: 1, html: HTML }),
      other().saveEdit({ slug, base: 1, html: HTML }),
    ])
    assert.deepEqual(results.map(r => r.status).sort(), ['fulfilled', 'rejected'])
    assert.deepEqual((await store.meta(slug)).versions.map(v => v.n), [1, 2])
  })
})

test('revise rejects two replies to one comment', async () => {
  await withStore(async store => {
    const { slug } = await store.create({ title: 'Plan', html: HTML })
    const c = await store.addComment(slug, { version: 1, anchor: null, text: 'note' })
    await assert.rejects(store.revise({ slug, html: HTML, replies: [
      { comment_id: c.id, status: 'applied', text: 'a' },
      { comment_id: c.id, status: 'applied', text: 'b' },
    ] }), /more than one reply/)
  })
})

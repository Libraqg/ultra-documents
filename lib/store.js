// Document store: versions, metadata and comments for one workspace.
//
// Layout (see docs/DESIGN.md):
//   <workspace>/.ultra-documents/.gitignore
//   <workspace>/.ultra-documents/<slug>/doc.json
//   <workspace>/.ultra-documents/<slug>/v<n>.ultra.html
//   <workspace>/.ultra-documents/<slug>/comments.json
//
// The store talks to the filesystem through a three-method adapter so the
// host can back it with ctx.fs and tests with node:fs.

import { randomBytes } from 'node:crypto'
import path from 'node:path'

export const ROOT_DIR = '.ultra-documents'
export const DOC_SUFFIX = '.ultra.html'
export const MAX_HTML_BYTES = 8 * 1024 * 1024
export const MAX_COMMENT_CHARS = 4000
export const MAX_REPLY_CHARS = 4000
export const MAX_ANCHOR_CHARS = 2000

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/
const COMMENT_ID = /^c_[a-z0-9]{6,32}$/
const COMMENT_STATUSES = new Set(['open', 'applied', 'declined', 'answered', 'resolved'])
const REPLY_STATUSES = new Set(['applied', 'declined', 'answered'])

export class StoreError extends Error {
  constructor(message, code) {
    super(message)
    this.code = code
  }
}

export function isSlug(value) {
  return typeof value === 'string' && SLUG.test(value)
}

// ASCII slug from a title; non-Latin titles fall back to "doc" and the
// caller's uniqueness suffix keeps them apart.
export function slugify(title) {
  const base = String(title || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '')
  return base || 'doc'
}

export function versionFileName(n) {
  if (!Number.isSafeInteger(n) || n < 1) throw new StoreError(`invalid version number ${JSON.stringify(n)}`, 'CORRUPT')
  return `v${n}${DOC_SUFFIX}`
}

// doc.json is a plain file the agent can also write with its own tools, so its
// contents are checked before anything is derived from them (version numbers
// become file names).
export function validateMeta(meta, slug) {
  const ok = meta && typeof meta === 'object' && meta.slug === slug && typeof meta.title === 'string'
    && Array.isArray(meta.versions) && meta.versions.length > 0
    && meta.versions.every((v, i) => v && Number.isSafeInteger(v.n) && v.n >= 1 && (i === 0 || v.n > meta.versions[i - 1].n))
  if (!ok) throw new StoreError(`doc.json of "${slug}" is malformed`, 'CORRUPT')
  return meta
}

// One queue per .ultra-documents directory, shared by every DocumentStore in
// this process: tool calls and sidebar commands each build their own store.
const QUEUES = new Map()

// "<...>/.ultra-documents/<slug>/v<n>.ultra.html" → { slug, version }.
export function parseVersionPath(filePath) {
  const parts = String(filePath).replace(/\\/g, '/').split('/')
  const file = parts.pop()
  const slug = parts.pop()
  const root = parts.pop()
  const m = /^v([1-9][0-9]{0,5})\.ultra\.html$/.exec(file || '')
  if (!m || root !== ROOT_DIR || !isSlug(slug)) return null
  return { slug, version: Number(m[1]) }
}

function newCommentId() {
  return 'c_' + randomBytes(6).toString('hex')
}

function clampText(value, max) {
  return String(value ?? '').slice(0, max)
}

function requireText(value, max, what) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new StoreError(`${what} must be a non-empty string`, 'INVALID')
  if (value.length > max) throw new StoreError(`${what} exceeds ${max} characters`, 'INVALID')
  return value
}

function requireHtml(html) {
  if (typeof html !== 'string' || html.trim().length === 0) throw new StoreError('html must be a non-empty string', 'INVALID')
  if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) throw new StoreError(`html exceeds ${MAX_HTML_BYTES} bytes`, 'INVALID')
  return html
}

// Anchors come from the in-frame probe: a text quote with surrounding context,
// or a CSS path to a visual element. Anything else is dropped.
export function normalizeAnchor(anchor) {
  if (!anchor || typeof anchor !== 'object') return null
  if (anchor.kind === 'element') {
    if (typeof anchor.selector !== 'string' || !anchor.selector) return null
    return {
      kind: 'element',
      selector: clampText(anchor.selector, MAX_ANCHOR_CHARS),
      label: clampText(anchor.label, 80),
    }
  }
  if (typeof anchor.text !== 'string' || !anchor.text.trim()) return null
  const out = {
    kind: 'text',
    text: clampText(anchor.text, MAX_ANCHOR_CHARS),
    context_before: clampText(anchor.context_before, 200),
    context_after: clampText(anchor.context_after, 200),
  }
  if (Number.isInteger(anchor.occurrence) && anchor.occurrence >= 0) out.occurrence = anchor.occurrence
  return out
}

export class DocumentStore {
  /**
   * @param {{ read(p: string): Promise<string|undefined>, write(p: string, text: string): Promise<void>, list(p: string): Promise<string[]> }} files
   * @param {string} workspace - absolute workspace root
   * @param {{ now?: () => Date }} [options]
   */
  constructor(files, workspace, options = {}) {
    this.files = files
    this.root = path.join(path.resolve(workspace), ROOT_DIR)
    this.now = options.now || (() => new Date())
  }

  // Serialize every read-modify-write on this directory so two calls never
  // interleave, whichever store instance they come through.
  serial(op) {
    const run = (QUEUES.get(this.root) || Promise.resolve()).then(op, op)
    QUEUES.set(this.root, run.catch(() => {}))
    return run
  }

  docDir(slug) {
    return path.join(this.root, slug)
  }

  versionPath(slug, n) {
    return path.join(this.docDir(slug), versionFileName(n))
  }

  async readJson(file, fallback) {
    const text = await this.files.read(file)
    if (text === undefined) return fallback
    try {
      return JSON.parse(text)
    } catch {
      throw new StoreError(`${file} is not valid JSON`, 'CORRUPT')
    }
  }

  async writeJson(file, value) {
    await this.files.write(file, JSON.stringify(value, null, 2) + '\n')
  }

  async ensureRoot() {
    const ignore = path.join(this.root, '.gitignore')
    if ((await this.files.read(ignore)) === undefined) await this.files.write(ignore, '*\n')
  }

  async meta(slug) {
    if (!isSlug(slug)) throw new StoreError(`invalid document slug "${slug}"`, 'INVALID')
    const meta = await this.readJson(path.join(this.docDir(slug), 'doc.json'), undefined)
    if (!meta) throw new StoreError(`no document "${slug}" in this workspace`, 'NOT_FOUND')
    return validateMeta(meta, slug)
  }

  async readComments(slug) {
    const list = await this.readJson(path.join(this.docDir(slug), 'comments.json'), [])
    return Array.isArray(list) ? list : []
  }

  async writeComments(slug, comments) {
    await this.writeJson(path.join(this.docDir(slug), 'comments.json'), comments)
  }

  async list() {
    let names
    try {
      names = await this.files.list(this.root)
    } catch {
      return []
    }
    const docs = []
    for (const name of names.sort()) {
      if (!isSlug(name)) continue
      // One unreadable or malformed document must not hide the others.
      const meta = await this.meta(name).catch(() => undefined)
      if (!meta) continue
      const comments = await this.readComments(name).catch(() => [])
      const latest = meta.versions[meta.versions.length - 1]
      docs.push({
        slug: meta.slug,
        title: meta.title,
        latest_version: latest.n,
        updated_at: latest.created_at,
        open_comments: comments.filter(c => c.status === 'open').length,
        path: this.versionPath(meta.slug, latest.n),
      })
    }
    return docs
  }

  create({ title, html, slug: wanted }) {
    return this.serial(async () => {
      requireText(title, 200, 'title')
      requireHtml(html)
      await this.ensureRoot()
      const base = isSlug(wanted) ? wanted.slice(0, 48) : slugify(title)
      let slug = base
      for (let i = 2; (await this.files.read(path.join(this.docDir(slug), 'doc.json'))) !== undefined; i++) {
        slug = `${base}-${i}`.slice(0, 64)
      }
      const at = this.now().toISOString()
      const file = this.versionPath(slug, 1)
      await this.files.write(file, html)
      await this.writeComments(slug, [])
      await this.writeJson(path.join(this.docDir(slug), 'doc.json'), {
        slug,
        title: title.trim(),
        created_at: at,
        versions: [{ n: 1, created_at: at }],
      })
      return { slug, title: title.trim(), version: 1, path: file }
    })
  }

  revise({ slug, html, note, replies = [] }) {
    return this.serial(async () => {
      requireHtml(html)
      const meta = await this.meta(slug)
      const comments = await this.readComments(slug)
      const byId = new Map(comments.map(c => [c.id, c]))
      const seen = new Set()
      for (const reply of replies) {
        if (seen.has(reply.comment_id)) throw new StoreError(`comment "${reply.comment_id}" has more than one reply`, 'INVALID')
        seen.add(reply.comment_id)
        if (!byId.has(reply.comment_id)) throw new StoreError(`no comment "${reply.comment_id}" on "${slug}"`, 'NOT_FOUND')
        if (!REPLY_STATUSES.has(reply.status)) throw new StoreError(`reply status must be applied, declined or answered`, 'INVALID')
        requireText(reply.text, MAX_REPLY_CHARS, 'reply text')
      }
      const at = this.now().toISOString()
      const n = meta.versions[meta.versions.length - 1].n + 1
      const file = this.versionPath(slug, n)
      await this.files.write(file, html)
      // doc.json first: a reply must never point at a version the sidebar
      // does not list yet.
      const entry = { n, created_at: at }
      if (typeof note === 'string' && note.trim()) entry.note = clampText(note.trim(), 500)
      meta.versions.push(entry)
      await this.writeJson(path.join(this.docDir(slug), 'doc.json'), meta)
      for (const reply of replies) {
        const comment = byId.get(reply.comment_id)
        comment.replies = [...(comment.replies || []), { author: 'ai', text: reply.text, status: reply.status, version: n, at }]
        comment.status = reply.status
      }
      await this.writeComments(slug, comments)
      return { slug, title: meta.title, version: n, path: file, replied: replies.map(r => r.comment_id) }
    })
  }

  // A version the user edited by hand in the sidebar. `base` is the version
  // the edit started from; if the agent wrote a newer one meanwhile, refuse
  // rather than silently dropping either side's changes.
  saveEdit({ slug, base, html }) {
    return this.serial(async () => {
      requireHtml(html)
      const meta = await this.meta(slug)
      const latest = meta.versions[meta.versions.length - 1].n
      if (base !== latest) throw new StoreError(`"${slug}" has a newer version ${latest}; edit that one instead`, 'CONFLICT')
      const at = this.now().toISOString()
      const n = latest + 1
      const file = this.versionPath(slug, n)
      await this.files.write(file, html)
      meta.versions.push({ n, created_at: at, author: 'user', note: 'Edited by hand' })
      await this.writeJson(path.join(this.docDir(slug), 'doc.json'), meta)
      return { slug, title: meta.title, version: n, path: file }
    })
  }

  async comments(slug, { includeResolved = false } = {}) {
    const meta = await this.meta(slug)
    const comments = await this.readComments(slug)
    return {
      slug,
      title: meta.title,
      latest_version: meta.versions[meta.versions.length - 1].n,
      comments: includeResolved ? comments : comments.filter(c => c.status === 'open'),
    }
  }

  addComment(slug, { version, anchor, text }) {
    return this.serial(async () => {
      const meta = await this.meta(slug)
      requireText(text, MAX_COMMENT_CHARS, 'comment text')
      const known = meta.versions.some(v => v.n === version)
      if (!known) throw new StoreError(`"${slug}" has no version ${version}`, 'INVALID')
      const comments = await this.readComments(slug)
      const comment = {
        id: newCommentId(),
        version,
        anchor: normalizeAnchor(anchor),
        text: text.trim(),
        author: { kind: 'user' },
        status: 'open',
        created_at: this.now().toISOString(),
        replies: [],
      }
      comments.push(comment)
      await this.writeComments(slug, comments)
      return comment
    })
  }

  setStatus(slug, id, status) {
    return this.serial(async () => {
      if (!COMMENT_ID.test(id || '')) throw new StoreError(`invalid comment id "${id}"`, 'INVALID')
      if (!COMMENT_STATUSES.has(status)) throw new StoreError(`invalid status "${status}"`, 'INVALID')
      await this.meta(slug)
      const comments = await this.readComments(slug)
      const comment = comments.find(c => c.id === id)
      if (!comment) throw new StoreError(`no comment "${id}" on "${slug}"`, 'NOT_FOUND')
      comment.status = status
      await this.writeComments(slug, comments)
      return comment
    })
  }

  deleteComment(slug, id) {
    return this.serial(async () => {
      if (!COMMENT_ID.test(id || '')) throw new StoreError(`invalid comment id "${id}"`, 'INVALID')
      await this.meta(slug)
      const comments = await this.readComments(slug)
      const next = comments.filter(c => c.id !== id)
      if (next.length === comments.length) throw new StoreError(`no comment "${id}" on "${slug}"`, 'NOT_FOUND')
      await this.writeComments(slug, next)
      return { id }
    })
  }
}

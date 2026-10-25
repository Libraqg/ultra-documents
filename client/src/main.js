// ultra-documents — web client (body of the __ModuleLoader__ factory).
//
// scripts/build-client.mjs wraps this file into client.js and replaces the two
// placeholders below with the frame probe and the reader stylesheet, both
// inherited from tdoc.
//
// What it registers: a document-preview implementation for *.ultra.html files
// and its body on the keyed slot `sidebar.right.tab.document`. The body renders
// the version in a sandboxed iframe (allow-scripts, no allow-same-origin), talks
// to tdoc's frame probe over postMessage for selections and highlights, saves
// comments through the host `/ultra-documents` command, and sends open comments
// to the Session with `remote.session.prompt`.

const React = require('react')
const ReactDOM = require('react-dom')
const h = React.createElement
const { useCallback, useEffect, useMemo, useRef, useState } = React

const FRAME_PROBE = __FRAME_PROBE__
const READER_CSS = __READER_CSS__

const IMPL_ID = 'ultra-documents'
const LOCALE_ID = 'ultraDocuments'
const COMMAND = 'ultra-documents'
const POLL_MS = 3000
const FILE_ADDRESS_PREFIX = 'dsh-resource://file/'

const zh = {
  title: '批注文档',
  loading: '正在载入文档…',
  failed: '无法载入这份文档',
  notUltra: '这不是 ultra-documents 的版本文件',
  version: '版本',
  newVersion: '已有新版本 v{n}',
  openNewVersion: '查看 v{n}',
  modeRead: '阅读',
  modeComment: '批注',
  modeHint: '批注模式：选中文字或点选图表即可批注；阅读模式：可以正常点击文档里的交互内容',
  fullscreen: '全屏',
  exitFullscreen: '退出全屏',
  send: '交给 AI',
  sending: '发送中…',
  sent: '已发给 AI',
  sendFailed: '发送失败：{error}',
  comments: '批注',
  openCount: '{n} 条待处理',
  noComments: '还没有批注。选中文字或点选图表即可添加。',
  composerPlaceholder: '写下你的意见…',
  save: '保存批注',
  cancel: '取消',
  saving: '保存中…',
  saveFailed: '保存失败：{error}',
  resolve: '标为已解决',
  reopen: '重新打开',
  remove: '删除',
  status_open: '待处理',
  status_applied: '已修改',
  status_declined: '未采纳',
  status_answered: '已回答',
  status_resolved: '已解决',
  onVersion: 'v{n}',
  ai: 'AI',
  showResolved: '显示已处理',
  hideResolved: '隐藏已处理',
  element: '图表：{label}',
  frame: '文档预览',
  modeEdit: '编辑',
  editHint: '直接修改文字和格式，保存后生成一个新版本',
  editNoScript: '这份文档带脚本，暂不支持直接编辑',
  editOnlyLatest: '只能编辑最新版本',
  editUnsaved: '有未保存的修改',
  editSave: '保存为新版本',
  editSaving: '保存中…',
  editDiscard: '放弃修改',
  editFailed: '保存失败：{error}',
  editConflict: 'AI 已经写出了 v{n}，你的修改没有保存。请切换到最新版本后再编辑。',
  fmtBold: '加粗',
  fmtItalic: '斜体',
  fmtH2: '标题',
  fmtH3: '小标题',
  fmtP: '正文',
  fmtUl: '无序列表',
  fmtOl: '有序列表',
  fmtQuote: '引用',
  fmtUndo: '撤销',
  fmtRedo: '重做',
  prompt: '请根据我的批注修改 ultra 文档《{title}》（slug: {slug}，当前最新 v{latest}）。待处理批注 {n} 条：{ids}。请先调用 ultra_documents_comments 读取批注，再用 ultra_documents_revise 写出新版本，并逐条回复。',
}

const en = {
  title: 'Commentable document',
  loading: 'Loading document…',
  failed: 'This document could not be loaded',
  notUltra: 'This is not an ultra-documents version file',
  version: 'Version',
  newVersion: 'Version {n} is available',
  openNewVersion: 'Show v{n}',
  modeRead: 'Read',
  modeComment: 'Comment',
  modeHint: 'Comment mode: select text or click a figure to comment. Read mode: interact with the document normally',
  fullscreen: 'Full screen',
  exitFullscreen: 'Exit full screen',
  send: 'Send to AI',
  sending: 'Sending…',
  sent: 'Sent to AI',
  sendFailed: 'Could not send: {error}',
  comments: 'Comments',
  openCount: '{n} open',
  noComments: 'No comments yet. Select text or click a figure to add one.',
  composerPlaceholder: 'Write your comment…',
  save: 'Save comment',
  cancel: 'Cancel',
  saving: 'Saving…',
  saveFailed: 'Could not save: {error}',
  resolve: 'Resolve',
  reopen: 'Reopen',
  remove: 'Delete',
  status_open: 'Open',
  status_applied: 'Applied',
  status_declined: 'Declined',
  status_answered: 'Answered',
  status_resolved: 'Resolved',
  onVersion: 'v{n}',
  ai: 'AI',
  showResolved: 'Show handled',
  hideResolved: 'Hide handled',
  element: 'Figure: {label}',
  frame: 'Document preview',
  modeEdit: 'Edit',
  editHint: 'Change the text and formatting directly; saving creates a new version',
  editNoScript: 'This document runs scripts and cannot be edited directly yet',
  editOnlyLatest: 'Only the latest version can be edited',
  editUnsaved: 'Unsaved changes',
  editSave: 'Save as new version',
  editSaving: 'Saving…',
  editDiscard: 'Discard changes',
  editFailed: 'Could not save: {error}',
  editConflict: 'The AI wrote v{n} in the meantime, so your changes were not saved. Switch to the latest version and edit that.',
  fmtBold: 'Bold',
  fmtItalic: 'Italic',
  fmtH2: 'Heading',
  fmtH3: 'Subheading',
  fmtP: 'Body text',
  fmtUl: 'Bulleted list',
  fmtOl: 'Numbered list',
  fmtQuote: 'Quote',
  fmtUndo: 'Undo',
  fmtRedo: 'Redo',
  prompt: 'Please revise ultra document "{title}" (slug: {slug}, latest v{latest}) from my comments. {n} open comment(s): {ids}. Call ultra_documents_comments to read them, then write the next version with ultra_documents_revise and reply to each one.',
}

// ---- pure helpers -----------------------------------------------------------

function parseFileAddress(address) {
  try {
    if (typeof address !== 'string' || !address.startsWith(FILE_ADDRESS_PREFIX)) return undefined
    const end = address.search(/[?#]/)
    const [scope, id, ...segments] = address.slice(FILE_ADDRESS_PREFIX.length, end === -1 ? undefined : end).split('/')
    if (scope !== 'session' || !id || segments.length === 0) return undefined
    return { sessionId: decodeURIComponent(id), path: segments.map(decodeURIComponent).join('/') }
  } catch {
    return undefined
  }
}

function parseVersionPath(filePath) {
  const parts = String(filePath).replace(/\\/g, '/').split('/')
  const file = parts.pop()
  const slug = parts.pop()
  const root = parts.pop()
  const m = /^v([1-9][0-9]{0,5})\.ultra\.html$/.exec(file || '')
  if (!m || root !== '.ultra-documents' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug || '')) return null
  return { slug, version: Number(m[1]), dir: parts.concat(root, slug).join('/') }
}

function fill(template, values) {
  return String(template).replace(/\{(\w+)\}/g, (_, k) => (values && values[k] !== undefined ? String(values[k]) : ''))
}

// Reader styles go right before </head>, after any author <style>, so the
// zero-specificity defaults lose to whatever the author set. The probe goes
// last in <body> so it runs after the author's own scripts parse. Both carry
// data-tdoc-provider: the probe drops such nodes when it serializes an edit.
function composeFrameDocument(html) {
  const reader = '<style id="tdoc-reader" data-tdoc-provider>' + READER_CSS + '</style>'
  const probe = '<script data-tdoc-provider>' + FRAME_PROBE.replace(/<\/script/gi, '<\\/script') + '</script>'
  let out = html
  out = /<\/head>/i.test(out) ? out.replace(/<\/head>/i, reader + '</head>') : reader + out
  out = /<\/body>/i.test(out) ? out.replace(/<\/body>(?![\s\S]*<\/body>)/i, probe + '</body>') : out + probe
  return out
}

// Direct editing is limited to documents without author scripts: an edit is
// saved by serializing the live DOM, which for a scripted page already holds
// the script's output, so reopening it would run the script a second time.
// "Script" covers <script>, inline event handlers, javascript: URLs and
// embedded frames.
function hasAuthorScript(html) {
  let doc
  try {
    doc = new DOMParser().parseFromString(html, 'text/html')
  } catch {
    return /<script\b|\son\w+\s*=|javascript:/i.test(html)
  }
  if (doc.querySelector('script, iframe, frame, object, embed')) return true
  for (const el of doc.querySelectorAll('*')) {
    for (const attr of el.attributes) {
      if (/^on/i.test(attr.name)) return true
      if (/^\s*javascript:/i.test(attr.value) && /^(href|src|xlink:href|action|formaction)$/i.test(attr.name)) return true
    }
  }
  return false
}

const COMMENT_ID = /^c_[a-z0-9]{6,32}$/
const NAVIGATE_INTERVAL_MS = 1000

// The probe's serializer removes its editor attributes but leaves the
// interaction-mode marker (and, mid-gesture, the selecting marker) on <html>.
function cleanSavedHtml(html) {
  return html.replace(/<html\b[^>]*>/i, tag => tag.replace(/\s+data-tdoc-(?:interaction-mode|selecting)(?:="[^"]*")?/gi, ''))
}

const FORMATS = [
  ['fmtBold', 'bold'],
  ['fmtItalic', 'italic'],
  ['fmtH2', 'formatBlock', 'h2'],
  ['fmtH3', 'formatBlock', 'h3'],
  ['fmtP', 'formatBlock', 'p'],
  ['fmtUl', 'insertUnorderedList'],
  ['fmtOl', 'insertOrderedList'],
  ['fmtQuote', 'formatBlock', 'blockquote'],
  ['fmtUndo', 'undo'],
  ['fmtRedo', 'redo'],
]

function decodeText(data) {
  return new TextDecoder('utf-8').decode(data)
}

// Remote calls answer with { ok: true, value } or { ok: false, error } rather
// than throwing; unwrap one and turn a failure into an exception.
function unwrap(result) {
  if (result && result.ok === false) {
    const error = result.error || {}
    throw new Error(error.message || error.code || 'request failed')
  }
  return result && result.ok === true ? result.value : result
}

function commandResult(response) {
  const execution = unwrap(response)
  const result = execution && (execution.result || execution)
  if (!result || !result.kind) throw new Error('command was not accepted')
  if (result.kind === 'error') throw new Error(result.text || 'command failed')
  return result.text || ''
}

function clientTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
  } catch {
    return undefined
  }
}

function isDarkPage() {
  try {
    const bg = getComputedStyle(document.body).backgroundColor
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(bg)
    if (!m) return window.matchMedia('(prefers-color-scheme: dark)').matches
    const [r, g, b] = m.slice(1).map(Number)
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5
  } catch {
    return false
  }
}

function newRequestId() {
  return (crypto && crypto.randomUUID) ? crypto.randomUUID() : 'ud-' + Date.now() + '-' + Math.random().toString(16).slice(2)
}

const STYLE = `
.ud-root{display:flex;flex-direction:column;height:100%;min-height:0;font:inherit;color:inherit}
.ud-full{position:fixed;inset:0;z-index:2147483000;background:var(--ud-bg,#fff);display:flex;flex-direction:column}
.ud-bar{display:flex;align-items:center;gap:6px;padding:6px 8px;border-bottom:1px solid rgba(127,127,127,.25);flex-wrap:wrap}
.ud-title{font-weight:600;flex:1 1 120px;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ud-btn{font:inherit;font-size:12px;line-height:1.2;padding:4px 8px;border-radius:6px;border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;cursor:pointer;white-space:nowrap}
.ud-btn:hover:not(:disabled){background:rgba(127,127,127,.12)}
.ud-btn:disabled{opacity:.5;cursor:default}
.ud-btn.ud-primary{background:#1652f0;border-color:#1652f0;color:#fff}
.ud-btn.ud-primary:hover:not(:disabled){background:#1245d0}
.ud-btn.ud-on{background:rgba(22,82,240,.14);border-color:rgba(22,82,240,.5)}
.ud-select{font:inherit;font-size:12px;padding:3px 4px;border-radius:6px;border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit}
.ud-banner{padding:6px 10px;font-size:12px;background:rgba(22,82,240,.1);display:flex;gap:8px;align-items:center}
.ud-note{padding:6px 10px;font-size:12px;opacity:.75}
.ud-error{padding:6px 10px;font-size:12px;color:#b42318}
.ud-stage{flex:1 1 auto;min-height:0;position:relative;background:#fff}
.ud-frame{position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff}
.ud-panel{flex:0 0 auto;max-height:45%;display:flex;flex-direction:column;border-top:1px solid rgba(127,127,127,.25);min-height:0}
.ud-panel-head{display:flex;align-items:center;gap:6px;padding:6px 8px;font-size:12px}
.ud-panel-head strong{flex:1}
.ud-list{overflow:auto;padding:0 8px 8px;display:flex;flex-direction:column;gap:6px}
.ud-card{border:1px solid rgba(127,127,127,.25);border-radius:8px;padding:6px 8px;font-size:12px;cursor:pointer}
.ud-card.ud-active{border-color:#1652f0;box-shadow:0 0 0 2px rgba(22,82,240,.2)}
.ud-card.ud-done{opacity:.65}
.ud-quote{border-left:3px solid #f5c400;padding-left:6px;margin:0 0 4px;opacity:.85;white-space:pre-wrap;word-break:break-word;max-height:4.2em;overflow:hidden}
.ud-text{white-space:pre-wrap;word-break:break-word}
.ud-meta{display:flex;gap:6px;align-items:center;margin-top:4px;opacity:.75;flex-wrap:wrap}
.ud-chip{border-radius:999px;padding:0 6px;border:1px solid rgba(127,127,127,.35)}
.ud-reply{margin-top:4px;padding:4px 6px;border-radius:6px;background:rgba(127,127,127,.1);white-space:pre-wrap;word-break:break-word}
.ud-actions{display:flex;gap:4px;margin-top:4px}
.ud-composer{padding:8px;border-top:1px solid rgba(127,127,127,.25);display:flex;flex-direction:column;gap:6px}
.ud-composer textarea{font:inherit;font-size:13px;min-height:56px;resize:vertical;padding:6px;border-radius:6px;border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit}
.ud-row{display:flex;gap:6px;justify-content:flex-end}
.ud-tools{display:flex;align-items:center;gap:4px;padding:6px 8px;border-bottom:1px solid rgba(127,127,127,.25);flex-wrap:wrap;background:rgba(22,82,240,.06)}
.ud-tools .ud-spacer{flex:1}
.ud-dirty{font-size:12px;opacity:.75}
`

function ensureStyle() {
  if (document.getElementById('ultra-documents-style')) return
  const style = document.createElement('style')
  style.id = 'ultra-documents-style'
  style.textContent = STYLE
  document.head.appendChild(style)
}

// ---- body ---------------------------------------------------------------------

function anchorLabel(comment, t) {
  const a = comment.anchor
  if (!a) return ''
  if (a.kind === 'element') return fill(t('element'), { label: a.label || a.selector })
  return a.text
}

function CommentCard({ comment, active, t, onFocus, onStatus, onDelete }) {
  const done = comment.status !== 'open'
  const quote = anchorLabel(comment, t)
  return h('div', {
    className: 'ud-card' + (active ? ' ud-active' : '') + (done ? ' ud-done' : ''),
    onClick: () => onFocus(comment.id),
    'data-comment-id': comment.id,
  },
    quote ? h('p', { className: 'ud-quote' }, quote) : null,
    h('div', { className: 'ud-text' }, comment.text),
    (comment.replies || []).map((reply, i) => h('div', { key: i, className: 'ud-reply' },
      h('strong', null, t('ai') + ' · ' + fill(t('onVersion'), { n: reply.version }) + ' '), reply.text)),
    h('div', { className: 'ud-meta' },
      h('span', { className: 'ud-chip' }, t('status_' + comment.status) || comment.status),
      h('span', null, fill(t('onVersion'), { n: comment.version }))),
    h('div', { className: 'ud-actions', onClick: e => e.stopPropagation() },
      comment.status === 'open'
        ? h('button', { className: 'ud-btn', onClick: () => onStatus(comment.id, 'resolved') }, t('resolve'))
        : h('button', { className: 'ud-btn', onClick: () => onStatus(comment.id, 'open') }, t('reopen')),
      h('button', { className: 'ud-btn', onClick: () => onDelete(comment.id) }, t('remove'))))
}

function createBody(ctx) {
  return function UltraDocumentBody({ content, resourceAddress, t }) {
    const address = useMemo(() => parseFileAddress(resourceAddress), [resourceAddress])
    const opened = useMemo(() => (address ? parseVersionPath(address.path) : null), [address])
    const [meta, setMeta] = useState(null)
    const [comments, setComments] = useState([])
    const [viewVersion, setViewVersion] = useState(opened ? opened.version : 1)
    const [fetched, setFetched] = useState({})
    const [mode, setMode] = useState('comment')
    const [pending, setPending] = useState(null)
    const [draft, setDraft] = useState('')
    const [saving, setSaving] = useState(false)
    const [sendState, setSendState] = useState('idle')
    const [error, setError] = useState(null)
    const [activeId, setActiveId] = useState(null)
    const [showDone, setShowDone] = useState(false)
    const [fullscreen, setFullscreen] = useState(false)
    const [editDirty, setEditDirty] = useState(false)
    const [editSaving, setEditSaving] = useState(false)
    const [frameNonce, setFrameNonce] = useState(0)
    const serializeWaiters = useRef(new Map())
    const frameRef = useRef(null)
    const listRef = useRef(null)
    const draftRef = useRef('')
    draftRef.current = draft
    const lastNavigate = useRef(0)

    useEffect(ensureStyle, [])
    useEffect(() => { if (opened) setViewVersion(opened.version) }, [opened && opened.version])

    const sessionId = address && address.sessionId
    const readText = useCallback(async (file, signal) => {
      const bytes = unwrap(await ctx.remote.workspaceFiles.readBytes(sessionId, file, {}, signal))
      return decodeText(bytes.data)
    }, [sessionId])

    // doc.json and comments.json change under us (the agent revises, another
    // tab comments), so poll them while the tab is visible.
    const refresh = useCallback(async signal => {
      if (!opened) return
      try {
        const [docText, commentsText] = await Promise.all([
          readText(opened.dir + '/doc.json', signal),
          readText(opened.dir + '/comments.json', signal).catch(() => '[]'),
        ])
        setMeta(JSON.parse(docText))
        const list = JSON.parse(commentsText)
        setComments(Array.isArray(list) ? list : [])
      } catch (e) {
        if (!(signal && signal.aborted)) setError(String(e && e.message || e))
      }
    }, [opened, readText])

    useEffect(() => {
      const controller = new AbortController()
      refresh(controller.signal)
      const timer = setInterval(() => {
        if (document.visibilityState === 'visible') refresh(controller.signal)
      }, POLL_MS)
      return () => { controller.abort(); clearInterval(timer) }
    }, [refresh])

    // Bytes for the version on screen: the tab's own content for the opened
    // version, a workspace read for any other.
    useEffect(() => {
      if (!opened || viewVersion === opened.version || fetched[viewVersion] !== undefined) return
      const controller = new AbortController()
      readText(opened.dir + '/v' + viewVersion + '.ultra.html', controller.signal)
        .then(text => setFetched(prev => ({ ...prev, [viewVersion]: text })))
        .catch(e => { if (!controller.signal.aborted) setError(String(e && e.message || e)) })
      return () => controller.abort()
    }, [opened, viewVersion, fetched, readText])

    const html = useMemo(() => {
      if (!opened) return undefined
      if (viewVersion === opened.version) return content && content.kind === 'bytes' ? decodeText(content.data) : undefined
      return fetched[viewVersion]
    }, [opened, viewVersion, content, fetched])
    const srcDoc = useMemo(() => (html === undefined ? undefined : composeFrameDocument(html)), [html])

    const openComments = useMemo(() => comments.filter(c => c.status === 'open'), [comments])
    const visible = showDone ? comments : openComments

    const post = useCallback(message => {
      const win = frameRef.current && frameRef.current.contentWindow
      if (win) win.postMessage(Object.assign({ source: 'tdoc-shell' }, message), '*')
    }, [])

    // Only open comments are highlighted: a handled comment's quote is often
    // gone from the newer version, and the probe would fall back to marking
    // the whole surrounding block.
    // The frame runs model-authored script, so it gets only what highlighting
    // needs, never the comment text or replies.
    const pushAnchors = useCallback(() => {
      post({ type: 'tdoc:anchors', comments: openComments.filter(c => c.anchor).map(c => ({ id: c.id, anchor: c.anchor, status: c.status })) })
    }, [post, openComments])

    useEffect(pushAnchors, [pushAnchors])
    useEffect(() => { post({ type: 'tdoc:mode', mode }) }, [post, mode])

    useEffect(() => {
      function onMessage(e) {
        const frame = frameRef.current
        if (!frame || e.source !== frame.contentWindow) return
        const d = e.data
        if (!d || d.source !== 'tdoc-frame' || typeof d.type !== 'string') return
        if (d.type === 'tdoc:ready') {
          post({ type: 'tdoc:theme', theme: isDarkPage() ? 'dark' : 'light' })
          post({ type: 'tdoc:mode', mode })
          pushAnchors()
        } else if (d.type === 'tdoc:selection') {
          const anchor = d.kind === 'element'
            ? { kind: 'element', selector: String(d.selector || ''), label: String(d.label || '') }
            : { kind: 'text', text: String(d.text || ''), context_before: String(d.context_before || ''), context_after: String(d.context_after || ''), occurrence: Number.isInteger(d.occurrence) ? d.occurrence : undefined }
          if (anchor.kind === 'element' ? anchor.selector : anchor.text.trim()) setPending(anchor)
        } else if (d.type === 'tdoc:cleared') {
          setPending(prev => (prev && !draftRef.current.trim() ? null : prev))
        } else if (d.type === 'tdoc:editState') {
          setEditDirty(!!d.dirty)
        } else if (d.type === 'tdoc:editDocument' && typeof d.requestId === 'string') {
          const resolve = serializeWaiters.current.get(d.requestId)
          serializeWaiters.current.delete(d.requestId)
          if (resolve) resolve(typeof d.html === 'string' ? d.html : '')
        } else if (d.type === 'tdoc:anchorClick') {
          if (typeof d.id === 'string' && COMMENT_ID.test(d.id)) setActiveId(d.id)
        } else if (d.type === 'tdoc:navigate' && typeof d.href === 'string' && /^https?:\/\//i.test(d.href)) {
          // Only for a real click (user activation propagates from the frame
          // to this page) and at most once a second: document script must not
          // be able to open tabs on its own.
          const now = Date.now()
          const activated = !navigator.userActivation || navigator.userActivation.isActive
          if (activated && now - lastNavigate.current >= NAVIGATE_INTERVAL_MS) {
            lastNavigate.current = now
            window.open(d.href, '_blank', 'noopener,noreferrer')
          }
        }
      }
      window.addEventListener('message', onMessage)
      return () => window.removeEventListener('message', onMessage)
    }, [post, pushAnchors, mode])

    useEffect(() => {
      if (!activeId || !listRef.current) return
      const el = [...listRef.current.children].find(child => child.dataset && child.dataset.commentId === activeId)
      if (el) el.scrollIntoView({ block: 'nearest' })
    }, [activeId])

    useEffect(() => {
      if (!fullscreen) return
      const onKey = e => { if (e.key === 'Escape') setFullscreen(false) }
      window.addEventListener('keydown', onKey)
      return () => window.removeEventListener('keydown', onKey)
    }, [fullscreen])

    const runCommand = useCallback(async (action, payload) => {
      const execution = await ctx.remote.commands.execute(sessionId, '/' + COMMAND + ' ' + action + ' ' + JSON.stringify(payload), [])
      return commandResult(execution)
    }, [sessionId])

    const saveComment = useCallback(async () => {
      if (!pending || !draft.trim() || !opened) return
      setSaving(true)
      setError(null)
      try {
        const anchor = Object.assign({}, pending)
        if (anchor.occurrence === undefined) delete anchor.occurrence
        await runCommand('comment-add', { slug: opened.slug, version: viewVersion, anchor, text: draft.trim() })
        setDraft('')
        setPending(null)
        post({ type: 'tdoc:clearPending' })
        await refresh()
      } catch (e) {
        setError(fill(t('saveFailed'), { error: e && e.message || e }))
      } finally {
        setSaving(false)
      }
    }, [pending, draft, opened, viewVersion, runCommand, post, refresh, t])

    const setStatus = useCallback(async (id, status) => {
      try {
        await runCommand('comment-status', { slug: opened.slug, id, status })
        await refresh()
      } catch (e) {
        setError(fill(t('saveFailed'), { error: e && e.message || e }))
      }
    }, [opened, runCommand, refresh, t])

    const removeComment = useCallback(async id => {
      try {
        await runCommand('comment-delete', { slug: opened.slug, id })
        await refresh()
      } catch (e) {
        setError(fill(t('saveFailed'), { error: e && e.message || e }))
      }
    }, [opened, runCommand, refresh, t])

    const sendToAi = useCallback(async () => {
      if (!opened || openComments.length === 0) return
      setSendState('sending')
      setError(null)
      try {
        const latest = meta ? meta.versions[meta.versions.length - 1].n : viewVersion
        const text = fill(t('prompt'), {
          title: meta ? meta.title : opened.slug,
          slug: opened.slug,
          latest,
          n: openComments.length,
          ids: openComments.map(c => c.id).join(', '),
        })
        // mode "queue" runs after the current turn when the agent is busy.
        const request = { requestId: newRequestId(), sessionId, mode: 'queue', content: [{ type: 'text', text }] }
        const zone = clientTimeZone()
        if (zone) request.clientTimeZone = zone
        unwrap(await ctx.remote.session.prompt(request))
        setSendState('sent')
        setTimeout(() => setSendState('idle'), 3000)
      } catch (e) {
        setSendState('idle')
        setError(fill(t('sendFailed'), { error: e && e.message || e }))
      }
    }, [opened, openComments, meta, viewVersion, sessionId, t])

    const serializeEdit = useCallback(() => new Promise((resolve, reject) => {
      const requestId = newRequestId()
      const timer = setTimeout(() => {
        serializeWaiters.current.delete(requestId)
        reject(new Error('the document did not answer'))
      }, 5000)
      serializeWaiters.current.set(requestId, html => { clearTimeout(timer); resolve(html) })
      post({ type: 'tdoc:editSerialize', requestId })
    }), [post])

    const leaveEdit = useCallback(() => {
      setMode('comment')
      setEditDirty(false)
      // Reload the frame so the page is back to the saved version's bytes.
      setFrameNonce(n => n + 1)
    }, [])

    const saveEdit = useCallback(async () => {
      if (!opened) return
      setEditSaving(true)
      setError(null)
      try {
        const edited = cleanSavedHtml(await serializeEdit())
        if (!edited.trim()) throw new Error('the document came back empty')
        const text = await runCommand('version-save', { slug: opened.slug, base: viewVersion, html: edited })
        const saved = Number((/version (\d+)/.exec(text) || [])[1])
        await refresh()
        leaveEdit()
        if (saved) setViewVersion(saved)
      } catch (e) {
        const message = String(e && e.message || e)
        const conflict = /newer version (\d+)/.exec(message)
        setError(conflict ? fill(t('editConflict'), { n: conflict[1] }) : fill(t('editFailed'), { error: message }))
      } finally {
        setEditSaving(false)
      }
    }, [opened, viewVersion, serializeEdit, runCommand, refresh, leaveEdit, t])

    const focusComment = useCallback(id => {
      setActiveId(id)
      post({ type: 'tdoc:focusAnchor', id, scroll: true })
    }, [post])

    if (!address || !opened) return h('p', { className: 'ud-error', role: 'alert' }, t('notUltra'))

    const latest = meta ? meta.versions[meta.versions.length - 1].n : opened.version
    const versions = meta ? meta.versions.map(v => v.n) : [opened.version]
    const editing = mode === 'edit'
    const scripted = html !== undefined && hasAuthorScript(html)
    const editBlocked = scripted ? t('editNoScript') : viewVersion !== latest ? t('editOnlyLatest') : null

    const bar = h('div', { className: 'ud-bar' },
      h('span', { className: 'ud-title', title: meta ? meta.title : opened.slug }, meta ? meta.title : opened.slug),
      h('select', {
        className: 'ud-select',
        'aria-label': t('version'),
        disabled: editing,
        value: viewVersion,
        onChange: e => { setViewVersion(Number(e.target.value)); setPending(null) },
      }, versions.map(n => h('option', { key: n, value: n }, 'v' + n))),
      editing ? null : h('button', {
        className: 'ud-btn' + (mode === 'comment' ? ' ud-on' : ''),
        title: t('modeHint'),
        onClick: () => setMode(mode === 'comment' ? 'read' : 'comment'),
      }, mode === 'comment' ? t('modeComment') : t('modeRead')),
      editing ? null : h('button', {
        className: 'ud-btn',
        title: editBlocked || t('editHint'),
        disabled: !!editBlocked || srcDoc === undefined,
        onClick: () => { setPending(null); setDraft(''); setMode('edit') },
      }, t('modeEdit')),
      h('button', { className: 'ud-btn', disabled: editing, onClick: () => setFullscreen(!fullscreen) }, fullscreen ? t('exitFullscreen') : t('fullscreen')),
      h('button', {
        className: 'ud-btn ud-primary',
        disabled: openComments.length === 0 || sendState === 'sending',
        onClick: sendToAi,
      }, sendState === 'sending' ? t('sending') : sendState === 'sent' ? t('sent') : t('send') + (openComments.length ? ' (' + openComments.length + ')' : '')))

    const tools = editing
      ? h('div', { className: 'ud-tools' },
          FORMATS.map(([label, command, value]) => h('button', {
            key: label,
            className: 'ud-btn',
            // Keep focus (and the selection) inside the document.
            onMouseDown: e => e.preventDefault(),
            onClick: () => post({ type: 'tdoc:editFormat', command, value }),
          }, t(label))),
          h('span', { className: 'ud-spacer' }),
          editDirty ? h('span', { className: 'ud-dirty' }, t('editUnsaved')) : null,
          h('button', { className: 'ud-btn', disabled: editSaving, onClick: leaveEdit }, t('editDiscard')),
          h('button', { className: 'ud-btn ud-primary', disabled: editSaving || !editDirty, onClick: saveEdit }, editSaving ? t('editSaving') : t('editSave')))
      : null

    const banner = latest > viewVersion
      ? h('div', { className: 'ud-banner' },
          h('span', null, fill(t('newVersion'), { n: latest })),
          h('button', { className: 'ud-btn', onClick: () => { setViewVersion(latest); setPending(null) } }, fill(t('openNewVersion'), { n: latest })))
      : null

    const stage = h('div', { className: 'ud-stage' },
      srcDoc === undefined
        ? h('p', { className: 'ud-note' }, t('loading'))
        : h('iframe', {
            key: viewVersion + '-' + frameNonce + (fullscreen ? '-full' : ''),
            ref: frameRef,
            className: 'ud-frame',
            title: t('frame'),
            sandbox: 'allow-scripts',
            srcDoc,
          }))

    const composer = pending && !editing
      ? h('div', { className: 'ud-composer' },
          h('p', { className: 'ud-quote' }, pending.kind === 'element' ? fill(t('element'), { label: pending.label || pending.selector }) : pending.text),
          h('textarea', {
            autoFocus: true,
            value: draft,
            placeholder: t('composerPlaceholder'),
            onChange: e => setDraft(e.target.value),
            onKeyDown: e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') saveComment() },
          }),
          h('div', { className: 'ud-row' },
            h('button', { className: 'ud-btn', onClick: () => { setPending(null); setDraft(''); post({ type: 'tdoc:clearPending' }) } }, t('cancel')),
            h('button', { className: 'ud-btn ud-primary', disabled: saving || !draft.trim(), onClick: saveComment }, saving ? t('saving') : t('save'))))
      : null

    const panel = h('div', { className: 'ud-panel' },
      h('div', { className: 'ud-panel-head' },
        h('strong', null, t('comments') + ' · ' + fill(t('openCount'), { n: openComments.length })),
        comments.length > openComments.length
          ? h('button', { className: 'ud-btn', onClick: () => setShowDone(!showDone) }, showDone ? t('hideResolved') : t('showResolved'))
          : null),
      visible.length === 0
        ? h('p', { className: 'ud-note' }, t('noComments'))
        : h('div', { className: 'ud-list', ref: listRef }, visible.map(c => h(CommentCard, {
            key: c.id, comment: c, active: c.id === activeId, t,
            onFocus: focusComment, onStatus: setStatus, onDelete: removeComment,
          }))),
      composer)

    const view = h('div', {
      className: fullscreen ? 'ud-full' : 'ud-root',
      style: fullscreen ? { '--ud-bg': isDarkPage() ? '#1b1b1b' : '#fff' } : undefined,
    }, bar, tools, banner, error ? h('p', { className: 'ud-error', role: 'alert' }, error) : null, stage, panel)

    return fullscreen ? ReactDOM.createPortal(view, document.body) : view
  }
}

module.exports.inject = ['slots', 'documentPreviews', 'locale', 'remote', 'remote.commands', 'remote.session', 'remote.workspaceFiles']

module.exports.apply = ctx => {
  const t = ctx.locale.bind(LOCALE_ID)
  ctx.effect(() => ctx.locale.register(LOCALE_ID, { zh, en }), 'ultra-documents: dictionaries')
  ctx.effect(() => ctx.documentPreviews.register({
    id: IMPL_ID,
    extensions: ['ultra.html'],
    binaryExtensions: [],
    priority: 'extension',
    title: () => t('title'),
    loading: 'bytes-complete',
    wrap: false,
  }), 'ultra-documents: metadata')
  ctx.effect(() => ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register({
    name: 'sidebar.right.tab.document',
    key: IMPL_ID,
    locale: LOCALE_ID,
  }, createBody(ctx))), 'ultra-documents: body')
}

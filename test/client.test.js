import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

// Values built inside the vm context carry its prototypes; compare as plain JSON.
const plain = value => JSON.parse(JSON.stringify(value))

// Load the built client.js the way dsh does: through window.__ModuleLoader__,
// with `require` resolving the host-shared modules.
async function loadClient() {
  const code = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  let loaded
  const window = { __ModuleLoader__: { load: entry => { loaded = entry } } }
  vm.runInNewContext(code, { window })
  const shared = {
    react: { createElement: () => null, useCallback: f => f, useEffect: () => {}, useMemo: f => f(), useRef: v => ({ current: v }), useState: v => [v, () => {}] },
    'react-dom': { createPortal: v => v },
  }
  const exports = loaded.factory(name => {
    if (!(name in shared)) throw new Error(`unexpected require ${name}`)
    return shared[name]
  })
  return { id: loaded.id, exports }
}

test('client.js registers under the package name', async () => {
  const { id, exports } = await loadClient()
  assert.equal(id, 'ultra-documents')
  assert.deepEqual(plain(exports.inject), ['slots', 'documentPreviews', 'locale', 'remote', 'remote.commands', 'remote.session', 'remote.workspaceFiles'])
})

test('apply registers the .ultra.html preview and its sidebar body', async () => {
  const { exports } = await loadClient()
  const calls = { locale: [], previews: [], slots: [] }
  const ctx = {
    effect: fn => fn(),
    locale: { bind: () => key => key, register: (id, dicts) => calls.locale.push([id, Object.keys(dicts)]) },
    documentPreviews: { register: def => calls.previews.push(def) },
    slots: { inject: (_name, fn) => fn(), register: (meta, component) => calls.slots.push([meta, typeof component]) },
  }
  exports.apply(ctx)
  assert.deepEqual(plain(calls.locale), [['ultraDocuments', ['zh', 'en']]])
  assert.equal(calls.previews.length, 1)
  const def = calls.previews[0]
  assert.equal(def.id, 'ultra-documents')
  assert.deepEqual(plain(def.extensions), ['ultra.html'])
  assert.equal(def.priority, 'extension')
  assert.equal(def.loading, 'bytes-complete')
  assert.equal(def.title(), 'title')
  assert.deepEqual(plain(calls.slots), [[{ name: 'sidebar.right.tab.document', key: 'ultra-documents', locale: 'ultraDocuments' }, 'function']])
})

test('client.js is up to date with its sources', async () => {
  const { execFileSync } = await import('node:child_process')
  execFileSync(process.execPath, [new URL('../scripts/build-client.mjs', import.meta.url).pathname, '--check'])
})

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
  const calls = { locale: [], previews: [], slots: [], plugins: [] }
  const ctx = {
    effect: fn => fn(),
    locale: { bind: () => key => key, register: (id, dicts) => calls.locale.push([id, Object.keys(dicts)]) },
    documentPreviews: { register: def => calls.previews.push(def) },
    slots: { inject: (_name, fn) => fn(), register: (meta, component) => calls.slots.push([meta, typeof component]) },
    plugin: def => calls.plugins.push(def),
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
  // The update check is its own child plugin, so a host without the plugin
  // manager remote still gets the document body.
  assert.equal(calls.plugins.length, 1)
  assert.equal(calls.plugins[0].name, 'ultra-documents/update-check')
  assert.deepEqual(plain(calls.plugins[0].inject), ['remote', 'remote.pluginManager'])
})

const version = (v, extra = {}) => ({ version: v, tags: [], prerelease: v.includes('-'), bundle: true, ...extra })
const listed = (installed, versions) => ({ status: 'listed', installed, registry: null, attempts: [], versions, omitted: 0 })

test('pickUpdate offers the newest usable version', async () => {
  const { exports } = await loadClient()
  const { pickUpdate } = exports
  assert.equal(pickUpdate({ status: 'refused', problem: 'not-updatable', reason: '', attempts: [] }), null)
  assert.equal(pickUpdate(listed('0.1.0', [])), null)
  assert.deepEqual(plain(pickUpdate(listed('0.1.0', [version('0.3.0-rc.1'), version('0.2.0')]))), { from: '0.1.0', to: '0.2.0', registry: null })
  // Prereleases only for a prerelease install.
  assert.equal(pickUpdate(listed('0.1.0', [version('0.2.0-rc.1')])), null)
  assert.equal(pickUpdate(listed('0.2.0-rc.1', [version('0.2.0-rc.2')])).to, '0.2.0-rc.2')
  // Skip versions the running dsh rejects, deprecated ones and non-bundles.
  assert.equal(pickUpdate(listed('0.1.0', [
    version('0.4.0', { incompatible: { reason: 'engines' } }),
    version('0.3.0', { deprecated: 'broken' }),
    version('0.2.1', { bundle: false }),
    version('0.2.0'),
  ])).to, '0.2.0')
})

test('client.js is up to date with its sources', async () => {
  const { execFileSync } = await import('node:child_process')
  execFileSync(process.execPath, [new URL('../scripts/build-client.mjs', import.meta.url).pathname, '--check'])
})

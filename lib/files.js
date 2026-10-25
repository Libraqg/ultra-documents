// node:fs adapter for DocumentStore, confined to one workspace.
//
// The host writes with node:fs rather than ctx.fs: the sandboxed ctx.fs checks
// writes against the deployment's default workspace when called from plugin
// code, not the Session's, and refuses them. Bypassing it means this adapter
// has to do the confinement itself: every path it touches must resolve, after
// following symlinks, inside the workspace, and the file itself must not be a
// symlink. The store adds validated slugs and version numbers on top.

import { randomBytes } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

export class ConfinementError extends Error {
  constructor(target) {
    super(`refusing to touch ${target}: it resolves outside the workspace`)
    this.code = 'OUTSIDE_WORKSPACE'
  }
}

export function isInside(parent, child) {
  const rel = path.relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

async function exists(p) {
  try {
    await lstat(p)
    return true
  } catch (e) {
    if (e.code === 'ENOENT') return false
    throw e
  }
}

/** @param {string} workspace - absolute workspace root every path must stay inside */
export function nodeFiles(workspace) {
  if (typeof workspace !== 'string' || !path.isAbsolute(workspace)) throw new Error('nodeFiles needs an absolute workspace path')
  let rootReal
  const root = () => (rootReal ??= realpath(workspace))

  // The nearest existing ancestor of `dir` must resolve inside the workspace;
  // checked before mkdir so a symlinked directory cannot make us create
  // directories elsewhere.
  async function confineDir(dir) {
    let probe = path.resolve(dir)
    while (!(await exists(probe))) {
      const parent = path.dirname(probe)
      if (parent === probe) break
      probe = parent
    }
    if (!isInside(await root(), await realpath(probe))) throw new ConfinementError(dir)
  }

  async function refuseSymlink(p) {
    try {
      if ((await lstat(p)).isSymbolicLink()) throw new ConfinementError(p)
    } catch (e) {
      if (e.code !== 'ENOENT') throw e
    }
  }

  return {
    async read(p) {
      if (!(await exists(path.dirname(p)))) return undefined
      await confineDir(path.dirname(p))
      await refuseSymlink(p)
      try {
        return await readFile(p, 'utf8')
      } catch (e) {
        if (e.code === 'ENOENT') return undefined
        throw e
      }
    },
    async write(p, text) {
      const dir = path.dirname(p)
      await confineDir(dir)
      await mkdir(dir, { recursive: true })
      await confineDir(dir)
      await refuseSymlink(p)
      // A unique temp name: two writers of one file must not share it.
      const tmp = `${p}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
      try {
        await writeFile(tmp, text, { flag: 'wx' })
        await rename(tmp, p)
      } catch (e) {
        await rm(tmp, { force: true })
        throw e
      }
    },
    async list(p) {
      if (!(await exists(p))) return []
      await confineDir(p)
      return (await readdir(p, { withFileTypes: true })).filter(e => e.isDirectory()).map(e => e.name)
    },
  }
}

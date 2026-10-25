// ultra-documents — host entry.
//
// Each part is its own child plugin with its own inject list, so a profile
// that lacks one service (say, no skill registry) still gets the others.

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerTools } from './lib/tools.js'
import { registerCommands } from './lib/commands.js'

export const name = 'ultra-documents'

const SKILL_DIR = join(dirname(fileURLToPath(import.meta.url)), 'skills', 'ultra-documents')

// SKILL.md frontmatter → { description, content }.
export function parseSkill(text) {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text.replace(/\r\n/g, '\n'))
  if (!m) throw new Error('SKILL.md has no frontmatter')
  const description = /^description:\s*(.+)$/m.exec(m[1])?.[1]?.trim()
  if (!description) throw new Error('SKILL.md frontmatter has no description')
  return { description, content: m[2].trim() }
}

export function apply(ctx) {
  ctx.plugin({
    name: 'ultra-documents/tools',
    inject: ['tools', 'fs', 'workingDirectory', 'sessionProjections'],
    apply: registerTools,
  })

  ctx.plugin({
    name: 'ultra-documents/commands',
    inject: ['commands', 'workingDirectory'],
    apply: registerCommands,
  })

  ctx.plugin({
    name: 'ultra-documents/skill',
    inject: ['skills'],
    async apply(child) {
      const { description, content } = parseSkill(await readFile(join(SKILL_DIR, 'SKILL.md'), 'utf8'))
      child.effect(() => child.skills.register({
        name: 'ultra-documents',
        description,
        content,
        source: 'plugin:ultra-documents',
        path: join(SKILL_DIR, 'SKILL.md'),
        resourceBase: { kind: 'directory', path: SKILL_DIR },
        invocation: { modelInvocable: true, userInvocable: true },
      }))
    },
  })
}

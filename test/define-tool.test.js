import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defineTool } from '../lib/define-tool.js'

const tool = defineTool({
  name: 'demo',
  description: 'demo',
  parameters: {
    slug: { type: 'string', required: true },
    replies: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { id: { type: 'string', required: true } } } },
  },
  output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
  execute: async args => `ok ${args.slug}`,
})

test('defineTool emits JSON Schema with required arrays', () => {
  assert.deepEqual(tool.parameters, {
    type: 'object',
    properties: {
      slug: { type: 'string' },
      replies: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false } },
    },
    required: ['slug'],
  })
  assert.deepEqual(tool.output.schema, { type: 'string' })
})

test('execute validates arguments before running the body', async () => {
  assert.equal(await tool.execute({ slug: 'a', replies: [{ id: 'c' }] }, {}), 'ok a')
  await assert.rejects(tool.execute({}, {}), /args.slug is required/)
  await assert.rejects(tool.execute({ slug: 1 }, {}), /args.slug must be string/)
  await assert.rejects(tool.execute({ slug: 'a', replies: [{ id: 'c', x: 1 }] }, {}), /args.replies\[0\].x is not allowed/)
})

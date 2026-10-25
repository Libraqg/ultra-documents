// A small stand-in for @deepseek-ai/dsh-tools' defineTool.
//
// Third-party plugins cannot rely on importing dsh's internal packages (a
// linked or npm install does not see the runtime's copies), and the tool
// registry accepts any definition shaped like
//   { name, description, parameters: <JSON Schema>, output: { schema, render }, execute }
// — the same shape MCP tools are registered with. This converts the
// `required: true` property shorthand to JSON Schema and checks arguments
// before calling the tool body.

function toJsonSchema(spec) {
  const out = { type: spec.type }
  if (spec.description) out.description = spec.description
  if (spec.type === 'array' && spec.items) out.items = toJsonSchema(spec.items)
  if (spec.type === 'object') Object.assign(out, propertyMap(spec.properties || {}), spec.additionalProperties === false ? { additionalProperties: false } : {})
  return out
}

function propertyMap(props) {
  const properties = {}
  const required = []
  for (const [key, value] of Object.entries(props)) {
    properties[key] = toJsonSchema(value)
    if (value.required) required.push(key)
  }
  return required.length ? { properties, required } : { properties }
}

const TYPE_CHECKS = {
  string: v => typeof v === 'string',
  boolean: v => typeof v === 'boolean',
  number: v => typeof v === 'number' && Number.isFinite(v),
  integer: v => Number.isInteger(v),
  array: Array.isArray,
  object: v => v !== null && typeof v === 'object' && !Array.isArray(v),
}

export function validate(schema, value, path = 'args') {
  const violations = []
  const check = TYPE_CHECKS[schema.type]
  if (check && !check(value)) return [`${path} must be ${schema.type}`]
  if (schema.type === 'object') {
    for (const key of schema.required || []) if (value[key] === undefined) violations.push(`${path}.${key} is required`)
    for (const [key, item] of Object.entries(value)) {
      const sub = schema.properties?.[key]
      if (sub) violations.push(...validate(sub, item, `${path}.${key}`))
      else if (schema.additionalProperties === false) violations.push(`${path}.${key} is not allowed`)
    }
  }
  if (schema.type === 'array' && schema.items) value.forEach((item, i) => violations.push(...validate(schema.items, item, `${path}[${i}]`)))
  return violations
}

export function defineTool({ name, description, parameters, output, execute }) {
  const schema = { type: 'object', ...propertyMap(parameters) }
  return {
    name,
    description,
    parameters: schema,
    output: { schema: toJsonSchema(output.schema), render: output.render },
    async execute(args, exec) {
      const violations = validate(schema, args ?? {})
      if (violations.length) throw new Error(`invalid arguments: ${violations.join('; ')}`)
      return execute(args ?? {}, exec)
    },
  }
}

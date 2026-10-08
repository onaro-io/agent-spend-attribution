// Generates schema/oasa-record.schema.json and schema/oasa-batch.schema.json
// from the field tables in SPEC.md. Run with --check to fail on drift instead
// of writing.
//
// SPDX-License-Identifier: Apache-2.0

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Permanent home of every OASA schema $id. Consumers reference these URLs, so
// this value must never change once published, whether or not it resolves.
export const SCHEMA_BASE_URL = 'https://oasaspec.org/schema';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SPEC_PATH = join(ROOT, 'SPEC.md');
const SCHEMA_DIR = join(ROOT, 'schema');

const RECORD_SECTION = /^## Record schema v(\d+)\.(\d+)(?:\.\d+)?\s*$/;
const BATCH_SECTION = /^### Batch envelope\s*$/;
const GROUP_HEADING = /^### (Group \d+) — (.+?)\s*(?:\(.*\))?\s*$/;
const UUID_V7_PATTERN =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-7[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';
const UTC_PATTERN = '(Z|[+-]00:00)$';
const DECIMAL_NOTE =
  'Decimal value encoded as a JSON number; parse with decimal precision, not binary floating point.';

function splitRow(line) {
  const PIPE = '\u0000';
  return line
    .replace(/\\\|/g, PIPE)
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.replaceAll(PIPE, '|').trim());
}

function unquote(cell) {
  const m = cell.match(/^`([^`]+)`$/);
  return m ? m[1] : null;
}

function cleanDescription(text) {
  return text.replace(/`/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

// Translates one SPEC.md "Type" cell into a JSON Schema fragment.
// Unknown type vocabulary is an error so a new spec type cannot slip through.
function typeToSchema(typeCell, field) {
  const t = typeCell.trim();

  if (t.startsWith('enum:')) {
    const values = [...t.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    if (values.length === 0) throw new Error(`${field}: enum with no values: ${t}`);
    return { type: 'string', enum: values };
  }
  if (t === 'string (UUIDv7)') return { type: 'string', pattern: UUID_V7_PATTERN };
  if (t === 'string') return { type: 'string' };
  if (t.startsWith('timestamp')) {
    const schema = { type: 'string', format: 'date-time' };
    if (/UTC/.test(t)) schema.pattern = UTC_PATTERN;
    return schema;
  }
  if (t === 'integer') return { type: 'integer' };
  if (t === 'decimal') return { type: 'number' };
  const bounded = t.match(/^decimal \((\d+(?:\.\d+)?)[–-](\d+(?:\.\d+)?)\)$/);
  if (bounded) {
    return { type: 'number', minimum: Number(bounded[1]), maximum: Number(bounded[2]) };
  }
  if (t === 'map<string,string>' || t === 'map&lt;string,string&gt;') {
    return { type: 'object', additionalProperties: { type: 'string' } };
  }
  if (t === 'array of records') {
    return { type: 'array', items: { $ref: 'oasa-record.schema.json' } };
  }
  throw new Error(`${field}: unrecognized SPEC.md type "${t}"`);
}

function parseTableRows(lines, start, stop) {
  const rows = [];
  for (let i = start; i < stop; i++) {
    const line = lines[i];
    if (!line.startsWith('| `')) continue;
    const cells = splitRow(line);
    const field = unquote(cells[0]);
    if (!field) continue;
    rows.push({ line: i + 1, field, cells });
  }
  return rows;
}

function sectionEnd(lines, start, isEnd) {
  for (let i = start + 1; i < lines.length; i++) {
    if (isEnd(lines[i])) return i;
  }
  return lines.length;
}

export function parseSpec(text) {
  const lines = text.split(/\r?\n/);

  const recordStart = lines.findIndex((l) => {
    const m = l.match(RECORD_SECTION);
    return m && m[1] === '0' && m[2] === '1';
  });
  if (recordStart < 0) throw new Error('SPEC.md: "## Record schema v0.1.x" section not found');
  const [, major, minor] = lines[recordStart].match(RECORD_SECTION);
  const recordEnd = sectionEnd(lines, recordStart, (l) => l.startsWith('## ') || l === '---');

  const groups = [];
  let current = null;
  for (let i = recordStart + 1; i < recordEnd; i++) {
    const g = lines[i].match(GROUP_HEADING);
    if (g) {
      current = { id: g[1], name: g[2], fields: [] };
      groups.push(current);
      continue;
    }
    if (lines[i].startsWith('#')) {
      current = null;
      continue;
    }
    if (!current || !lines[i].startsWith('| `')) continue;
    const [fieldCell, typeCell, requiredCell, descCell] = splitRow(lines[i]);
    const field = unquote(fieldCell);
    if (!field) continue;
    current.fields.push({
      field,
      type: typeCell,
      required: requiredCell === 'Yes',
      description: cleanDescription(descCell ?? ''),
    });
  }
  if (groups.length === 0) throw new Error('SPEC.md: no field groups found in record schema section');

  const batchStart = lines.findIndex((l) => BATCH_SECTION.test(l));
  if (batchStart < 0) throw new Error('SPEC.md: "### Batch envelope" table not found');
  const batchEnd = sectionEnd(lines, batchStart, (l) => l.startsWith('#') || l === '---');
  const batchFields = parseTableRows(lines, batchStart + 1, batchEnd).map(({ field, cells }) => ({
    field,
    type: cells[1],
    required: cells[2] === 'Yes',
    description: cleanDescription(cells[3] ?? ''),
  }));
  if (batchFields.length === 0) throw new Error('SPEC.md: batch envelope table has no rows');

  return { version: `${major}.${minor}`, groups, batchFields };
}

function buildProperties(fields, versionPattern) {
  const properties = {};
  const required = [];
  for (const f of fields) {
    if (properties[f.field]) throw new Error(`SPEC.md: duplicate field ${f.field}`);
    const description = f.type.startsWith('decimal')
      ? `${f.description} ${DECIMAL_NOTE}`
      : f.description;
    const schema = { description, ...typeToSchema(f.type, f.field) };
    if (f.field === 'schema_version') schema.pattern = versionPattern;
    if (f.required && schema.type === 'string' && !schema.enum) schema.minLength = 1;
    properties[f.field] = schema;
    if (f.required) required.push(f.field);
  }
  return { properties, required };
}

export function buildSchemas(spec) {
  const versionPattern = `^${spec.version.replace('.', '\\.')}(\\.[0-9]+)?$`;
  const base = `${SCHEMA_BASE_URL}/${spec.version}`;

  const recordFields = spec.groups.flatMap((g) => g.fields);
  const rec = buildProperties(recordFields, versionPattern);
  const record = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `${base}/oasa-record.schema.json`,
    title: `OASA record (schema_version ${spec.version}.x)`,
    description:
      'One Open Agent Spend Attribution record. Envelope fields are required; every other group is optional. ' +
      'Generated from SPEC.md by scripts/generate-schema.mjs; do not edit by hand.',
    type: 'object',
    required: rec.required,
    additionalProperties: false,
    properties: rec.properties,
  };

  const bat = buildProperties(spec.batchFields, versionPattern);
  const batch = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `${base}/oasa-batch.schema.json`,
    title: `OASA batch (schema_version ${spec.version}.x)`,
    description:
      'A batch header plus an array of OASA records, for adapters that send records in bulk. ' +
      'Generated from SPEC.md by scripts/generate-schema.mjs; do not edit by hand.',
    type: 'object',
    required: bat.required,
    additionalProperties: false,
    properties: bat.properties,
  };

  return { record, batch };
}

export function serialize(schema) {
  return JSON.stringify(schema, null, 2) + '\n';
}

function main() {
  const check = process.argv.includes('--check');
  const spec = parseSpec(readFileSync(SPEC_PATH, 'utf8'));
  const { record, batch } = buildSchemas(spec);
  const outputs = [
    ['oasa-record.schema.json', serialize(record)],
    ['oasa-batch.schema.json', serialize(batch)],
  ];

  if (check) {
    let drift = false;
    for (const [name, expected] of outputs) {
      let actual = '';
      try {
        actual = readFileSync(join(SCHEMA_DIR, name), 'utf8').replace(/\r\n/g, '\n');
      } catch {
        actual = '';
      }
      if (actual !== expected) {
        drift = true;
        console.error(`schema/${name} has drifted from SPEC.md. Run "npm run generate" and commit the result.`);
      }
    }
    if (drift) process.exit(1);
    const fieldCount = spec.groups.reduce((n, g) => n + g.fields.length, 0);
    console.log(`Schema matches SPEC.md (${spec.groups.length} groups, ${fieldCount} record fields, ${spec.batchFields.length} batch fields).`);
    return;
  }

  mkdirSync(SCHEMA_DIR, { recursive: true });
  for (const [name, content] of outputs) {
    writeFileSync(join(SCHEMA_DIR, name), content);
    console.log(`Wrote schema/${name}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}

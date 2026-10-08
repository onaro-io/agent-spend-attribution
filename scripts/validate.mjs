// Validates every examples/*.json file against schema/oasa-record.schema.json,
// validates a batch built from them against schema/oasa-batch.schema.json,
// and confirms the schema rejects known-bad records.
//
// SPDX-License-Identifier: Apache-2.0

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { deterministicRecordId } from './record-id.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

const recordSchema = readJson(join(ROOT, 'schema', 'oasa-record.schema.json'));
const batchSchema = readJson(join(ROOT, 'schema', 'oasa-batch.schema.json'));

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
ajv.addSchema(recordSchema);
const validateRecord = ajv.getSchema(recordSchema.$id);
const validateBatch = ajv.compile(batchSchema);

const describe = (errors) =>
  (errors ?? []).map((e) => `${e.instancePath || '(root)'} ${e.message}`).join('; ');

let failures = 0;
const fail = (msg) => {
  failures++;
  console.error(`FAIL ${msg}`);
};

const exampleDir = join(ROOT, 'examples');
const files = readdirSync(exampleDir).filter((f) => f.endsWith('.json')).sort();
if (files.length === 0) fail('no examples found');

const records = [];
for (const file of files) {
  const record = readJson(join(exampleDir, file));
  records.push(record);
  if (!validateRecord(record)) {
    fail(`examples/${file}: ${describe(validateRecord.errors)}`);
    continue;
  }
  const expectedId = deterministicRecordId(record.occurred_at, record.source_record_id);
  if (record.record_id !== expectedId) {
    fail(`examples/${file}: record_id ${record.record_id} is not the deterministic ID ${expectedId}`);
    continue;
  }
  console.log(`ok   examples/${file}`);
}

const batch = {
  schema_version: '0.1',
  source_system: 'examples',
  emitted_at: '2026-10-07T00:00:00Z',
  count: records.length,
  records,
};
if (!validateBatch(batch)) {
  fail(`batch of all examples: ${describe(validateBatch.errors)}`);
} else if (batch.count !== batch.records.length) {
  fail('batch count does not match records length');
} else {
  console.log(`ok   batch of ${records.length} examples`);
}

const base = records[0];
const mustReject = [
  ['missing record_id', (r) => delete r.record_id],
  ['UUIDv4 record_id', (r) => (r.record_id = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b')],
  ['money as a string', (r) => (r.billed_cost = '0.0011')],
  ['unknown field', (r) => (r.organization_id = 'org_1')],
  ['non-UTC occurred_at', (r) => (r.occurred_at = '2026-09-01T11:04:05-04:00')],
  ['enum value outside the spec', (r) => (r.operation = 'execute_tool')],
  ['schema_version 0.2', (r) => (r.schema_version = '0.2')],
  ['non-string tag value', (r) => (r.tags = { team: 1 })],
];
for (const [label, mutate] of mustReject) {
  const r = structuredClone(base);
  mutate(r);
  if (validateRecord(r)) fail(`schema accepted a record with ${label}`);
  else console.log(`ok   rejects ${label}`);
}

if (failures > 0) {
  console.error(`\n${failures} validation failure(s).`);
  process.exit(1);
}
console.log('\nAll examples valid.');

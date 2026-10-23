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

const V012_EXAMPLES = [
  'allocation-split.json',
  'charge-focus-row.json',
  'settlement-invoice.json',
  'usage-bedrock-inference-profile.json',
  'usage-openai-chat.json',
  'usage-tool-call.json',
];
const COMMON_FIELDS = ['agent_id', 'agent_owner', 'cost_center', 'project_id'];
const MAPPING_ONLY = [
  'attribution_identity_type',
  'attribution_identity_value',
  'valid_from',
  'valid_to',
];

function checkAttribution(record, file) {
  const set = COMMON_FIELDS.filter((field) => record[field] !== undefined);
  if (record.attribution) {
    const keys = Object.keys(record.attribution).sort();
    const expect = [...set].sort();
    if (keys.join(',') !== expect.join(',')) {
      fail(`examples/${file}: attribution keys [${keys}] do not match set fields [${expect}]`);
    }
  }
  if (record.attribution_unattributed_reason && set.length > 0) {
    fail(`examples/${file}: unattributed reason is set beside a common field`);
  }
  if (record.record_type === 'mapping') {
    if (record.attribution || record.attribution_unattributed_reason) {
      fail(`examples/${file}: mapping record carries provenance or an unattributed reason`);
    }
    for (const field of ['attribution_identity_type', 'attribution_identity_value', 'valid_from']) {
      if (!record[field]) fail(`examples/${file}: mapping golden is missing ${field}`);
    }
    if (set.length === 0) fail(`examples/${file}: mapping golden sets no common field`);
  } else {
    for (const field of MAPPING_ONLY) {
      if (record[field] !== undefined) fail(`examples/${file}: ${field} is set on a non-mapping record`);
    }
  }
}

const records = [];
const v012ok = new Set();
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
  const failuresBefore = failures;
  checkAttribution(record, file);
  if (failures !== failuresBefore) continue;
  if (V012_EXAMPLES.includes(file)) v012ok.add(file);
  console.log(`ok   examples/${file}`);
}

if (V012_EXAMPLES.every((file) => v012ok.has(file))) {
  console.log('ok   all 6 records from 0.1.2 still validate');
} else {
  const missing = V012_EXAMPLES.filter((file) => !v012ok.has(file));
  fail(`0.1.2 golden records failed or are missing: ${missing.join(', ')}`);
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
  ['valid_from on a non-mapping record', (r) => (r.valid_from = '2026-09-01T00:00:00Z')],
  ['unattributed reason beside a common field', (r) => (r.attribution_unattributed_reason = 'no_identity')],
  ['attribution entry missing method', (r) => (r.attribution = {
    cost_center: {
      source_system: 'aws.bedrock',
      identity_type: 'aws.bedrock.inference_profile_tag',
      identity_value: 'oasa_cost_center',
    },
  })],
  ['attribution key without its common field', (r) => (r.attribution = {
    agent_id: {
      method: 'mapped',
      source_system: 'anthropic',
      identity_type: 'anthropic.workspace_id',
      identity_value: 'wrkspc_01JwQvzr7rXLA5AGx3HKfFUJ',
    },
  })],
  ['provenance on a mapping record', (r) => {
    r.record_type = 'mapping';
    r.attribution = {
      cost_center: {
        method: 'declared',
        source_system: 'aws.bedrock',
        identity_type: 'aws.bedrock.inference_profile_tag',
        identity_value: 'oasa_cost_center',
      },
    };
  }],
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

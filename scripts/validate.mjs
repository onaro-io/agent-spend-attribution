// Validates every examples/*.json file against schema/0.1.3/oasa-record.schema.json,
// validates a batch built from them against schema/0.1.3/oasa-batch.schema.json,
// checks the published 0.1 schema is still the 0.1.2 document, and confirms
// the 0.1.3 schema rejects known-bad records.
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

const recordSchema = readJson(join(ROOT, 'schema', '0.1.3', 'oasa-record.schema.json'));
const batchSchema = readJson(join(ROOT, 'schema', '0.1.3', 'oasa-batch.schema.json'));
const publishedRecordSchema = readJson(join(ROOT, 'schema', 'oasa-record.schema.json'));
const publishedBatchSchema = readJson(join(ROOT, 'schema', 'oasa-batch.schema.json'));

const ID_013_RECORD = 'https://oasaspec.org/schema/0.1.3/oasa-record.schema.json';
const ID_013_BATCH = 'https://oasaspec.org/schema/0.1.3/oasa-batch.schema.json';
const ID_01_RECORD = 'https://oasaspec.org/schema/0.1/oasa-record.schema.json';
const ID_01_BATCH = 'https://oasaspec.org/schema/0.1/oasa-batch.schema.json';

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

function expectId(schema, id, label) {
  if (schema.$id !== id) fail(`${label} $id is ${schema.$id}, expected ${id}`);
  else console.log(`ok   ${label} $id`);
}
expectId(recordSchema, ID_013_RECORD, '0.1.3 record schema');
expectId(batchSchema, ID_013_BATCH, '0.1.3 batch schema');
expectId(publishedRecordSchema, ID_01_RECORD, 'published 0.1 record schema');
expectId(publishedBatchSchema, ID_01_BATCH, 'published 0.1 batch schema');
if (publishedRecordSchema.properties && publishedRecordSchema.properties.attribution) {
  fail('published 0.1 record schema contains attribution');
}

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
  console.log('ok   all 6 records from 0.1.2 still validate against 0.1.3');
} else {
  const missing = V012_EXAMPLES.filter((file) => !v012ok.has(file));
  fail(`0.1.2 golden records failed or are missing: ${missing.join(', ')}`);
}

const ajv012 = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv012);
const validatePublished = ajv012.compile(publishedRecordSchema);
let publishedOk = true;
for (const file of V012_EXAMPLES) {
  const record = readJson(join(exampleDir, file));
  if (!validatePublished(record)) {
    publishedOk = false;
    fail(`published 0.1 schema rejected examples/${file}: ${describe(validatePublished.errors)}`);
  }
}
if (publishedOk) console.log('ok   published 0.1 schema still accepts every 0.1.2 golden record');

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

function runV02() {
  const dir = join(ROOT, 'examples', '0.2.0');
  const recordSchema02 = readJson(join(ROOT, 'schema', '0.2.0', 'oasa-record.schema.json'));
  const batchSchema02 = readJson(join(ROOT, 'schema', '0.2.0', 'oasa-batch.schema.json'));
  if (recordSchema02.$id !== 'https://oasaspec.org/schema/0.2.0/oasa-record.schema.json') {
    fail(`0.2.0 record schema $id is ${recordSchema02.$id}`);
  }
  if (batchSchema02.$id !== 'https://oasaspec.org/schema/0.2.0/oasa-batch.schema.json') {
    fail(`0.2.0 batch schema $id is ${batchSchema02.$id}`);
  }
  const ajv02 = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv02);
  ajv02.addSchema(recordSchema02);
  const validate02 = ajv02.getSchema(recordSchema02.$id);
  const validateBatch02 = ajv02.compile(batchSchema02);

  const readDir = (name) => {
    const folder = join(dir, name);
    return readdirSync(folder).filter((f) => f.endsWith('.json')).sort().map((f) => ({
      file: `examples/0.2.0/${name}/${f}`,
      record: readJson(join(folder, f)),
    }));
  };

  const valid = readDir('valid');
  const invalid = readDir('invalid');
  const semantic = readDir('semantic');
  for (const { file, record } of valid) {
    if (!validate02(record)) {
      fail(`${file}: ${describe(validate02.errors)}`);
      continue;
    }
    const expectedId = deterministicRecordId(record.occurred_at, record.source_record_id);
    if (record.record_id !== expectedId) {
      fail(`${file}: record_id ${record.record_id} is not the deterministic ID ${expectedId}`);
      continue;
    }
    const issues = singleRecordIssues(record);
    if (issues.length) {
      fail(`${file}: ${issues.join(', ')}`);
      continue;
    }
    console.log(`ok   ${file}`);
  }
  if (!valid.some((item) => item.record.record_id === '01a05d7f-b288-7532-8207-8cb53896d9e1')) {
    fail('0.2.0 fixtures are missing the deterministic record id test vector');
  }

  for (const { file, record } of invalid) {
    if (validate02(record)) fail(`${file}: schema accepted an invalid record`);
    else console.log(`ok   rejects ${file}`);
  }

  for (const { file, record } of semantic) {
    if (!validate02(record)) {
      fail(`${file}: schema rejected a semantic fixture: ${describe(validate02.errors)}`);
      continue;
    }
    const issues = singleRecordIssues(record);
    if (issues.length === 0) fail(`${file}: semantic fixture has no cross-field issue`);
    else console.log(`ok   semantic ${file}: ${issues.join(', ')}`);
  }

  const resolveRoot = join(dir, 'resolve');
  for (const name of readdirSync(resolveRoot).sort()) {
    const folder = join(resolveRoot, name);
    const group = readdirSync(folder).filter((f) => f.endsWith('.json')).sort().map((f) => readJson(join(folder, f)));
    for (const record of group) {
      if (!validate02(record)) {
        fail(`examples/0.2.0/resolve/${name}: ${describe(validate02.errors)}`);
      }
      const issues = singleRecordIssues(record);
      if (issues.length) fail(`examples/0.2.0/resolve/${name}: ${issues.join(', ')}`);
    }
    checkResolve(name, group);
  }

  const batch = {
    schema_version: '0.2.0',
    source_system: 'examples',
    emitted_at: '2026-10-27T20:00:00Z',
    count: valid.length,
    records: valid.map((item) => item.record),
  };
  if (!validateBatch02(batch)) fail(`0.2.0 batch: ${describe(validateBatch02.errors)}`);
  else console.log(`ok   0.2.0 batch of ${valid.length} valid records`);
}

function singleRecordIssues(record) {
  const issues = [];
  const identities = record.external_identities;
  if (Array.isArray(identities)) {
    const seen = new Set();
    for (const entry of identities) {
      if (seen.has(entry.identity_type)) issues.push(`duplicate identity_type ${entry.identity_type}`);
      seen.add(entry.identity_type);
    }
    if (record.external_identity_ref && !identities.some((entry) => entry.identity_value === record.external_identity_ref)) {
      issues.push('shorthand ref is not an identity_value');
    }
    if (record.attribution_identity_type && !identities.some((entry) =>
      entry.identity_type === record.attribution_identity_type &&
      entry.identity_value === record.attribution_identity_value)) {
      issues.push('attribution pair is not an external_identities entry');
    }
  }
  if (record.gpu_busy_seconds !== undefined && record.gpu_seconds !== undefined && record.gpu_busy_seconds > record.gpu_seconds) {
    issues.push('gpu_busy_seconds exceeds gpu_seconds');
  }
  if (Array.isArray(record.owners)) {
    const named = record.owners.filter((entry) => entry.role === 'owner');
    if (named.length > 1) issues.push('more than one owner role');
    let owner = named.length === 1 ? named[0].principal : undefined;
    if (named.length === 0 && record.owners.length === 1 && record.owners[0].role === undefined) {
      owner = record.owners[0].principal;
    }
    if (record.agent_owner !== undefined && owner !== undefined && record.agent_owner !== owner) {
      issues.push('agent_owner does not match owners');
    }
    if (record.agent_owner !== undefined && owner === undefined) issues.push('agent_owner does not match owners');
  }
  return issues;
}

function bindingKeys(record) {
  if (Array.isArray(record.external_identities) && record.external_identities.length) {
    return record.external_identities.map((entry) => `${entry.identity_type}\0${entry.identity_value}`);
  }
  if (record.attribution_identity_type && record.attribution_identity_value) {
    return [`${record.attribution_identity_type}\0${record.attribution_identity_value}`];
  }
  return [];
}

function windowEnd(record, mappings) {
  let end = record.valid_to ? Date.parse(record.valid_to) : Infinity;
  for (const other of mappings) {
    if (other.supersedes === record.record_id && other.valid_from) {
      const cut = Date.parse(other.valid_from);
      if (cut < end) end = cut;
    }
  }
  return end;
}

function windowsOverlap(a, b, mappings) {
  if (a.supersedes === b.record_id || b.supersedes === a.record_id) return false;
  const aStart = Date.parse(a.valid_from);
  const bStart = Date.parse(b.valid_from);
  return aStart < windowEnd(b, mappings) && bStart < windowEnd(a, mappings);
}

function conflictsFor(mappings) {
  const byIdentity = new Map();
  for (const record of mappings) {
    for (const key of bindingKeys(record)) {
      if (!byIdentity.has(key)) byIdentity.set(key, []);
      byIdentity.get(key).push(record);
    }
  }
  const conflicted = new Map();
  for (const [key, list] of byIdentity) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (!windowsOverlap(list[i], list[j], mappings)) continue;
        for (const record of [list[i], list[j]]) {
          if (!conflicted.has(record.record_id)) conflicted.set(record.record_id, new Set());
          conflicted.get(record.record_id).add(key);
        }
      }
    }
  }
  return conflicted;
}

function appliedMapping(mappings, key, at) {
  const t = Date.parse(at);
  const conflicted = conflictsFor(mappings);
  return mappings.filter((record) => {
    if (!bindingKeys(record).includes(key)) return false;
    const blocked = conflicted.get(record.record_id);
    if (blocked && blocked.has(key)) return false;
    const start = Date.parse(record.valid_from);
    return start <= t && t < windowEnd(record, mappings);
  });
}

function checkResolve(name, group) {
  const mappings = group.filter((record) => record.record_type === 'mapping');
  const label = `examples/0.2.0/resolve/${name}`;
  if (name === 'owner-change') {
    const entra = 'entra.agent_id\0agent-1';
    const conflicted = conflictsFor(mappings);
    if ([...conflicted.values()].some((keys) => keys.has(entra))) {
      fail(`${label}: owner change was treated as an overlap`);
      return;
    }
    const before = group.find((record) => record.source_record_id === 'usage/before-owner');
    const after = group.find((record) => record.source_record_id === 'usage/after-owner');
    const beforeHits = appliedMapping(mappings, entra, before.occurred_at);
    const afterHits = appliedMapping(mappings, entra, after.occurred_at);
    if (beforeHits.length !== 1 || beforeHits[0].agent_owner !== 'alice') {
      fail(`${label}: usage before valid_from did not stay with alice`);
      return;
    }
    if (afterHits.length !== 1 || afterHits[0].agent_owner !== 'bob') {
      fail(`${label}: usage on or after valid_from did not use bob`);
      return;
    }
    console.log(`ok   ${label}: alice then bob, not a conflict`);
    return;
  }
  if (name === 'partial-conflict') {
    const entra = 'entra.agent_id\0agent-1';
    const bedrock = 'aws.bedrock.agent_id\0bedrock-9';
    const entraUsage = group.find((record) => record.source_record_id === 'usage/entra-only');
    const bedrockUsage = group.find((record) => record.source_record_id === 'usage/bedrock-only');
    const entraHits = appliedMapping(mappings, entra, entraUsage.occurred_at);
    const bedrockHits = appliedMapping(mappings, bedrock, bedrockUsage.occurred_at);
    if (entraHits.length !== 0) {
      fail(`${label}: the overlapping identity still bound`);
      return;
    }
    if (bedrockHits.length !== 1 || bedrockHits[0].source_record_id !== 'mapping/two-identities') {
      fail(`${label}: the other identity did not stay bound`);
      return;
    }
    console.log(`ok   ${label}: one identity conflicts, the other still binds`);
    return;
  }
  if (name === 'plain-overlap') {
    const entra = 'entra.agent_id\0agent-1';
    const usage = group.find((record) => record.record_type === 'usage');
    const hits = appliedMapping(mappings, entra, usage.occurred_at);
    if (hits.length !== 0) fail(`${label}: overlapping mappings were applied`);
    else console.log(`ok   ${label}: overlap applies neither mapping`);
    return;
  }
  fail(`${label}: no resolution check for this directory`);
}

runV02();

if (failures > 0) {
  console.error(`\n${failures} validation failure(s).`);
  process.exit(1);
}
console.log('\nAll examples valid.');

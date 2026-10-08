// Deterministic UUIDv7 derivation from SPEC.md "Deterministic record IDs".
// Usage: node scripts/record-id.mjs <occurred_at> <source_record_id>
//
// SPDX-License-Identifier: Apache-2.0

import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export function deterministicRecordId(occurredAt, sourceRecordId) {
  const ms = Date.parse(occurredAt);
  if (Number.isNaN(ms) || ms < 0) throw new Error(`invalid occurred_at: ${occurredAt}`);
  const h = createHash('sha256').update(sourceRecordId, 'utf8').digest();
  const b = Buffer.alloc(16);
  b.writeUIntBE(ms, 0, 6);
  b[6] = 0x70 | (h[0] & 0x0f);
  b[7] = h[1];
  b[8] = 0x80 | (h[2] & 0x3f);
  h.copy(b, 9, 3, 10);
  const hex = b.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [occurredAt, sourceRecordId] = process.argv.slice(2);
  if (!occurredAt || !sourceRecordId) {
    console.error('usage: node scripts/record-id.mjs <occurred_at> <source_record_id>');
    process.exit(2);
  }
  console.log(deterministicRecordId(occurredAt, sourceRecordId));
}

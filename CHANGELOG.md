# Changelog

All notable changes to the Open Agent Spend Attribution (OASA) Specification.

The specification is additive-only within a major version: fields are added, never renamed or removed, until a major version increment. `schema_version` inside a record changes only when the record format itself changes — a documentation or mapping revision does not move it.

## [v0.2.0] — 2026-09-22 (draft branch — unpublished)

### Added
- Group 10 — Infrastructure: `pool_id`, `endpoint_id`, `gpu_seconds`, `hosting`, `interval_seconds`.
- `record_type` value `capacity` (endpoint-level observation; forbids agent/session fields; requires pool, endpoint, gpu_seconds).
- Draft OTLP attribute reservations `oasa.infrastructure.*` mapping onto the flat wire names.
- `schema_version` `"0.2"` / `"0.2.0"` as the gate for the above. v0.1.x text unchanged.

### Notes
- `gpu_seconds` is forbidden on `usage` (per-request GPU attribution out of scope).
- Publication of 0.2.0 (merge, HTML pin, announcement) is a separate decision.

## [v0.1.1] — 2026-09-15

### Added
- `cached_tokens` → `gen_ai.usage.cache_read.input_tokens` in the OpenTelemetry GenAI mapping, with a note on avoiding double-counting against `input_tokens`.
- `reasoning_tokens` → `gen_ai.usage.reasoning.output_tokens`, noting OTel's guidance that the value SHOULD be included in `gen_ai.usage.output_tokens`.
- `tool_name` → `gen_ai.tool.name`.
- `session_id` → `gen_ai.conversation.id`, noting that OASA `session_id` is the broader concept.
- Notes column on the OpenTelemetry mapping table.
- References section listing upstream specifications and their stewards.

### Changed
- Worked example (usage record) now includes `cached_tokens` and `session_id`.
- Mapping tables re-verified against upstream documentation on 2026-09-15.

### Unchanged
- No schema fields added, removed, or renamed. `schema_version` remains `"0.1"`.

## [v0.1] — 2026-09-14

Initial public draft.

- Nine field groups: envelope, agent identity, task and session context, consumption, cost, allocation, settlement join, control and governance, outcome.
- Three-layer model (telemetry / attribution / billing + settlement) with named join keys.
- Mapping tables for OpenTelemetry GenAI semantic conventions, FOCUS, and x402.
- Worked example across usage, charge, and settlement records.
- Published under CC BY 4.0.

[v0.2.0]: https://www.onaro.io/spec (draft — not published)
[v0.1.1]: https://www.onaro.io/spec/v0.1.1
[v0.1]: https://www.onaro.io/spec/v0.1

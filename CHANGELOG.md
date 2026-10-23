# Changelog

All notable changes to the Open Agent Spend Attribution (OASA) Specification.

The specification is additive-only within a major version: fields are added, never renamed or removed, until a major version increment. `schema_version` inside a record changes only when the record format itself changes — a documentation or mapping revision does not move it.

## [v0.2.0] — 2026-09-22 (draft branch — unpublished)

### Added
- Group 10 — Infrastructure: `pool_id`, `endpoint_id`, `gpu_seconds`, `hosting`, `interval_seconds`.
- Group 10 capacity metrics `gpu_busy_seconds` (≤ `gpu_seconds`) and `energy_wh`, both capacity-only, with matching `oasa.infrastructure.*` reservations.
- `record_type` value `capacity` (endpoint-level observation; forbids agent/session fields; requires pool, endpoint, gpu_seconds).
- Draft OTLP attribute reservations `oasa.infrastructure.*` mapping onto the flat wire names.
- `schema_version` `"0.2"` / `"0.2.0"` as the gate for the above. v0.1.x text unchanged.

### Notes
- `gpu_seconds` is forbidden on `usage` (per-request GPU attribution out of scope).
- Publication of 0.2.0 (merge, HTML pin, announcement) is a separate decision.

## Unreleased — editorial

### Added
- README "Implementations" section, listing [oasa-otel-exporter](https://github.com/onaro-io/oasa-otel-exporter).
- SPEC.md: the OpenTelemetry GenAI mapping table and the `otel-collector` `source_system` value point at oasa-otel-exporter.
- [Attributing agent spend](docs/guides/attribution-best-practices.md), a guide for the 0.1.3 attribution section: the implementer's procedure, and a section per platform for finance and platform teams. No schema change.

### Unchanged
- No schema change. The note sits outside the field tables, so `schema/` is unchanged.

## [v0.1.3] — 2026-10-22

Adds per-field attribution provenance, a `mapping` record type, and the tagging convention. `schema_version` stays `"0.1"`.

### Added
- `record_type` value `mapping`, for a native identifier bound to common attribution fields over a validity window (`valid_from`, `valid_to`).
- `attribution`, one object whose keys are the common fields that are set (`agent_id`, `agent_owner`, `cost_center`, `project_id`). Each entry records `method`, `source_system`, `identity_type`, and `identity_value`.
- `attribution_unattributed_reason`: `no_identity`, `identity_not_mapped`, `tag_missing`, `seat_without_owner`, `not_on_bill`, `mapping_conflict`.
- `attribution_identity_type` and `attribution_identity_value` on mapping records.
- Tag convention keys `oasa_cost_center`, `oasa_agent`, `oasa_owner`, `oasa_project`. A convention key on a billing row is `declared`. `mapped` is only a mapping record.
- OpenTelemetry agent mapping: `oasa.agent.id` maps to `agent_id`. `gen_ai.agent.id` maps to `external_identity_ref`. Output from the 0.1.2 exporter, which wrote `gen_ai.agent.id` into `agent_id`, remains valid.
- OpenTelemetry rows `oasa.cost_center`, `oasa.agent.owner`, and `oasa.project.id` for the other three common fields.
- Golden records for each identity pattern, including a charge whose cost center is a declared tag and whose agent is mapped.
- FOCUS export columns `x_oasa_attribution` and `x_oasa_unattributed_reason`.
- JSON Schema `$id` `https://oasaspec.org/schema/0.1.3/oasa-record.schema.json` and `https://oasaspec.org/schema/0.1.3/oasa-batch.schema.json`.

### Unchanged
- No field removed or renamed. Every 0.1.2 golden record still validates. `schema_version` remains `"0.1"`.
- The 0.1.2 schema `$id` `https://oasaspec.org/schema/0.1/oasa-record.schema.json` and the published document at that identifier (`schema/oasa-record.schema.json`, and the batch schema beside it) are unchanged.

## [v0.1.2] — 2026-10-08

Adds `allocated` to `cost_source`. Adds machine-readable JSON Schema, golden examples and validation tooling. Documents deterministic record IDs.

### Added
- `cost_source` value `allocated`, for cost assigned from a shared cost by an allocation rule. Additive enum value.
- `schema/oasa-record.schema.json` and `schema/oasa-batch.schema.json` (JSON Schema draft 2020-12), generated from the SPEC.md field tables by `scripts/generate-schema.mjs`. CI fails if the committed schema drifts from SPEC.md.
- `examples/`: six golden records (`usage-openai-chat`, `usage-bedrock-inference-profile`, `usage-tool-call`, `charge-focus-row`, `allocation-split`, `settlement-invoice`). The OpenAI and Bedrock records use the figures from `docs/focus-mapping.md`.
- `npm run validate`, run in CI, checks every example against the schema.
- "Machine-readable schema" section, including the batch envelope used by bulk adapters.
- "Deterministic record IDs" section: a UUIDv7 derivation from `occurred_at` and `source_record_id`, with a test vector, so retried exports keep the same `record_id`.
- Schema, examples, and scripts are licensed Apache-2.0 (`LICENSE-APACHE`); the specification text stays CC BY 4.0.
- Permanent schema identifiers under `https://oasaspec.org/schema/`.

### Changed
- FOCUS mapping table: `provider` maps to `ServiceProviderName` (FOCUS 1.4; formerly `ProviderName`), with a link to the full mapping in `docs/focus-mapping.md`.

### Unchanged
- No fields added, removed, or renamed. `schema_version` remains `"0.1"`: an added enum value is additive, so every valid 0.1.1 record is still valid.

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
[v0.1.3]: https://www.onaro.io/spec/v0.1.3
[v0.1.2]: https://www.onaro.io/spec/v0.1.2
[v0.1.1]: https://www.onaro.io/spec/v0.1.1
[v0.1]: https://www.onaro.io/spec/v0.1

# Open Agent Spend Attribution (OASA) Specification

**Version 0.1.3** · Initial public draft 2026-09-14 · Revised 2026-10-22
Published by Onaro (BrianOnAI LLC) · Licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

Canonical HTML version: <https://www.onaro.io/spec>
Pinned version: <https://www.onaro.io/spec/v0.1.3>

---

## Abstract

OASA defines a canonical record format that attributes AI-agent resource consumption and spend to agent identity, task, and cost object, and joins runtime telemetry, normalized billing, and payment settlement into a single auditable ledger row. It is designed to interoperate with OpenTelemetry GenAI semantic conventions (telemetry), the FOCUS specification (billing), and x402 payment-rail records (settlement). It is not a payment protocol and not a billing format; it is the join between them.

Partial records are valid. Every field outside the envelope is optional so adapters can emit what they know and reconcile later. Within a major version, the schema is additive-only.

## Design principles

- Hub-and-spoke: canonical middle, adapters at the edges.
- Settlement-agnostic: invoice, card, wire, and on-chain rails reconcile into the same spine.
- Additive to FOCUS and OpenTelemetry — never competing with them.
- Envelope required; all other groups optional so partial records remain valid.
- Versioned; additive-only within a major version.

## The three-layer model

```
        ┌───────────────────────────────┐
        │  Telemetry — OTel GenAI       │
        └───────────────┬───────────────┘
                        │  trace_id
        ┌───────────────┴───────────────┐
        │  Attribution — OASA           │
        │  (canonical)                  │
        └───────────────┬───────────────┘
                        │  invoice_id + source_record_id
                        │  settlement_ref
        ┌───────────────┴───────────────┐
        │  Billing — FOCUS              │
        │  + Settlement — x402          │
        └───────────────────────────────┘
```

Join keys on the edges; attribution in the middle.

---

## Record schema v0.1.3

### Group 1 — Envelope (required)

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `record_id` | string (UUIDv7) | Yes | Globally unique record identifier. Adapters with a stable source key SHOULD derive it deterministically (see Deterministic record IDs) so that a retried export produces the same ID. |
| `record_type` | enum: `usage` \| `charge` \| `settlement` \| `allocation` \| `outcome` \| `mapping` | Yes | One row = one event class. `mapping` binds a native identifier to common attribution fields for a validity window. |
| `schema_version` | string | Yes | Schema version string; `"0.1"` for this draft. |
| `occurred_at` | timestamp (RFC 3339, UTC) | Yes | When the event happened. |
| `recorded_at` | timestamp (RFC 3339, UTC) | Yes | When the record was ingested. |
| `source_system` | string | Yes | e.g. `otel-collector`, `openai-billing`, `x402-facilitator`. |
| `source_record_id` | string | Yes | Key in the source system. |
| `currency` | string | Yes | ISO 4217, or CAIP-19 asset ID for on-chain assets. |

`source_system` = `otel-collector` is the value emitted by [oasa-otel-exporter](https://github.com/onaro-io/oasa-otel-exporter), an OpenTelemetry Collector exporter that turns GenAI spans into OASA `usage` records.

### Group 2 — Agent identity

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `agent_id` | string | No | Stable internal agent ID. |
| `agent_name` | string | No | Human-readable agent name. |
| `agent_version` | string | No | Agent build or prompt version. |
| `agent_owner` | string | No | Team or principal accountable. |
| `parent_agent_id` | string | No | Parent in a sub-agent chain. |
| `agent_framework` | string | No | e.g. `langgraph`, `crewai`, `custom`. |
| `identity_scheme` | enum: `internal` \| `erc8004` \| `other` | No | How external identity is named. |
| `external_identity_ref` | string | No | e.g. ERC-8004 registration reference. |

### Group 3 — Task & session context

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `session_id` | string | No | Runtime session identifier. |
| `trace_id` | string | No | W3C Trace Context / OpenTelemetry trace id. |
| `span_id` | string | No | Span id within the trace. |
| `task_id` | string | No | Org-defined task identifier. |
| `task_type` | string | No | Free taxonomy; org-defined. |
| `workflow_id` | string | No | Workflow or pipeline id. |
| `trigger` | enum: `human` \| `scheduled` \| `agent` \| `event` | No | What started the run. |
| `initiating_principal` | string | No | Human or agent that authorized the run. |

### Group 4 — Consumption

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `provider` | string | No | Model or API provider. |
| `service` | string | No | Service product name. |
| `model` | string | No | Model identifier. |
| `operation` | enum: `chat` \| `completion` \| `embeddings` \| `tool_call` \| `inference` \| `storage` \| `api_call` \| `other` | No | Operation class. |
| `input_tokens` | integer | No | Input token count. |
| `output_tokens` | integer | No | Output token count. |
| `cached_tokens` | integer | No | Cached / reused tokens when reported. |
| `reasoning_tokens` | integer | No | Reasoning tokens when reported. |
| `unit_type` | enum: `tokens` \| `requests` \| `seconds` \| `gb` \| `custom` | No | Unit of consumption. |
| `units_consumed` | decimal | No | Quantity in `unit_type`. |
| `tool_name` | string | No | Tool invoked, if any. |
| `request_count` | integer | No | Request count for the event. |

### Group 5 — Cost

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `list_cost` | decimal | No | List price; mirrors FOCUS `ListCost` semantics. |
| `billed_cost` | decimal | No | Billed amount; mirrors FOCUS `BilledCost`. |
| `effective_cost` | decimal | No | Effective cost after discounts; mirrors FOCUS `EffectiveCost`. |
| `cost_source` | enum: `measured` \| `rated` \| `invoiced` \| `allocated` | No | How cost was derived. `allocated` means the cost was assigned from a shared cost by an allocation rule rather than metered, rated, or invoiced for this record. |
| `pricing_ref` | string | No | Price-sheet row ID. |
| `invoice_id` | string | No | Vendor invoice identifier. |
| `focus_charge_ref` | string | No | Pointer into a FOCUS dataset row. |

### Group 6 — Allocation

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `cost_center` | string | No | Cost center or department. |
| `project_id` | string | No | Project identifier. |
| `customer_id` | string | No | Customer or account identifier. |
| `product_line` | string | No | Product line. |
| `environment` | enum: `prod` \| `staging` \| `dev` \| `other` | No | Runtime environment. |
| `tags` | map<string,string> | No | Free-form tags. |
| `allocation_method` | enum: `direct` \| `rule` \| `split` | No | How cost was allocated. |
| `allocation_rule_id` | string | No | Rule that produced the allocation. |
| `split_fraction` | decimal (0–1) | No | Share of a split allocation. |
| `attribution` | attribution | No | Per-field provenance for `agent_id`, `agent_owner`, `cost_center`, and `project_id`. Present only alongside at least one of those fields. Each entry has `method`, `source_system`, `identity_type`, and `identity_value`. See Attribution. |
| `attribution_unattributed_reason` | enum: `no_identity` \| `identity_not_mapped` \| `tag_missing` \| `seat_without_owner` \| `not_on_bill` \| `mapping_conflict` | No | Why none of the four common attribution fields is set. MUST be absent when any of them is set. A producer that attributes a record and sets none of the four MUST set this. A record MAY omit it. |
| `attribution_identity_type` | string | No | On a `mapping` record, the native identifier name. MUST be absent on every other record type. |
| `attribution_identity_value` | string | No | On a `mapping` record, the native identifier value. MUST be absent on every other record type. |
| `valid_from` | timestamp (RFC 3339, UTC) | No | On a `mapping` record, inclusive start of the window. MUST be absent on every other record type. |
| `valid_to` | timestamp (RFC 3339, UTC) | No | On a `mapping` record, exclusive end of the window. Absent means still in force. MUST be absent on every other record type. |

### Group 7 — Settlement join

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `settlement_rail` | enum: `invoice` \| `card` \| `ach` \| `wire` \| `x402` \| `other_onchain` | No | How money moved. |
| `settlement_network` | string | No | CAIP-2 chain ID where applicable. |
| `settlement_asset` | string | No | CAIP-19 asset identifier. |
| `settlement_amount` | decimal | No | Settled amount. |
| `settlement_ref` | string | No | Tx hash, statement line, or remittance ID. |
| `settled_at` | timestamp | No | Settlement timestamp. |
| `reconciliation_status` | enum: `unmatched` \| `matched` \| `partial` \| `disputed` | No | Join status against billing/telemetry. |

### Group 8 — Control & governance

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `budget_id` | string | No | Budget that constrained or funded the spend. |
| `policy_id` | string | No | Policy identifier. |
| `authorization_ref` | string | No | Mandate / verifiable-intent credential ID. |
| `approval_type` | enum: `policy_auto` \| `pre_authorized` \| `human_approved` | No | How spend was authorized. |

### Group 9 — Outcome (optional, forward-looking)

Outcome capture is intentionally minimal in v0.1; it exists so cost-per-outcome queries have a landing zone.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `outcome_event_id` | string | No | Linked outcome event. |
| `outcome_type` | string | No | Outcome class (org-defined). |
| `outcome_value` | decimal | No | Numeric outcome value. |
| `outcome_unit` | string | No | Unit for `outcome_value`. |
| `business_metric_ref` | string | No | Pointer to a business metric definition. |

---

## Attribution

`agent_id`, `agent_owner`, `cost_center`, and `project_id` are the common attribution fields. Each stays optional and keeps the definition in its field group. This section says how a producer records the source of each field, the order of sources, and how a native identifier becomes one of those fields.

`customer_id`, `product_line`, `environment`, `tags`, task, session, and trace fields stay on the record. They are not common attribution fields and they do not get an `attribution` entry. Setting `customer_id` alone does not clear `attribution_unattributed_reason`.

### Per-field provenance

`attribution` is an object. Its keys are common fields. Each value has four members:

| Member | Meaning |
| --- | --- |
| `method` | `declared`, `manual`, `mapped`, `inherited`, or `rule`. |
| `source_system` | The system that minted the native identity. This is distinct from the envelope `source_system`, which is who emitted the OASA record, and from `provider`, which is the model provider. |
| `identity_type` | The native identifier name. Form below. |
| `identity_value` | The native identifier value. For a convention tag or label, this is the tag key. The tag's value is the common field. |

When `attribution` is present, its keys MUST be exactly the common fields that are set on the record, and each entry MUST include all four members. A lower-precedence source MAY fill a field a higher-precedence source left empty, and that field gets its own entry.

A record MAY omit `attribution`. Every 0.1.2 record omits it and remains valid. Producers of new attributed records SHOULD include it whenever a common field is set.

`attribution_unattributed_reason` is record-level. It MUST be absent when any common field is set. There is no per-field unattributed method. A producer that attributes a record and sets none of the four common fields MUST set the reason. A record MAY omit the reason; 0.1.2 records that name no common field omit it and remain valid.

### Methods

| Method | Meaning |
| --- | --- |
| `declared` | The source stated this field. No mapping record was consulted. A convention-key tag or label already on a billing row is declared: `identity_type` is the tag mechanism, and `identity_value` is the tag key. An accepted alias is declared the same way, and `identity_value` is the key that was on the row. An `oasa.*` span attribute is declared: `identity_type` is the attribute name and `identity_value` is the attribute value. A provider id copied straight into the common field of the same meaning is declared: `identity_type` is the platform identity type and `identity_value` is that id. |
| `manual` | A person assigned this field. `identity_type` is `oasa.manual`. `identity_value` is the ticket or actor id recorded for the assignment. |
| `mapped` | A mapping record translated one native identifier into this field. `identity_type` and `identity_value` are the native pair that matched, and the mapping's validity window contained this record's `occurred_at`. `mapped` is recorded only when a mapping record supplied the field. |
| `inherited` | This field was copied from another OASA record. `identity_type` names that parent (`oasa.trace_id` or `oasa.record_id`). A tag the provider already copied onto the billing row is `declared`. |
| `rule` | An allocation rule assigned this field. `allocation_rule_id` MUST be that rule. `identity_type` is `oasa.allocation_rule` and `identity_value` equals `allocation_rule_id`. |

`cost_source` says how the money was derived. `allocation_method` says how a split was calculated. `method` says how the actor and the cost object were chosen.

### Resolution order

Each common field is resolved on its own. The first source that supplies that field sets it:

1. `declared`
2. `manual`
3. `mapped`
4. `inherited`
5. `rule`
6. `unattributed`

`unattributed` applies to the record only when none of the four fields was set.

A manual assignment overrides `mapped`, `inherited`, and `rule` for the fields it names. A field already stored as one of those three MAY be replaced by a manual assignment; its provenance becomes `manual`.

A declared value on a stored record is left as declared. To correct it, publish an allocation record, or a charge with `tags.adjustment` = `true` as the FOCUS mapping describes for `ChargeCategory = Adjustment`. The new record carries its own per-field provenance.

A usage record and the charge that bills it stay two records. They join on `trace_id` when both have one. Inheritance MAY fill a field the charge left empty. It does not replace a field the charge declared.

When two mapping records match the same identity type, the same value, and overlapping windows, neither is applied. If the record then has no common field, the reason is `mapping_conflict`. If another field was set, the conflicted field stays empty and the record-level reason stays absent. Publishers SHOULD treat overlapping windows for one pair as an invalid mapping set.

`occurred_at` selects the mapping. A mapping that changes later does not rewrite a record whose `occurred_at` is already inside an earlier window.

### Unattributed reasons

Closed enum. A new reason is a minor spec revision. The reason is set only when none of the four common fields is set.

| Reason | When it is used |
| --- | --- |
| `no_identity` | No native identifier and no declared common field. |
| `identity_not_mapped` | A native identifier is present, and no mapping record covers that type and value at `occurred_at`. |
| `tag_missing` | The billing channel is a tag or label, and no convention key and no accepted alias is present. |
| `seat_without_owner` | The native identity is a person or a seat, and no mapping assigns an `agent_owner` or `cost_center`. |
| `not_on_bill` | This is a charge. The only identity sits on request metadata, a gateway log, or a span, and there is no join key to the record that holds it. |
| `mapping_conflict` | Two mapping records cover the same identity at `occurred_at`, and applying neither leaves the record with no common field. |

### Mapping records

A `mapping` record says: this native identifier means these common fields, from this time to this time. It carries the envelope. `occurred_at` is when the mapping was recorded. `valid_from` is when it takes effect.

| Field | Normative strength | Role |
| --- | --- | --- |
| `attribution_identity_type` | SHOULD | Native identifier name. |
| `attribution_identity_value` | SHOULD | Native value. |
| `valid_from` | SHOULD | Inclusive start. |
| `valid_to` | MAY | Exclusive end. Absent means still in force. |
| One or more of `agent_id`, `agent_owner`, `cost_center`, `project_id` | SHOULD | Fields the identifier maps to. `customer_id` MAY be set. It is not required. |

`attribution` and `attribution_unattributed_reason` MUST be absent on a mapping record. `attribution_identity_type`, `attribution_identity_value`, `valid_from`, and `valid_to` MUST be absent on every other record type. On those records the identity pair lives inside the per-field entry.

The envelope stays the only schema-required group. A partial mapping still validates. Receivers MAY refuse to apply a mapping that lacks a type, a value, or `valid_from`.

Applying a mapping fills each still-empty target field with `method` = `mapped`, the mapping's identity pair, and `source_system` set to the system that minted that identity. A field already declared is left declared. A manual assignment for that field wins over the mapping.

### Identity type names

`identity_type` is a string, not a closed enum. Receivers MUST match the names below as case-sensitive strings. Unknown types are allowed. They match a row only when a mapping record uses them.

Form: lowercase segments separated by dots. Each segment starts with a letter and otherwise contains `[a-z0-9_]`.

The initial vocabulary, by the shape of the native identity. Platform grain is recorded in [Attribution identity by platform](docs/research/attribution-identity-by-platform.md).

| Pattern | Identity type | What a producer writes |
| --- | --- | --- |
| Account partition | `anthropic.workspace_id` | `project_id` is `declared` when that id is the organization's project. Other common fields come from a mapping record. A null workspace id is `no_identity`. |
| Account partition | `anthropic.api_key_id` | A mapping record MAY set `agent_id`. |
| Account partition | `openai.project_id` | `project_id` is `declared` when that id is the organization's project. |
| Account partition | `openai.api_key_id` | A mapping record MAY set `agent_id`. |
| Account partition | `gcp.project_id` | `project_id` is `declared` when that id is the organization's project. |
| Account partition | `azure.resource_id` | A mapping record MAY set `project_id`. It is not assumed to be `agent_id`. |
| Account partition | `copilot_studio.environment_id` | `project_id` is `declared` when that id is the organization's project. |
| Resource tag | `aws.bedrock.inference_profile_tag`, `aws.bedrock.project_tag`, `azure.tag`, `gcp.label` | A convention key on the billing row is `declared`. `identity_value` is the key. |
| Resource tag | `aws.bedrock.workspace_id` | Carries the same convention keys, declared the same way. |
| Resource tag | `azure.foundry_project` | The provider-written tag key is `project`. An implementation MAY configure `project` as an alias of `oasa_project`. When that alias is accepted, `project_id` is `declared` and `identity_value` is `project`. A second user tag named `project` is not written on that usage. |
| Per-request metadata | `oasa.agent.id`, `oasa.cost_center`, `oasa.agent.owner`, `oasa.project.id` | Declares the matching common field on a usage record. `identity_value` is the attribute value. |
| Per-request metadata | `anthropic.metadata.user_id`, `anthropic.user_profile_id`, `openai.safety_identifier`, `openai.metadata` | Fills no common field. |
| Per-request metadata | `aws.bedrock.request_metadata` | A usage record MAY apply a mapping record to a low-cardinality key. Per-request ids MUST NOT be mapping keys. |
| Caller or seat | `openai.user_id` | A mapping record MAY set `agent_owner`. |
| Caller or seat | `aws.bedrock.iam_principal` | A mapping record MAY set `agent_owner` or `cost_center`. |
| Caller or seat | `microsoft365.copilot_user` | A mapping record MAY set `agent_owner` or `cost_center`. With no mapping, the reason is `seat_without_owner`. |
| Caller or seat | `copilot_studio.agent_id`, `microsoft365.credit_agent` | `agent_id` is `declared` when the app id is the organization's agent id. |
| Caller or seat | `copilot_studio.user_id` | A mapping record MAY set `agent_owner`. The all-zero user id is `no_identity`. |
| Caller or seat | `microsoft365.credit_user` | A mapping record MAY set `agent_owner`. |
| Gateway key | `litellm.virtual_key`, `kong.consumer_id`, `portkey.virtual_key` | A mapping record MAY set `agent_id` or `cost_center` on the gateway's usage record. |
| Gateway key | `litellm.team_id` | A mapping record MAY set `cost_center` or `agent_owner`. |
| Gateway key | `litellm.end_user` | Fills no common field. |
| Gateway key | `portkey.metadata` | A convention key in metadata MAY be `declared` on the gateway's usage record. |

A gateway identity reaches the provider invoice only when the upstream call also sets a provider partition, tag, or label. Otherwise a provider charge with no join key is `not_on_bill`.

### Tagging convention

One set of keys, written so a Google Cloud request label will accept them. Keys and values are lowercase letters, digits, underscores, and dashes. A key starts with a lowercase letter. Key and value are at most 63 characters. Empty values are not used. Those limits are the Google Cloud request-label rules read on 2026-10-22 from [Custom metadata labels](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/add-labels-to-api-calls). A label key can be dropped after 1,000 distinct values for that key over the life of the billing account.

| Tag or label key | Copies into |
| --- | --- |
| `oasa_cost_center` | `cost_center` |
| `oasa_agent` | `agent_id` |
| `oasa_owner` | `agent_owner` |
| `oasa_project` | `project_id` |
| `environment` | `environment` |

`environment` is not a common attribution field and has no provenance entry. The tag value should be `prod`, `staging`, or `dev` when the environment is one of those.

These four `oasa_` keys are the names this specification defines. An implementation MAY accept configured aliases for keys a customer already writes. An alias fills the same field as the convention key it stands in for. The field is `declared`. `identity_value` SHOULD be the key that was present on the row.

`trace_id`, `span_id`, `session_id`, `task_id`, request id, message id, end-user id, email, and timestamp MUST NOT be tag or label keys or values. An agent catalog larger than 1,000 distinct `oasa_agent` values on one Google billing account MUST NOT put `oasa_agent` on Google labels. Bind those agents with a mapping record from the profile or project id.

---

## Record schema v0.2.0 (additive)

`schema_version` `"0.2"` / `"0.2.0"` unlocks Group 10 and the `capacity` record type. v0.1.x records remain valid unchanged. Receivers that advertise known-minor `0.2` MUST reject `infrastructure.*` keys and `record_type: capacity` on `schema_version` &lt; `0.2`.

### Extended `record_type`

| Value | Meaning |
| --- | --- |
| `capacity` | Endpoint-level capacity observation over an interval (no caller). Agent and session/task fields MUST be absent. |

### Group 10 — Infrastructure

Wire names are flat (same style as token/cost fields). OTLP attribute reservations use the `oasa.infrastructure.*` namespace and map onto these wire names.

| Field | Type | Cardinality | Description |
| --- | --- | --- | --- |
| `pool_id` | string, ≤128 | Optional on `usage`; **required** on `capacity` | Customer-defined cost pool / cluster identity. Opaque to the spec; org-scoped at the receiver. |
| `endpoint_id` | string, ≤128 | Optional on `usage`; **required** on `capacity` | Serving endpoint identity (e.g. deployment / NAI endpoint name). Opaque. |
| `gpu_seconds` | number ≥ 0 | **Forbidden** on `usage`; **required** on `capacity` | GPU time consumed over the record's interval. Endpoint grain only — not per-request. |
| `gpu_busy_seconds` | number ≥ 0 | **Forbidden** on non-`capacity` records; optional on `capacity` | Portion of `gpu_seconds` during which the GPUs were busy. MUST be ≤ `gpu_seconds`. |
| `energy_wh` | number ≥ 0 | **Forbidden** on non-`capacity` records; optional on `capacity` | Energy consumed by the endpoint over the record's interval, in watt-hours. |
| `hosting` | enum: `provider_api` \| `self_hosted` \| `dedicated_capacity` | Optional on any record type | Signals that a vendor public price list may not apply. |
| `interval_seconds` | number &gt; 0 | Optional | Observation window length. `occurred_at` is the interval **end**. Added because `usage` has no interval/window fields. |

Token and cost groups remain permitted (not required) on `capacity` records.

### Draft OTLP attribute reservations (v0.2 binding)

| OASA wire field | Reserved OTLP attribute |
| --- | --- |
| `pool_id` | `oasa.infrastructure.pool_id` |
| `endpoint_id` | `oasa.infrastructure.endpoint_id` |
| `gpu_seconds` | `oasa.infrastructure.gpu_seconds` |
| `gpu_busy_seconds` | `oasa.infrastructure.gpu_busy_seconds` |
| `energy_wh` | `oasa.infrastructure.energy_wh` |
| `hosting` | `oasa.infrastructure.hosting` |
| `interval_seconds` | `oasa.infrastructure.interval_seconds` |

These reservations are draft until OASA 0.2.0 is published. They MUST NOT collide with OpenTelemetry GenAI semantic conventions.

---

## Deterministic record IDs

Receivers deduplicate on `record_id`. An adapter that generates a fresh random ID on every attempt turns each retry into a duplicate row. Adapters whose source has a stable key SHOULD derive `record_id` from it with the procedure below; two implementations given the same inputs then produce the same ID, and the result is still a valid UUIDv7 under RFC 9562.

Inputs: `occurred_at` and `source_record_id` of the record being emitted.

1. `ms` = `occurred_at` as Unix time in milliseconds, truncated (not rounded) to the millisecond.
2. `h` = SHA-256 of the UTF-8 bytes of `source_record_id`.
3. Build 16 bytes `b`:
   - `b[0..5]` = `ms` as a 48-bit big-endian integer.
   - `b[6]` = `0x70 | (h[0] & 0x0F)` (version 7).
   - `b[7]` = `h[1]`.
   - `b[8]` = `0x80 | (h[2] & 0x3F)` (RFC 9562 variant).
   - `b[9..15]` = `h[3..9]`.
4. Format `b` as a lowercase hyphenated UUID string (8-4-4-4-12).

For OpenTelemetry spans, `source_record_id` is `<trace_id>/<span_id>` in lowercase hex and `occurred_at` is the span end time.

Test vector: `occurred_at` = `2026-09-01T15:04:05Z`, `source_record_id` = `4bf92f3577b34da6a3ce929d0e0e4736/00f067aa0ba902b7` → `record_id` = `01a05d7f-b288-7532-8207-8cb53896d9e1`.

Derived IDs are predictable from their inputs. They are identifiers, not secrets, and MUST NOT be used as access tokens.

---

## Machine-readable schema

The record tables above are published as JSON Schema (draft 2020-12) for adapters to validate their output:

- [`schema/oasa-record.schema.json`](schema/oasa-record.schema.json): the 0.1.2 record schema. `$id` `https://oasaspec.org/schema/0.1/oasa-record.schema.json`. This document is unchanged in 0.1.3.
- [`schema/oasa-batch.schema.json`](schema/oasa-batch.schema.json): the 0.1.2 batch schema. `$id` `https://oasaspec.org/schema/0.1/oasa-batch.schema.json`.
- [`schema/0.1.3/oasa-record.schema.json`](schema/0.1.3/oasa-record.schema.json): the 0.1.3 record schema. `$id` `https://oasaspec.org/schema/0.1.3/oasa-record.schema.json`.
- [`schema/0.1.3/oasa-batch.schema.json`](schema/0.1.3/oasa-batch.schema.json): the 0.1.3 batch schema. `$id` `https://oasaspec.org/schema/0.1.3/oasa-batch.schema.json`.
- [`examples/`](examples/): golden records, one per file. Current examples validate against the 0.1.3 record schema. The six records published with 0.1.2 also validate against the unchanged 0.1.2 schema.

A published `$id` never changes, and the document at that identifier never changes. 0.1.3 has its own identifier. `schema_version` inside a record stays `"0.1"`. The 0.1.3 schema is generated from this document by `scripts/generate-schema.mjs` and never edited by hand. A field change is a pull request against SPEC.md first; the schema is regenerated from it, and CI fails if the committed 0.1.3 schema drifts from these tables. Run `npm run validate` to check every example, including the six golden records published with 0.1.2.

Decimal fields, including every money field, are JSON numbers. Consumers SHOULD parse them with decimal precision rather than binary floating point.

The 0.2.0 draft (Group 10 and `capacity`) is not covered yet; it gets its own schema when 0.2.0 is published. The schema files, examples, and scripts are licensed Apache-2.0 (see [LICENSE-APACHE](LICENSE-APACHE)); the specification text remains CC BY 4.0.

### Batch envelope

Adapters that send records in bulk wrap them in this header. Every record in `records` is validated independently; the header carries no attribution.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `schema_version` | string | Yes | Schema version of the records in the batch; `"0.1"` for this draft. |
| `source_system` | string | Yes | System that emitted the batch, e.g. `otel-collector`. |
| `emitted_at` | timestamp (RFC 3339, UTC) | Yes | When the batch was sent. |
| `count` | integer | Yes | Number of records in `records`. |
| `records` | array of records | Yes | OASA records, each valid against the record schema. |

---

## Mapping tables

Verified against upstream docs on 2026-09-15. The `oasa.*` rows and the `gen_ai.agent.id` row were revised on 2026-10-22, when the GenAI registry defined `gen_ai.agent.id` as a hosted agent resource id. OpenTelemetry GenAI conventions are still experimental and may drift; unmapped OASA fields are noted where no ratified equivalent exists. FOCUS token-economics columns track 1.4 (ratified) and 1.5 (scheduled). x402 V2 communicates requirements via `PAYMENT-REQUIRED` payloads (network, asset, amount, payTo).

### OASA ↔ OpenTelemetry GenAI

[oasa-otel-exporter](https://github.com/onaro-io/oasa-otel-exporter) v0.1.0 implements the earlier reading of this table, in which `agent_id` is read from `gen_ai.agent.id`. Output from that version remains valid 0.1.2. The rows below are the 0.1.3 mapping.

| OASA | OTel | Notes |
| --- | --- | --- |
| `provider` | `gen_ai.provider.name` | |
| `input_tokens` | `gen_ai.usage.input_tokens` | |
| `output_tokens` | `gen_ai.usage.output_tokens` | |
| `cached_tokens` | `gen_ai.usage.cache_read.input_tokens` | Cached/reused input tokens. Where a provider reports cache reads separately, map the cache-read count here; do not double-count into `input_tokens` if the provider already reports them inclusively. OTel also defines `gen_ai.usage.cache_creation.input_tokens` for cache writes. |
| `reasoning_tokens` | `gen_ai.usage.reasoning.output_tokens` | Output tokens used for reasoning (e.g. chain-of-thought). OTel says this value SHOULD be included in `gen_ai.usage.output_tokens`. Where a provider reports reasoning only in billing payloads, populate from the provider usage object. |
| `model` | `gen_ai.request.model` | The requested model. Where a provider returns a resolved or versioned model, prefer that value and record the requested model in `tags` if both matter. |
| `operation` | `gen_ai.operation.name` | |
| `tool_name` | `gen_ai.tool.name` | Emitted on tool-execution spans. Pair with `operation = tool_call`. |
| `session_id` | `gen_ai.conversation.id` | Where a runtime emits a conversation/thread identifier. OASA `session_id` is broader — a non-conversational agent run is still a session. |
| `agent_id` | `oasa.agent.id` | Application agent id, set by the application. Method `declared`. `identity_type` is `oasa.agent.id` and `identity_value` is the attribute value. `gen_ai.agent.id` does not fill this field. |
| `cost_center` | `oasa.cost_center` | Method `declared` when the attribute is set. `identity_type` is `oasa.cost_center`. |
| `agent_owner` | `oasa.agent.owner` | Method `declared` when the attribute is set. `identity_type` is `oasa.agent.owner`. |
| `project_id` | `oasa.project.id` | Method `declared` when the attribute is set. `identity_type` is `oasa.project.id`. |
| `agent_name` | `gen_ai.agent.name` | Application-supplied display name. |
| `external_identity_ref` | `gen_ai.agent.id`, else `gen_ai.main_agent.id` | Hosted agent resource id. When either attribute is copied here, `identity_scheme` is `other`. A mapping record MAY bind that resource id to an `agent_id`; that fill is `mapped`. `gen_ai.main_agent.id` is not copied into `parent_agent_id`. |
| `trace_id` / `span_id` | W3C Trace Context / OTel `trace_id`, `span_id` | Join key to the Attribution layer; carried from W3C Trace Context. |

### OASA ↔ FOCUS

FOCUS 1.4 added token-economics columns; FOCUS 1.5 (Dec 2026 target) adds native token tracking and a Price Sheet dataset. OASA tracks those columns as they ratify.

| OASA | FOCUS |
| --- | --- |
| `list_cost` | `ListCost` |
| `billed_cost` | `BilledCost` |
| `effective_cost` | `EffectiveCost` |
| `provider` | `ServiceProviderName` (FOCUS 1.4; formerly `ProviderName`) |
| `service` | `ServiceName` |
| `tags` | `Tags` |
| charge rows (`record_type=charge`) | `ChargeCategory` / charge rows |

Full column-by-column mapping, including the Invoice Detail dataset and worked examples: [OASA ↔ FOCUS 1.4 mapping](docs/focus-mapping.md).

A convention key in FOCUS `Tags` declares the matching common field: `oasa_cost_center`, `oasa_agent`, `oasa_owner`, `oasa_project`. The provenance `identity_value` is that key. An accepted alias is declared the same way, and `identity_value` is the key on the row. Export carries the `attribution` object in the custom column `x_oasa_attribution`, and `attribution_unattributed_reason` in `x_oasa_unattributed_reason` when the reason is set. Mapping records are not FOCUS cost rows.

### OASA ↔ x402

| OASA | x402 |
| --- | --- |
| `settlement_network` | `PaymentRequired.network` (`PAYMENT-REQUIRED`) |
| `settlement_asset` | `PaymentRequired` asset / token |
| `settlement_amount` | `PaymentRequired` amount / price |
| `settlement_ref` | on-chain tx / `SettlementResponse` reference |
| (payee context) | `PaymentRequired.payTo` |

---

## Worked example

One agent tool-call as a usage row, later joined by a charge row and an x402 settlement row sharing `trace_id` / `settlement_ref`.

### 1. Usage (telemetry)

```json
{
  "record_id": "0193f0a0-0000-7000-8000-000000000001",
  "record_type": "usage",
  "schema_version": "0.1",
  "occurred_at": "2026-09-01T15:04:05Z",
  "recorded_at": "2026-09-01T15:04:06Z",
  "source_system": "otel-collector",
  "source_record_id": "span-9f2c",
  "currency": "USD",
  "agent_id": "agent-support-47",
  "agent_name": "Support Triage",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "span_id": "00f067aa0ba902b7",
  "task_type": "ticket_resolve",
  "provider": "openai",
  "model": "gpt-4.1",
  "operation": "tool_call",
  "tool_name": "crm.lookup",
  "input_tokens": 1200,
  "output_tokens": 340,
  "cached_tokens": 800,
  "session_id": "sess-2f91",
  "unit_type": "tokens",
  "units_consumed": 1540,
  "cost_source": "measured"
}
```

### 2. Charge (billing)

```json
{
  "record_id": "0193f0a0-0000-7000-8000-000000000002",
  "record_type": "charge",
  "schema_version": "0.1",
  "occurred_at": "2026-09-02T00:00:00Z",
  "recorded_at": "2026-09-02T06:12:00Z",
  "source_system": "openai-billing",
  "source_record_id": "inv_line_88421",
  "currency": "USD",
  "agent_id": "agent-support-47",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "invoice_id": "INV-2026-09-01",
  "focus_charge_ref": "focus:row:88421",
  "list_cost": 0.042,
  "billed_cost": 0.038,
  "effective_cost": 0.038,
  "cost_source": "invoiced"
}
```

### 3. Settlement (x402)

```json
{
  "record_id": "0193f0a0-0000-7000-8000-000000000003",
  "record_type": "settlement",
  "schema_version": "0.1",
  "occurred_at": "2026-09-01T15:04:07Z",
  "recorded_at": "2026-09-01T15:04:08Z",
  "source_system": "x402-facilitator",
  "source_record_id": "pay_0xabc",
  "currency": "eip155:8453/erc20:0x",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "settlement_rail": "x402",
  "settlement_network": "eip155:8453",
  "settlement_asset": "eip155:8453/erc20:0x",
  "settlement_amount": 0.038,
  "settlement_ref": "0xdeadbeef",
  "settled_at": "2026-09-01T15:04:07Z",
  "reconciliation_status": "matched"
}
```

---

## References

Upstream specifications and standards this document maps to or depends on.

| Reference | Steward | Link |
| --- | --- | --- |
| OpenTelemetry GenAI semantic conventions | OpenTelemetry (CNCF) | <https://opentelemetry.io/docs/specs/semconv/gen-ai/> |
| FOCUS™ (FinOps Open Cost and Usage Specification) | FinOps Foundation (Linux Foundation) | <https://focus.finops.org/> |
| x402 | x402 Foundation (Linux Foundation) | <https://x402.org/> |
| W3C Trace Context | W3C | <https://www.w3.org/TR/trace-context/> |
| CAIP-2 (chain ID) / CAIP-19 (asset ID) | Chain Agnostic Standards Alliance | <https://chainagnostic.org/> |
| ERC-8004 (agent identity) | Ethereum | <https://eips.ethereum.org/> |
| RFC 3339 (timestamps) | IETF | <https://www.rfc-editor.org/rfc/rfc3339> |
| ISO 4217 (currency codes) | ISO | <https://www.iso.org/iso-4217-currency-codes.html> |
| UUIDv7 (RFC 9562) | IETF | <https://www.rfc-editor.org/rfc/rfc9562> |

Referencing these specifications does not imply endorsement by their stewards. OASA is an independent publication of Onaro (BrianOnAI LLC).

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Cite this specification

> Open Agent Spend Attribution (OASA) Specification, version 0.1.3. Onaro, 2026-09-14 (revised 2026-10-22). https://www.onaro.io/spec

License: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Attribution required; adaptations allowed.

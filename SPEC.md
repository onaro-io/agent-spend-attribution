# Open Agent Spend Attribution (OASA) Specification

**Version 0.1.1** · Initial public draft 2026-09-14 · Revised 2026-09-15
Published by Onaro (BrianOnAI LLC) · Licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

Canonical HTML version: <https://www.onaro.io/spec>
Pinned version: <https://www.onaro.io/spec/v0.1.1>

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

## Record schema v0.1.1

### Group 1 — Envelope (required)

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `record_id` | string (UUIDv7) | Yes | Globally unique record identifier. |
| `record_type` | enum: `usage` \| `charge` \| `settlement` \| `allocation` \| `outcome` | Yes | One row = one event class. |
| `schema_version` | string | Yes | Schema version string; `"0.1"` for this draft. |
| `occurred_at` | timestamp (RFC 3339, UTC) | Yes | When the event happened. |
| `recorded_at` | timestamp (RFC 3339, UTC) | Yes | When the record was ingested. |
| `source_system` | string | Yes | e.g. `otel-collector`, `openai-billing`, `x402-facilitator`. |
| `source_record_id` | string | Yes | Key in the source system. |
| `currency` | string | Yes | ISO 4217, or CAIP-19 asset ID for on-chain assets. |

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
| `cost_source` | enum: `measured` \| `rated` \| `invoiced` | No | How cost was derived. |
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

## Mapping tables

Verified against upstream docs on 2026-09-15. OpenTelemetry GenAI conventions are still experimental and may drift; attribute names here are current as of that date, and unmapped OASA fields are noted where no ratified equivalent exists. FOCUS token-economics columns track 1.4 (ratified) and 1.5 (scheduled). x402 V2 communicates requirements via `PAYMENT-REQUIRED` payloads (network, asset, amount, payTo).

### OASA ↔ OpenTelemetry GenAI

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
| `agent_id` | `gen_ai.agent.id` | |
| `agent_name` | `gen_ai.agent.name` | |
| `trace_id` / `span_id` | W3C Trace Context / OTel `trace_id`, `span_id` | Join key to the Attribution layer; carried from W3C Trace Context. |

### OASA ↔ FOCUS

FOCUS 1.4 added token-economics columns; FOCUS 1.5 (Dec 2026 target) adds native token tracking and a Price Sheet dataset. OASA tracks those columns as they ratify.

| OASA | FOCUS |
| --- | --- |
| `list_cost` | `ListCost` |
| `billed_cost` | `BilledCost` |
| `effective_cost` | `EffectiveCost` |
| `provider` | `ProviderName` |
| `service` | `ServiceName` |
| `tags` | `Tags` |
| charge rows (`record_type=charge`) | `ChargeCategory` / charge rows |

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

> Open Agent Spend Attribution (OASA) Specification, version 0.1.1. Onaro, 2026-09-14 (revised 2026-09-15). https://www.onaro.io/spec

License: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Attribution required; adaptations allowed.

# OASA ↔ FOCUS 1.4 Mapping

**Status:** Draft 0.1 · 2026-10-05 · companion to OASA 0.1.1 · License CC BY 4.0
**Scope:** FOCUS 1.4 Cost and Usage dataset (65 columns) and Invoice Detail dataset; notes on FOCUS 1.5 token tracking
**Repository:** github.com/onaro-io/agent-spend-attribution · `docs/focus-mapping.md`

## 1. Purpose

FOCUS answers *what was billed*. OASA answers *which agent, on whose behalf, against which cost object, and what the books should say*. This document specifies how the two join, column by column, so that:

- a FOCUS dataset from any provider or FinOps platform can be ingested as OASA charge records with no transformation beyond field renaming;
- an OASA ledger can be exported as a FOCUS-conformant dataset, with attribution carried in `x_`-prefixed custom columns per FOCUS 1.4 Custom Column Handling;
- a controller can trace any GL line → OASA record → FOCUS row → invoice line.

OASA is additive to FOCUS. Nothing here redefines a FOCUS column; where OASA carries a FOCUS value, the FOCUS semantics apply unchanged.

## 2. Join model

Three record types participate.

| OASA record | Joins to FOCUS via | Cardinality |
| --- | --- | --- |
| `charge` | `focus_charge_ref` → one Cost and Usage row; `invoice_id` → `InvoiceId`; invoice line → `InvoiceDetailId` | One OASA charge per FOCUS row (1:1) |
| `usage` | `trace_id` / `agent_id` to the charge records rated from it | One usage record may map to several FOCUS rows (one per `SkuMeter`), see §4 |
| `allocation` | Expresses how a charge is split across cost objects; exportable as FOCUS Allocated* columns | Many allocations per charge |
| `settlement` | `invoice_id` → Invoice Detail dataset; `settlement_ref` → payment | One or more settlements per invoice |

`focus_charge_ref` is a provider-neutral pointer. Recommended form: `focus:<dataset-id>:<row-key>` where `row-key` is the data generator's stable row identifier when one exists, else a hash of (`BillingAccountId`, `ChargePeriodStart`, `SkuPriceId`, `ResourceId`, `SubAccountId`).

## 3. Column mapping: FOCUS 1.4 Cost and Usage → OASA

Treatment codes: **Carried** = value copied into an OASA field with identical semantics. **Derived** = OASA field computed from the column, or vice versa, under a stated rule. **Referenced** = stays on the FOCUS row, reachable through `focus_charge_ref`; not needed for attribution or booking.

| FOCUS column | Since | Treatment | OASA field or rule | Note |
| --- | --- | --- | --- | --- |
| `AllocatedMethodDetails` | 1.3 | Derived | allocation_method, split_fraction, allocation_rule_id | When OASA is the data generator of a derived dataset, allocation records serialize here as the Elements array. |
| `AllocatedMethodId` | 1.3 | Derived | allocation_rule_id | Stable ID of the rule that produced the split. |
| `AllocatedResourceId` | 1.3 | Derived | cost_center \| project_id \| customer_id | The cost object the split lands on; OASA keeps them as typed fields, FOCUS flattens to one ID. |
| `AllocatedResourceName` | 1.3 | Derived | (display name of the cost object) |  |
| `AllocatedTags` | 1.3 | Derived | tags (allocation record) |  |
| `AvailabilityZone` | 1.0 | Referenced | — | Reachable through focus_charge_ref; not needed for attribution. |
| `BilledCost` | 1.0 | Carried | billed_cost | Same semantics; OASA charge records copy the value. |
| `BillingAccountId` | 1.0 | Referenced | — | Provider account; stays on the FOCUS row. |
| `BillingAccountName` | 1.0 | Referenced | — |  |
| `BillingAccountType` | 1.3 | Referenced | — |  |
| `BillingCurrency` | 1.0 | Carried | currency | OASA currency on charge records equals BillingCurrency. |
| `BillingPeriodEnd` | 1.0 | Referenced | — | Accrual period comes from occurred_at; FOCUS period kept for reconciliation. |
| `BillingPeriodStart` | 1.0 | Referenced | — |  |
| `CapacityReservationId` | 1.1 | Referenced | — |  |
| `CapacityReservationStatus` | 1.1 | Referenced | — |  |
| `ChargeCategory` | 1.0 | Derived | record_type | FOCUS Usage/Purchase → OASA charge; Credit/Adjustment/Tax → charge with negative or tax-flagged cost (see §5). |
| `ChargeClass` | 1.0 | Carried | (x_oasa_charge_class on export) | Correction rows drive OASA true-up logic. |
| `ChargeDescription` | 1.0 | Referenced | — |  |
| `ChargeFrequency` | 1.0 | Referenced | — |  |
| `ChargePeriodEnd` | 1.0 | Derived | occurred_at | OASA charge occurred_at = ChargePeriodStart; period end kept via reference. |
| `ChargePeriodStart` | 1.0 | Carried | occurred_at |  |
| `CommitmentDiscountCategory` | 1.0 | Referenced | — | Commitment accounting is out of OASA scope; FOCUS is authoritative. |
| `CommitmentDiscountId` | 1.0 | Referenced | — |  |
| `CommitmentDiscountName` | 1.0 | Referenced | — |  |
| `CommitmentDiscountQuantity` | 1.1 | Referenced | — |  |
| `CommitmentDiscountStatus` | 1.0 | Referenced | — |  |
| `CommitmentDiscountType` | 1.0 | Referenced | — |  |
| `CommitmentDiscountUnit` | 1.1 | Referenced | — |  |
| `CommitmentProgramEligibilityDetails` | 1.4 | Referenced | — |  |
| `ConsumedQuantity` | 1.0 | Carried | units_consumed | For token SKUs, equals the token count for that SkuMeter. |
| `ConsumedUnit` | 1.0 | Carried | unit_type | FOCUS "Tokens" ↔ OASA tokens; other units map to requests, seconds, gb, custom. |
| `ContractApplied` | 1.3 | Referenced | — |  |
| `ContractedCost` | 1.0 | Referenced | — | OASA carries list, billed, effective; contracted stays on the FOCUS row. |
| `ContractedUnitPrice` | 1.0 | Referenced | — |  |
| `EffectiveCost` | 1.0 | Carried | effective_cost | Same semantics. |
| `HostProviderName` | 1.3 | Referenced | — | Marketplace or cloud host (e.g. AWS for Bedrock-hosted models). |
| `InvoiceDetailId` | 1.4 | Carried | focus_charge_ref (secondary) / invoice line reference | Joins the charge to the Invoice Detail dataset; see §6. |
| `InvoiceId` | 1.2 | Carried | invoice_id | Same value. |
| `InvoiceIssuerName` | 1.0 | Referenced | — |  |
| `ListCost` | 1.0 | Carried | list_cost | Same semantics. |
| `ListUnitPrice` | 1.0 | Referenced | pricing_ref (indirect) | OASA points at a price-sheet row rather than carrying the price. |
| `PricingCategory` | 1.0 | Referenced | — |  |
| `PricingCurrency` | 1.2 | Referenced | — |  |
| `PricingCurrencyContractedUnitPrice` | 1.2 | Referenced | — |  |
| `PricingCurrencyEffectiveCost` | 1.2 | Referenced | — |  |
| `PricingCurrencyListUnitPrice` | 1.2 | Referenced | — |  |
| `PricingQuantity` | 1.0 | Referenced | — |  |
| `PricingUnit` | 1.0 | Referenced | — | e.g. "1M Tokens"; informs rating of usage records. |
| `RegionId` | 1.0 | Referenced | — |  |
| `RegionName` | 1.0 | Referenced | — |  |
| `ResourceId` | 1.0 | Derived | agent_id (when provider resource = agent) | Only when the provider's resource is the agent itself (e.g. an assistant or agent ID); otherwise referenced. |
| `ResourceName` | 1.0 | Derived | agent_name (same condition) |  |
| `ResourceType` | 1.0 | Referenced | — |  |
| `ServiceCategory` | 1.0 | Referenced | — | Expected "AI and Machine Learning" for model charges. |
| `ServiceName` | 1.0 | Carried | service | Same value. |
| `ServiceProviderName` | 1.3 | Carried | provider | Replaces ProviderName (removed in 1.4). |
| `ServiceSubcategory` | 1.1 | Referenced | — |  |
| `SkuId` | 1.0 | Referenced | — |  |
| `SkuMeter` | 1.1 | Derived | input_tokens \| output_tokens \| cached_tokens \| reasoning_tokens | One FOCUS row per meter; OASA usage record holds all four counts (see §4). |
| `SkuPriceDetails` | 1.1 | Referenced | pricing_ref (indirect) |  |
| `SkuPriceId` | 1.0 | Carried | pricing_ref | OASA pricing_ref may hold SkuPriceId when the provider is the price source. |
| `SubAccountId` | 1.0 | Derived | project_id \| customer_id (when sub-account = cost object) | Provider projects or workspaces often are the cost object; mapping is per adapter. |
| `SubAccountName` | 1.0 | Derived | (same condition) |  |
| `SubAccountType` | 1.3 | Referenced | — |  |
| `Tags` | 1.0 | Carried | tags | Provider tags copied; OASA may add attribution keys. |

Summary: 14 carried, 12 derived, 39 referenced. Nothing in FOCUS 1.4 Cost and Usage is lost; 39 columns simply stay where they are.

## 4. Token economics

FOCUS 1.4 expresses token consumption through existing columns rather than token-specific ones: `ConsumedQuantity` with `ConsumedUnit` = Tokens, `PricingUnit` (e.g. 1M Tokens), and `SkuMeter` distinguishing input, output, cached-input and reasoning meters. FOCUS 1.5 (scheduled December 2026) is expected to add native token tracking and a Price Sheet dataset; this section will be revised when it ratifies.

Consequences for the join:

- One provider request produces **one OASA usage record** carrying `input_tokens`, `output_tokens`, `cached_tokens`, `reasoning_tokens`, and **up to four FOCUS rows**, one per `SkuMeter`. The OASA charge records rated from that usage keep the per-meter split; `units_consumed` on each charge equals the FOCUS `ConsumedQuantity` for that meter.
- `pricing_ref` on an OASA record should hold the FOCUS `SkuPriceId` when the provider is the price source, so the rate used for a `rated` cost can be audited against the provider's `ListUnitPrice`.
- `cost_source` makes the FOCUS relationship explicit: `invoiced` means `billed_cost` came from a FOCUS row; `rated` means OASA priced metered usage before any FOCUS row existed; `measured` means cost was observed at the gateway.

## 5. ChargeCategory and ChargeClass

| FOCUS | OASA treatment |
| --- | --- |
| `ChargeCategory = Usage` | `record_type = charge`, positive cost |
| `ChargeCategory = Purchase` | `record_type = charge`; prepaid credits are a charge with `tags.prepaid = true`, drawn down by later usage records |
| `ChargeCategory = Credit` | `record_type = charge`, negative cost, same cost object as the usage it offsets where determinable |
| `ChargeCategory = Adjustment` | `record_type = charge` with `tags.adjustment = true`; drives a true-up entry |
| `ChargeCategory = Tax` | `record_type = charge` with `tags.tax = true`; booked to the tax account, not the cost object |
| `ChargeClass = Correction` | Any of the above, flagged so the consuming ledger reverses the prior period and reposts |

## 6. Invoice Detail dataset (FOCUS 1.4) and settlement

FOCUS 1.4 adds an Invoice Detail dataset: `InvoiceId`, `InvoiceDetailId`, `InvoiceIssueDate`, `InvoiceIssueStatus`, `PaymentDueDate`, `PaymentTerms`, `PaymentCurrency`, `PaymentCurrencyBilledCost`, `PurchaseOrderNumber`, `ReferenceInvoiceId`, plus billing-period and issuer columns. It describes the invoice; it does not record that money moved.

| FOCUS Invoice Detail | OASA |
| --- | --- |
| `InvoiceId`, `InvoiceDetailId` | `invoice_id`, and the invoice-line component of `focus_charge_ref` |
| `InvoiceIssueDate`, `InvoiceIssueStatus` | Referenced; a provisional invoice (`InvoiceIssueStatus` not yet issued) corresponds to OASA charges still `cost_source = rated` |
| `PaymentDueDate`, `PaymentTerms`, `PurchaseOrderNumber` | Referenced; drive AP, not attribution |
| `PaymentCurrency`, `PaymentCurrencyBilledCost` | `settlement_asset`, `settlement_amount` when the payment currency differs from billing currency |
| `ReferenceInvoiceId` | Referenced; a credit memo's pointer back to the original invoice |
| (no column) | `settlement_rail`, `settlement_ref`, `settled_at`, `reconciliation_status`: OASA records the payment event FOCUS has no place for |

## 7. Allocation: FOCUS Allocated* columns and OASA allocation records

FOCUS 1.3 introduced data-generator-calculated split cost allocation (`AllocatedMethodId`, `AllocatedMethodDetails`, `AllocatedResourceId`, `AllocatedResourceName`, `AllocatedTags`) for cases where the *provider* splits a charge. OASA allocation records cover the far more common case where the *practitioner* splits a charge across cost objects after the fact.

When Onaro, or any OASA implementation, publishes a derived FOCUS dataset, OASA allocation records serialize into the Allocated* columns: `allocation_rule_id` → `AllocatedMethodId`; the split factors and `split_fraction` → `AllocatedMethodDetails.Elements`; the cost object → `AllocatedResourceId`/`Name`; allocation-time tags → `AllocatedTags`. The original provider row is preserved as the origin charge, with the unallocated remainder, if any, as its own row per FOCUS rules.

## 8. What FOCUS does not carry

These OASA groups have no FOCUS equivalent and travel as `x_` columns on export.

| OASA group | Fields | Why FOCUS lacks it |
| --- | --- | --- |
| Agent identity | `agent_id`, `agent_name`, `agent_version`, `agent_owner`, `parent_agent_id`, `agent_framework`, `identity_scheme`, `external_identity_ref` | Billing data has no notion of the software actor |
| Task and session | `session_id`, `trace_id`, `span_id`, `task_id`, `task_type`, `workflow_id`, `trigger`, `initiating_principal` | Runtime context lives in telemetry, not invoices |
| Cost provenance | `cost_source` | FOCUS rows exist only once a data generator bills; metered-but-unbilled and self-hosted inference never appear |
| Control and governance | `budget_id`, `policy_id`, `authorization_ref`, `approval_type` | Pre-spend authorization is outside FOCUS scope |
| Settlement | `settlement_rail`, `settlement_network`, `settlement_asset`, `settlement_amount`, `settlement_ref`, `settled_at`, `reconciliation_status` | FOCUS describes invoices, not payments |
| Outcome | `outcome_event_id`, `outcome_type`, `outcome_value`, `outcome_unit`, `business_metric_ref` | Business results are not billing data |

## 9. Exporting OASA as a FOCUS-conformant dataset

An OASA ledger can be published as a FOCUS 1.4 Cost and Usage dataset so that any FOCUS-consuming tool can read attributed agent spend. Rules:

1. Every FOCUS Mandatory column is populated from the Carried and Derived mappings in §3; Referenced columns are copied from the source FOCUS row when one exists, else null per FOCUS nullability rules.
2. Attribution fields are emitted as custom columns with the `x_oasa_` prefix, per FOCUS 1.4 Custom Column Handling: `x_oasa_record_id`, `x_oasa_agent_id`, `x_oasa_agent_name`, `x_oasa_trace_id`, `x_oasa_task_type`, `x_oasa_cost_center`, `x_oasa_project_id`, `x_oasa_customer_id`, `x_oasa_cost_source`, `x_oasa_budget_id`, `x_oasa_settlement_ref`, `x_oasa_reconciliation_status`.
3. Self-hosted inference (`cost_source = rated`, no provider row) is emitted with `ServiceProviderName` = the organization's own name, `ChargeCategory = Usage`, `PricingCategory = Standard`, and `x_oasa_cost_source = rated`, so it sits beside provider charges in the same dataset. This is the only case where OASA originates a FOCUS row rather than referencing one.
4. The dataset metadata declares the `x_oasa_*` columns per FOCUS schema metadata requirements.

## 10. Worked example

One request by a support agent, 1,200 input tokens, 340 output tokens, 800 cached tokens, OpenAI, September 1. All costs and rates in this example are illustrative and do not represent any provider's current pricing.

**FOCUS 1.4 Cost and Usage, three rows (abridged)**

| ServiceProviderName | ServiceName | SkuMeter | ConsumedQuantity | ConsumedUnit | PricingUnit | ListCost | EffectiveCost | SubAccountId | ChargePeriodStart | InvoiceId | InvoiceDetailId |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| OpenAI | API | Input tokens | 400 | Tokens | 1M Tokens | 0.0012 | 0.0011 | proj_support | 2026-09-01 | INV-2026-09-01 | L-88421 |
| OpenAI | API | Cached input tokens | 800 | Tokens | 1M Tokens | 0.0002 | 0.0002 | proj_support | 2026-09-01 | INV-2026-09-01 | L-88422 |
| OpenAI | API | Output tokens | 340 | Tokens | 1M Tokens | 0.0051 | 0.0048 | proj_support | 2026-09-01 | INV-2026-09-01 | L-88423 |

**OASA usage record (one)**: `agent_id` agent-support-47, `trace_id` 4bf9…, `task_type` ticket_resolve, `input_tokens` 1200, `output_tokens` 340, `cached_tokens` 800, `cost_source` measured, `cost_center` Customer Success.

**OASA charge records (three)**: one per FOCUS row, each with `focus_charge_ref` = `focus:openai-2026-09:L-8842x`, `invoice_id` INV-2026-09-01, `list_cost`/`billed_cost`/`effective_cost` copied, `units_consumed` = that row's `ConsumedQuantity`, `agent_id` and `cost_center` inherited from the usage record via `trace_id`.

**Resulting GL line**: AI services expense, Customer Success, $0.0061, with an audit trail of GL line → 3 OASA charges → 3 FOCUS rows → invoice INV-2026-09-01 lines L-88421 to L-88423.

Note the asymmetry the example shows: FOCUS tells you 1,540 tokens cost $0.0061 on `proj_support`; only the OASA side says which agent, which ticket, and which department's budget.

## 10b. Worked example: cloud-hosted model with provider-side attribution (Amazon Bedrock)

The OpenAI example above is a direct provider invoice with no attribution in the billing data. Bedrock is the other case: the provider carries a practitioner tag onto the billing row, so attribution exists upstream and OASA's job is to read it, not reconstruct it. All costs are illustrative. The AWS-side setup (inference profiles, cost allocation tag activation, IAM enforcement) and the month-end entries are covered in [How do I allocate Amazon Bedrock costs by department?](https://www.onaro.io/blog/how-to-allocate-amazon-bedrock-costs-by-department)

One request by a support agent through an application inference profile tagged `CostCenter=CustomerSuccess`, `Agent=support-agent`, 4,000 input tokens and 900 output tokens, September 1.

**FOCUS 1.4 Cost and Usage, two rows (abridged, from the AWS FOCUS-format export)**

| ServiceProviderName | HostProviderName | ServiceName | ResourceId | SkuMeter | ConsumedQuantity | ConsumedUnit | BilledCost | Tags | ChargePeriodStart |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Amazon Web Services | Amazon Web Services | Amazon Bedrock | arn:…:application-inference-profile/support-agent | Input tokens | 4,000 | Tokens | 0.0120 | {CostCenter: CustomerSuccess, Agent: support-agent} | 2026-09-01T14:00Z |
| Amazon Web Services | Amazon Web Services | Amazon Bedrock | arn:…:application-inference-profile/support-agent | Output tokens | 900 | Tokens | 0.0135 | {CostCenter: CustomerSuccess, Agent: support-agent} | 2026-09-01T14:00Z |

**OASA charge records (two)**: one per row; `provider` = Amazon Web Services, `service` = Amazon Bedrock, `focus_charge_ref` to each row, `cost_source` = `invoiced`, `units_consumed` = that row's `ConsumedQuantity`. Attribution comes from the FOCUS `Tags` map through a configured tag-key mapping: `CostCenter` → `cost_center`, `Agent` → `agent_id`; any remaining tags are copied to OASA `tags`. If a runtime usage record exists for the same request (via `trace_id`), it is joined as usual; if not, the charge records are already attributable on their own.

**Rules this example sets**

- `Tags` is the attribution channel when a provider supports practitioner tags on the billed resource. The tag-key mapping is configuration, not schema; OASA does not assume key names.
- `ResourceId` becomes `agent_id` only when the resource is the agent (one inference profile per agent). When one profile serves several agents, `ResourceId` is referenced and `agent_id` comes from runtime usage records.
- A row with `Tags` lacking the cost-object key (profile tagged with `Agent` but not `CostCenter`) produces a charge record with `cost_center` empty and `allocation_method` unset; it is unattributed until an allocation record assigns it. The same holds for rows with no `ResourceId` tag at all (direct model-ID invocation). Neither is allocated by default.
- `HostProviderName` = `ServiceProviderName` here; for a marketplace-hosted third-party model on Bedrock the two differ, and OASA keeps `provider` = the service provider while referencing the host.

**Resulting GL line**: AI services expense, Customer Success, $0.0255, with the audit trail GL line → 2 OASA charges → 2 FOCUS rows → inference profile ARN → the tag the department owner set.

Where the OpenAI example shows OASA adding attribution that billing lacks, this one shows OASA preserving attribution that billing already has, and making the untagged remainder visible rather than smearing it.

## 11. Open questions for the FinOps Foundation FOCUS working group

1. When FOCUS 1.5 ratifies native token tracking, should per-meter token counts collapse to one row with typed columns (as OASA models them), or remain one row per `SkuMeter`? OASA can map either; the choice affects every AI cost dataset's row count by 3–4×.
2. `SubAccountId` is the closest FOCUS has to a practitioner cost object. For AI providers, is a provider project or workspace an appropriate sub-account, and should FOCUS guidance say so?
3. Is there appetite for a standardized actor dimension (agent or service identity) in a future FOCUS release, or is that correctly left to `x_` columns and specifications like OASA?
4. Self-hosted inference has no data generator. Should FOCUS guidance address organization-originated rows for owned infrastructure, or is that out of scope by design?

## 12. Changelog

- 0.1 (2026-10-05): initial draft against FOCUS 1.4 (June 2026) and OASA 0.1.1.

---

*This mapping is published by Onaro (BrianOnAI LLC) under CC BY 4.0. FOCUS™ is a trademark of the FinOps Foundation; referencing it does not imply endorsement.*

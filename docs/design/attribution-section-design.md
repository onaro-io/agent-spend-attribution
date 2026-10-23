# Attribution section — design note

**Work order:** WO-OASA-ATTR-1, Task 2
**Status:** Revised after design review. Proposal only. Task 3 does not start until this revision is approved.
**Spec it would change:** OASA 0.1.2, as an additive 0.1.3.
**Platform facts:** [Attribution identity by platform](../research/attribution-identity-by-platform.md), documentation read 2026-10-22.

This note proposes a small attribution section: four common fields that already exist, per-field provenance, a closed set of unattributed reasons, and a mapping record with validity dates. Platform behavior is not restated except where a field or a tag rule depends on it.

## Decisions from review

1. Resolution order, highest first: `declared`, `manual`, `mapped`, `inherited`, `rule`, `unattributed`.
2. A manual assignment overrides the automated methods (`mapped`, `inherited`, `rule`). A declared value is corrected by an allocation record or an adjustment charge. The declared field on the original record is never edited.
3. Provenance is per field. For each of the four common fields that is set, the record stores that field's method, source system, identity type, and identity value. A lower-precedence source may fill a field a higher one left empty.
4. `attribution_unattributed_reason` stays on the record, and only when none of the four common fields is set.
5. A convention-key tag or label already on a billing row is `declared`. The identity type is the tag mechanism. The identity value is the tag key. `mapped` is recorded only when a mapping record supplied the field.
6. Convention keys are `oasa_cost_center`, `oasa_agent`, `oasa_owner`, and `oasa_project`. `environment` stays unprefixed. An implementation MAY accept configured aliases for existing customer keys.
7. OpenTelemetry attributes for the four fields share one namespace: `oasa.agent.id`, `oasa.cost_center`, `oasa.agent.owner`, `oasa.project.id`.

---

## 1. Common attribution fields

These four fields are the attribution contract. Each already exists, stays optional, and keeps its 0.1.2 definition. A convention key on a billing row fills the matching field directly. A mapping record fills one or more of them from some other native identifier. An implementer has to store, export, and resolve these four. Nothing else is added to the contract.

| Field | Definition | Format | Example |
| --- | --- | --- | --- |
| `agent_id` | Stable id of the software agent that incurred the spend. The same string means the same agent for the life of that agent. | String. When the value will also be written as a cost tag or label, it MUST already be in the tagging form in [§7](#7-tagging-convention): lowercase, starting with a letter, only `a-z`, `0-9`, `_`, and `-`, at most 63 characters. | `support-triage` |
| `agent_owner` | The team or principal accountable for the agent. A person, a team, or a queue. The end user of a single request stays out of this field. | Same tagging form when it will be written as a tag or label. | `customer-success` |
| `cost_center` | The cost center or department that should carry the cost. | Same tagging form when it will be written as a tag or label. | `cc-4100` |
| `project_id` | The project or use case the spend belongs to. This is the organization's project, which may or may not equal the provider's project id. When they differ, the provider's id is the native identity in that field's provenance, and `project_id` is the organization's value after a mapping record is applied. When they are the same id, the field is declared from the provider id. | Same tagging form when it will be written as a tag or label. | `support-portal` |

### Why these four

- `agent_id` is the actor billing data does not have. FOCUS has no actor column. The research inventory shows every platform either lacks an agent id or expresses it only as a customer-chosen tag, a Copilot Studio app id, or a span attribute.
- `agent_owner` is who answers for the agent when the native identity is a person or a seat (an IAM principal, an organization member, a Microsoft 365 user) rather than a piece of software.
- `cost_center` is the finance object a tag or label is most often aimed at, and the object an allocation record already splits.
- `project_id` is the use case. Provider projects and workspaces are native identities that usually map here, once, rather than being treated as the agent.

### Left out of the contract

These stay in the record. They are not part of the set a mapping must be able to fill, and they do not get per-field provenance entries.

| Existing field | Why it is not in the common set |
| --- | --- |
| `agent_name`, `agent_version`, `agent_framework`, `parent_agent_id` | Display and structure. They do not identify the cost object. `agent_name` remains the human label. |
| `task_id`, `task_type`, `workflow_id`, `session_id`, `trace_id`, `span_id` | Run context. They are how records join. They are high-cardinality, and no platform in the inventory puts them on an invoice. Putting them in the common set would force every implementer to treat a trace as a cost object. |
| `customer_id`, `product_line` | Real allocation dimensions for some organizations, already optional. They are not universal enough to add to the set every mapping must handle. A mapping MAY set them. It is not required to. Setting `customer_id` alone does not clear `attribution_unattributed_reason`. |
| `environment`, `tags` | `environment` stays the runtime environment. `tags` stays the free-form map. The convention in §7 names tag keys that copy into the common fields, plus unprefixed `environment`. The rest of `tags` is not the contract. |
| `initiating_principal` | Who started the run. That is authorization context, distinct from the owner of the agent. |

No new cost-object field is proposed. `workflow` and `task` in particular stay where they are.

---

## 2. Per-field provenance

Every usage, charge, allocation, settlement, and outcome record that has one or more common fields set MUST say, for each of those fields, how that field was set. A mapping record does not carry this object. It is the table the `mapped` method consults.

One object, `attribution`. Its keys are the common fields that are set on the record. Each value has four members.

| Member | Type | Definition |
| --- | --- | --- |
| `method` | enum: `declared`, `manual`, `mapped`, `inherited`, `rule` | How this field was determined. |
| `source_system` | string | The system that minted the native identity. Examples: `anthropic`, `openai`, `aws.bedrock`, `azure`, `gcp`, `copilot-studio`, `microsoft-365`, `litellm`, `kong`, `portkey`, `otel`. |
| `identity_type` | string | Which native identifier was used. A dotted lowercase name, form in [§5.1](#51-identity-type-names). |
| `identity_value` | string | The value of that identifier. For a convention tag or label, this is the tag key. For every other method, it is the native value. |

`attribution_unattributed_reason` stays a record-level enum, [§4](#4-unattributed-reasons). It is present only when `agent_id`, `agent_owner`, `cost_center`, and `project_id` are all absent. The `attribution` object is absent in that case. There is no per-field unattributed method and no per-field reason. A field a source left empty simply has no key.

`source_system` on an entry is not the envelope `source_system`. The envelope field is who emitted the OASA record (`otel-collector`, `openai-billing`). The provenance `source_system` is who issued the identity that field came from. A collector can emit a record (`source_system` = `otel-collector`) whose cost center was minted by Bedrock (`attribution.cost_center.source_system` = `aws.bedrock`).

`provider` stays the model provider. A gateway record can have `provider` = `openai` and a provenance `source_system` of `litellm`.

The object is one schema property, with a fixed key set, so the wire contract stays one addition rather than sixteen sibling fields. `scripts/generate-schema.mjs` today emits a flat property per SPEC.md table row and has no nested object type beyond `map<string,string>`. Task 3 extends the generator for this one property. The drift check still fails if the schema and SPEC.md disagree.

Illustrative shape. The charge declared a cost center from a Bedrock profile tag and inherited the agent from the joined usage record, because the tag did not carry an agent:

```json
{
  "cost_center": "cc-4100",
  "agent_id": "support-triage",
  "attribution": {
    "cost_center": {
      "method": "declared",
      "source_system": "aws.bedrock",
      "identity_type": "aws.bedrock.inference_profile_tag",
      "identity_value": "oasa_cost_center"
    },
    "agent_id": {
      "method": "inherited",
      "source_system": "otel",
      "identity_type": "oasa.trace_id",
      "identity_value": "4bf92f3577b34da6a3ce929d0e0e4736"
    }
  }
}
```

The tag value `cc-4100` is the common field. The provenance value is the key `oasa_cost_center`.

### Methods

The names are `declared`, `manual`, `mapped`, `inherited`, `rule`, and `unattributed`. The first five are stored on a field. `unattributed` is the record state in which no common field is set.

| Method | Meaning |
| --- | --- |
| `declared` | The source stated this field. No mapping record was consulted. A convention-key tag or label on a billing row is declared: `identity_type` is the tag mechanism (the identity type in [§6.2](#62-resource-tags-and-labels)), and `identity_value` is the tag key. An accepted alias is declared the same way, and `identity_value` is the key that was actually on the row. An `oasa.*` span attribute is declared: `identity_type` is the attribute name and `identity_value` is the attribute value. A provider id copied straight into the common field of the same meaning (the sub-account is the organization's project) is declared: `identity_type` is the platform identity type and `identity_value` is that id. |
| `manual` | A person assigned this field. `identity_type` is `oasa.manual`. `identity_value` is the ticket or actor id the organization records for the assignment. Manual overrides `mapped`, `inherited`, and `rule`. It does not edit a declared value. |
| `mapped` | A mapping record translated one native identifier into this field. `identity_type` and `identity_value` are the native pair that matched. The mapping's validity window contained this record's `occurred_at`. `mapped` is recorded only for a mapping record. A convention key on a billing row is not a mapping record. |
| `inherited` | This field was copied from another OASA record. `identity_type` names that parent (`oasa.trace_id`, `oasa.record_id`). A provider tag the bill already carries is declared, including when the provider itself copied the tag from a parent resource onto the cost row. |
| `rule` | An allocation rule assigned this field. `allocation_rule_id` is that rule. `identity_type` is `oasa.allocation_rule` and `identity_value` equals `allocation_rule_id`. |
| `unattributed` | No method produced any of the four common fields. The fields are absent, the `attribution` object is absent, and `attribution_unattributed_reason` says why. When an identifier was present and could not be used, the reason still names that situation (`identity_not_mapped`, `mapping_conflict`, `seat_without_owner`, `not_on_bill`). The unused identifier is not given a provenance entry, because no field was set. |

`method` is not a replacement for `allocation_method` or `cost_source`. `cost_source` says how the money was derived. `allocation_method` says how a split was calculated. Provenance says how the actor and the cost object were chosen.

Normative constraints, to be enforced by schema tests:

- A key in `attribution` MUST be one of `agent_id`, `agent_owner`, `cost_center`, `project_id`.
- A key is present if and only if that common field is set.
- Each entry MUST include `method`, `source_system`, `identity_type`, and `identity_value`.
- `attribution_unattributed_reason` MUST be set when all four common fields are absent, and MUST be absent when any of them is set.
- On a mapping record, `attribution` and `attribution_unattributed_reason` MUST be absent.

---

## 3. Resolution order

Each common field is resolved on its own. Sources are considered in this order. The first source that supplies that field sets it and writes that field's provenance entry. A source that does not have the field leaves it for the next source.

1. `declared`
2. `manual`
3. `mapped`
4. `inherited`
5. `rule`
6. `unattributed`

`unattributed` applies to the record only after every field has been considered and none of the four was set.

A manual assignment overrides `mapped`, `inherited`, and `rule` for the fields it names. Where a manual value and an automated value both exist for one field, the stored field and its provenance are `manual`. A later manual assignment MAY replace a field already stored as `mapped`, `inherited`, or `rule`. The provenance on that field becomes `manual`.

A declared value on a stored record is never edited. To correct it, publish a new allocation record, or a charge that carries the adjustment the FOCUS mapping already describes. The original record keeps the declared field and its provenance. The new record carries its own per-field provenance (`manual` when a person assigned it, `rule` when a rule produced the allocation).

A usage record and the charge that bills it stay two records. They join on `trace_id` when both have one. Inheritance may fill a field the charge's higher-precedence sources left empty. It does not replace a field the charge already declared.

A Bedrock charge tagged `oasa_cost_center=cc-4100`, with no agent tag, declares `cost_center`. If the joined usage record has `agent_id`, the charge's empty `agent_id` may be inherited from that usage record. The usage record keeps its own provenance (declared from `oasa.agent.id`). A reader can still see which identity the invoice carried, because the charge's `cost_center` entry says `declared` and its `agent_id` entry says `inherited`.

When two mapping records match the same identity type, the same value, and overlapping validity windows, neither is applied to any field. If that leaves the record with no common field set, the reason is `mapping_conflict`. If another field was set by a higher source, the conflicted field stays empty and the record-level reason stays absent. Publishers SHOULD treat overlapping windows for one pair as an invalid mapping set.

`occurred_at` selects the mapping. A mapping changed on Tuesday does not rewrite Monday's records.

---

## 4. Unattributed reasons

Closed enum. New reasons are a minor spec revision. The reason is set only when none of the four common fields is set.

| Reason | When it is used |
| --- | --- |
| `no_identity` | The record has no native identifier and no declared common field. Direct model invocation with no profile, an untagged resource, a Copilot session whose user id is all zeros. |
| `identity_not_mapped` | A native identifier is present, and no mapping record covers that type and value at `occurred_at`. |
| `tag_missing` | The billing channel for this platform is a tag or label, and no convention key (and no accepted alias) is present. Includes a Google label key dropped after 1,000 distinct values, and a Bedrock or Azure cost row that is untagged. |
| `seat_without_owner` | The native identity is a person or a seat (Microsoft 365 Copilot user, OpenAI organization user, IAM principal used as a person) and no mapping assigns an `agent_owner` or `cost_center`. A seat is not an agent. |
| `not_on_bill` | This is a charge. The only identity sits on request metadata, a gateway log, or a span, and there is no `trace_id` (or other join key) to the record that holds it. The identity is usage-side only, so the charge is not given those fields. |
| `mapping_conflict` | Two mapping records cover the same identity at `occurred_at`, and applying neither of them leaves the record with no common field. |

`not_on_bill` and `mapping_conflict` are the two reasons beyond the four examples in the work order. `not_on_bill` is the inventory's main failure: Anthropic `metadata.user_id`, OpenAI `safety_identifier`, Bedrock request metadata, and gateway metadata never appear on the provider cost dataset. Calling that `no_identity` would erase an identifier that does exist on the usage side. `mapping_conflict` keeps a bad mapping set from silently picking a winner.

---

## 5. The mapping record

`record_type` gains the value `mapping`. A mapping record says: this native identifier means these common fields, from this time to this time.

It uses the envelope (so it has a `record_id`, an `occurred_at`, and a `source_system`) plus:

| Field | Required by the normative text | Role |
| --- | --- | --- |
| `attribution_identity_type` | SHOULD | The native identifier name. This is the mapping's key, not a provenance entry. |
| `attribution_identity_value` | SHOULD | The native value. |
| `valid_from` | SHOULD | Inclusive start, RFC 3339 UTC. |
| `valid_to` | MAY | Exclusive end. Absent means still in force. |
| `agent_id`, `agent_owner`, `cost_center`, `project_id` | At least one SHOULD be set | The fields the identifier maps to. |

`occurred_at` on a mapping record is when the mapping was recorded. `valid_from` is when it takes effect. Those are different moments. A mapping recorded on Friday can be valid from Monday.

`valid_from` and `valid_to` are the two fields that are not provenance and not common fields. They exist so a changed mapping does not rewrite history. They MUST be absent on every record type other than `mapping`. `attribution_identity_type` and `attribution_identity_value` MUST be absent on every record type other than `mapping`. On a usage, charge, allocation, settlement, or outcome record, the identity pair lives inside the per-field `attribution` entry. The `attribution` object and `attribution_unattributed_reason` MUST be absent on a mapping record.

Schema requirement stays the envelope only, matching 0.1.2. The SHOULD rules above are normative text plus schema tests on the golden mapping example, not new required properties. A partial mapping still validates. Receivers MAY refuse to apply a mapping that lacks a type, a value, or `valid_from`.

Example, illustrative:

```json
{
  "record_type": "mapping",
  "attribution_identity_type": "anthropic.workspace_id",
  "attribution_identity_value": "wrkspc_01JwQvzr7rXLA5AGx3HKfFUJ",
  "valid_from": "2026-09-01T00:00:00Z",
  "agent_id": "support-triage",
  "agent_owner": "customer-success",
  "cost_center": "cc-4100",
  "project_id": "support-portal"
}
```

Applying it to a charge whose `occurred_at` is inside the window, and whose common fields were empty, sets each target field and an `attribution` entry with `method` = `mapped`, `source_system` = `anthropic`, and the same identity type and value. A field the charge had already declared is left as declared. The mapping fills only the fields that were still empty, unless a manual assignment names those fields, in which case manual wins.

Replacing the cost center on 1 October is a second mapping record with `valid_from` of 1 October, and `valid_to` of 1 October on the first record. September charges keep the first record.

### 5.1 Identity type names

`identity_type`, on a provenance entry and on a mapping record, is a string, not a closed enum, so a new platform does not wait for a spec revision. The specification will list the names in §6 as the initial vocabulary. Receivers MUST match them as case-sensitive strings. Unknown types are allowed. They do not match a vocabulary row until a mapping record uses them.

Form: lowercase segments separated by dots, each segment starting with a letter and otherwise `[a-z0-9_]`.

---

## 6. Per-platform mapping

Organized by the five patterns in the research note. "Fills" means the common field written when this identifier is the one the organization uses for that purpose. The method is stated in the section introduction. Grain and whether it reaches the bill are from the 2026-10-22 inventory. Where the inventory left a question, the cell says so and the identifier is not treated as a billing source.

A row that says "mapping record" does not itself name the agent or the cost center. The mapping record does, and the field's method is `mapped`.

### 6.1 Account partition

The provider's own bucket. It reaches the bill. It is coarser than a request.

When the organization's common field is that same id, the field is `declared`. `identity_type` is the platform identity type and `identity_value` is the id. When a mapping record translates the id into a different value (a workspace id that means agent `support-triage` and cost center `cc-4100`), each field that mapping fills is `mapped`.

| Platform | Identity type | Fills | Grain | On the bill |
| --- | --- | --- | --- | --- |
| Anthropic | `anthropic.workspace_id` | `project_id` when the workspace id is the organization's project. `agent_id`, `cost_center`, and `agent_owner` only through a mapping record. | Cost: 1 day. Usage: 1 minute, 1 hour, or 1 day. | Yes, Cost API grouped by workspace. The Default Workspace value is null. A null id is `no_identity`, not a mapping key. |
| Anthropic | `anthropic.api_key_id` | A mapping record MAY set `agent_id`. | Usage buckets. Cost API grouping documented on 2026-10-22 is workspace and description, not key. | Usage. Not a documented cost grouping. |
| OpenAI | `openai.project_id` | `project_id` when the project id is the organization's project. | Cost: 1 day. Usage: 1 minute, 1 hour, or 1 day. | Yes, Costs API. Scale Tier bundle cost stays on the organization and is `no_identity` at project grain. |
| OpenAI | `openai.api_key_id` | A mapping record MAY set `agent_id`. | Same split as the project. | Yes, Costs API, daily. |
| Google Cloud | `gcp.project_id` | `project_id` when the project id is the organization's project. | Hourly windows in the standard billing export. | Yes. |
| Azure | `azure.resource_id` | A mapping record MAY set `project_id` when one Foundry resource is one use case. It MUST NOT be assumed to be `agent_id`. | Meter rows on the invoice. | Yes. Partner and Marketplace meters sit on the resource group, not on the Foundry resource. |
| Copilot Studio | `copilot_studio.environment_id` | `project_id` when the environment id is the organization's project. | Environment capacity, daily in the credit reports. | Yes, as pooled credits or as the Azure pay-as-you-go meter for that environment. Not per message. |

### 6.2 Resource tags and labels

The customer-attached key that the provider copies onto cost rows. A convention key on the billing row declares the field. `identity_type` is the mechanism in this table. `identity_value` is the tag key. The tag's value is copied into the common field. `mapped` is not how this copy is recorded.

| Platform | Identity type | Fills | Grain | On the bill |
| --- | --- | --- | --- | --- |
| Bedrock application inference profile | `aws.bedrock.inference_profile_tag` | The convention key selects the field: `oasa_cost_center`, `oasa_agent`, `oasa_owner`, `oasa_project` | Per usage type per day. Not per request. | Yes, after the tag key is activated. Not retroactive. Classic CUR and CUR 2.0. |
| Bedrock project (`bedrock-mantle`) | `aws.bedrock.project_tag` | Same convention keys | Same daily aggregate | Yes, after activation. Responses and Chat Completions. |
| Bedrock workspace | `aws.bedrock.workspace_id` | Carries project tags. Same convention keys. | Same daily aggregate | Yes, as those tags. Anthropic Messages on `bedrock-mantle`. |
| Azure resource tag | `azure.tag` | Same convention keys | Usage records after the tag is present. About 24 hours. | Yes, when the service includes tags. Purchases show as tags not supported. |
| Foundry project tag | `azure.foundry_project` | `project_id`, from the provider-written tag whose key is `project` | Usage for supported meters | Yes. **Preview.** Models sold by Azure, including Azure OpenAI. Not Marketplace models. The provider writes this tag. Its key is not the convention key `oasa_project`. An implementation MAY configure `project` as an alias of `oasa_project`. When that alias is accepted, the field is `declared` and `identity_value` is `project`. Do not also write a user tag named `project` on that usage. |
| Vertex / Agent Platform request label | `gcp.label` | Same convention keys, as label keys | Labels are attached per call. The billing export is hourly. | Yes, PayGo only. Provisioned Throughput ignores labels. Partner models that support labels use the `X-Vertex-AI-Labels` header. |

A profile, project, or deployment that serves more than one agent does not fill `agent_id` from its resource id. `agent_id` comes from the `oasa_agent` tag or label when that value is one agent, or it stays on the usage record and may be inherited onto a charge that left `agent_id` empty.

### 6.3 Per-request metadata

Present on the request, the log, or the span. Absent from the cost dataset. These fill a **usage** record. They fill a **charge** only by inheritance, and only for a field the charge left empty, and only when a join key exists. A charge with only this identity, and no join key, and no common field from any other source, is `not_on_bill`.

| Platform | Identity type | Fills on a usage record | Grain | On the bill |
| --- | --- | --- | --- | --- |
| Anthropic | `anthropic.metadata.user_id` | Nothing in the common set. Abuse-detection id, max 512. An end-user id stays out of `agent_owner`. | Per request | No |
| Anthropic | `anthropic.user_profile_id` | Nothing in the common set. Safety attribution of an end customer. Profiles are not billable. | Per request | No |
| OpenAI | `openai.safety_identifier` | Nothing in the common set. End-user safety id, max 128. | Per request or Realtime session | No |
| OpenAI | `openai.metadata` | Nothing in the common set. Up to 16 pairs, key 64, value 512, for object queries. | Per object | No |
| Bedrock | `aws.bedrock.request_metadata` | A usage record built from invocation logs MAY apply a mapping record to a low-cardinality key. Per-request ids MUST NOT be used as mapping keys. | Per request, logs only | No. CUR has no request id. |
| OpenTelemetry | `oasa.agent.id` | `agent_id`, method `declared`. `identity_type` is `oasa.agent.id`. `identity_value` is the attribute value. | Per span | No |
| OpenTelemetry | `oasa.cost_center` | `cost_center`, method `declared` | Per span | No |
| OpenTelemetry | `oasa.agent.owner` | `agent_owner`, method `declared` | Per span | No |
| OpenTelemetry | `oasa.project.id` | `project_id`, method `declared` | Per span | No |

### 6.4 Caller identity and seats

The native value names a person or a caller. It fills `agent_owner` or `cost_center` through a mapping record (`mapped`). It does not fill `agent_id`, except the Copilot Studio app id, which is an agent resource. When that app id is the organization's `agent_id`, the field is `declared`.

| Platform | Identity type | Fills | Grain | On the bill |
| --- | --- | --- | --- | --- |
| OpenAI | `openai.user_id` | A mapping record MAY set `agent_owner` when the organization member is the owner | Usage buckets | Usage only. Not a Costs API grouping. This is the platform member, distinct from `safety_identifier`. |
| Bedrock | `aws.bedrock.iam_principal` | A mapping record MAY set `agent_owner` or `cost_center` | Per usage type per day | Yes, in CUR 2.0 with caller identity. Not in classic CUR. |
| Microsoft 365 Copilot | `microsoft365.copilot_user` | A mapping record MAY set `agent_owner` or `cost_center`. No mapping: `seat_without_owner`. | Per user seat | The seat is the bill. It is not split by agent. Licensed use of the features in the Copilot Studio rate table adds no credit charge. |
| Copilot Studio | `copilot_studio.agent_id` | `agent_id` when the app id is the organization's agent id | Credit reports by agent. Not per message. | Yes, as credits. The Azure invoice for pay-as-you-go is the environment meter. |
| Copilot Studio | `copilot_studio.user_id` | A mapping record MAY set `agent_owner` | User report for the standard harness | Yes, as credits. The all-zero user id is `no_identity`. |
| Microsoft 365 metered credits | `microsoft365.credit_user`, `microsoft365.credit_agent` | User maps toward `agent_owner` through a mapping record. Agent app id maps to `agent_id` when it is the organization's agent id. | Credits report, visible within an hour. Not per message. | Yes, for users without a Microsoft 365 Copilot license. |

### 6.5 Gateway key

The gateway's own ledger, per request. It reaches the provider invoice only when the upstream call also uses a partition, tag, or label from §6.1 or §6.2. Otherwise provider charges that lack a join are `not_on_bill`.

A convention key in gateway metadata declares the field on the gateway's usage record. `identity_type` is the metadata mechanism. `identity_value` is the key. A virtual key, team, or consumer id fills a common field only through a mapping record.

| Platform | Identity type | Fills | Grain | On the provider bill |
| --- | --- | --- | --- | --- |
| LiteLLM | `litellm.virtual_key` | A mapping record MAY set `agent_id` or `cost_center` | Per request in `LiteLLM_SpendLogs` | No |
| LiteLLM | `litellm.team_id` | A mapping record MAY set `cost_center` or `agent_owner` | Per request | No |
| LiteLLM | `litellm.end_user` | Outside the common set. High-cardinality end user. | Per request | No |
| Kong | `kong.consumer_id` | A mapping record MAY set `agent_id` or `cost_center`. `consumer.custom_id` is the same row when that is the stable business id. | Per request in the log plugin. Rate-limit cost is applied on the next request and is a control figure, not the ledger. | No |
| Portkey | `portkey.virtual_key` | A mapping record MAY set `agent_id` or `cost_center`. Catalog integrations are the current form of the virtual key. | Per request in Portkey analytics | No |
| Portkey | `portkey.metadata` | A convention key in metadata (`oasa_cost_center`, `oasa_agent`, `oasa_owner`, `oasa_project`) MAY be declared into the matching field on the gateway's usage record. `_user` is an end user and stays out of `agent_owner`. | Per request. Values max 128 characters in Portkey, still capped at 63 by §7 when copied into a common field. | No |

---

## 7. Tagging convention

One set of keys, written so the strictest platform accepts them. That platform is Google Cloud request labels, read 2026-10-22 from [Custom metadata labels](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/add-labels-to-api-calls):

- Keys and values are lowercase letters, digits, underscores, and dashes. A key starts with a lowercase letter.
- Key and value are at most 63 characters.
- A label key can be dropped without notice after 1,000 distinct values for that key over the life of the billing account.

AWS cost allocation tags and Azure resource tags allow a larger character set and a longer value. The convention does not use that room. A value that fits a Google label fits the others. Bedrock's cost best-practices page says the same thing in different words: keep cost-allocation keys low-cardinality, and keep session, trace, and experiment ids in request metadata.

### Keys

| Tag or label key | Copies into | Example value |
| --- | --- | --- |
| `oasa_cost_center` | `cost_center` | `cc-4100` |
| `oasa_agent` | `agent_id` | `support-triage` |
| `oasa_owner` | `agent_owner` | `customer-success` |
| `oasa_project` | `project_id` | `support-portal` |
| `environment` | `environment` | `prod`, `staging`, `dev` |

`environment` is not a common attribution field and has no provenance entry. It stays in the convention because the record already has the field. The value `other` is allowed on the OASA field. The tag value should be one of `prod`, `staging`, `dev` when the environment is one of those.

The four `oasa_` keys are the names the specification defines. An implementation MAY accept configured aliases for keys a customer already writes. An alias fills the same common field as the convention key it stands in for. The field is still `declared`. `identity_value` SHOULD be the key that was present on the row, so the audit trail shows the alias rather than the canonical name.

`oasa_cost_center` is 16 characters, `oasa_project` is 11, and the other two `oasa_` keys are shorter. Each starts with a letter. All of them fit the 63-character key limit.

### Per-request ids never go in tags

`trace_id`, `span_id`, `session_id`, `task_id`, request id, message id, end-user id, email, and timestamp MUST NOT be tag or label keys or values. They are unique per request or close to it. On Google that exhausts the 1,000-value budget and the key can be dropped for the rest of the billing account's life. On AWS they bloat the cost-allocation tag space. On Azure they blow past any useful grouping. Those ids belong on the usage record (`trace_id`, `session_id`, `task_id`) or in the platform's request-metadata channel (§6.3).

An agent catalog larger than 1,000 distinct `oasa_agent` values on one Google billing account MUST NOT put `oasa_agent` on Google labels. Bind agents with a mapping record from the profile or project id instead, and keep the label set to `oasa_cost_center`, `oasa_owner`, `oasa_project`, and `environment`.

### Where to put them

Tag the resource the provider copies onto the cost row.

- Bedrock: the application inference profile, or the mantle project. One profile is one model, so a workload that calls several models needs one profile per model, carrying the same tags.
- Azure: the Foundry resource and the model deployment, as user-defined tags, using the `oasa_` keys. Foundry's automatic tag key `project` is `azure.foundry_project`. It is separate from `oasa_project`. Do not write a second user tag named `project` onto that same usage.
- Google: the `labels` object on the PayGo `generateContent` or `streamGenerateContent` call, or `X-Vertex-AI-Labels` for a supported partner model. Not on Provisioned Throughput. The project itself remains `gcp.project_id`.
- Anthropic, OpenAI, Microsoft 365 Copilot, and Copilot Studio: no cost-allocation tag channel. Do not invent one. Use a mapping record from the workspace, project, key, seat, or agent app id.
- Gateways: the convention keys MAY be sent as gateway metadata for the gateway ledger. That does not put them on the provider bill. To reach the provider bill, the gateway must set the provider's own tag or label, or use a separate provider key or project per common field.

### How the keys translate

| Platform | Mechanism | Case and length the platform allows | What this convention uses |
| --- | --- | --- | --- |
| AWS | Cost allocation tag on the profile, project, or IAM principal. Activate the key. Up to 24 hours to appear, then up to 24 hours to activate. Not retroactive. Backfill restores at most 12 months, and only for months the resource already had the tag. 500 active keys per payer. | AWS tags are case-sensitive. The Bedrock request-metadata channel is a different object (16 entries, key and value 256) and does not accept these keys. | Lowercase keys exactly as in the table. Activate `oasa_cost_center`, `oasa_agent`, `oasa_owner`, `oasa_project`, `environment`. |
| Azure | Resource tag. Cost Analysis groups by Tag. | Name up to 512 characters, value up to 256. Names cannot contain `< > % & \ ? /`. 50 tags per resource. | The same lowercase keys, values ≤ 63. Foundry's automatic `project` tag is the provider's. The convention key on a user tag is `oasa_project`. |
| Google | Request label, PayGo. | 64 labels per call for Google models, 32 for the partner models that support them. Key 1–63, value 0–63. Lowercase. 1,000 values per key per billing account. | The same keys and the same value rules. Empty values are not used. |
| Anthropic | No tag. Workspace id and, on usage only, API key id. | Workspace id is `wrkspc_…`. | Mapping record. No tags. |
| OpenAI | No tag. Project id and API key id on the Costs API. | Metadata is 16 pairs, key 64, value 512, and is not a cost dimension. | Mapping record from `openai.project_id` or `openai.api_key_id`. Metadata is not a substitute. |
| Copilot Studio / Microsoft 365 | No tag. Agent app id, environment, user seat, credits. | Seat is per user. Credits are not per message. | Mapping record. No tags. |
| LiteLLM | Spend-log metadata and `x-litellm-tags`. Not provider tags. | A max length for metadata values was not in the pages read. | Convention keys in metadata for the gateway ledger only. |
| Kong | Consumer, and log-plugin fields. Header templating can copy a header upstream. | Consumer id, username, or custom id. | Mapping from `kong.consumer_id`. A copied header reaches the bill only if the provider stores it as a tag or label. |
| Portkey | `x-portkey-metadata` and analytics. | String values, max 128. | Convention keys in metadata for the gateway ledger. `_user` stays out of `agent_owner`. |
| OpenTelemetry | Span and resource attributes, not provider tags. | Attribute values are not limited to 63 by the convention. | `oasa.agent.id`, `oasa.cost_center`, `oasa.agent.owner`, `oasa.project.id`. They are not invoice tags. |

---

## 8. `gen_ai.agent.id` and the `oasa` attribute namespace

The GenAI registry read on 2026-10-22 defines `gen_ai.agent.id` as the stable id of a **hosted** agent resource (an assistant id, a Bedrock agent ARN, a Google reasoning-engine name). It says in-memory and process-local ids do not belong there. `gen_ai.agent.name` is still a human-readable name supplied by the application. `gen_ai.main_agent.id` is the top-level hosted agent in the process, with the same hosted-id rule.

OASA 0.1.2 maps `gen_ai.agent.id` to `agent_id`. That was written when the attribute was a general agent id. Under the current registry, a non-hosted application agent has no `gen_ai.agent.id`.

### Where the four common fields go

They go in one attribute namespace, set by the application:

| Common field | Span attribute | Provenance when the attribute is set |
| --- | --- | --- |
| `agent_id` | `oasa.agent.id` | `declared`. `identity_type` `oasa.agent.id`. `identity_value` is the attribute value. `source_system` `otel`. |
| `cost_center` | `oasa.cost_center` | `declared`. `identity_type` `oasa.cost_center`. |
| `agent_owner` | `oasa.agent.owner` | `declared`. `identity_type` `oasa.agent.owner`. |
| `project_id` | `oasa.project.id` | `declared`. `identity_type` `oasa.project.id`. |

- The value of `oasa.agent.id` is the stable application agent id, in the tagging form when that agent will also appear as a tag.
- It is not a trace id, a session id, or a new UUID per process. Those fail the "stable id" requirement the same way an in-memory id fails `gen_ai.agent.id`.
- A lower-precedence source MAY fill a common field these attributes left empty. An attribute that is present wins for its field, because it is `declared`.

`gen_ai.agent.name` continues to map to `agent_name`.

`gen_ai.agent.id` maps to `external_identity_ref`. When that attribute is present, `identity_scheme` is `other`. It is the hosted resource, not the application agent. A mapping record MAY bind that resource id to an `agent_id` when one hosted agent is one application agent. The exporter does not assume that. That binding is `mapped`.

`gen_ai.main_agent.id` maps to `external_identity_ref` only when `gen_ai.agent.id` is absent. When both are present, `gen_ai.agent.id` is the external ref on that span. `gen_ai.main_agent.id` is not copied into `parent_agent_id`. A hosted resource id and an internal parent id are different kinds of value.

### Spec mapping table

Replace the agent rows in the OASA ↔ OpenTelemetry table, and add the three new attribute rows:

| OASA | OpenTelemetry | Notes |
| --- | --- | --- |
| `agent_id` | `oasa.agent.id` | Application agent id, set by the application. `gen_ai.agent.id` stays off this field. |
| `cost_center` | `oasa.cost_center` | Declared when the attribute is set. |
| `agent_owner` | `oasa.agent.owner` | Declared when the attribute is set. |
| `project_id` | `oasa.project.id` | Declared when the attribute is set. |
| `agent_name` | `gen_ai.agent.name` | Unchanged. Application-supplied display name. |
| `external_identity_ref` | `gen_ai.agent.id`, else `gen_ai.main_agent.id` | Hosted agent resource id. |
| `identity_scheme` | `other` when `external_identity_ref` is set from a `gen_ai.agent*` id | No new scheme value. `erc8004` stays what it is. |

These `oasa.*` names are an OASA reservation, same idea as the draft `oasa.infrastructure.*` reservations, on span attributes. They do not collide with `gen_ai.*`.

### Exporter change

In `oasa-otel-exporter` (not in this change):

- `mapping.yaml`: `agent_id` reads `oasa.agent.id`. It no longer reads `gen_ai.agent.id`.
- `cost_center` reads `oasa.cost_center`. `agent_owner` reads `oasa.agent.owner`. `project_id` reads `oasa.project.id`. Configured attribution settings may still fill a field the span left empty. That fill is `manual` or `mapped` according to where the setting came from, and it does not replace an attribute that was present.
- `external_identity_ref` reads `gen_ai.agent.id`, then `gen_ai.main_agent.id`.
- `identity_scheme` is `other` when that external ref is set.
- Golden traces that put an application id such as `agent-support-47` on `gen_ai.agent.id` move that value to `oasa.agent.id`. A real hosted id, when a test has one, stays on `gen_ai.agent.id` and is expected on `external_identity_ref`.
- `agent_name` from `gen_ai.agent.name`, and the `service.name` fallback for `agent_name` when no agent name is present, stay as they are. `service.name` does not fill `agent_id`.

Until that exporter change, a current exporter will keep writing hosted-or-application ids from `gen_ai.agent.id` into `agent_id`. That remains valid 0.1.2 output. It is not the 0.1.3 mapping.

---

## 9. Compatibility

### Existing records

Every new field is optional. `record_type` gains `mapping`. `attribution` and `attribution_unattributed_reason` are new, so existing records do not contain them. `schema_version` stays `0.1`. The document version becomes 0.1.3. A valid 0.1.2 record remains valid. This matches the 0.1.2 rule that an added enum value is additive and does not move `schema_version`.

`additionalProperties` stays false. The new names are added to the schema. Unknown names still fail.

`valid_from` and `valid_to` are rejected by the normative text on non-mapping records. `attribution_identity_type` and `attribution_identity_value` are likewise only on mapping records. Schema tests cover a mapping golden record and a usage record that omits the new fields.

### FOCUS

The FOCUS column mapping keeps its columns. The meaning of a convention key changes as follows.

- `Tags` still copies to `tags`. A convention key in `Tags` declares the field. `identity_type` is the tag mechanism that produced the FOCUS `Tags` map for that provider. `identity_value` is the tag key. The tag value copies into the common field: `oasa_cost_center` → `cost_center`, `oasa_agent` → `agent_id`, `oasa_owner` → `agent_owner`, `oasa_project` → `project_id`. An accepted alias is declared the same way, and `identity_value` is the key present on the row. `mapped` is reserved for a mapping record. It is not the method for this copy.
- `ResourceId` still becomes `agent_id` only when that resource is the agent. That copy is `declared`, with the resource's identity type and the resource id as `identity_value`. Otherwise `ResourceId` is a native identity (`aws.bedrock` profile ARN, `azure.resource_id`) and a mapping record decides. The field a mapping record fills is `mapped`.
- `SubAccountId` still MAY fill `project_id` when the sub-account is the organization's project. That straight copy is `declared`. Provenance uses the platform identity type (`openai.project_id`, `anthropic.workspace_id`, `gcp.project_id`) and the sub-account id as `identity_value`. A mapping record that translates the sub-account into a different project, agent, or cost center is `mapped`.
- Agent identity, per-field provenance, and mapping records still have no FOCUS column. Export adds one custom column, `x_oasa_attribution`, holding the `attribution` object as JSON, and `x_oasa_unattributed_reason` when the reason is set. One column keeps the FOCUS dataset from growing by sixteen provenance columns. Mapping records are not cost rows and are not written into a FOCUS cost dataset.

A FOCUS row with no convention key, no accepted alias, and no usable `ResourceId` or `SubAccountId` is a charge with no common field set and reason `tag_missing` or `no_identity`, as §4 distinguishes. It is not given a default cost center.

The current FOCUS example that maps `CostCenter` and `Agent` through configured keys stays valid as an alias configuration. Task 3 updates that example so the convention keys are the names the spec shows, and says additional keys are aliases.

---

## 10. Fields this note adds

| Addition | Why it exists |
| --- | --- |
| `attribution` | One object. For each common field that is set, the method, source system, identity type, and identity value of the source that supplied that field. A lower source fills only a field a higher source left empty, and gets its own entry. |
| `attribution_unattributed_reason` | Unattributed spend needs a standard reason. Record level, and only when none of the four common fields is set. |
| `attribution_identity_type`, `attribution_identity_value` on a mapping record | The native name (`anthropic.workspace_id`) and value have to be the mapping's key. On every other record type they live inside the per-field entry. |
| `record_type` value `mapping` | The mapping has to be a record, so it is versioned and auditable with everything else. |
| `valid_from`, `valid_to` | A mapping has to change without rewriting records whose `occurred_at` is already past. |

No other field is proposed. `customer_id`, task, workflow, and session stay as they are in 0.1.2.

---

## 11. Implementation follow-ups (Task 5)

This section is not specification text. It is not copied into SPEC.md. It names one implementation, Meridian, so the conformance work has a translation. The exporter notes in §8 are part of the same follow-up list. The full priority-ordered conformance list is Task 5 and waits until the design is approved.

### Method translation

Read from `origin/staging` of `bmd523-quantum/caio-assistant` on 2026-10-22, commit `10aa157f13f7a09c0280f84348ba31b40a173b7b` (2026-10-20), file `agentic/services/attribution_service.py` and migration `066_wo3_spend_records_attribution.sql`. The service comment states precedence `declared` > `manual`/`inherited` > `rule` > `unattributed`, and says rule application and manual assignment only update rows whose method is `unattributed`. They do not overwrite `declared`, `manual`, `inherited`, or `demo_seed`. Migration 066's check constraint lists `unattributed`, `rule`, `manual`, `inherited`, and `demo_seed`. `declared` appears in the service comment and is absent from that constraint. Task 5 confirms whether a later migration added it. Rows the review specified, and that this checkout did not contain as source text, are marked as review instructions.

| Meridian | Spec |
| --- | --- |
| `declared` (telemetry identity, in the service comment) | `declared` on each field that telemetry set |
| FOCUS tag recorded as `inherited` (review instruction) | `declared`. `identity_type` is the tag mechanism. `identity_value` is the tag key. |
| `manual` (in-place update of `unattributed` rows) | `manual`. Overrides `mapped`, `inherited`, and `rule`. A declared value is corrected by an allocation record or an adjustment charge, and the original field is left as declared. |
| `inherited` when it copies another record (a seat roster, a joined usage record) and the source is not a FOCUS convention tag | `inherited` |
| `rule` | `rule` |
| `unattributed` | No common field set. `attribution_unattributed_reason` is set. |
| `demo_seed` | No spec method. Fixture data stays outside the specification. |
| `no_project` (review instruction; a code search of the repository on 2026-10-22 did not find this string) | `no_identity` |

Meridian's default FOCUS tag keys are `CostCenter` and `Agent` (review instruction). The convention keys are `oasa_cost_center` and `oasa_agent`, plus `oasa_owner` and `oasa_project`. An implementation MAY configure `CostCenter` as an alias of `oasa_cost_center` and `Agent` as an alias of `oasa_agent`. An accepted alias is still `declared`, and `identity_value` is the key on the row.

Meridian's staging precedence has no `mapped` step, and it ties `manual` with `inherited`. The spec order is `declared`, `manual`, `mapped`, `inherited`, `rule`, `unattributed`. Customer mappings of native ids are new work for that implementation. Meridian department and workflow fields stay outside the OASA common set. `workflow` remains task context. A department maps toward `cost_center` or `agent_owner` when a conformance adapter emits OASA records.

### Exporter

The `oasa-otel-exporter` changes in §8 are the exporter half of Task 5: read `oasa.agent.id`, `oasa.cost_center`, `oasa.agent.owner`, and `oasa.project.id`; stop reading `gen_ai.agent.id` into `agent_id`; put `gen_ai.agent.id` (else `gen_ai.main_agent.id`) on `external_identity_ref`. Current exporter output remains valid 0.1.2.

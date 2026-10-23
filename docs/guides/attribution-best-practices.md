# Attributing agent spend

**For:** someone connecting a provider bill, a gateway ledger, or OpenTelemetry spans to OASA 0.1.3.
**Rules:** [Attribution](../../SPEC.md#attribution) in the specification.
**What each platform actually puts on a bill:** [Attribution identity by platform](../research/attribution-identity-by-platform.md), documentation read 2026-10-22.

Do the work in this order. Stop at the first step that fills the fields you need.

## 1. Name the four values

| Field | Write this | Leave it empty when |
| --- | --- | --- |
| `agent_id` | The stable id of the software agent. The same string for the life of that agent. | The bill only names a person, a seat, or a shared profile. |
| `agent_owner` | The team or principal who answers for the agent. | You only know the end user of one request. |
| `cost_center` | The finance object that should carry the cost. | You do not know it yet. Do not invent a default. |
| `project_id` | The organization's project or use case. | The provider's project id is a different string. Keep the provider id as the native identity and map it. |

If a value will also be written as a tag or label, write it in tag form before it goes anywhere else: lowercase, starting with a letter, only `a-z`, `0-9`, `_`, and `-`, at most 63 characters.

`customer_id`, task, session, and trace stay on the record. They are not these four fields.

## 2. Put a durable key on the thing the bill copies

Tag or label the resource the provider copies onto the cost row. Use these keys:

| Key | Becomes |
| --- | --- |
| `oasa_cost_center` | `cost_center` |
| `oasa_agent` | `agent_id` |
| `oasa_owner` | `agent_owner` |
| `oasa_project` | `project_id` |
| `environment` | `environment` (`prod`, `staging`, or `dev`) |

A convention key already on the billing row is **declared**. The provenance `identity_type` is the tag mechanism (`aws.bedrock.inference_profile_tag`, `azure.tag`, `gcp.label`). The provenance `identity_value` is the key, `oasa_cost_center`, not the tag's value. The tag's value is the common field. Copy the rest of the tag map to `tags`.

An implementation may accept an alias for a key a customer already writes, such as `CostCenter` for `oasa_cost_center`. An accepted alias is still declared, and `identity_value` is the key that was on the row.

Where the key goes:

- **Amazon Bedrock:** the application inference profile, or the mantle project. One profile is one model, so a workload that calls several models needs one profile per model, carrying the same keys. Activate the cost-allocation tag key. Tags are not retroactive.
- **Azure:** user-defined tags on the Foundry resource and the model deployment. Foundry's automatic tag key is `project`. That is not `oasa_project`. You may configure `project` as an alias of `oasa_project`. Do not also write a user tag named `project` on that usage.
- **Google Cloud:** the `labels` object on a PayGo `generateContent` or `streamGenerateContent` call, or `X-Vertex-AI-Labels` for a supported partner model. Provisioned Throughput ignores labels. A label key can be dropped after 1,000 distinct values over the life of the billing account. If you have more than 1,000 agents, do not put `oasa_agent` on Google labels. Bind the agent with a mapping record from the profile or project id, and keep the labels to `oasa_cost_center`, `oasa_owner`, `oasa_project`, and `environment`.
- **Anthropic, OpenAI, Microsoft 365 Copilot, and Copilot Studio:** there is no cost-allocation tag channel. Do not invent one. Use a mapping record (step 3).

These never go in a tag or label, as a key or as a value: `trace_id`, `span_id`, `session_id`, `task_id`, request id, message id, end-user id, email, timestamp. They belong on the usage record or in the provider's request-metadata channel. Request metadata does not reach the provider invoice.

A profile that serves more than one agent does not become `agent_id`. Put `oasa_agent` on it only when that value is one agent. Otherwise map the profile id, or leave `agent_id` on the usage record.

## 3. Bind a native id with a mapping record

Use a `mapping` record when the bill names something else: a workspace, an API key, a seat, an IAM principal, a gateway virtual key, or a resource id that is not itself the agent.

The record says: this native identifier means these fields, from `valid_from` (inclusive) until `valid_to` (exclusive; omit `valid_to` while it is still in force). `occurred_at` on the mapping is when you recorded it, which can be later than `valid_from`. A charge selects the mapping whose window contains the charge's `occurred_at`. Changing the mapping on Tuesday does not rewrite Monday.

`mapped` means a mapping record supplied the field. A convention key on the bill is not mapped.

Straight copies stay declared, with the platform identity type and the id as `identity_value`:

- Anthropic workspace id, OpenAI project id, or Google Cloud project id copied into `project_id` when that id is the organization's project.
- A Copilot Studio app id copied into `agent_id` when that app id is the organization's agent id.
- `ResourceId` copied into `agent_id` only when the resource is the agent.

A null Anthropic workspace id, an all-zero Copilot user id, and a Scale Tier bundle that has no project are `no_identity`. Do not invent a mapping key for them.

A seat or a person (Microsoft 365 Copilot user, OpenAI organization user, Bedrock IAM principal used as a person) can fill `agent_owner` or `cost_center` through a mapping record. It does not fill `agent_id`. With no mapping, the reason is `seat_without_owner`.

A gateway virtual key, team, or consumer id fills a field on the gateway's own usage record through a mapping record. That ledger reaches the provider invoice only when the upstream call also sets a provider tag, label, project, or key. Otherwise the provider charge, if it has no join key, is `not_on_bill`.

Two mapping records for the same identity type and value with overlapping windows are a bad set. Apply neither. If that leaves the record with no common field, the reason is `mapping_conflict`.

## 4. Write provenance on each field you set

`attribution` has one entry per common field that is set. Each entry has `method`, `source_system`, `identity_type`, and `identity_value`. `source_system` here is who minted the identity. The envelope `source_system` is who emitted the OASA record. They are often different.

Resolve each field on its own, highest source first:

1. `declared`
2. `manual`
3. `mapped`
4. `inherited`
5. `rule`
6. `unattributed`, only when none of the four fields was set

A source that does not have a field leaves it for the next source. A Bedrock charge tagged `oasa_cost_center=cc-4100`, with no agent tag, declares `cost_center`. A mapping record on the profile ARN can still set `agent_id` as `mapped`, because declared left that field empty. The golden record is [`examples/charge-declared-tag-mapped-agent.json`](../../examples/charge-declared-tag-mapped-agent.json).

A usage record and the charge that bills it stay two records. Join them on `trace_id` when both have one. Inheritance may fill a field the charge left empty. It does not replace a field the charge declared.

A manual assignment overrides `mapped`, `inherited`, and `rule`. It does not edit a declared value. To correct a declared value, publish an allocation record, or a charge with `tags.adjustment` set to `true`. Leave the original record as it was.

Set `attribution_unattributed_reason` only when none of the four fields is set. Use `tag_missing` when the billing channel is a tag or label and no convention key or accepted alias is present. Use `not_on_bill` when the only identity is on a span, a gateway log, or request metadata and the charge has no join key. Use `identity_not_mapped` when an id is present and no mapping covers it. Do not fill a default cost center.

## 5. On a span, use the `oasa` attributes

| Attribute | Field | Method |
| --- | --- | --- |
| `oasa.agent.id` | `agent_id` | `declared` |
| `oasa.cost_center` | `cost_center` | `declared` |
| `oasa.agent.owner` | `agent_owner` | `declared` |
| `oasa.project.id` | `project_id` | `declared` |

`oasa.agent.id` is the application's stable agent id. `gen_ai.agent.id` is a hosted agent resource id (an assistant id, a Bedrock agent ARN, a reasoning-engine name). Copy `gen_ai.agent.id` to `external_identity_ref` with `identity_scheme` `other`. If `gen_ai.agent.id` is absent, `gen_ai.main_agent.id` may fill `external_identity_ref`. Do not copy either into `agent_id` or `parent_agent_id`.

`gen_ai.agent.name` still maps to `agent_name`. `service.name` may fill `agent_name` when no agent name is present. It does not fill `agent_id`.

Output from oasa-otel-exporter 0.1.0, which wrote `gen_ai.agent.id` into `agent_id`, remains valid 0.1.2. It is not the 0.1.3 mapping. New instrumentation should set `oasa.agent.id`.

## Checklist

- The four values are stable and, if tagged, already in tag form.
- Convention keys on the bill are declared, with `identity_value` equal to the key.
- Anything else that fills a field has a mapping record whose window contains `occurred_at`, and the field's method is `mapped`.
- No per-request id is in a tag or label.
- A declared field was not edited. A correction is a new allocation or adjustment.
- A record with no common field has an unattributed reason and no default cost center.
- Span agent ids are on `oasa.agent.id`. Hosted resource ids are on `external_identity_ref`.

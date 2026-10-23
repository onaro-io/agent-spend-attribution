# Attributing agent spend

**For:** someone connecting a provider bill, a gateway ledger, or OpenTelemetry spans to OASA 0.1.3, and the finance and platform teams who configure each provider.
**Rules:** [Attribution](../../SPEC.md#attribution) in the specification.
**What each platform actually puts on a bill:** [Attribution identity by platform](../research/attribution-identity-by-platform.md), documentation read 2026-10-22.

Sections 1–5 are the implementer's procedure. [Finance and platform teams](#finance-and-platform-teams) is the per-platform part.

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

- **Amazon Bedrock:** the application inference profile, or the mantle project. One profile is one model, so a workload that calls several models needs one profile per model, carrying the same keys. Activate the cost-allocation tag key. Tags apply to cost incurred after activation. A management account can request a backfill of up to 12 months, and only for months in which the resource already had the tag.
- **Azure:** user-defined tags on the Foundry resource and the model deployment. Foundry's automatic tag key is `project`. That key is **Preview**. It is not `oasa_project`. You may configure `project` as an alias of `oasa_project`. Do not also write a user tag named `project` on that usage.
- **Google Cloud:** the `labels` object on a PayGo `generateContent` or `streamGenerateContent` call, or `X-Vertex-AI-Labels` for a supported partner model. Provisioned Throughput ignores labels. Google's 1,000-value limit counts distinct values over the billing account's lifetime, including retired agents. A label key can be dropped, without notice, once that count is passed. If you have more than 1,000 agents, do not put `oasa_agent` on Google labels. Bind the agent with a mapping record from the profile or project id, and keep the labels to `oasa_cost_center`, `oasa_owner`, `oasa_project`, and `environment`.
- **Anthropic and OpenAI:** structure the account: one workspace or project or key per agent or cost object. There is no cost-allocation tag channel. Do not invent one. After the account is split that way, bind the workspace, project, or key with a mapping record (step 3), or copy the id into `project_id` when it is the organization's project.
- **Microsoft 365 Copilot and Copilot Studio:** there is no cost-allocation tag channel. Do not invent one. Use a mapping record (step 3).

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

## Finance and platform teams

One section per platform. Each says what to configure, what the bill can attribute, what it cannot, and the mistakes that leave a charge without a common field. A feature the research note marks as preview is marked **Preview** here. Every platform claim cites that note.

The four fields and the mapping record are in sections 1–3 above. Structure the account before you write a mapping.

### Anthropic

**Configure.** Structure the account: one workspace or project or key per agent or cost object. On Anthropic, do that with a workspace, then map. The Cost API groups dollars by `workspace_id`. The default allowance is 100 workspaces per organization, and archived workspaces do not count. ([§2.1](../research/attribution-identity-by-platform.md#21-anthropic))

There is no cost-allocation tag. After the workspace exists, bind `wrkspc_…` with a mapping record, or copy it into `project_id` when that id is the organization's project.

**What it can attribute.**

- Cost API dollars, grouped by `workspace_id`, in daily buckets. ([§2.1](../research/attribution-identity-by-platform.md#21-anthropic))
- Usage by workspace and by API key, in buckets of one minute, one hour, or one day. Cost is USD, reported in cents as decimal strings. Usage and cost data typically appear within 5 minutes. ([§2.1](../research/attribution-identity-by-platform.md#21-anthropic))

**What it cannot attribute.**

- The Default Workspace. Its `workspace_id` is `null` in usage and cost reports. That is `no_identity`. Do not invent a mapping key for it. ([§2.1](../research/attribution-identity-by-platform.md#21-anthropic))
- API-key dollars on the Cost API. The grouping documented there is `workspace_id` and `description`, not `api_key_id`. Whether some other export carries key-level dollars is left open. ([§2.1](../research/attribution-identity-by-platform.md#21-anthropic), [open question 1](../research/attribution-identity-by-platform.md#4-open-questions))
- `metadata.user_id` on a Messages request. It is not a Usage or Cost API dimension. Maximum length 512. It must not contain a name, email, or phone number. ([§2.1](../research/attribution-identity-by-platform.md#21-anthropic))
- A user profile (`uprof_…`). Profiles are not billable and do not affect pricing. A profile belongs to the organization, not a workspace. Bedrock and Google-managed Claude do not host the profile endpoints. ([§2.1](../research/attribution-identity-by-platform.md#21-anthropic))
- Priority Tier dollars. They are absent from the Cost API. Priority Tier usage is on the Usage API under `service_tier`. ([§2.1](../research/attribution-identity-by-platform.md#21-anthropic))
- The Usage and Cost API on Claude Platform on AWS. Those organizations use the console. On Claude Models on Google Cloud (Anthropic managed), only the usage endpoint is available. ([§2.1](../research/attribution-identity-by-platform.md#21-anthropic))

**Common mistakes.**

- Several agents in one workspace. The Cost API then has one daily bucket for all of them. ([§2.1](../research/attribution-identity-by-platform.md#21-anthropic), [§3.1](../research/attribution-identity-by-platform.md#31-account-partition))
- A mapping record whose key is the null Default Workspace id. ([§2.1](../research/attribution-identity-by-platform.md#21-anthropic))
- An end-user id in `metadata.user_id`, expected on the invoice. ([§2.1](../research/attribution-identity-by-platform.md#21-anthropic), [§3.3](../research/attribution-identity-by-platform.md#33-per-request-metadata-that-does-not-reach-the-bill))
- The Cost API used to split spend by API key. ([§2.1](../research/attribution-identity-by-platform.md#21-anthropic))

### OpenAI

**Configure.** Structure the account: one workspace or project or key per agent or cost object. On OpenAI, do that with a project or an API key, then map. Costs group by `project_id` and by `api_key_id`. API keys belong to a project. ([§2.2](../research/attribution-identity-by-platform.md#22-openai))

There is no cost-allocation tag. After the project or key exists, bind it with a mapping record, or copy the project id into `project_id` when that id is the organization's project.

**What it can attribute.**

- Costs API dollars, grouped by `project_id` and by `api_key_id`, in daily buckets. `bucket_width` is `1d`. `limit` is 1–180, default 7. The id on the key grouping is the key id, not the secret. ([§2.2](../research/attribution-identity-by-platform.md#22-openai))
- Usage by project, API key, and organization `user_id`, in buckets of one minute, one hour, or one day. The one-minute interval applies to usage data, not billing data. ([§2.2](../research/attribution-identity-by-platform.md#22-openai))

**What it cannot attribute.**

- Organization `user_id` on the Costs API. It is not in the Costs `group_by` list (`project_id`, `line_item`, `api_key_id`). The id is the platform member, not the application's end user. A mapping record may fill `agent_owner` or `cost_center` from it. It does not fill `agent_id`. With no mapping, the reason is `seat_without_owner`. ([§2.2](../research/attribution-identity-by-platform.md#22-openai), [§3.4](../research/attribution-identity-by-platform.md#34-caller-identity-on-usage-and-seats-on-the-bill))
- The request fields `user`, `safety_identifier` (maximum 128 characters), and `metadata` (up to 16 pairs, key maximum 64, value maximum 512). None of them is a Costs or Usage dimension. ([§2.2](../research/attribution-identity-by-platform.md#22-openai))
- Scale Tier bundle cost, which is attributed to the organization, not to projects. A project can show usage and zero model spend when the usage sits inside a Scale Tier allocation. ([§2.2](../research/attribution-identity-by-platform.md#22-openai))
- A FOCUS or CUR-style export of the API invoice. No page read for this note describes one. The documented billing identity is project and API key, at daily grain, on the Costs API. ([§2.2](../research/attribution-identity-by-platform.md#22-openai))

**Common mistakes.**

- One project, or one key, shared by many agents. That bucket cannot be split further from the Costs API alone. ([§3.1](../research/attribution-identity-by-platform.md#31-account-partition))
- The organization user mapped to `agent_id`. Costs do not group by that id, and the id is a person. ([§2.2](../research/attribution-identity-by-platform.md#22-openai), [§3.4](../research/attribution-identity-by-platform.md#34-caller-identity-on-usage-and-seats-on-the-bill))
- `safety_identifier` or request metadata expected on the bill. ([§2.2](../research/attribution-identity-by-platform.md#22-openai), [§3.3](../research/attribution-identity-by-platform.md#33-per-request-metadata-that-does-not-reach-the-bill))
- A project's zero model spend read as zero usage, while the tokens sit in a Scale Tier bundle. ([§2.2](../research/attribution-identity-by-platform.md#22-openai))

### Amazon Bedrock

**Configure.** Tag the resource the bill copies.

- An application inference profile for InvokeModel and Converse. One profile is one model, so a workload that calls several models needs one profile per model, carrying the same keys. ([§2.3](../research/attribution-identity-by-platform.md#23-aws-bedrock))
- A mantle project for Responses and Chat Completions. One project can span many models. ([§2.3](../research/attribution-identity-by-platform.md#23-aws-bedrock))
- For Anthropic Messages on `bedrock-mantle`, workspaces carry project tags through a workspace header. ([§2.3](../research/attribution-identity-by-platform.md#23-aws-bedrock))
- Activate the cost-allocation tag key. Tags apply going forward, to cost incurred after activation. A management account can request a backfill of up to 12 months, once every 24 hours, for months the resource already had the tag. Months before the tag existed on the resource stay empty. ([§2.3](../research/attribution-identity-by-platform.md#23-aws-bedrock))
- Stay within 500 active user-defined cost-allocation tag keys per payer account. ([§2.3](../research/attribution-identity-by-platform.md#23-aws-bedrock))

Use the keys in [step 2](#2-put-a-durable-key-on-the-thing-the-bill-copies). Put `oasa_agent` on a profile only when that profile is one agent.

**What it can attribute.**

- After activation, tags on the profile or project in Cost Explorer, classic CUR, and CUR 2.0, as `resourceTags/{key}`, at billed dollars per usage type per day. ([§2.3](../research/attribution-identity-by-platform.md#23-aws-bedrock))
- The IAM caller, and principal and session tags, in CUR 2.0 when the caller-identity option is on. Both Bedrock endpoints can carry it. ([§2.3](../research/attribution-identity-by-platform.md#23-aws-bedrock))
- User-defined resource tags in the `Tags` column of the AWS FOCUS 1.2 data export. Pages read for this note document FOCUS 1.0 and 1.2, and do not document a 1.3 or 1.4 export. ([§2.3](../research/attribution-identity-by-platform.md#23-aws-bedrock))

**What it cannot attribute.**

- Request metadata (`X-Amzn-Bedrock-Request-Metadata`, or `requestMetadata` on Converse). It is stored on the invocation log. CUR has no per-`requestId` line. Join logs to CUR at model and usage-type grain. ([§2.3](../research/attribution-identity-by-platform.md#23-aws-bedrock))
- Cost from before the tag existed on the resource. Backfill does not fill those months. ([§2.3](../research/attribution-identity-by-platform.md#23-aws-bedrock))
- The caller-identity column in classic CUR. The FAQ says that column exists only in a CUR 2.0 export. ([§2.3](../research/attribution-identity-by-platform.md#23-aws-bedrock))
- An IAM principal used as a person, written into `agent_id`. The principal can fill `agent_owner` or `cost_center` through a mapping record. ([§3.4](../research/attribution-identity-by-platform.md#34-caller-identity-on-usage-and-seats-on-the-bill))

**Common mistakes.**

- A direct model-id call, with no profile or project, and a tag expected on the row. That invocation has no profile resource to tag. ([§1.5](../research/attribution-identity-by-platform.md#15-focus-mapping))
- A tag applied and never activated. Cost allocation tags do not appear until the key is activated. After a tag is applied, the key can take up to 24 hours to show on the activation page, then up to 24 hours to activate. Bedrock's profile and project pages say tags can take up to 24 hours to appear in Cost Explorer and CUR after activation. ([§2.3](../research/attribution-identity-by-platform.md#23-aws-bedrock))
- Backfill treated as a rewrite of history. Values appear only for months in which the resource already had that tag. ([§2.3](../research/attribution-identity-by-platform.md#23-aws-bedrock))
- A key deactivated and then backfilled. That removes the key from prior months as well. ([§2.3](../research/attribution-identity-by-platform.md#23-aws-bedrock))
- A session id, trace id, or experiment id in a cost-allocation tag. Bedrock's cost best-practices page says those belong in request metadata. ([§3.2](../research/attribution-identity-by-platform.md#32-resource-tags-and-labels-that-reach-the-bill))
- One inference profile used for several models. ([§2.3](../research/attribution-identity-by-platform.md#23-aws-bedrock))

### Azure

**Configure.** Put user-defined tags on the Foundry resource and on the model deployment. The Foundry cost page says to add deployment tags and user-defined tags to segment model-deployment cost. ([§2.4](../research/attribution-identity-by-platform.md#24-azure-openai-and-microsoft-foundry))

Foundry also applies a tag key `project` to the project's underlying usage. That tag is **Preview**. It is supported for models sold by Azure, including Azure OpenAI. It is not supported for Azure Marketplace models. `project` is not `oasa_project`. You may configure `project` as an alias of `oasa_project`. Do not also write a user tag named `project` on that usage. ([§2.4](../research/attribution-identity-by-platform.md#24-azure-openai-and-microsoft-foundry))

Tag inheritance copies billing, resource-group, and subscription tags onto child usage records for an Enterprise Agreement, a Microsoft Customer Agreement, or a Microsoft Partner Agreement with an Azure plan. ([§2.4](../research/attribution-identity-by-platform.md#24-azure-openai-and-microsoft-foundry))

A resource, resource group, or subscription holds 50 name-value pairs. A tag name is at most 512 characters, a value at most 256. A name cannot contain `< > % & \ ? /`. ([§2.4](../research/attribution-identity-by-platform.md#24-azure-openai-and-microsoft-foundry))

Wait 24 hours for a new tag to arrive on usage. The resource has to be incurring charges. ([§2.4](../research/attribution-identity-by-platform.md#24-azure-openai-and-microsoft-foundry))

**What it can attribute.**

- The invoice, grouped in Cost Analysis by resource, resource group, meter, or subscription. Azure-sold models, including Azure OpenAI, are meters under the Foundry resource. Several providers' models appear under "Global" resources, one meter pair (input and output) per model per Foundry resource, named `model-name-GUID`. Cost Analysis grain is day, month, or year. ([§2.4](../research/attribution-identity-by-platform.md#24-azure-openai-and-microsoft-foundry))
- User-defined tags, when the service includes tags in usage data. ([§2.4](../research/attribution-identity-by-platform.md#24-azure-openai-and-microsoft-foundry))
- The **Preview** `project` tag, for the meters it supports. ([§2.4](../research/attribution-identity-by-platform.md#24-azure-openai-and-microsoft-foundry))

**What it cannot attribute.**

- Partner and community models as meters under the Foundry resource. They are meters under the resource group. ([§2.4](../research/attribution-identity-by-platform.md#24-azure-openai-and-microsoft-foundry))
- Marketplace model usage with the **Preview** `project` tag. ([§2.4](../research/attribution-identity-by-platform.md#24-azure-openai-and-microsoft-foundry))
- Foundry portal estimates: the Operate overview, the Agents estimated-cost column, and an agent's Monitor tab. Use Cost Management and the invoice for financial reconciliation. Agent overview estimates exclude prompt-agent and non-Foundry agent costs. For existing Claude deployments on per-model token billing, the Monitor estimated-cost chart is absent. ([§2.4](../research/attribution-identity-by-platform.md#24-azure-openai-and-microsoft-foundry))
- `FoundryModelEstimatedCost`. It is **Preview**, it is labeled as not an invoice, and it is not exported to diagnostic settings. ([§2.4](../research/attribution-identity-by-platform.md#24-azure-openai-and-microsoft-foundry))
- Token metrics (`InputTokens`, `OutputTokens`, and the related metrics). They are one-minute metrics, not the invoice. ([§2.4](../research/attribution-identity-by-platform.md#24-azure-openai-and-microsoft-foundry))
- An agent id as a Cost Management dimension for Azure OpenAI token meters. No page read for this note shows one. ([open question 7](../research/attribution-identity-by-platform.md#4-open-questions))
- Tags on purchases and classic resources, which show as "Tags not supported," and on services that omit tags from usage, which show as "Tags not available." A resource with no tag value shows as "Untagged." ([§2.4](../research/attribution-identity-by-platform.md#24-azure-openai-and-microsoft-foundry))

**Common mistakes.**

- A month-end number taken from the Foundry portal estimate. ([§2.4](../research/attribution-identity-by-platform.md#24-azure-openai-and-microsoft-foundry))
- The **Preview** `project` tag expected on a Marketplace model. ([§2.4](../research/attribution-identity-by-platform.md#24-azure-openai-and-microsoft-foundry))
- A user tag named `project` written beside the automatic **Preview** tag. ([§2.4](../research/attribution-identity-by-platform.md#24-azure-openai-and-microsoft-foundry))
- Cost Analysis checked in the same hour the tag was applied. ([§2.4](../research/attribution-identity-by-platform.md#24-azure-openai-and-microsoft-foundry))
- `FoundryModelEstimatedCost` booked as the invoice. It is **Preview**. ([§2.4](../research/attribution-identity-by-platform.md#24-azure-openai-and-microsoft-foundry))

### Vertex AI and Gemini

**Configure.** On a PayGo call to a Google model, send the convention keys in the `labels` object on `generateContent` or `streamGenerateContent`. For the partner models the labels page lists, Anthropic and Mistral, send `X-Vertex-AI-Labels` (base64-encoded JSON) on `rawPredict` and `streamRawPredict`. ([§2.5](../research/attribution-identity-by-platform.md#25-google-vertex-ai-and-gemini))

Google's 1,000-value limit counts distinct values for a label key over the billing account's lifetime, including retired agents. Past that count, the key is dropped without notice. A Google model call holds 64 labels. A listed partner-model call holds 32. Key length is 1–63, value length is 0–63, lowercase. Do not put a person's name or title in a label. ([§2.5](../research/attribution-identity-by-platform.md#25-google-vertex-ai-and-gemini))

If retired and live agents together would pass 1,000 values for `oasa_agent`, leave that key off the label. When the Cloud project is one agent, bind `agent_id` with a mapping record from the project id. Keep the labels to `oasa_cost_center`, `oasa_owner`, `oasa_project`, and `environment`.

The Cloud project (`project.id`, `project.number`) is the billing boundary inside a Cloud Billing account. ([§2.5](../research/attribution-identity-by-platform.md#25-google-vertex-ai-and-gemini))

**What it can attribute.**

- PayGo request labels. They are forwarded to Cloud Billing. Billing reports and billing exports can filter and group by them. ([§2.5](../research/attribution-identity-by-platform.md#25-google-vertex-ai-and-gemini))
- The Cloud project on every standard-export row, plus resource labels in that export. The export's `usage_start_time` and `usage_end_time` are hourly windows, so many calls can share a row. ([§2.5](../research/attribution-identity-by-platform.md#25-google-vertex-ai-and-gemini))

**What it cannot attribute.**

- Provisioned Throughput. It silently ignores labels. The request still succeeds. ([§2.5](../research/attribution-identity-by-platform.md#25-google-vertex-ai-and-gemini))
- The Gemini Developer API (`generativelanguage.googleapis.com`). The labels page's examples use `aiplatform.googleapis.com`. No labels-to-billing page for the Developer API was found. ([§2.5](../research/attribution-identity-by-platform.md#25-google-vertex-ai-and-gemini), [open question 9](../research/attribution-identity-by-platform.md#4-open-questions))
- A named BigQuery column for a `generateContent` label. The standard-export schema describes `labels` as the resource label, `project.labels` as the project's labels, and `system_labels` as Google-generated. Which column holds the request label is not settled. ([open question 8](../research/attribution-identity-by-platform.md#4-open-questions))
- Cost the same day in every case. Costs typically appear within a day and can take more than 24 hours. Project fields can be missing on usage in the first 24 hours after the project is created. ([§2.5](../research/attribution-identity-by-platform.md#25-google-vertex-ai-and-gemini))

**Common mistakes.**

- `oasa_agent` on the label after retired agents have already used up the lifetime distinct values. ([§2.5](../research/attribution-identity-by-platform.md#25-google-vertex-ai-and-gemini))
- Labels on a Provisioned Throughput deployment, with the call succeeding and the label absent from the bill. ([§2.5](../research/attribution-identity-by-platform.md#25-google-vertex-ai-and-gemini))
- The same `labels` body on the Gemini Developer API, because Vertex accepts it. ([open question 9](../research/attribution-identity-by-platform.md#4-open-questions))
- A person's name in a label value. ([§2.5](../research/attribution-identity-by-platform.md#25-google-vertex-ai-and-gemini))

### Copilot Studio and Microsoft 365

**Configure.** These products do not tag a cloud resource per request. Do not invent a tag channel. ([§2.6](../research/attribution-identity-by-platform.md#26-microsoft-copilot-studio-and-microsoft-365-copilot))

A Microsoft 365 Copilot license is assigned to a user. Map that user to `agent_owner` or `cost_center`. The seat does not fill `agent_id`. ([§2.6](../research/attribution-identity-by-platform.md#26-microsoft-copilot-studio-and-microsoft-365-copilot), [§3.4](../research/attribution-identity-by-platform.md#34-caller-identity-on-usage-and-seats-on-the-bill))

In the credits report, an agent is an element of an app. Agent ID is the app identifier Microsoft generates, and the agent name comes from the app manifest. Copy that app id into `agent_id` when it is the organization's agent id. Each agent belongs to one environment. Prepaid credits are purchased at the tenant, pooled, then allocated to the environment. ([§2.6](../research/attribution-identity-by-platform.md#26-microsoft-copilot-studio-and-microsoft-365-copilot))

Pay-as-you-go links an environment to an Azure subscription with a billing policy. ([§2.6](../research/attribution-identity-by-platform.md#26-microsoft-copilot-studio-and-microsoft-365-copilot))

A session with no signed-in user uses the user id `00000000-0000-0000-0000-000000000000`. That is `no_identity`. Do not invent a mapping key for it. ([§2.6](../research/attribution-identity-by-platform.md#26-microsoft-copilot-studio-and-microsoft-365-copilot))

**What it can attribute.**

- The Microsoft 365 Copilot seat, per user. For a licensed user, the billing-rates table marks classic answer, generative answer, agent action, tenant-graph grounding, agent-flow actions, and basic generative tools as "No charge." ([§2.6](../research/attribution-identity-by-platform.md#26-microsoft-copilot-studio-and-microsoft-365-copilot))
- Prepaid credit consumption, in Power Platform admin reports by environment, agent, or user. Capacity views are daily. The detailed report adds product or AI feature, channel, LLM model, and knowledge source or tool. ([§2.6](../research/attribution-identity-by-platform.md#26-microsoft-copilot-studio-and-microsoft-365-copilot))
- Pay-as-you-go dollars on the Azure invoice, at the environment's meter, with the agent and user split in the Power Platform and Microsoft 365 reports. ([§2.6](../research/attribution-identity-by-platform.md#26-microsoft-copilot-studio-and-microsoft-365-copilot))
- Metered credits for an unlicensed user in Copilot Chat, per user, per agent, per billing policy, and per agent-user pair. The credits report says usage is visible within an hour. The agent-usage report is available within 72 hours of the UTC day. User names stay hidden until an admin shows them. ([§2.6](../research/attribution-identity-by-platform.md#26-microsoft-copilot-studio-and-microsoft-365-copilot))

**What it cannot attribute.**

- A seat divided across agents. The seat is the bill, and it names a person. ([§2.6](../research/attribution-identity-by-platform.md#26-microsoft-copilot-studio-and-microsoft-365-copilot), [§3.4](../research/attribution-identity-by-platform.md#34-caller-identity-on-usage-and-seats-on-the-bill))
- A single conversation or message, a token count, or why a row was not billed. The reports do not show those. ([§2.6](../research/attribution-identity-by-platform.md#26-microsoft-copilot-studio-and-microsoft-365-copilot))
- Agents powered by the GitHub Copilot harness, inside a Microsoft 365 Copilot license. That usage is not included. ([§2.6](../research/attribution-identity-by-platform.md#26-microsoft-copilot-studio-and-microsoft-365-copilot))
- One Azure resource per agent. The pay-as-you-go invoice is the environment meter. The agent split is not described as a separate Azure resource. ([§2.6](../research/attribution-identity-by-platform.md#26-microsoft-copilot-studio-and-microsoft-365-copilot))
- A hard stop from an Azure budget or alert. Those notify. Stopping Copilot Studio consumption is an agent-level limit. ([§2.6](../research/attribution-identity-by-platform.md#26-microsoft-copilot-studio-and-microsoft-365-copilot))

**Common mistakes.**

- Licensed agent usage booked as a Copilot Credit charge for a feature the rate table marks "No charge." ([§2.6](../research/attribution-identity-by-platform.md#26-microsoft-copilot-studio-and-microsoft-365-copilot))
- The all-zero user id given a mapping. ([§2.6](../research/attribution-identity-by-platform.md#26-microsoft-copilot-studio-and-microsoft-365-copilot))
- The agent's Monitor page used as the credit total. Monitor shows billed credits only and can be lower than the reports, which include non-billed credits. ([§2.6](../research/attribution-identity-by-platform.md#26-microsoft-copilot-studio-and-microsoft-365-copilot))
- The Azure Cost Management row read as if it named the agent. ([§2.6](../research/attribution-identity-by-platform.md#26-microsoft-copilot-studio-and-microsoft-365-copilot))

### Gateways

LiteLLM, Kong, and Portkey each keep a ledger of their own. That identity reaches the provider bill only when the credential, tag, or label the gateway sends is what the provider records. A virtual key that fans into one provider key does not, by itself, split that provider's invoice. ([§2.7](../research/attribution-identity-by-platform.md#27-ai-gateways), [§3.5](../research/attribution-identity-by-platform.md#35-gateway-key))

Map the gateway key, team, or consumer onto the gateway's own usage record. The provider charge, if it has no join key, is `not_on_bill`.

#### LiteLLM

**Configure.** Spend tracking requires virtual keys and a database. Optional headers on the request: `x-litellm-tags` (comma-separated), `x-litellm-spend-logs-metadata` (a JSON object; the documented example uses `user_id`, `project_id`, and `request_type`), `x-litellm-customer-id` or `x-litellm-end-user-id`, and `x-litellm-trace-id`, then `x-litellm-session-id`, then any `x-*-session-id`. ([§2.7](../research/attribution-identity-by-platform.md#27-ai-gateways))

**What it can attribute.** One row per priced request in `LiteLLM_SpendLogs`: the key hash, the internal user who owns the key, `team_id`, `request_tags`, `end_user`, the model group, token counts, and a calculated `spend`. The response header `x-litellm-response-cost` carries that cost. ([§2.7](../research/attribution-identity-by-platform.md#27-ai-gateways))

**What it cannot attribute.** That row on the provider invoice, unless the deployment underneath also tags or keys the call. ([§2.7](../research/attribution-identity-by-platform.md#27-ai-gateways))

**Common mistakes.**

- LiteLLM `spend` booked as the provider invoice. LiteLLM prices from its model cost map and documents a workflow for when that figure does not match the provider bill. A request that prices to zero on a model with a non-zero map is still written, with `spend = 0`. ([§2.7](../research/attribution-identity-by-platform.md#27-ai-gateways))
- Tag-based routing, or a tag spend feature, assumed to be in every deployment. Those features are marked Enterprise on the spend-tracking page. ([§2.7](../research/attribution-identity-by-platform.md#27-ai-gateways))

#### Kong

**Configure.** Kong's identity object is a Consumer. Key Authentication binds a credential to that Consumer. The client presents the credential in a header, a query parameter, or the body. AI Proxy authenticates to the upstream provider on behalf of the Consumer and records usage into the selected Kong log plugin. ([§2.7](../research/attribution-identity-by-platform.md#27-ai-gateways))

**What it can attribute.** A gateway control figure. AI Proxy can calculate cost into the log plugin. AI Rate Limiting Advanced turns provider token usage into a cost and limits that cost per policy. Policies can match consumer, consumer group, header, path, model, and provider. From Gateway 3.15, a consumer counter can use `consumer.id` (the default), `consumer.username`, or `consumer.custom_id`. ([§2.7](../research/attribution-identity-by-platform.md#27-ai-gateways))

**What it cannot attribute.** That cost on the upstream invoice. No Kong page read for this note writes it there. A durable per-consumer cost table that reconciles to an upstream invoice is not specified. The cost of a request is applied on the next request, so the request that crosses the limit is not the one that is rejected. ([§2.7](../research/attribution-identity-by-platform.md#27-ai-gateways), [open question 10](../research/attribution-identity-by-platform.md#4-open-questions))

**Common mistakes.**

- A header copied upstream with `$(headers.header_name)` and treated as attribution. That templating can land in the upstream model name or model options, and it attributes the provider bill only when the provider stores that field. ([§2.7](../research/attribution-identity-by-platform.md#27-ai-gateways))
- The gateway's calculated cost treated as a line on the provider invoice. ([§2.7](../research/attribution-identity-by-platform.md#27-ai-gateways))

#### Portkey

**Configure.** Send metadata as a string map in the SDK or in the `x-portkey-metadata` header. Any number of keys may be sent. Every value is a string of at most 128 characters. `_user` drives user-level analytics. If the OpenAI `user` field is present and `_user` is absent, Portkey copies `user` into `_user`. On an Enterprise self-hosted gateway at 2.5.0 or later, `HEADERS_TO_METADATA` copies named request headers into metadata. Enterprise metadata can sit on the request, the API key, and the workspace. ([§2.7](../research/attribution-identity-by-platform.md#27-ai-gateways))

Virtual keys have been migrated to Model Catalog. One Portkey API key can call many providers, and the provider credential stays in Portkey. Catalog integrations can be shared to all workspaces or to selected workspaces. ([§2.7](../research/attribution-identity-by-platform.md#27-ai-gateways))

**What it can attribute.** Analytics inside Portkey, grouped by any metadata key, and filterable by virtual key. Logs can be filtered by the same keys. ([§2.7](../research/attribution-identity-by-platform.md#27-ai-gateways))

**What it cannot attribute.** That metadata on the provider invoice. The page describes observability and cost attribution inside Portkey. Budgets (USD or tokens) reject later requests. They apply only to requests made after the limit is set. They do not split the provider invoice. The minimum cost limit documented is $1, and the minimum token limit is 100. Workspace budgets are Enterprise, and selected Pro customers. ([§2.7](../research/attribution-identity-by-platform.md#27-ai-gateways))

**Common mistakes.**

- Many agents behind one provider credential, with the split kept only in Portkey metadata. The provider invoice still shows the credential the gateway used upstream. ([§3.5](../research/attribution-identity-by-platform.md#35-gateway-key))
- A workspace budget read as an allocation of the provider invoice. Exhausting it rejects later requests. ([§2.7](../research/attribution-identity-by-platform.md#27-ai-gateways))

### OpenTelemetry

**Configure.** On the span, set `oasa.agent.id`, `oasa.cost_center`, `oasa.agent.owner`, and `oasa.project.id`, as in [step 5](#5-on-a-span-use-the-oasa-attributes). Every attribute in the GenAI registry table is stability **Development**. ([§2.8](../research/attribution-identity-by-platform.md#28-opentelemetry-genai-semantic-conventions)) The reference exporter fills `cost_center`, `project_id`, and `customer_id` from operator-configured span or resource attributes, `environment` from `deployment.environment.name`, and `tags` from a configured attribute list. A missing attribute is omitted. That exporter writes usage records only. ([§1.4](../research/attribution-identity-by-platform.md#14-opentelemetry-mapping-in-the-spec))

`gen_ai.provider.name` uses `gcp.vertex_ai` for `aiplatform.googleapis.com` and `gcp.gemini` for `generativelanguage.googleapis.com`. ([§2.8](../research/attribution-identity-by-platform.md#28-opentelemetry-genai-semantic-conventions))

**What it can attribute.**

- A usage record, per operation. `gen_ai.agent.name` is the human-readable name the application supplies. `gen_ai.conversation.id` is the conversation, session, or thread id when the framework or the provider already has one. When a provider reports both billed units and model-consumed tokens, instrumentations should report the billed count. ([§2.8](../research/attribution-identity-by-platform.md#28-opentelemetry-genai-semantic-conventions))
- A charge, after a join. The convention does not put these attributes on an invoice. A collector can join them to billing later. Join on `trace_id` when both records have one. Inheritance may fill a field the charge left empty. ([§2.8](../research/attribution-identity-by-platform.md#28-opentelemetry-genai-semantic-conventions))

**What it cannot attribute.**

- The provider invoice. These attributes ride on spans, events, or metrics. They do not appear on a provider bill. A charge whose only identity is the span, and which has no join key, is `not_on_bill`. ([§2.8](../research/attribution-identity-by-platform.md#28-opentelemetry-genai-semantic-conventions))
- `agent_id` from `gen_ai.agent.id`. The registry read on 2026-10-22 reserves that attribute for a stable hosted agent resource: an assistant id, a Bedrock agent ARN, or a reasoning-engine resource name. It should be the provider-assigned id. In-memory instance ids are not recommended. Copy it to `external_identity_ref`. ([§2.8](../research/attribution-identity-by-platform.md#28-opentelemetry-genai-semantic-conventions))
- `agent_id` from `service.name`. That attribute names the deploying service, which may be coarser than the agent. It may fill `agent_name` when no agent name is present. ([§2.8](../research/attribution-identity-by-platform.md#28-opentelemetry-genai-semantic-conventions), [§1.4](../research/attribution-identity-by-platform.md#14-opentelemetry-mapping-in-the-spec))

**Common mistakes.**

- `gen_ai.agent.id` copied into `agent_id`. Output from oasa-otel-exporter 0.1.0 remains valid 0.1.2. New instrumentation sets `oasa.agent.id`. The registry's narrowing of `gen_ai.agent.id` is what the 0.1.3 mapping follows. ([§2.8](../research/attribution-identity-by-platform.md#28-opentelemetry-genai-semantic-conventions))
- `gen_ai.conversation.id` invented from a new UUID, the trace id, or a hash of the request. Set it when the framework or the provider already has one. ([§2.8](../research/attribution-identity-by-platform.md#28-opentelemetry-genai-semantic-conventions))
- `gen_ai.workflow.name` set to a type name such as `StateGraph`. The registry says not to record it in that case. ([§2.8](../research/attribution-identity-by-platform.md#28-opentelemetry-genai-semantic-conventions))
- `gen_ai.main_agent.id` generated from an in-memory id. If no stable id exists, the agent entity is not emitted. `gen_ai.agent.name` may still be set on the span. ([§2.8](../research/attribution-identity-by-platform.md#28-opentelemetry-genai-semantic-conventions))
- A span treated as enough to attribute the provider charge, with no `trace_id` on that charge. ([§2.8](../research/attribution-identity-by-platform.md#28-opentelemetry-genai-semantic-conventions))

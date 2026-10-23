# Attribution identity by platform

**Work order:** WO-OASA-ATTR-1, Task 1 (research and inventory)
**Read:** 2026-10-22
**Spec reviewed:** OASA 0.1.2 (`SPEC.md`, `schema/oasa-record.schema.json`, `docs/focus-mapping.md`)
**Status:** Research only. No specification change is proposed here.

This note records what OASA already carries for attribution, how each named platform identifies who or what generated a cost, and the patterns those mechanisms fall into. Every platform claim below was checked against that platform's documentation on 2026-10-22. Where a page does not settle a point, it is listed under [Open questions](#open-questions) rather than filled in.

A mechanism **reaches billing** when the provider's cost or invoice dataset can be grouped by it. A mechanism is **usage or logs only** when it appears on a request, a usage report, or a telemetry record and the cost dataset documented on the same date does not group by it.

---

## 1. What OASA has today

OASA 0.1.2 is a record format. Envelope fields are required. Every other field is optional, and `additionalProperties` is false, so a record with an unknown field does not validate. `schema_version` for a 0.1 record matches `0.1` or `0.1.<n>`.

Attribution is spread across three groups. There is no field that says how attribution was decided, no standard reason for an unattributed record, and no record type for a mapping from a native identifier to an agent or cost center.

### 1.1 Agent identity (Group 2)

| Field | Type | Meaning in 0.1.2 |
| --- | --- | --- |
| `agent_id` | string | Stable internal agent ID. |
| `agent_name` | string | Human-readable agent name. |
| `agent_version` | string | Agent build or prompt version. |
| `agent_owner` | string | Team or principal accountable. |
| `parent_agent_id` | string | Parent in a sub-agent chain. |
| `agent_framework` | string | Framework name, for example `langgraph`. |
| `identity_scheme` | `internal` \| `erc8004` \| `other` | How an external identity is named. |
| `external_identity_ref` | string | External registration reference. |

### 1.2 Task and session (Group 3)

These fields describe the run, not the cost object. They are the join to telemetry.

| Field | Type | Meaning in 0.1.2 |
| --- | --- | --- |
| `session_id` | string | Runtime session identifier. |
| `trace_id` | string | W3C / OpenTelemetry trace id. |
| `span_id` | string | Span id within the trace. |
| `task_id` | string | Org-defined task identifier. |
| `task_type` | string | Org-defined task taxonomy. |
| `workflow_id` | string | Workflow or pipeline id. |
| `trigger` | `human` \| `scheduled` \| `agent` \| `event` | What started the run. |
| `initiating_principal` | string | Human or agent that authorized the run. |

### 1.3 Allocation (Group 6)

| Field | Type | Meaning in 0.1.2 |
| --- | --- | --- |
| `cost_center` | string | Cost center or department. |
| `project_id` | string | Project identifier. |
| `customer_id` | string | Customer or account identifier. |
| `product_line` | string | Product line. |
| `environment` | `prod` \| `staging` \| `dev` \| `other` | Runtime environment. |
| `tags` | map of string to string | Free-form tags. |
| `allocation_method` | `direct` \| `rule` \| `split` | How cost was allocated. |
| `allocation_rule_id` | string | Rule that produced the allocation. |
| `split_fraction` | decimal 0–1 | Share of a split allocation. |

`cost_source` (`measured` \| `rated` \| `invoiced` \| `allocated`) says how the **money** was derived. It does not say how the **identity** was derived. `allocated` means the cost was assigned from a shared cost by an allocation rule.

Golden examples already populate a subset of these fields: `examples/usage-openai-chat.json` and `examples/usage-tool-call.json` set `agent_id`, `agent_name`, and `cost_center`; `examples/usage-bedrock-inference-profile.json` also sets `environment` and `tags`; `examples/charge-focus-row.json` sets `cost_center` on a charge; `examples/allocation-split.json` sets `cost_center`, `allocation_method`, `allocation_rule_id`, and `split_fraction`.

### 1.4 OpenTelemetry mapping in the spec

`SPEC.md` maps, and was last re-verified by the spec on 2026-09-15:

| OASA | OpenTelemetry |
| --- | --- |
| `agent_id` | `gen_ai.agent.id` |
| `agent_name` | `gen_ai.agent.name` |
| `session_id` | `gen_ai.conversation.id` |
| `trace_id`, `span_id` | W3C trace and span ids |
| `provider` | `gen_ai.provider.name` |
| `model` | `gen_ai.request.model` |
| `tool_name` | `gen_ai.tool.name` |

`agent_owner`, `cost_center`, `project_id`, `customer_id`, `tags`, and `initiating_principal` have no GenAI equivalent in that table. The reference exporter (`oasa-otel-exporter` README, read 2026-10-22) fills `cost_center`, `project_id`, and `customer_id` from operator-configured span or resource attributes, `environment` from `deployment.environment.name`, and `tags` from a configured attribute list. A missing attribute is omitted. That exporter writes usage records only; it does not price them.

The GenAI registry has moved since the 2026-09-15 spec check. See [OpenTelemetry](#opentelemetry-genai-semantic-conventions).

### 1.5 FOCUS mapping

`docs/focus-mapping.md` (draft 0.1, 2026-10-05, against FOCUS 1.4) treats FOCUS as the billing row and OASA as the attribution joined to it. The columns that carry identity today:

| FOCUS column | Treatment | OASA |
| --- | --- | --- |
| `Tags` | Carried | `tags`. The spec says OASA may add attribution keys. |
| `ResourceId` | Derived | `agent_id`, only when the provider resource is the agent. Otherwise the column stays on the FOCUS row. |
| `ResourceName` | Derived | `agent_name`, under the same condition. |
| `SubAccountId` | Derived | `project_id` or `customer_id`, when the sub-account is the cost object. The mapping is per adapter. |
| `SubAccountName` | Derived | Display name, under the same condition. |
| `AllocatedResourceId` | Derived | `cost_center`, `project_id`, or `customer_id`. FOCUS flattens the cost object to one id. |
| `AllocatedTags` | Derived | `tags` on the allocation record. |

Agent identity, task and session, `cost_source`, and governance fields have no FOCUS column. On export they travel as `x_oasa_*` custom columns. The names listed in the mapping are `x_oasa_record_id`, `x_oasa_agent_id`, `x_oasa_agent_name`, `x_oasa_trace_id`, `x_oasa_task_type`, `x_oasa_cost_center`, `x_oasa_project_id`, `x_oasa_customer_id`, `x_oasa_cost_source`, `x_oasa_budget_id`, `x_oasa_settlement_ref`, and `x_oasa_reconciliation_status`.

Two worked examples already draw the line this research keeps hitting:

- The OpenAI example treats the FOCUS row as project-scoped (`SubAccountId` = `proj_support`) and copies `agent_id` and `cost_center` onto the charge from the usage record via `trace_id`. The bill does not name the agent.
- The Bedrock example treats `Tags` as the attribution channel (`CostCenter` → `cost_center`, `Agent` → `agent_id`). The tag-key mapping is configuration, not schema. A row whose tags lack the cost-object key stays unattributed until an allocation record assigns it. Direct model-id invocation, with no profile resource, is in the same state.

FOCUS 1.4 itself has no actor dimension. The mapping's open question 3 asks whether a future FOCUS release should add one, or leave it to `x_` columns.

---

## 2. Platform inventory

### 2.1 Anthropic

Sources read 2026-10-22:

- [Workspaces](https://platform.claude.com/docs/en/manage-claude/workspaces)
- [Usage and Cost API](https://platform.claude.com/docs/en/manage-claude/usage-cost-api)
- [Admin API](https://platform.claude.com/docs/en/manage-claude/admin-api)
- [Messages API](https://platform.claude.com/docs/en/api/messages) (`metadata.user_id`)
- [User profiles](https://platform.claude.com/docs/en/manage-claude/user-profiles)

| Mechanism | Where it appears | Grain | Reaches billing? | Limits |
| --- | --- | --- | --- | --- |
| Workspace (`wrkspc_…`) | Usage API and Cost API. Also the `anthropic-workspace-id` response header. | Usage: buckets of 1 minute, 1 hour, or 1 day. Cost: 1 day only. | Yes, for Cost API dollars, grouped by `workspace_id`. | Default of 100 workspaces per organization; archived workspaces do not count. The Default Workspace's `workspace_id` is `null` in usage and cost reports. |
| API key (`apikey_…`) | Usage API filter and group. Admin API lists keys, each with a workspace or organization scope, and a principal for personal and service-account keys. | Same usage buckets as above. | Usage only. The Cost API grouping documented on this date is `workspace_id` and `description`, not `api_key_id`. | Workspace-scoped keys cannot call the Admin API. Playground usage has `api_key_id` null. |
| `metadata.user_id` on a Messages request | Request body. | Per request. | No. It is not a Usage or Cost API dimension. | Max length 512. Opaque id (UUID or hash). Anthropic may use it to detect abuse. The field must not contain a name, email, or phone number. |
| User profile (`uprof_…`) via `anthropic-user-profile-id` | Request header, after `POST /v1/user_profiles`. | Per request, pointing at a registered end customer. | No. The profile page says profiles are not billable and do not affect pricing. | A profile belongs to the organization, not a workspace. One profile id works in every workspace of that organization. `passthrough` profiles identify a company; `application` profiles identify a person. Bedrock and Google-managed Claude do not host the profile endpoints. |

Cost is USD, reported in cents as decimal strings. Priority Tier dollars are absent from the Cost API; Priority Tier usage is on the Usage API under `service_tier`. Code execution appears in the Cost API description `Code Execution Usage` and is absent from the Usage API. Usage and cost data typically appear within 5 minutes. A single request can return at most 31 daily buckets, 168 hourly buckets, or 1,440 one-minute buckets.

The programmatic Usage and Cost API is not available on Claude Platform on AWS; those organizations use the console. On Claude Models on Google Cloud (Anthropic managed), only the usage endpoint is available, and it requires `roles/claude.admin`. Claude Enterprise uses a separate Analytics API, including a Claude Code Analytics API for per-user estimated cost. That Enterprise path was not inventoried beyond the pointer on the Usage and Cost page.

### 2.2 OpenAI

Sources read 2026-10-22:

- [Costs API](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/costs/)
- [Completions usage API](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/completions/)
- [Metadata type](https://developers.openai.com/api/reference/typescript/resources/$shared/)
- [Chat Completions parameters](https://developers.openai.com/api/reference/python/resources/chat/index.md) (`user`, `safety_identifier`)
- [Safety best practices](https://developers.openai.com/api/docs/guides/safety-best-practices)
- [Reviewing API usage and costs](https://help.openai.com/en/articles/10478918-reviewing-api-usage-and-costs) (help center, updated within a day of this reading)
- [Organization user](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/users/methods/retrieve)

| Mechanism | Where it appears | Grain | Reaches billing? | Limits |
| --- | --- | --- | --- | --- |
| Project (`project_id`) | Costs API and Usage API, as a filter and a `group_by`. API keys belong to a project. | Cost: daily buckets only. Usage: 1 minute, 1 hour, or 1 day. | Yes. Costs group by `project_id`. | Costs: `bucket_width` is `1d`; `limit` is 1–180, default 7. The help center says Scale Tier **bundle** cost is attributed to the organization, not to projects. A project can show usage and zero model spend when the usage sits inside a Scale Tier allocation. |
| API key (`api_key_id`) | Costs API and Usage API. | Same split as projects. | Yes, on the Costs API, grouped by `api_key_id`. | Same bucket limits. The id is the key id, not the secret. |
| Organization `user_id` | Usage API `group_by=user_id` and the Usage Dashboard filter "Users". The Users API describes this object as an individual user within the organization. | Usage buckets only. | Usage only. `user_id` is not in the Costs API `group_by` list (`project_id`, `line_item`, `api_key_id`). | This is the platform member, not the application's end user. |
| Request `user` | Chat Completions (and the equivalent on other endpoints). | Per request. | No documented path onto Costs or Usage. | The reference says this field is being replaced by `safety_identifier` and `prompt_cache_key`. It is a stable end-user id used for cache bucketing and abuse detection. |
| `safety_identifier` | Responses, Chat Completions, and Images. Realtime uses the `OpenAI-Safety-Identifier` header. | Per request or Realtime session. The checks guide says the identifier does not carry over between APIs or sessions; each API needs its own copy. | No documented path onto Costs or Usage. | Maximum 128 characters. OpenAI recommends a hash, not an email or name. |
| `metadata` | Up to 16 key-value pairs on an API object. | Per object (a request, or another object that accepts the shared metadata type). | No. It is not a Costs or Usage dimension. The reference says it supports querying objects via the API or the dashboard. | Key maximum 64 characters. Value maximum 512 characters. Values are strings. |

The help center separates the one-minute usage interval from billing: "This interval applies to usage data, not billing data." Token counts on an individual response (`usage.prompt_tokens` / `usage.input_tokens` and the output equivalents, plus cached and reasoning counts when present) are per request and are not a cost row.

No OpenAI page read on this date describes a FOCUS or CUR-style cost export of the API invoice. The billing-side identity that is documented is project and API key, at daily grain, on the Costs API.

### 2.3 AWS Bedrock

Sources read 2026-10-22:

- [Track usage and costs](https://docs.aws.amazon.com/bedrock/latest/userguide/cost-management.html)
- [Application inference profiles](https://docs.aws.amazon.com/bedrock/latest/userguide/cost-mgmt-application-inference-profiles.html)
- [Projects](https://docs.aws.amazon.com/bedrock/latest/userguide/cost-mgmt-projects.html)
- [Understanding CUR data](https://docs.aws.amazon.com/bedrock/latest/userguide/cost-mgmt-understanding-cur-data.html)
- [Best practices](https://docs.aws.amazon.com/bedrock/latest/userguide/cost-mgmt-best-practices.html)
- [FAQ](https://docs.aws.amazon.com/bedrock/latest/userguide/cost-mgmt-faq.html)
- [Per-request metadata tagging](https://docs.aws.amazon.com/bedrock/latest/userguide/cost-mgmt-request-metadata.html)
- [Activating cost allocation tags](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/activating-tags.html)
- [Backfill cost allocation tags](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/cost-allocation-backfill.html)
- [Billing quotas](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/billing-limits.html)
- [FOCUS 1.0 to 1.2 migration](https://docs.aws.amazon.com/cur/latest/userguide/table-dictionary-focus-1-2-migrating.html) (Data Exports)

Bedrock documents four native mechanisms, and they do not all apply to both endpoints. `bedrock-runtime` is InvokeModel and Converse. `bedrock-mantle` is Responses, Chat Completions, and Anthropic Messages.

| Mechanism | Where it appears | Grain | Reaches billing? | Limits |
| --- | --- | --- | --- | --- |
| Application inference profile | Profile ARN is used in place of the model id. Tags on the profile flow to Cost Explorer and CUR (classic and CUR 2.0) as `resourceTags/{key}`. | Aggregated billed dollars, per usage type per day. | Yes, after the tag key is activated. | Model-specific: one profile per model. InvokeModel and Converse. The cost page's comparison table also lists Chat Completions for profiles; Projects are the mantle-side equivalent for Responses and Chat Completions. |
| Project | Project resource tags, same billing tools. | Same daily usage-type aggregate. | Yes, after activation. | `bedrock-mantle` only (Responses and Chat Completions). One project can span many models. |
| Workspace | The cost page lists workspaces as carrying project tags through a workspace header, for Anthropic Messages on `bedrock-mantle`. | Same daily aggregate. | Yes, as project tags, after activation. | Documented as mantle Anthropic Messages. |
| IAM principal, plus principal and session tags | Caller identity column in CUR 2.0. Tags from the IAM user or role, and session tags passed at assume-role, appear as `iamPrincipal/{key}` and `resourceTags/{key}` depending on source. The CUR page's table lists both. | Same daily aggregate. | Yes, in CUR 2.0 with the caller-identity option. Classic CUR does not carry the caller-identity column. | Both endpoints. The FAQ says the identity column exists only in a CUR 2.0 export. |
| Request metadata | `X-Amzn-Bedrock-Request-Metadata` header on InvokeModel and InvokeModelWithResponseStream. `requestMetadata` body field on Converse and ConverseStream. Stored on the invocation log as `requestMetadata`. | Per request. Token counts; the customer converts tokens to cost. | No. Invocation logs only. CUR has no per-`requestId` line. | 16 entries. Keys and values up to 256 characters. A restricted character set. Over-limit requests are rejected. |

Cost allocation tags do not appear until the key is activated in Billing. Bedrock's profile and project pages say tags can take up to 24 hours to appear in Cost Explorer and CUR after activation, and that cost allocation tags are not retroactive: only costs incurred after activation are tagged. The activating-tags page adds an earlier wait: after a tag is applied to a resource, the key can take up to 24 hours to show up on the activation page, then up to 24 hours to activate.

Backfill is the exception, and it is narrower than "rewrite history." A management account can backfill activation status for up to 12 months, once every 24 hours. Values appear only for months in which the resource already had that tag. Months before the tag existed on the resource stay empty. Deactivating a key and backfilling removes it from prior months as well.

Active user-defined cost allocation tag keys are capped at 500 per payer account. One activate or deactivate request can change 20 keys. The automatically activated `awsApplication` tag does not count toward the quota.

CUR, classic and 2.0, aggregates Bedrock by usage type, operation, and pricing or resource over an hour or a day. It does not carry a per-request id. The CUR page says to join invocation logs to CUR at model and usage-type grain to reconcile dollars, not to price an individual prompt from CUR.

AWS Data Exports documents FOCUS 1.0 and FOCUS 1.2. FOCUS 1.2 has 57 FOCUS columns plus 3 AWS columns. Its tag rule is to include user-defined and provider-defined resource tags, and user-defined cost category tags, in `Tags`. Time granularity for the 1.2 export can be hourly, daily, or monthly. This reading did not find an AWS page for a FOCUS 1.3 or 1.4 export. OASA's mapping is written against FOCUS 1.4. See open questions.

### 2.4 Azure OpenAI and Microsoft Foundry

Sources read 2026-10-22:

- [Plan and manage costs (Foundry)](https://learn.microsoft.com/en-us/azure/foundry/concepts/manage-costs)
- [Monitoring data reference for Azure OpenAI](https://learn.microsoft.com/en-us/azure/foundry/openai/monitor-openai-reference)
- [Tag resources](https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/tag-resources)
- [Group and filter in Cost Analysis](https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/group-filter)
- [Tag inheritance](https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/enable-tag-inheritance)

Microsoft's current product name on these pages is Microsoft Foundry. Azure OpenAI is billed as a Foundry model sold by Azure.

| Mechanism | Where it appears | Grain | Reaches billing? | Limits |
| --- | --- | --- | --- | --- |
| Foundry resource, resource group, subscription | Cost Analysis, grouped by Resource, Resource group, Meter, or Subscription. | Cost Analysis is day, month, or year. Meter rows are the invoice grain. | Yes. This is the bill. | Azure-sold models, including Azure OpenAI, are meters under the Foundry resource. Partner and community models are meters under the resource group, not under the Foundry resource. Several providers' models appear under "Global" resources, one meter pair (input and output) per model per Foundry resource, named `model-name-GUID`. |
| User-defined resource tags, including deployment tags | Cost Analysis filter and group by Tag. The Foundry cost page tells the reader to add deployment tags and user-defined tags to segment model-deployment cost. | On usage records after the tag is present. The Cost Analysis page says to wait 24 hours for a new tag to arrive on usage, and that the resource has to be incurring charges. | Yes, when the service includes tags in usage data. | 50 name-value pairs per resource, resource group, and subscription. Tag name up to 512 characters, value up to 256. Storage accounts: name 128, value 256. Tag names cannot contain `< > % & \ ? /`. Purchases and classic resources show as "Tags not supported." Services that omit tags from usage show as "Tags not available." A resource with no tag value shows as "Untagged." |
| Tag inheritance | Cost Management setting. Billing, resource-group, and subscription tags are applied to child usage records. | Usage records, not the resources themselves. | Yes, for the account types listed below. | Enterprise Agreement, Microsoft Customer Agreement, and Microsoft Partner Agreement with Azure plan. |
| Foundry `project` tag | Cost Analysis, filter Tag = `project`. Applied automatically to the project's underlying usage. | Usage records for the supported meters. | Yes, for those meters. | **Preview.** Supported for models sold by Azure, including Azure OpenAI. Not supported for Azure Marketplace models. |
| Foundry portal agent and deployment estimates | Foundry portal Operate overview, Agents estimated-cost column, and an agent's Monitor tab. | Portal date range. The page calls these estimates. | No. The page says to use Cost Management and the invoice for financial reconciliation. Agent overview estimates exclude prompt-agent and non-Foundry agent costs. | For existing Claude deployments on per-model token billing, the Monitor estimated-cost chart is absent; token and request metrics are present. Actual billed cost for those deployments is in Cost Management. |
| Azure Monitor token metrics | `InputTokens`, `OutputTokens`, and related token metrics. Dimensions include `ModelDeploymentName`, `ModelName`, `ModelVersion`, `Region`, and often `ApiName`. | One minute (`PT1M`). | Usage only. These are metrics, not the invoice. | `FoundryModelEstimatedCost` is preview, is labeled as not an invoice, includes a `ProjectId` dimension, and is not exported to diagnostic settings (`DS Export: No`). |

The Foundry cost page also says HTTP status alone does not decide whether a call was billed. The invoice and meter records are the source of truth.

### 2.5 Google Vertex AI and Gemini

Sources read 2026-10-22:

- [Custom metadata labels](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/add-labels-to-api-calls) (Gemini Enterprise Agent Platform; the request host in the examples is `aiplatform.googleapis.com`)
- [Standard Cloud Billing export schema](https://docs.cloud.google.com/billing/docs/how-to/export-data-bigquery-tables/standard-usage)
- [Export Cloud Billing data to BigQuery](https://docs.cloud.google.com/billing/docs/how-to/export-data-bigquery)

| Mechanism | Where it appears | Grain | Reaches billing? | Limits |
| --- | --- | --- | --- | --- |
| Cloud project (`project.id`, `project.number`) | Every standard-export row. `project.labels` carries labels on the project. | The standard export's `usage_start_time` / `usage_end_time` are hourly windows. | Yes. The project is the billing boundary inside a Cloud Billing account. | Project fields can be missing on usage in the first 24 hours after the project is created. |
| Request labels on `generateContent` and `streamGenerateContent` | Request body `labels`, for Google models. The page says the labels are forwarded to Cloud Billing, and that billing reports and billing exports can filter and group by them. | The page describes per-call labels. The export itself is hourly, so many calls can share a row. See open questions for which export column holds the request label. | Yes, for PayGo. | 64 labels per call for Google models. Key length 1–63, must start with a lowercase letter or international character. Value length 0–63. Keys and values: lowercase letters, numbers, underscores, dashes, UTF-8. A label key is dropped, without notice, if more than 1,000 distinct values are used for it over the life of the billing account. Do not put person names or titles in labels. Costs typically appear within a day and can take more than 24 hours. |
| Request labels on partner models | `X-Vertex-AI-Labels` header, base64-encoded JSON, on `rawPredict` and `streamRawPredict`. | Same. | Yes, for PayGo, for the partner models the page lists. | 32 labels per call. The page lists Anthropic and Mistral as the partner models that support labels. |
| Provisioned Throughput | Same request label fields. | — | No. The page says Provisioned Throughput silently ignores labels. | The request still succeeds. |
| Resource labels | Standard export `labels.key` / `labels.value`, documented as the label on the Google Cloud resource that generated the usage. | Hourly export row. | Yes. | Separate from `system_labels`, which are Google-generated, and from `project.labels`. |

The labels page's examples are Vertex AI (`aiplatform.googleapis.com`), which the OpenTelemetry registry calls `gcp.vertex_ai`. The Gemini Developer API (`generativelanguage.googleapis.com`, OTel value `gcp.gemini`) is a different endpoint. This reading did not find a labels-to-billing page for that endpoint. See open questions.

### 2.6 Microsoft Copilot Studio and Microsoft 365 Copilot

Sources read 2026-10-22:

- [Billing rates and management](https://learn.microsoft.com/en-us/microsoft-copilot-studio/requirements-messages-management)
- [Assign licenses and manage access](https://learn.microsoft.com/en-us/microsoft-copilot-studio/requirements-licensing)
- [Standard harness licensing](https://learn.microsoft.com/en-us/microsoft-copilot-studio/billing-licensing)
- [Manage Copilot Credits](https://learn.microsoft.com/en-us/power-platform/admin/manage-copilot-studio-copilot-credits-capacity)
- [Microsoft Copilot Credits report](https://learn.microsoft.com/en-us/microsoft-365/admin/activity-reports/microsoft-365-copilot-credits)
- [Copilot reports overview](https://learn.microsoft.com/en-us/microsoft-365/copilot/agent-essentials/agent-usage-billing/agent-usage-cs-reports)
- [Extensibility cost](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/cost-considerations)
- [Govern GitHub-harness credit consumption](https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/govern-credit-consumption)

These are seat and credit products. They do not tag a cloud resource per request.

| Mechanism | Where it appears | Grain | Reaches billing? | Limits |
| --- | --- | --- | --- | --- |
| Microsoft 365 Copilot user license | Assigned to a user. The billing-rates table marks classic answer, generative answer, agent action, tenant-graph grounding, agent-flow actions, and basic generative tools as "No charge" when the user has this license. | Per user seat. The seat is not split by agent. | The seat is the bill. Agent usage by a licensed user does not add a Copilot Credit charge for the features in that table. | A seat identifies a person, not an agent. Usage of agents powered by the GitHub Copilot harness is not included in the Microsoft 365 Copilot license. |
| Copilot Studio prepaid credits | Purchased at the tenant, pooled, then allocated to an environment. Power Platform admin center Summary, with downloadable reports by environment, agent, or user. | Daily consumption in the capacity views. The detailed report adds product or AI feature, channel, LLM model, and knowledge source or tool. | Yes, as credit consumption. | The reports do not show a single conversation or message, do not show token counts, and do not show why a row was not billed. An agent's Monitor page shows billed credits only and can be lower than the reports, which include non-billed credits. For the standard harness, the user report includes a user. Sessions with no signed-in user appear as user id `00000000-0000-0000-0000-000000000000`. |
| Copilot Studio pay-as-you-go | An environment is linked to an Azure subscription by a billing policy. | Azure Cost Management for the Azure charge. Credit reports for the agent and user split. | Yes. The Azure invoice is the environment's meter. The agent split is in the Power Platform and Microsoft 365 reports, not described as a separate Azure resource per agent. | Azure budgets and alerts notify. They do not stop Copilot Studio consumption. Stopping is an agent-level limit. |
| Unlicensed user in Copilot Chat | Microsoft 365 admin center Copilot Credits report: credits per user, per agent, per billing policy, and per agent-user pair. | The credits report says usage is visible within an hour. The agent-usage report is available within 72 hours of the UTC day. | Yes, for metered credits. | Applies to users who do not have a Microsoft 365 Copilot license and who use agents that spin the Copilot Studio meter. User names are hidden in usage reports until an admin shows them. |
| Copilot Studio maker license | A tenant license plus a per-user license for people who create agents. The licensing page says users of a published agent do not need that maker license. | Per maker, not per request. | This is an authoring seat, not inference attribution. | Guest users of the tenant cannot access Copilot Studio. |

An agent in the credits report is "an element of an app." Agent ID is the app identifier Microsoft generates. Agent name comes from the app manifest. The environment is the container: each agent belongs to one environment, and prepaid capacity is assigned to the environment.

### 2.7 AI gateways

Gateways sit in front of the providers above. Their identity is real for the gateway's own ledger. It reaches the **provider** bill only when the gateway's credential, tag, or label is what the provider records. A virtual key that fans into one provider key does not, by itself, split that provider's invoice.

#### LiteLLM

Sources read 2026-10-22:

- [Virtual keys](https://docs.litellm.ai/docs/proxy/virtual_keys)
- [Spend tracking](https://docs.litellm.ai/docs/proxy/cost_tracking)
- [Request headers](https://docs.litellm.ai/docs/proxy/request_headers)
- [Request tags](https://docs.litellm.ai/docs/proxy/request_tags)

Spend tracking requires virtual keys and a database. Each priced request is a row in `LiteLLM_SpendLogs`. The documented row includes the key hash, the internal user who owns the key, `team_id`, `request_tags`, `end_user` (the request's `user` field), the model group, token counts, and a calculated `spend`. The response header `x-litellm-response-cost` carries that calculated cost. LiteLLM prices from its model cost map, including provider tier metadata when the response has it, and it documents a workflow for when that figure does not match the provider bill. A request that prices to zero on a model with a non-zero map is still written, with `spend = 0`, and counted in `litellm_zero_cost_requests_total`.

Headers, all optional:

| Header | Role |
| --- | --- |
| `x-litellm-tags` | Comma-separated tags for routing or spend. |
| `x-litellm-spend-logs-metadata` | JSON object stored on the spend log. The documented example uses `user_id`, `project_id`, and `request_type`. |
| `x-litellm-customer-id`, `x-litellm-end-user-id` | End-user id. Checked without extra configuration. |
| `x-litellm-trace-id`, then `x-litellm-session-id`, then any `x-*-session-id` | Session id stored on the spend log and copied onto nested tool and agent calls. |

Grain is per request, in the gateway database. It does not appear on the provider invoice unless the deployment underneath also tags or keys the call.

Tag-based routing and some tag spend features are marked Enterprise on the spend-tracking page. This reading did not find a documented maximum length for tag or metadata values.

#### Kong

Sources read 2026-10-22:

- [AI Proxy](https://docs.konghq.com/hub/kong-inc/ai-proxy/)
- [AI Rate Limiting Advanced](https://docs.konghq.com/hub/kong-inc/ai-rate-limiting-advanced/)
- [Key Authentication getting started](https://docs.konghq.com/gateway/latest/get-started/rate-limiting/)
- [Rate Limiting Advanced](https://docs.konghq.com/hub/kong-inc/rate-limiting-advanced/)

Kong's identity object is a Consumer, not a virtual key. Key Authentication binds a credential to a Consumer. The client presents the credential in a header, query parameter, or body. Rate Limiting can aggregate by `consumer`, `credential`, `header`, `ip`, `path`, `service`, or `consumer-group`. From Gateway 3.15, a consumer counter can use `consumer.id` (the default), `consumer.username`, or `consumer.custom_id`.

AI Proxy authenticates to the upstream provider on behalf of the Consumer, records usage statistics for the configured provider and model into the selected Kong log plugin, and can record the transformed request and response. With a native `llm_format`, the plugin still provides analytics, logging, and cost calculation. AI Rate Limiting Advanced turns provider token usage into a cost and limits that cost per policy. Policies can match consumer, consumer group, header, path, model, and provider. The plugin's own limitation: the cost of a request is applied on the **next** request, so the request that crosses the limit is not the one that is rejected.

That cost is a gateway control figure. This reading did not find a Kong page that writes it into the upstream provider's invoice. Header templating (`$(headers.header_name)`) can copy a request header into the upstream model name or model options, which is a way to push identity upstream only if the provider then stores that field.

#### Portkey

Sources read 2026-10-22:

- [Metadata](https://portkey.ai/docs/product/observability/metadata)
- [Virtual keys](https://docs.portkey.ai/docs/product/ai-gateway/virtual-keys)
- [Metadata grouped analytics](https://portkey.ai/docs/api-reference/admin-api/control-plane/analytics/groups-paginated-data/get-metadata-grouped-data)
- [Workspace budgets](https://portkey.ai/docs/product/administration/enforce-workspace-budget-limts-and-rate-limits)
- [Provider budget limits](https://portkey.ai/docs/product/ai-gateway/virtual-keys/budget-limits)

Portkey's virtual keys have been migrated to Model Catalog. The documented invariant that remains: one Portkey API key can call many providers, and the provider credential stays in Portkey rather than in application code. Catalog integrations can be shared to all workspaces or to selected workspaces, with budgets and rate limits.

Request metadata is a string map sent in the SDK or in the `x-portkey-metadata` header. The page says any number of keys may be sent, every value must be a string of at most 128 characters, and `_user` drives user-level analytics. If the OpenAI `user` field is present and `_user` is absent, Portkey copies `user` into `_user`. Analytics can group by any metadata key. The grouped-metadata API accepts a `virtual_keys` filter. Logs can be filtered by the same keys.

Enterprise self-hosted gateways at 2.5.0 or later can copy named request headers into metadata with `HEADERS_TO_METADATA`. Enterprise metadata can also be attached at three levels: the request, the API key, and the workspace. The page describes this as observability and cost attribution inside Portkey. It does not say the metadata is written onto the provider invoice.

Budgets (cost in USD, or tokens) on a provider integration apply only to requests made after the limit is set. The minimum cost limit documented is $1, and the minimum token limit is 100. Workspace budgets are Enterprise, and selected Pro customers. Exhausting a budget rejects later requests; it does not split the provider invoice.

### 2.8 OpenTelemetry GenAI semantic conventions

Sources read 2026-10-22:

- [GenAI attribute registry](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/registry/attributes/gen-ai.md) (`main` of `open-telemetry/semantic-conventions-genai`)
- [Moved notice on the old site](https://opentelemetry.io/docs/specs/semconv/gen-ai/)

The conventions have left the core semantic-conventions repository. The pages under `opentelemetry.io/docs/specs/semconv/gen-ai/` say they have moved and are no longer maintained there. The attribute table below is from the GenAI repository. Every attribute in that table is stability **Development**.

These attributes ride on spans (and, where the convention says so, on events or metrics). They are per operation, which for a model call is per request. They do not appear on a provider invoice. A collector can join them to billing later; the convention itself does not.

Attributes that identify an actor or a cost-relevant grouping:

| Attribute | What it is | Constraint that matters for attribution |
| --- | --- | --- |
| `gen_ai.agent.id` | Unique, stable id of a **hosted** agent resource. Examples: an OpenAI assistant id, a Bedrock agent ARN, a Google reasoning-engine resource name. | Should be the provider-assigned id. In-memory instance ids are not recommended. |
| `gen_ai.agent.name` | Human-readable name supplied by the application. | |
| `gen_ai.agent.version` | Agent version. | |
| `gen_ai.main_agent.id` | Stable id of the top-level agent in the process. Same hosted-id guidance. | Instrumentation must not generate this from an in-memory id. If no stable id exists, the agent entity is not emitted. `gen_ai.agent.name` may still be set on the span. |
| `gen_ai.main_agent.name` | Top-level agent name. In agent-to-agent calls this maps to the Agent Card name. | |
| `gen_ai.conversation.id` | Conversation, session, or thread id. | Set it when the framework or the provider already has one. Do not invent one from a new UUID, the trace id, or a hash of the request. |
| `gen_ai.workflow.name` | Low-cardinality workflow name supplied by the application. | Must not be recorded when the only available name is a type name such as `StateGraph`. |
| `gen_ai.provider.name` | Provider, from a fixed list when one applies (`openai`, `anthropic`, `aws.bedrock`, `azure.ai.openai`, `gcp.vertex_ai`, `gcp.gemini`, and others). | `gcp.vertex_ai` is `aiplatform.googleapis.com`. `gcp.gemini` is `generativelanguage.googleapis.com`. |
| `gen_ai.request.model`, `gen_ai.response.model` | Requested model, and the model that answered. | |
| `gen_ai.operation.name` | `chat`, `generate_content`, `embeddings`, `execute_tool`, `invoke_agent`, `invoke_workflow`, and others. | |
| `gen_ai.tool.name` | Tool the agent used. | |
| `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.usage.cache_read.input_tokens`, `gen_ai.usage.reasoning.output_tokens` | Token counts. Cache-write, and text, image, and audio splits, also exist. | When a provider reports both billed units and model-consumed tokens, instrumentations should report the billed count. Reasoning tokens should be included in `output_tokens`. |

OASA 0.1.2 maps `agent_id` straight from `gen_ai.agent.id`. That mapping was written when the attribute was a general agent id. The registry read on 2026-10-22 narrows `gen_ai.agent.id` to a stable hosted-agent resource id. An application agent that is not a hosted resource no longer fits that attribute. `gen_ai.agent.name` is still application-supplied. This is an open question for the design note, not a spec change.

Resource attributes are not part of the GenAI registry. The ones the reference exporter already reads are general semantic conventions: `service.name` as a fallback display name, and `deployment.environment.name` for environment. They identify the deploying service, which may be coarser than the agent.

---

## 3. Patterns

The mechanisms above collapse into five patterns. A platform often uses more than one, at different grains.

### 3.1 Account partition

An identifier the provider created, and which the provider uses as a billing or usage bucket: Anthropic workspace, OpenAI project, OpenAI API key, Google Cloud project, Azure subscription, resource group, and Foundry resource.

This is the only pattern that is on the invoice without the customer attaching a tag. The grain is the bucket, not the request. Anthropic cost is daily by workspace. OpenAI cost is daily by project and by API key. Azure and Google bills are hourly or daily aggregates on the resource or project. One key or one project shared by many agents cannot be split further with this pattern alone.

### 3.2 Resource tags and labels that reach the bill

The customer attaches a key-value pair to a **resource** or, on Google and Bedrock, to a **call**, and the provider copies it onto cost rows after a delay.

| Platform | What is tagged | On the bill as | Character and cardinality rules | Delay and history |
| --- | --- | --- | --- | --- |
| Bedrock application inference profile, project, IAM principal | The profile, the project, or the caller | Cost Explorer, classic CUR, CUR 2.0, and the FOCUS `Tags` column in the 1.2 export | 500 active cost-allocation tag keys per payer. Request metadata is a different channel and is not this row. | Up to 24 hours to become activatable, up to 24 hours after activation. Not retroactive. Backfill restores up to 12 months only where the resource already had the tag. |
| Azure resource, and Foundry `project` | The resource, or the project (automatic, preview) | Cost Analysis Tag | 50 tags. Name 512, value 256. | About 24 hours before new usage carries the tag. Marketplace meters are outside the preview project tag. |
| Vertex / Agent Platform request | The API call, PayGo only | Cloud Billing reports and the billing export | 64 labels (Google) or 32 (listed partner models). Key and value 63. Lowercase. 1,000 values per key per billing account, then the key can be dropped. | Typically within a day, sometimes more than 24 hours. Provisioned Throughput drops the labels silently. |

Tags and labels are low-cardinality by design. Bedrock's own best-practices page says session ids, trace ids, and experiment ids belong in request metadata, not in cost allocation tags.

### 3.3 Per-request metadata that does not reach the bill

The caller sends an id on the request. The provider stores it for abuse detection, support, or logs. The cost dataset does not group by it.

- Anthropic `metadata.user_id` (max 512) and `anthropic-user-profile-id`.
- OpenAI `user`, `safety_identifier` (max 128), and `metadata` (16 pairs, key 64, value 512).
- Bedrock `requestMetadata` (16 pairs, key and value 256), on invocation logs.
- Gateway metadata: LiteLLM spend-log metadata and tags, Portkey `x-portkey-metadata` (value 128), Kong header policies and log-plugin fields.
- OpenTelemetry span attributes, per operation, Development stability.

These can attribute a **usage** record at request grain. They attribute a **charge** only after something joins them to a bill that is coarser. The Bedrock CUR page states that join explicitly: logs reconcile to CUR at model and usage-type grain, not per prompt.

### 3.4 Caller identity on usage, and seats on the bill

Some products name a person, and the person is not an agent.

- OpenAI Usage API `user_id` is an organization member. Costs do not group by it.
- AWS IAM principal in CUR 2.0 is the caller role or user, at daily grain, and it does reach dollars.
- Microsoft 365 Copilot is a per-user seat. Licensed use of the features in the Copilot Studio rate table adds no credit charge. The seat cannot be divided across agents.
- Copilot Credits for unlicensed users, and Copilot Studio consumption reports, do split by user and by agent, down to a day or an hour depending on the report, and not down to a message. A session with no signed-in user is an all-zero user id.

A seat answers "who is licensed." It does not answer "which agent spent the seat."

### 3.5 Gateway key

LiteLLM virtual key, Portkey catalog integration plus API key, and Kong Consumer credential. The gateway can record per-request calculated cost against that key, plus team, end user, and metadata. That ledger is the gateway's. The provider invoice still shows the credential the gateway used upstream. Splitting the invoice requires one of the patterns above on the upstream call, or accepting the gateway ledger as the attribution source and reconciling it to the invoice in total.

---

## 4. Open questions

These are points the pages read on 2026-10-22 do not settle.

1. **Anthropic cost by API key.** Usage groups by `api_key_id`. The Cost API page documents grouping by `workspace_id` and `description` only. The same page says to use the Usage API as a cost proxy when there are many keys, which implies the Cost API is the wrong tool for that split. It does not say the dollars are unavailable by key through some other export.
2. **Anthropic `metadata.user_id` retention.** The Messages reference defines the field and an abuse-detection use. No usage, cost, or log page read here says the customer can list requests by that id.
3. **OpenAI end-user id on any customer-visible cost record.** `safety_identifier` and `metadata` are documented for safety and for object queries. Neither is a Costs or Usage `group_by`. Whether the dashboard's object query can be joined to a cost export is not stated.
4. **OpenAI `user_id` on the Usage API for service accounts and admin keys.** The field is an organization user. How usage is bucketed when the caller is a service account, or when several keys share one owner, is not spelled out on the pages read.
5. **AWS FOCUS version.** Data Exports documents FOCUS 1.0 and 1.2. OASA maps FOCUS 1.4. Whether AWS publishes a 1.3 or 1.4 FOCUS export, and whether Bedrock tag keys land in that export's `Tags` column under the same names as `resourceTags/{key}` in CUR, is not on the pages read.
6. **Bedrock workspace versus project.** The cost overview lists workspaces as their own row, carrying project tags through a header, for Anthropic Messages on `bedrock-mantle`. The projects page does not fully define whether a workspace can point at more than one project or change over time.
7. **Foundry agent on the invoice.** Portal agent costs are estimates. Cost Management documents resource, meter, deployment tag, and the preview `project` tag. No page read here shows an agent id as a Cost Management dimension for Azure OpenAI token meters.
8. **Which BigQuery column receives a Vertex request label.** The labels page says request labels are forwarded to Cloud Billing and can be queried in billing exports. The standard-export schema describes `labels` as the label on the resource, `project.labels` as the project's labels, and `system_labels` as Google-generated. The column that holds a `generateContent` label, and whether hourly aggregation merges calls that share a label, is not stated.
9. **Gemini Developer API labels.** The labels page's host is `aiplatform.googleapis.com`. Billing behavior for `generativelanguage.googleapis.com` was not found in this pass.
10. **Kong cost export.** AI Proxy records usage and calculates cost into the configured log plugin, and AI Rate Limiting Advanced applies cost on the next request. A durable per-consumer cost table that can be reconciled to an upstream invoice is not specified on the pages read.
11. **LiteLLM metadata limits.** Headers and the spend-log shape are documented. A maximum key count or value length for `x-litellm-spend-logs-metadata` is not.
12. **`gen_ai.agent.id` versus OASA `agent_id`.** The current spec maps them one-to-one. The registry now reserves `gen_ai.agent.id` for a stable hosted-agent resource id and tells instrumentation not to put an in-memory id there. Where an application agent id should go, if the workload is not a hosted agent, is not answered by the convention.

---

## 5. Pages read

All read 2026-10-22.

| Topic | URL |
| --- | --- |
| OASA spec, schema, FOCUS mapping, examples | Repository files at OASA 0.1.2. FOCUS mapping draft dated 2026-10-05. |
| OTel exporter mapping | `oasa-otel-exporter` README and `mapping.yaml`, reference only. |
| Anthropic workspaces | https://platform.claude.com/docs/en/manage-claude/workspaces |
| Anthropic usage and cost | https://platform.claude.com/docs/en/manage-claude/usage-cost-api |
| Anthropic admin API | https://platform.claude.com/docs/en/manage-claude/admin-api |
| Anthropic Messages | https://platform.claude.com/docs/en/api/messages |
| Anthropic user profiles | https://platform.claude.com/docs/en/manage-claude/user-profiles |
| OpenAI costs | https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/costs/ |
| OpenAI completions usage | https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/completions/ |
| OpenAI metadata | https://developers.openai.com/api/reference/typescript/resources/$shared/ |
| OpenAI chat parameters | https://developers.openai.com/api/reference/python/resources/chat/index.md |
| OpenAI safety identifiers | https://developers.openai.com/api/docs/guides/safety-best-practices |
| OpenAI usage help | https://help.openai.com/en/articles/10478918-reviewing-api-usage-and-costs |
| OpenAI organization user | https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/users/methods/retrieve |
| Bedrock cost overview | https://docs.aws.amazon.com/bedrock/latest/userguide/cost-management.html |
| Bedrock inference profiles | https://docs.aws.amazon.com/bedrock/latest/userguide/cost-mgmt-application-inference-profiles.html |
| Bedrock projects | https://docs.aws.amazon.com/bedrock/latest/userguide/cost-mgmt-projects.html |
| Bedrock CUR | https://docs.aws.amazon.com/bedrock/latest/userguide/cost-mgmt-understanding-cur-data.html |
| Bedrock cost best practices | https://docs.aws.amazon.com/bedrock/latest/userguide/cost-mgmt-best-practices.html |
| Bedrock cost FAQ | https://docs.aws.amazon.com/bedrock/latest/userguide/cost-mgmt-faq.html |
| Bedrock request metadata | https://docs.aws.amazon.com/bedrock/latest/userguide/cost-mgmt-request-metadata.html |
| AWS tag activation | https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/activating-tags.html |
| AWS tag backfill | https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/cost-allocation-backfill.html |
| AWS billing quotas | https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/billing-limits.html |
| AWS FOCUS 1.2 | https://docs.aws.amazon.com/cur/latest/userguide/table-dictionary-focus-1-2-migrating.html |
| Foundry costs | https://learn.microsoft.com/en-us/azure/foundry/concepts/manage-costs |
| Azure OpenAI metrics | https://learn.microsoft.com/en-us/azure/foundry/openai/monitor-openai-reference |
| Azure tags | https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/tag-resources |
| Azure Cost Analysis grouping | https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/group-filter |
| Azure tag inheritance | https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/enable-tag-inheritance |
| Vertex / Agent Platform labels | https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/add-labels-to-api-calls |
| Google billing export | https://docs.cloud.google.com/billing/docs/how-to/export-data-bigquery-tables/standard-usage |
| Copilot Studio rates | https://learn.microsoft.com/en-us/microsoft-copilot-studio/requirements-messages-management |
| Copilot Studio licenses | https://learn.microsoft.com/en-us/microsoft-copilot-studio/requirements-licensing |
| Copilot Studio harness licensing | https://learn.microsoft.com/en-us/microsoft-copilot-studio/billing-licensing |
| Copilot Credits capacity | https://learn.microsoft.com/en-us/power-platform/admin/manage-copilot-studio-copilot-credits-capacity |
| Microsoft 365 credits report | https://learn.microsoft.com/en-us/microsoft-365/admin/activity-reports/microsoft-365-copilot-credits |
| Copilot reports | https://learn.microsoft.com/en-us/microsoft-365/copilot/agent-essentials/agent-usage-billing/agent-usage-cs-reports |
| Copilot extensibility cost | https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/cost-considerations |
| GitHub harness credits | https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/govern-credit-consumption |
| LiteLLM virtual keys | https://docs.litellm.ai/docs/proxy/virtual_keys |
| LiteLLM spend | https://docs.litellm.ai/docs/proxy/cost_tracking |
| LiteLLM headers | https://docs.litellm.ai/docs/proxy/request_headers |
| LiteLLM tags | https://docs.litellm.ai/docs/proxy/request_tags |
| Kong AI Proxy | https://docs.konghq.com/hub/kong-inc/ai-proxy/ |
| Kong AI Rate Limiting Advanced | https://docs.konghq.com/hub/kong-inc/ai-rate-limiting-advanced/ |
| Kong key auth | https://docs.konghq.com/gateway/latest/get-started/rate-limiting/ |
| Kong Rate Limiting Advanced | https://docs.konghq.com/hub/kong-inc/rate-limiting-advanced/ |
| Portkey metadata | https://portkey.ai/docs/product/observability/metadata |
| Portkey virtual keys | https://docs.portkey.ai/docs/product/ai-gateway/virtual-keys |
| Portkey metadata analytics | https://portkey.ai/docs/api-reference/admin-api/control-plane/analytics/groups-paginated-data/get-metadata-grouped-data |
| Portkey workspace budgets | https://portkey.ai/docs/product/administration/enforce-workspace-budget-limts-and-rate-limits |
| Portkey provider budgets | https://portkey.ai/docs/product/ai-gateway/virtual-keys/budget-limits |
| OpenTelemetry GenAI registry | https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/registry/attributes/gen-ai.md |
| OpenTelemetry move notice | https://opentelemetry.io/docs/specs/semconv/gen-ai/ |

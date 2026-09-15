# Open Agent Spend Attribution (OASA)

**An open specification for attributing AI-agent spend to the agent, task, and cost object responsible for it.**

[![License: CC BY 4.0](https://img.shields.io/badge/License-CC%20BY%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by/4.0/)

AI agents are already spending money — on model tokens, third-party APIs, compute, and increasingly on autonomous payment rails. Three kinds of record describe that spend, and none of them answers the question a finance team actually has:

- **Settlement** records (x402, card, wire) prove that money moved.
- **Billing** records (FOCUS-normalized invoices) state what a vendor charged.
- **Attribution** records — which agent spent it, on what task, for which cost object, and whether it produced value — have no standard at all.

OASA is that third layer. It defines a canonical record format that joins runtime telemetry, normalized billing, and payment settlement into a single auditable ledger row.

**Read the spec: [SPEC.md](SPEC.md)** · Canonical HTML version: <https://www.onaro.io/spec>

## What OASA is not

- Not a payment protocol. It does not move money or replace x402.
- Not a billing format. It is additive to [FOCUS](https://focus.finops.org/), not a competitor.
- Not a telemetry standard. It maps to [OpenTelemetry GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) rather than redefining them.

It is the join between those three.

## Design principles

- **Hub-and-spoke** — canonical middle, adapters at the edges.
- **Settlement-agnostic** — invoice, card, wire, and on-chain rails reconcile into the same spine.
- **Additive, never competing** — upstream specifications own their layers.
- **Partial records are valid** — every field outside the envelope is optional, so adapters emit what they know and reconcile later.
- **Additive-only within a major version.**

## Status

Version 0.1.1 — early public draft. The schema is expected to change based on implementation feedback. It is published openly so that the attribution layer gets defined in the open rather than inside one vendor's product.

Mapping tables were verified against upstream documentation on 2026-09-15. OpenTelemetry GenAI conventions are still experimental and may drift; corrections are welcome.

## Versions

| Version | Date | HTML |
| --- | --- | --- |
| v0.1.1 | 2026-09-15 | <https://www.onaro.io/spec/v0.1.1> |
| v0.1 | 2026-09-14 | <https://www.onaro.io/spec/v0.1> |

Pinned version URLs do not change. `https://www.onaro.io/spec` always renders the latest.

## Contributing

Corrections, mapping errors, and field proposals are welcome:

- **Open an issue** for anything wrong, missing, or ambiguous — especially an upstream attribute name that has drifted.
- **Open a pull request** against `SPEC.md` for concrete changes. Include the upstream source for any mapping you add or correct.
- **General comments:** hello@onaro.io

Implementation reports are the most useful contribution of all. If you have tried to map real agent spend with this schema, what broke is what the next version needs to fix.

## License

The specification text is licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) — free to use, adapt, and implement, with attribution.

## Cite this specification

> Open Agent Spend Attribution (OASA) Specification, version 0.1.1. Onaro, 2026-09-14 (revised 2026-09-15). https://www.onaro.io/spec

## Background

The argument behind the specification: [The Missing Ledger](https://www.onaro.io/missing-ledger).

---

Published by [Onaro](https://www.onaro.io/) (BrianOnAI LLC). Onaro builds Meridian, a FinOps system of record for AI labor. The specification is published independently of that product and carries no dependency on it.

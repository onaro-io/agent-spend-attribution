# Schema hosting

GitHub Pages publishes this repository as the OASA site. The JSON Schema files are served at the URLs in their `$id` fields. Each file is placed at the path of its `$id`, so `schema/oasa-record.schema.json` is served at `https://oasaspec.org/schema/0.1/oasa-record.schema.json` and `schema/0.1.3/oasa-record.schema.json` is served at `https://oasaspec.org/schema/0.1.3/oasa-record.schema.json`. GitHub Pages sends `Content-Type: application/json` for `.json` files. A charset parameter may follow the media type.

The same build renders the current specification at `/spec/` and `/spec/v0.1.3/`, the best-practices guide at `/guides/attribution-best-practices/`, the FOCUS mapping at `/focus-mapping/`, and the contributing page at `/contributing/`. Prior versions link to their published HTML. The page mark is OASA. The footer says the specification is maintained by Onaro.

Until this site replaces the published HTML, `/` redirects to `https://www.onaro.io/spec`. `scripts/site-pages.mjs` holds that address in `ROOT_REDIRECT_URL`. Clear it to serve the current specification at `/`.

`npm run check:published` builds the site, checks the schema bytes against the repo, and checks the pages. After a push to `main`, the Publish site workflow deploys the site and then fetches the live `$id` URLs. That live check fails until the DNS records below are in place.

## DNS records for oasaspec.org

Create all eight records. Remove any other `A`, `AAAA`, `ALIAS`, `ANAME`, or `CNAME` record on the apex (`@`). Do not add a wildcard record.

| Type | Name | Value |
| --- | --- | --- |
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| AAAA | `@` | `2606:50c0:8000::153` |
| AAAA | `@` | `2606:50c0:8001::153` |
| AAAA | `@` | `2606:50c0:8002::153` |
| AAAA | `@` | `2606:50c0:8003::153` |

TTL `3600` is sufficient. These are the GitHub Pages addresses documented at [Managing a custom domain for your GitHub Pages site](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site), read 2026-10-22.

If the DNS provider cannot store `A` records and instead offers one `ALIAS` or `ANAME` record, use that single record instead of the eight above:

| Type | Name | Value |
| --- | --- | --- |
| ALIAS or ANAME | `@` | `onaro-io.github.io` |

Do not combine that alias with the `A` and `AAAA` records.

The schema URLs use the apex host. No `www` record is required. If GitHub shows a domain-verification `TXT` record when the custom domain is saved, add that `TXT` record as well. Its value comes from the repository settings and is not fixed in this document.

After the first deploy, the workflow sets the Pages custom domain to `oasaspec.org`. In the repository, under Settings, Pages, confirm the custom domain is `oasaspec.org` and, once the certificate is issued, that HTTPS is enforced.

## Redirects to oasaspec.org

These names already use GoDaddy nameservers (`domaincontrol.com`). Forward each one to `https://oasaspec.org`. Do not point them at the GitHub Pages addresses above. GitHub Pages serves a single custom domain, so those addresses would not answer for these names.

In the GoDaddy Domain Portfolio, open the domain, then DNS, then Forwarding. The steps below are the forwarding form at [Forward my GoDaddy domain](https://www.godaddy.com/help/forward-my-godaddy-domain-12123), read 2026-10-22.

For the root domain:

- Destination: `https://oasaspec.org`
- Type: Permanent (301)
- Forward only. Do not use forwarding with masking.

For the subdomain `www`, add a second rule with the same destination, the same permanent type, and forward only.

Saving a root forward locks the apex `A` records. Confirm they are these two, and leave them locked:

| Type | Name | Value |
| --- | --- | --- |
| A | `@` | `15.197.225.128` |
| A | `@` | `3.33.251.168` |

Apply that pair of forwarding rules to each of these domains:

- `oasaspec.com`
- `oasa.foundation`
- `agentspendattribution.com`
- `agentspendattribution.org`
- `aispendattribution.com`
- `aispendattribution.org`
- `aiworkunit.com`
- `aiworkunit.org`

On 2026-10-22 the apex and `www` of each name already answered `301` with `Location: https://oasaspec.org`. GoDaddy forwarding sends that host to the one destination URL. A path on these names, such as `/schema/0.1/oasa-record.schema.json`, is not rewritten onto `oasaspec.org`. Schema identifiers stay on `https://oasaspec.org`.

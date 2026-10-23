# Schema hosting

The JSON Schema files are served at the URLs in their `$id` fields. GitHub Pages publishes this repository's `schema/` directory as a static site. Each file is placed at the path of its `$id`, so `schema/oasa-record.schema.json` is served at `https://oasaspec.org/schema/0.1/oasa-record.schema.json` and `schema/0.1.3/oasa-record.schema.json` is served at `https://oasaspec.org/schema/0.1.3/oasa-record.schema.json`. GitHub Pages sends `Content-Type: application/json` for `.json` files. A charset parameter may follow the media type.

`npm run check:published` builds that site and checks the bytes against the repo. After a push to `main`, the Publish schema workflow deploys the site and then fetches the live `$id` URLs. That live check fails until the DNS records below are in place.

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

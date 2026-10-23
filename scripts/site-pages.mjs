// Renders the specification site into site/ next to the schema files.
// The root stays a redirect to the published HTML until this site replaces it.
// Clear ROOT_REDIRECT_URL to serve the current specification at /.
//
// SPDX-License-Identifier: Apache-2.0

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import GithubSlugger from 'github-slugger';
import { Marked } from 'marked';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'https://github.com/onaro-io/agent-spend-attribution';

export const ROOT_REDIRECT_URL = 'https://www.onaro.io/spec';

const CURRENT_VERSION = { version: '0.1.3', date: '2026-10-22' };

export const PRIOR_VERSIONS = [
  { version: '0.1.2', date: '2026-10-08', href: 'https://www.onaro.io/spec/v0.1.2' },
  { version: '0.1.1', date: '2026-09-15', href: 'https://www.onaro.io/spec/v0.1.1' },
  { version: '0.1', date: '2026-09-14', href: 'https://www.onaro.io/spec/v0.1' },
];

const PAGES = [
  {
    source: 'SPEC.md',
    pathname: '/spec/',
    nav: 'spec',
    title: 'Open Agent Spend Attribution (OASA) Specification',
    spec: true,
  },
  {
    source: 'SPEC.md',
    pathname: '/spec/v0.1.3/',
    nav: 'spec',
    title: 'Open Agent Spend Attribution (OASA) Specification 0.1.3',
    spec: true,
    pinned: true,
  },
  {
    source: 'docs/guides/attribution-best-practices.md',
    pathname: '/guides/attribution-best-practices/',
    nav: 'guide',
    title: 'Attributing agent spend',
  },
  {
    source: 'docs/focus-mapping.md',
    pathname: '/focus-mapping/',
    nav: 'focus',
    title: 'OASA ↔ FOCUS 1.4 Mapping',
  },
  {
    source: 'docs/contributing.md',
    pathname: '/contributing/',
    nav: 'contributing',
    title: 'Contributing',
  },
];

const NAV = [
  { id: 'spec', href: '/spec/', label: 'Specification' },
  { id: 'guide', href: '/guides/attribution-best-practices/', label: 'Best practices' },
  { id: 'focus', href: '/focus-mapping/', label: 'FOCUS mapping' },
  { id: 'contributing', href: '/contributing/', label: 'Contributing' },
];

const PUBLISHED = new Map([
  ...PAGES.filter((page) => !page.pinned).map((page) => [page.source, page.pathname]),
  ['schema/oasa-record.schema.json', '/schema/0.1/oasa-record.schema.json'],
  ['schema/oasa-batch.schema.json', '/schema/0.1/oasa-batch.schema.json'],
  ['schema/0.1.3/oasa-record.schema.json', '/schema/0.1.3/oasa-record.schema.json'],
  ['schema/0.1.3/oasa-batch.schema.json', '/schema/0.1.3/oasa-batch.schema.json'],
]);

function sitePath(siteDir, pathname) {
  return join(siteDir, pathname.replace(/^\//, ''));
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function relativeUrl(fromPage, toPath) {
  const fromDir = fromPage.endsWith('/') ? fromPage : `${posix.dirname(fromPage)}/`;
  let rel = posix.relative(fromDir, toPath);
  if (rel === '') return './';
  if (toPath.endsWith('/') && !rel.endsWith('/')) rel += '/';
  return rel;
}

function resolveHref(href, sourceRel, pagePath) {
  const hashAt = href.indexOf('#');
  const hash = hashAt >= 0 ? href.slice(hashAt) : '';
  const raw = hashAt >= 0 ? href.slice(0, hashAt) : href;
  if (raw === '') return hash;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return href;
  const dir = sourceRel.includes('/') ? sourceRel.slice(0, sourceRel.lastIndexOf('/') + 1) : '';
  let resolved = posix.normalize(`${dir}${raw}`);
  if (resolved.startsWith('./')) resolved = resolved.slice(2);
  if (resolved.endsWith('/')) return `${REPO}/tree/main/${resolved.slice(0, -1)}${hash}`;
  const published = PUBLISHED.get(resolved);
  if (published) return `${relativeUrl(pagePath, published)}${hash}`;
  return `${REPO}/blob/main/${resolved}${hash}`;
}

function renderMarkdown(markdown, sourceRel, pagePath) {
  const slugger = new GithubSlugger();
  const parser = new Marked({ gfm: true });
  parser.use({
    walkTokens(token) {
      if (token.type === 'link' && typeof token.href === 'string') {
        token.href = resolveHref(token.href, sourceRel, pagePath);
      }
    },
    renderer: {
      heading(token) {
        const id = slugger.slug(token.text);
        const inner = this.parser.parseInline(token.tokens);
        return `<h${token.depth} id="${id}">${inner}</h${token.depth}>\n`;
      },
    },
  });
  return parser.parse(markdown)
    .replaceAll('<table>', '<div class="table-scroll"><table>')
    .replaceAll('</table>', '</table></div>');
}

function versionHtml(page) {
  const prior = PRIOR_VERSIONS.map((item) => (
    `<a href="${item.href}">${item.version}</a> <span class="date">(${item.date})</span>`
  )).join(', ');
  const here = page.pinned
    ? `<a href="${relativeUrl(page.pathname, '/spec/')}">Current version</a>`
    : `<a href="${relativeUrl(page.pathname, '/spec/v0.1.3/')}">Pinned 0.1.3</a>`;
  const home = ROOT_REDIRECT_URL
    ? ` The home page redirects to <a href="${escapeHtml(ROOT_REDIRECT_URL)}">the published HTML</a>.`
    : '';
  return `<p class="versions">Version ${CURRENT_VERSION.version} <span class="date">(${CURRENT_VERSION.date})</span>. ${here}. Prior versions: ${prior}.${home}</p>`;
}

function canonicalUrl(page) {
  if (page.spec && ROOT_REDIRECT_URL) {
    return page.pinned ? 'https://www.onaro.io/spec/v0.1.3' : ROOT_REDIRECT_URL;
  }
  return `https://oasaspec.org${page.pathname}`;
}

function renderDocument(page) {
  const markdown = readFileSync(join(ROOT, page.source), 'utf8');
  const article = renderMarkdown(markdown, page.source, page.pathname);
  const nav = NAV.map((item) => {
    const current = item.id === page.nav ? ' aria-current="page"' : '';
    return `<a href="${relativeUrl(page.pathname, item.href)}"${current}>${item.label}</a>`;
  }).join('\n');
  const versions = page.spec ? versionHtml(page) : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(page.title)}</title>
<link rel="canonical" href="${escapeHtml(canonicalUrl(page))}">
<link rel="stylesheet" href="${relativeUrl(page.pathname, '/assets/site.css')}">
</head>
<body>
<header>
<a class="mark" href="${relativeUrl(page.pathname, '/spec/')}">OASA</a>
<p class="tagline">Open Agent Spend Attribution</p>
<nav aria-label="Site">
${nav}
</nav>
</header>
<main>
${versions}
${article}
</main>
<footer>
<p>OASA is maintained by <a href="https://www.onaro.io/">Onaro</a>.</p>
</footer>
</body>
</html>
`;
}

function redirectDocument(url) {
  const safe = escapeHtml(url);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Open Agent Spend Attribution</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="${safe}">
<meta http-equiv="refresh" content="0; url=${safe}">
<script>location.replace(${JSON.stringify(url)});</script>
</head>
<body>
<p>OASA</p>
<p><a href="${safe}">Open Agent Spend Attribution</a></p>
</body>
</html>
`;
}

const CSS = `:root {
  color-scheme: light;
  --ink: #1c1917;
  --muted: #57534e;
  --line: #d6d3d1;
  --link: #1e3a8a;
  --paper: #ffffff;
  --code: #f5f5f4;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  color: var(--ink);
  background: var(--paper);
  font-family: Georgia, "Iowan Old Style", Palatino, "Palatino Linotype", serif;
  line-height: 1.55;
}
header, main, footer {
  padding-left: 1.25rem;
  padding-right: 1.25rem;
}
header {
  max-width: 70rem;
  margin: 0 auto;
  padding-top: 1.25rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--line);
}
.mark {
  color: var(--ink);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-decoration: none;
  font-family: "Segoe UI", system-ui, sans-serif;
}
.tagline {
  margin: 0.15rem 0 0.75rem;
  color: var(--muted);
  font-family: "Segoe UI", system-ui, sans-serif;
  font-size: 0.95rem;
}
nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 1rem;
  font-family: "Segoe UI", system-ui, sans-serif;
  font-size: 0.95rem;
}
nav a { color: var(--link); }
nav a[aria-current="page"] {
  color: var(--ink);
  text-decoration: none;
  font-weight: 600;
}
main {
  max-width: 70rem;
  margin: 0 auto;
  padding-top: 1.5rem;
  padding-bottom: 3rem;
}
.versions {
  color: var(--muted);
  font-family: "Segoe UI", system-ui, sans-serif;
  font-size: 0.92rem;
}
h1, h2, h3, h4 { line-height: 1.25; }
a { color: var(--link); }
code, pre {
  font-family: Consolas, ui-monospace, monospace;
  font-size: 0.9em;
}
code { background: var(--code); padding: 0 0.15em; }
pre { background: var(--code); padding: 1rem; overflow-x: auto; }
pre code { background: none; padding: 0; }
.table-scroll { overflow-x: auto; margin: 1rem 0; }
table { border-collapse: collapse; width: 100%; min-width: 36rem; }
th, td {
  border-bottom: 1px solid var(--line);
  text-align: left;
  vertical-align: top;
  padding: 0.45rem 0.6rem;
}
th { font-family: "Segoe UI", system-ui, sans-serif; font-size: 0.85rem; }
blockquote {
  margin-left: 0;
  padding-left: 1rem;
  border-left: 3px solid var(--line);
  color: var(--muted);
}
footer {
  max-width: 70rem;
  margin: 0 auto;
  padding-top: 1rem;
  padding-bottom: 2rem;
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-family: "Segoe UI", system-ui, sans-serif;
  font-size: 0.9rem;
}
.date { white-space: nowrap; }
`;

export function writePages(siteDir) {
  const cssPath = sitePath(siteDir, '/assets/site.css');
  mkdirSync(dirname(cssPath), { recursive: true });
  writeFileSync(cssPath, CSS);
  for (const page of PAGES) {
    const dest = sitePath(siteDir, `${page.pathname}index.html`);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, renderDocument(page));
  }
  const indexPath = sitePath(siteDir, '/index.html');
  if (ROOT_REDIRECT_URL) {
    writeFileSync(indexPath, redirectDocument(ROOT_REDIRECT_URL));
  } else {
    const home = PAGES.find((page) => page.pathname === '/spec/');
    writeFileSync(indexPath, renderDocument({ ...home, pathname: '/' }));
  }
  return PAGES.map((page) => page.pathname);
}

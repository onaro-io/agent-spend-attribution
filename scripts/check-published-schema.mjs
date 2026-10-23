// Confirms the static site serves each schema file at its $id, byte for byte.
// --live fetches https://oasaspec.org and checks Content-Type.
//
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishPlan, sitePath, writeSite } from './publish-schema.mjs';
import { ROOT_REDIRECT_URL, writePages } from './site-pages.mjs';

const REQUIRED = [
  'https://oasaspec.org/schema/0.1/oasa-record.schema.json',
  'https://oasaspec.org/schema/0.1/oasa-batch.schema.json',
  'https://oasaspec.org/schema/0.1.3/oasa-record.schema.json',
  'https://oasaspec.org/schema/0.1.3/oasa-batch.schema.json',
];

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exitCode = 1;
}

function checkLocal(plan, siteDir) {
  const byUrl = new Map(plan.map((item) => [item.url, item]));
  for (const url of REQUIRED) {
    if (!byUrl.has(url)) fail(`repo has no schema file whose $id is ${url}`);
  }
  if (process.exitCode) return;
  for (const item of plan) {
    const published = readFileSync(sitePath(siteDir, item.pathname));
    if (!published.equals(item.bytes)) {
      fail(`${item.pathname} does not match ${item.file}`);
    }
  }
  if (!process.exitCode) console.log(`ok   ${plan.length} schema file(s) publish at their $id paths`);
}

function readPage(siteDir, pathname) {
  return readFileSync(join(siteDir, pathname), 'utf8');
}

function checkPages(siteDir) {
  if (ROOT_REDIRECT_URL !== 'https://www.onaro.io/spec') {
    fail(`root redirect is ${ROOT_REDIRECT_URL}`);
  }
  const index = readPage(siteDir, 'index.html');
  if (!index.includes('content="0; url=https://www.onaro.io/spec"')) {
    fail('root does not redirect to https://www.onaro.io/spec');
  }
  if (!index.includes('location.replace("https://www.onaro.io/spec")')) {
    fail('root script does not replace the location with https://www.onaro.io/spec');
  }
  if (index.includes('id="attribution"')) fail('root contains the specification');
  if (!index.includes('<p>OASA</p>')) fail('root is missing the OASA name');

  const spec = readPage(siteDir, join('spec', 'index.html'));
  const pinned = readPage(siteDir, join('spec', 'v0.1.3', 'index.html'));
  for (const page of [spec, pinned]) {
    for (const url of [
      'https://www.onaro.io/spec/v0.1.2',
      'https://www.onaro.io/spec/v0.1.1',
      'https://www.onaro.io/spec/v0.1',
    ]) {
      if (!page.includes(`href="${url}"`)) fail(`specification page is missing ${url}`);
    }
    if (!page.includes('id="attribution"')) fail('specification page is missing the attribution anchor');
    if (!page.includes('id="oasa--opentelemetry-genai"')) {
      fail('specification page is missing the OpenTelemetry anchor');
    }
    if (!page.includes('<code>record_id</code>')) fail('specification tables dropped inline code');
    if (!page.includes('OASA is maintained by <a href="https://www.onaro.io/">Onaro</a>.')) {
      fail('specification page is missing the maintainer footer');
    }
    if (page.includes('Meridian')) fail('specification page names Meridian');
  }
  if (!spec.includes('href="../schema/0.1/oasa-record.schema.json"')) {
    fail('specification does not link the 0.1 schema at its $id path');
  }
  if (!spec.includes('href="../focus-mapping/"')) fail('specification does not link the FOCUS mapping');
  if (!spec.includes('https://github.com/onaro-io/agent-spend-attribution/blob/main/docs/research/attribution-identity-by-platform.md')) {
    fail('specification research link does not point at the repository');
  }

  const guide = readPage(siteDir, join('guides', 'attribution-best-practices', 'index.html'));
  if (!guide.includes('id="attributing-agent-spend"')) fail('best-practices page is missing its heading');
  if (!guide.includes('href="../../spec/#attribution"')) fail('best-practices page does not link the attribution section');
  if (!guide.includes('https://github.com/onaro-io/agent-spend-attribution/blob/main/examples/charge-declared-tag-mapped-agent.json')) {
    fail('best-practices page does not link the mixed golden record');
  }
  if (guide.includes('Meridian')) fail('best-practices page names Meridian');

  const focus = readPage(siteDir, join('focus-mapping', 'index.html'));
  if (!focus.includes('id="oasa--focus-14-mapping"')) fail('FOCUS mapping page is missing its heading');
  if (focus.includes('Meridian')) fail('FOCUS mapping page names Meridian');

  const contributing = readPage(siteDir, join('contributing', 'index.html'));
  if (!contributing.includes('href="mailto:hello@onaro.io"')) fail('contributing page is missing the contact address');
  if (!contributing.includes('id="contributing"')) fail('contributing page is missing its heading');

  for (const page of [guide, focus, contributing]) {
    if (!page.includes('OASA is maintained by <a href="https://www.onaro.io/">Onaro</a>.')) {
      fail('a page is missing the maintainer footer');
    }
    if (!page.includes('>OASA</a>')) fail('a page is missing the OASA mark');
  }
  if (!process.exitCode) console.log('ok   spec, guide, FOCUS mapping, contributing, and the root redirect');
}

async function fetchPublished(url) {
  let lastError = new Error(`${url} did not respond`);
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      const response = await fetch(url, { redirect: 'follow' });
      if (response.status === 404 || response.status === 502 || response.status === 503) {
        lastError = new Error(`${url} returned ${response.status}`);
      } else {
        return response;
      }
    } catch (error) {
      lastError = error;
    }
    if (attempt < 8) await new Promise((resolve) => setTimeout(resolve, 15000));
  }
  throw lastError;
}

async function checkLive(plan) {
  let failures = 0;
  for (const item of plan) {
    let response;
    try {
      response = await fetchPublished(item.url);
    } catch (error) {
      failures++;
      console.error(`FAIL ${error.message}`);
      continue;
    }
    const type = response.headers.get('content-type') || '';
    const media = type.split(';')[0].trim().toLowerCase();
    if (!response.ok) {
      failures++;
      console.error(`FAIL ${item.url} returned ${response.status}`);
      continue;
    }
    if (media !== 'application/json') {
      failures++;
      console.error(`FAIL ${item.url} Content-Type is "${type}", expected application/json`);
      continue;
    }
    const body = Buffer.from(await response.arrayBuffer());
    if (!body.equals(item.bytes)) {
      failures++;
      console.error(`FAIL ${item.url} body does not match ${item.file}`);
      continue;
    }
    console.log(`ok   ${item.url}  ${type}`);
  }
  if (failures > 0) process.exitCode = 1;
}

async function main() {
  const live = process.argv.includes('--live');
  const plan = publishPlan();
  const siteDir = writeSite(plan);
  writePages(siteDir);
  checkLocal(plan, siteDir);
  if (process.exitCode) return;
  checkPages(siteDir);
  if (process.exitCode) return;
  if (live) await checkLive(plan);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(`FAIL ${error.message}`);
    process.exit(1);
  });
}

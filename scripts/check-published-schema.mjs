// Confirms the static site serves each schema file at its $id, byte for byte.
// --live fetches https://oasaspec.org and checks Content-Type.
//
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { publishPlan, sitePath, writeSite } from './publish-schema.mjs';

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
  checkLocal(plan, siteDir);
  if (process.exitCode) return;
  if (live) await checkLive(plan);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(`FAIL ${error.message}`);
    process.exit(1);
  });
}

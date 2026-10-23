// Builds the static site that serves each schema file at its $id path.
// schema/oasa-record.schema.json is published at /schema/0.1/ because that is
// the path in its $id. Versioned directories such as schema/0.1.3/ publish at
// the path in their own $id.
//
// SPDX-License-Identifier: Apache-2.0

import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA_ORIGIN = 'https://oasaspec.org';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SCHEMA_DIR = join(ROOT, 'schema');
export const SITE_DIR = join(ROOT, 'site');

export function listSchemaFiles(schemaDir = SCHEMA_DIR) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.json')) out.push(path);
    }
  };
  walk(schemaDir);
  return out.sort();
}

export function publishPlan(schemaDir = SCHEMA_DIR) {
  const plan = [];
  for (const file of listSchemaFiles(schemaDir)) {
    const bytes = readFileSync(file);
    let json;
    try {
      json = JSON.parse(bytes.toString('utf8'));
    } catch (error) {
      throw new Error(`${file} is not JSON: ${error.message}`);
    }
    if (typeof json.$id !== 'string' || json.$id.length === 0) {
      throw new Error(`${file} has no $id`);
    }
    const url = new URL(json.$id);
    if (url.origin !== SCHEMA_ORIGIN) {
      throw new Error(`${file} $id origin is ${url.origin}, expected ${SCHEMA_ORIGIN}`);
    }
    if (!url.pathname.startsWith('/schema/') || !url.pathname.endsWith('.json')) {
      throw new Error(`${file} $id path ${url.pathname} is not a /schema/*.json path`);
    }
    plan.push({ file, pathname: url.pathname, url: json.$id, bytes });
  }
  const seen = new Map();
  for (const item of plan) {
    const previous = seen.get(item.pathname);
    if (previous) throw new Error(`${item.file} and ${previous} both publish to ${item.pathname}`);
    seen.set(item.pathname, item.file);
  }
  return plan;
}

export function sitePath(siteDir, pathname) {
  return join(siteDir, pathname.replace(/^\//, ''));
}

export function writeSite(plan, siteDir = SITE_DIR) {
  rmSync(siteDir, { recursive: true, force: true });
  mkdirSync(siteDir, { recursive: true });
  writeFileSync(join(siteDir, '.nojekyll'), '');
  for (const item of plan) {
    const dest = sitePath(siteDir, item.pathname);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, item.bytes);
  }
  return siteDir;
}

function main() {
  const plan = publishPlan();
  writeSite(plan);
  for (const item of plan) {
    console.log(`${item.url}  <=  ${item.file}`);
  }
  console.log(`Wrote ${plan.length} schema file(s) to site/`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}

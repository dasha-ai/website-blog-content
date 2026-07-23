#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.BLOG_CONTENT_ROOT
  ? path.resolve(process.env.BLOG_CONTENT_ROOT)
  : path.resolve(scriptDir, '..');

const locales = ['en-us', 'ru-ru'];
const requiredFields = ['slug', 'title', 'createdAt'];
const forbiddenBinaryPattern = /\.(png|jpe?g|webp|gif|mp3|pdf)$/i;
const cdnBlogUrlPattern = /^https:\/\/cdn\.dasha\.ai\/blog\//;
const safeSlugPattern = /^[A-Za-z0-9._~-]+$/;

const errors = [];
let postCount = 0;

function addError(message) {
  errors.push(message);
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

function parseFrontmatter(filePath) {
  const raw = readText(filePath);
  if (!raw.startsWith('---\n')) {
    addError(`${filePath}: missing opening frontmatter marker`);
    return {};
  }

  const closeIndex = raw.indexOf('\n---', 4);
  if (closeIndex === -1) {
    addError(`${filePath}: missing closing frontmatter marker`);
    return {};
  }

  const frontmatter = raw.slice(4, closeIndex);
  const data = {};

  for (const line of frontmatter.split('\n')) {
    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!match) continue;

    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    data[match[1]] = value;
  }

  return data;
}

function validatePost(locale, slugDir, filePath, seenSlugs) {
  const frontmatter = parseFrontmatter(filePath);

  if (!safeSlugPattern.test(slugDir)) {
    addError(
      `${filePath}: directory slug "${slugDir}" must contain only unreserved URL path-segment characters`,
    );
  }

  for (const field of requiredFields) {
    if (!frontmatter[field]) {
      addError(`${filePath}: missing required frontmatter field "${field}"`);
    }
  }

  if (frontmatter.slug && !safeSlugPattern.test(frontmatter.slug)) {
    addError(
      `${filePath}: frontmatter slug "${frontmatter.slug}" must contain only unreserved URL path-segment characters`,
    );
  }

  if (frontmatter.slug && frontmatter.slug !== slugDir) {
    addError(`${filePath}: frontmatter slug "${frontmatter.slug}" must match directory "${slugDir}"`);
  }

  if (frontmatter.slug) {
    if (seenSlugs.has(frontmatter.slug)) {
      addError(`${filePath}: duplicate slug "${frontmatter.slug}" in locale "${locale}"`);
    }
    seenSlugs.add(frontmatter.slug);
  }

  if (frontmatter.createdAt && Number.isNaN(Date.parse(frontmatter.createdAt))) {
    addError(`${filePath}: createdAt "${frontmatter.createdAt}" is not parseable by Date.parse`);
  }

  for (const imageField of ['heroImage', 'authorPhoto']) {
    if (frontmatter[imageField] && !cdnBlogUrlPattern.test(frontmatter[imageField])) {
      addError(`${filePath}: ${imageField} must use a URL under https://cdn.dasha.ai/blog/`);
    }
  }

  postCount += 1;
}

if (!fs.existsSync(path.join(root, 'AGENTS.md'))) {
  addError(`${root}: AGENTS.md is required at the blog content root`);
}

if (!fs.existsSync(path.join(root, 'CLAUDE.md'))) {
  addError(`${root}: CLAUDE.md is required at the blog content root`);
}

for (const filePath of walk(root)) {
  if (forbiddenBinaryPattern.test(filePath)) {
    addError(`${filePath}: binary blog assets must live on https://cdn.dasha.ai/blog/`);
  }
}

for (const locale of locales) {
  const localeDir = path.join(root, locale);
  if (!fs.existsSync(localeDir)) {
    addError(`${localeDir}: locale directory is missing`);
    continue;
  }

  const seenSlugs = new Set();
  const entries = fs.readdirSync(localeDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const mdxPath = path.join(localeDir, entry.name, 'index.mdx');
    if (!fs.existsSync(mdxPath)) {
      addError(`${path.join(localeDir, entry.name)}: missing index.mdx`);
      continue;
    }

    validatePost(locale, entry.name, mdxPath, seenSlugs);
  }
}

if (postCount === 0) {
  addError(`${root}: no blog posts found`);
}

if (errors.length > 0) {
  console.error(`Blog content validation failed with ${errors.length} error(s):`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Validated ${postCount} blog post(s) in ${root}`);

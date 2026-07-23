import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const validatorPath = path.join(scriptDir, 'validate-blog-content.mjs');

function makeFixture({ directorySlug = 'valid-slug', frontmatterSlug = directorySlug } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'blog-validation-'));
  writeFileSync(path.join(root, 'AGENTS.md'), 'fixture\n');
  writeFileSync(path.join(root, 'CLAUDE.md'), 'fixture\n');

  for (const locale of ['en-us', 'ru-ru']) {
    const postDir = path.join(root, locale, directorySlug);
    mkdirSync(postDir, { recursive: true });
    writeFileSync(
      path.join(postDir, 'index.mdx'),
      `---\nslug: "${frontmatterSlug}"\ntitle: "Fixture"\ncreatedAt: "2026-07-22T00:00:00Z"\n---\n\nFixture\n`,
    );
  }

  return root;
}

function validate(root) {
  return spawnSync(process.execPath, [validatorPath], {
    encoding: 'utf8',
    env: { ...process.env, BLOG_CONTENT_ROOT: root },
  });
}

test('accepts unreserved URL path-segment characters', () => {
  const root = makeFixture({ directorySlug: 'valid.slug_name~part-1' });
  try {
    const result = validate(root);
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects unsafe directory slugs', () => {
  const root = makeFixture({ directorySlug: 'unsafe slug' });
  try {
    const result = validate(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /directory slug .* must contain only unreserved URL path-segment characters/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects unsafe frontmatter slugs', () => {
  const root = makeFixture({ frontmatterSlug: 'unsafe%20slug' });
  try {
    const result = validate(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /frontmatter slug .* must contain only unreserved URL path-segment characters/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('continues to require the frontmatter slug to match its directory', () => {
  const root = makeFixture({ frontmatterSlug: 'different-safe-slug' });
  try {
    const result = validate(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /must match directory/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

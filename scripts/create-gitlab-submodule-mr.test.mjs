import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildMergeRequestDescription,
  buildMergeRequestTitle,
  buildSourceBranch,
  requireBlogSha,
  redactSecrets,
} from './create-gitlab-submodule-mr.mjs';

test('buildSourceBranch creates a stable branch name from the GitHub commit', () => {
  const sha = '37ac50df6aa76b2b77e46a99a0b6992a82652c4a';

  assert.equal(buildSourceBranch({ sha }), 'blog-content/update-37ac50df6aa7');
  assert.equal(
    buildSourceBranch({ sha, prefix: 'custom/prefix' }),
    'custom/prefix-37ac50df6aa7',
  );
});

test('requireBlogSha rejects missing or malformed commit ids', () => {
  assert.throws(() => requireBlogSha({ GITHUB_SHA: '' }), /GITHUB_SHA/);
  assert.throws(() => requireBlogSha({ GITHUB_SHA: 'not-a-sha' }), /40-character/);
});

test('merge request title and description identify the GitHub source commit', () => {
  const sha = '37ac50df6aa76b2b77e46a99a0b6992a82652c4a';
  const title = buildMergeRequestTitle({ sha });
  const description = buildMergeRequestDescription({
    sha,
    githubRepository: 'dasha-ai/website-blog-content',
    githubRunId: '28168206672',
    targetBranch: 'master',
  });

  assert.equal(title, 'chore(blog): publish content 37ac50df6aa7');
  assert.match(description, /37ac50df6aa76b2b77e46a99a0b6992a82652c4a/);
  assert.match(description, /https:\/\/github.com\/dasha-ai\/website-blog-content\/commit\/37ac50df6aa76b2b77e46a99a0b6992a82652c4a/);
  assert.match(description, /https:\/\/github.com\/dasha-ai\/website-blog-content\/actions\/runs\/28168206672/);
  assert.match(description, /target branch: `master`/);
});

test('redactSecrets removes tokens from thrown command output', () => {
  const output = 'remote: token glpat-secret and ghp-secret appeared';

  assert.equal(redactSecrets(output, ['glpat-secret', 'ghp-secret']), 'remote: token [REDACTED] and [REDACTED] appeared');
});

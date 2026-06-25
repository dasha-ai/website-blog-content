#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_GITLAB_API_URL = 'https://gitlab.dasha.ai/api/v4';
const DEFAULT_GITLAB_PROJECT_ID = '75';
const DEFAULT_GITLAB_REPOSITORY_URL =
  'https://gitlab.dasha.ai/dasha.ai/frontend-team/english-teaser-website.git';
const DEFAULT_TARGET_BRANCH = 'master';
const DEFAULT_SUBMODULE_PATH = 'content/blog';
const DEFAULT_BRANCH_PREFIX = 'blog-content/update';

export function redactSecrets(value, secrets) {
  let output = value;
  for (const secret of secrets.filter(Boolean)) {
    output = output.split(secret).join('[REDACTED]');
  }
  return output;
}

export function requireBlogSha(env = process.env) {
  const sha = env.GITHUB_SHA ?? '';
  if (!sha) {
    throw new Error('GITHUB_SHA is required');
  }
  if (!/^[0-9a-f]{40}$/i.test(sha)) {
    throw new Error('GITHUB_SHA must be a 40-character git commit id');
  }
  return sha.toLowerCase();
}

export function buildSourceBranch({ sha, prefix = DEFAULT_BRANCH_PREFIX }) {
  return `${prefix}-${sha.slice(0, 12)}`;
}

export function buildMergeRequestTitle({ sha }) {
  return `chore(blog): publish content ${sha.slice(0, 12)}`;
}

export function buildMergeRequestDescription({
  sha,
  githubRepository,
  githubRunId,
  targetBranch,
}) {
  const commitUrl = `https://github.com/${githubRepository}/commit/${sha}`;
  const runUrl = githubRunId
    ? `https://github.com/${githubRepository}/actions/runs/${githubRunId}`
    : null;

  return [
    '## Summary',
    '',
    `Updates \`content/blog\` to GitHub content commit \`${sha}\`.`,
    '',
    `- GitHub commit: ${commitUrl}`,
    runUrl ? `- GitHub Actions run: ${runUrl}` : null,
    `- GitLab target branch: \`${targetBranch}\``,
    '',
    '## Verification',
    '',
    '- GitHub content validation passed before this MR was created.',
    '- The website pipeline will validate the private submodule checkout, build, lint, and tests.',
  ]
    .filter(Boolean)
    .join('\n');
}

function requiredEnv(name, env = process.env) {
  const value = env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function run(command, args, { cwd, env = {}, secrets = [] } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    const output = [
      `$ ${command} ${args.join(' ')}`,
      result.stdout,
      result.stderr,
    ].join('\n');
    throw new Error(redactSecrets(output, secrets));
  }

  return result.stdout.trim();
}

async function gitlabRequest({ apiUrl, projectId, token }, method, pathSuffix, body) {
  const response = await fetch(`${apiUrl}/projects/${encodeURIComponent(projectId)}${pathSuffix}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'PRIVATE-TOKEN': token,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`GitLab API ${method} ${pathSuffix} failed: ${response.status} ${text}`);
  }

  return data;
}

async function writeAskPassScript(tempDir) {
  const askPassPath = path.join(tempDir, 'gitlab-askpass.sh');
  await writeFile(
    askPassPath,
    [
      '#!/bin/sh',
      'case "$1" in',
      '  *Username*) echo oauth2 ;;',
      '  *Password*) printf "%s\\n" "$GITLAB_TOKEN" ;;',
      '  *) exit 1 ;;',
      'esac',
      '',
    ].join('\n'),
    'utf8',
  );
  await chmod(askPassPath, 0o700);
  return askPassPath;
}

export function parseSubmodulePointer(output) {
  const match = output.match(/^160000 commit ([0-9a-f]{40})\t/);
  return match?.[1] ?? null;
}

function readSubmodulePointer(repoDir, submodulePath, secrets) {
  const output = run('git', ['ls-tree', 'HEAD', submodulePath], {
    cwd: repoDir,
    secrets,
  });
  return parseSubmodulePointer(output);
}

async function ensureMergeRequest(context) {
  const params = new URLSearchParams({
    state: 'opened',
    source_branch: context.sourceBranch,
    target_branch: context.targetBranch,
  });
  const existing = await gitlabRequest(
    context,
    'GET',
    `/merge_requests?${params.toString()}`,
  );

  const payload = {
    source_branch: context.sourceBranch,
    target_branch: context.targetBranch,
    title: context.title,
    description: context.description,
    remove_source_branch: true,
    squash: true,
  };

  if (existing.length > 0) {
    const mr = await gitlabRequest(
      context,
      'PUT',
      `/merge_requests/${existing[0].iid}`,
      payload,
    );
    console.log(`Updated GitLab MR !${mr.iid}: ${mr.web_url}`);
    return mr;
  }

  const mr = await gitlabRequest(context, 'POST', '/merge_requests', payload);
  console.log(`Created GitLab MR !${mr.iid}: ${mr.web_url}`);
  return mr;
}

export async function main(env = process.env) {
  const sha = requireBlogSha(env);
  const gitlabToken = requiredEnv('GITLAB_TOKEN', env);
  const githubToken = requiredEnv('GITHUB_TOKEN', env);
  const githubRepository = requiredEnv('GITHUB_REPOSITORY', env);
  const apiUrl = env.GITLAB_API_URL ?? DEFAULT_GITLAB_API_URL;
  const projectId = env.GITLAB_PROJECT_ID ?? DEFAULT_GITLAB_PROJECT_ID;
  const repositoryUrl = env.GITLAB_REPOSITORY_URL ?? DEFAULT_GITLAB_REPOSITORY_URL;
  const targetBranch = env.GITLAB_TARGET_BRANCH ?? DEFAULT_TARGET_BRANCH;
  const submodulePath = env.GITLAB_SUBMODULE_PATH ?? DEFAULT_SUBMODULE_PATH;
  const sourceBranch = buildSourceBranch({
    sha,
    prefix: env.GITLAB_BRANCH_PREFIX ?? DEFAULT_BRANCH_PREFIX,
  });
  const title = buildMergeRequestTitle({ sha });
  const description = buildMergeRequestDescription({
    sha,
    githubRepository,
    githubRunId: env.GITHUB_RUN_ID,
    targetBranch,
  });
  const secrets = [gitlabToken, githubToken];
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'website-blog-sync-'));
  const repoDir = path.join(tempDir, 'website');

  try {
    const askPass = await writeAskPassScript(tempDir);
    const gitEnv = {
      GIT_ASKPASS: askPass,
      GIT_TERMINAL_PROMPT: '0',
      GITLAB_TOKEN: gitlabToken,
    };

    run('git', ['clone', '--depth', '1', '--branch', targetBranch, repositoryUrl, repoDir], {
      env: gitEnv,
      secrets,
    });
    run('git', ['config', 'user.name', 'GitHub Blog Content Bot'], { cwd: repoDir, secrets });
    run('git', ['config', 'user.email', 'support+github-blog-content@dasha.ai'], {
      cwd: repoDir,
      secrets,
    });
    run(
      'git',
      [
        'config',
        '--global',
        `url.https://x-access-token:${githubToken}@github.com/.insteadOf`,
        'https://github.com/',
      ],
      { cwd: repoDir, secrets },
    );

    const currentPointer = readSubmodulePointer(repoDir, submodulePath, secrets);
    if (!currentPointer) {
      console.log(
        `${submodulePath} is not a submodule on ${targetBranch}; publication will start after the website submodule migration is merged.`,
      );
      return null;
    }

    if (currentPointer === sha) {
      console.log(`${submodulePath} already points at ${sha}; no GitLab MR needed.`);
      return null;
    }

    run('git', ['checkout', '-b', sourceBranch], { cwd: repoDir, secrets });
    run('git', ['submodule', 'sync', '--', submodulePath], { cwd: repoDir, secrets });
    run('git', ['submodule', 'update', '--init', '--depth', '1', '--', submodulePath], {
      cwd: repoDir,
      secrets,
    });
    run('git', ['fetch', '--depth', '1', 'origin', sha], {
      cwd: path.join(repoDir, submodulePath),
      secrets,
    });
    run('git', ['checkout', sha], { cwd: path.join(repoDir, submodulePath), secrets });
    run('git', ['add', submodulePath], { cwd: repoDir, secrets });
    run('git', ['commit', '-m', title], { cwd: repoDir, secrets });
    run('git', ['push', '--force', 'origin', `HEAD:refs/heads/${sourceBranch}`], {
      cwd: repoDir,
      env: gitEnv,
      secrets,
    });

    return ensureMergeRequest({
      apiUrl,
      projectId,
      token: gitlabToken,
      sourceBranch,
      targetBranch,
      title,
      description,
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

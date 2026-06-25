# Blog Posts Are a Record

Posts document history; do not rewrite shipped claims or links to match
current products. The 2021 SDK post links auth.dasha.ai/Account/Register;
it stays because the blackbox.dasha.ai equivalent is a dead route. The Copy
Consistency Contract governs current claims, not history. The same rule
covers QA reports under docs/qa/.

## Repository Contract

This repository is mounted into the main website repository as the
`content/blog` Git submodule.

Each post lives under a locale directory. Examples:

```text
en-us/voice-ai-site-reliability-engineering/index.mdx
ru-ru/voice-ai/index.mdx
```

Supported locales are:

```text
en-us
ru-ru
```

For each post, the `slug` frontmatter value must match the directory name.
Images, audio files, PDFs, and other binary assets must live on
`https://cdn.dasha.ai/blog/`; do not commit binary assets to this repository.

Run validation before opening a pull request:

```bash
npm test
```

Merging a pull request here does not publish the website. Publication happens
when the main website repository updates its `content/blog` submodule pointer
and passes its GitLab pipeline.

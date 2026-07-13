# Dasha Website Blog Content

This repository contains the source content for the Dasha website blog. The
website consumes it as the `content/blog` Git submodule.

## Repository Layout

Posts live in locale directories:

```text
en-us/<slug>/index.mdx
ru-ru/<slug>/index.mdx
```

Each post's `slug` frontmatter must match its directory name. Binary assets
belong on `https://cdn.dasha.ai/blog/`, not in this repository.

## Changes

Changes must use a pull request. Run the repository checks before opening one:

```bash
npm test
```

Published posts are historical records. Do not rewrite old claims or links to
match the current product. Contributions are limited to Dasha staff and other
contributors authorized under a written agreement with Dasha.AI Inc.

## Publication

Merging here does not deploy the website directly. The GitHub publisher opens
or updates a merge request in the website's GitLab repository. The website is
published only after that merge request passes its own review and pipeline.

## Copyright

Copyright 2020-2026 Dasha.AI Inc. All rights reserved. Public availability does
not make this repository open source or grant permission to reuse its content
or code. See [LICENSE](LICENSE).

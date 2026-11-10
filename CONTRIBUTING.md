# Contributing

SyncLounge uses a two-lane branch model:

- `dev` is the integration branch and the target for feature and bug-fix pull requests.
- `main` is the stable release branch. It receives reviewed promotion pull requests from `dev` and same-repository Dependabot updates. Bring dependency updates merged to `main` back into `dev` before the next promotion.

Create a focused branch from the latest `dev`, keep unrelated cleanup out of the change, and open a draft pull request early when feedback would help.

## Local verification

Use Node.js 22.18+ on the 22.x line, or 24.11+. CI checks Node 22, 24 and 26:

```sh
SKIP_BUILD=true npm ci
npm run lint -- --no-fix
npm run build
npm test
docker build --build-arg VERSION=dev-local -t synclounge:dev-local .
```

Behavior changes need focused regression tests. Pull requests must list the commands actually run; a generic “tests pass” statement is not verification evidence.

For responsive UI checks, run `npm run serve` and open `/test/fixtures/ui-preview.html`.
The development-only fixture renders entry, connection, browsing, media, settings, player-menu,
and six-person chat views with local sample data. Check narrow phones (320–390px), tablets (768px), and desktops
(1440px), including long titles, chat submission, and drawer controls. It is excluded
from production builds. The fixture uses the same external font stylesheet as the app.

Verify installation, update prompts, and offline recovery against a production build
served by `node server.js` over HTTPS or localhost; the development server does not
register a service worker. Existing tabs must keep playing when an update becomes available.

## Pull requests

- Target `dev`; release promotions and same-repository Dependabot updates may target `main`.
- Squash ordinary feature and fix PRs. Use merge commits for `dev` → `main`
  promotions and release-history reconciliation PRs so both branches retain
  their common ancestry. The repository must allow merge commits on these
  branches; required CI checks and review rules still apply.
- Include screenshots for visible UI changes.
- Update stable documentation when behavior or configuration changes.
- Treat socket payload handling, poster proxying, GitHub Actions, dependencies, and releases as security-sensitive surfaces.
- Resolve actionable CI, security and review findings before marking the pull request ready. Automatic CodeRabbit reviews are disabled.

Release images are built only from version tags whose commit is on `main`. Development images are published from `dev` as `ghcr.io/chrisae9/synclounge:dev` and immutable `dev-<commit SHA>` tags.

---
name: synclounge-release
description: Create and verify SyncLounge releases, including SemVer selection, version-bump and promotion pull requests, release notes, annotated tags, GitHub Releases, and GHCR images. Use when preparing, publishing, or validating a SyncLounge release.
---

# SyncLounge Release

Run this workflow from the SyncLounge repository root. Preserve the repository's
two-lane branch model: changes merge into `dev`, then `dev` is promoted to
`main`. Release tags must point to commits on `main`.

## Prepare

1. Confirm the repository and working tree before making changes:

   ```sh
   test "$(git config --get remote.origin.url | sed 's/\.git$//')" = "https://github.com/chrisae9/synclounge" \
     || test "$(git config --get remote.origin.url | sed 's/\.git$//')" = "git@github.com:chrisae9/synclounge"
   git status --short --branch
   gh auth status
   git fetch origin --prune --tags
   ```

   Stop if the working tree is not clean or the repository identity is wrong.

2. Inspect the release delta:

   ```sh
   LAST_TAG=$(git tag --merged origin/main --sort=-v:refname | head -1)
   if [ -n "$LAST_TAG" ]; then
     git log --oneline "$LAST_TAG"..origin/dev
     git diff --stat "$LAST_TAG"..origin/dev
   else
     EMPTY_TREE=$(git hash-object -t tree /dev/null)
     git log --oneline origin/dev
     git diff --stat "$EMPTY_TREE" origin/dev
   fi
   ```

   Read the relevant diffs and merged pull requests; do not rely only on commit
   subjects.

3. Select the next SemVer version. Use `v1.0.0` if no release tags exist;
   otherwise choose a patch, minor, or major bump based on user-visible impact.
   Confirm that neither the Git tag nor GHCR version already exists.

## Land the version bump

1. Create a focused branch from the latest `origin/dev`:

   ```sh
   git switch --create release/v<VERSION> origin/dev
   npm version <VERSION> --no-git-tag-version
   ```

   `<VERSION>` excludes the `v` prefix. Verify that `package.json` and the root
   lockfile agree.

2. Run the repository's required checks:

   ```sh
   SKIP_BUILD=true npm ci
   npm run lint -- --no-fix
   npm run build
   npm test
   npm run audit
   docker build --build-arg VERSION=<VERSION> -t synclounge:<VERSION> .
   ```

3. Commit the version files, push the branch, and open a pull request targeting
   `dev`. Include the exact verification results in the pull request. Wait for
   required checks and CodeRabbit, then resolve every actionable finding before
   merging.

4. Promote `dev` to `main` with a separate pull request whose head is the
   repository's `dev` branch. Do not push directly to `main`. Wait for required
   checks and merge the promotion before tagging.

## Write release notes

Review every commit and pull request from the previous release tag through the
promoted commit. Omit empty sections and use this format:

```markdown
## SyncLounge <VERSION>

### Changes
* **Category/Area** — Describe the change in present tense and include useful technical detail.

### Fixes
* **Category/Area** — Explain the symptom and how it was fixed.

### Maintenance
* **Category/Area** — Summarize dependency, CI, cleanup, or release work.
```

- Use `*`, a bold category, and an em dash for every bullet.
- Use specific categories such as **Player**, **WebSocket**, **Docker**,
  **CI/CD**, **Server/Security**, or **Release**.
- Put code references in backticks.
- Link relevant pull requests and commits.
- Keep each bullet concise and factual.
- Do not mention AI tools, agents, or automated review processes.

Present the complete release notes to the user before creating or pushing a
tag. Tag only after explicit approval unless the user already authorized
unattended release tagging in the same request.

## Tag and publish

1. Refresh and verify the exact release commit:

   ```sh
   git fetch origin --prune --tags
   git switch --detach origin/main
   VERSION=$(node -p "require('./package.json').version")
   test "$(node -p "require('./package-lock.json').version")" = "$VERSION"
   test "$(git tag -l "v$VERSION")" = ""
   git merge-base --is-ancestor HEAD origin/main
   ```

2. Create an annotated tag containing the approved release notes, then push
   only that tag:

   ```sh
   git tag -a "v$VERSION" -F /path/to/approved-release-notes.md
   git push origin "v$VERSION"
   ```

3. Monitor the tag-triggered release workflow:

   ```sh
   RELEASE_COMMIT=$(git rev-parse "v$VERSION^{commit}")
   RUN_ID=""
   for _ in $(seq 1 12); do
     RUN_ID=$(gh run list --repo chrisae9/synclounge \
       --workflow release.yml --event push --commit "$RELEASE_COMMIT" --limit 1 \
       --json databaseId --jq '.[0].databaseId')
     [ -n "$RUN_ID" ] && break
     sleep 5
   done
   test -n "$RUN_ID"
   gh run watch "$RUN_ID" --repo chrisae9/synclounge --exit-status
   gh release view "v$VERSION" --repo chrisae9/synclounge
   for IMAGE_TAG in latest "$VERSION" "${VERSION%.*}" "${VERSION%%.*}"; do
     MANIFEST=$(docker buildx imagetools inspect \
       "ghcr.io/chrisae9/synclounge:$IMAGE_TAG")
     printf '%s\n' "$MANIFEST" | grep -q 'Platform:.*linux/amd64'
     printf '%s\n' "$MANIFEST" | grep -q 'Platform:.*linux/arm64'
   done
   ```

   Stop if the exact commit's workflow does not succeed. Verify that the GitHub
   Release contains the approved notes and that the `latest`, `x.y.z`, `x.y`,
   and `x` GHCR tags each include `linux/amd64` and `linux/arm64`.

If publishing is still running, report the workflow URL and current status. If
any check fails, stop and report the exact failure; do not move or recreate the
tag without explicit approval.

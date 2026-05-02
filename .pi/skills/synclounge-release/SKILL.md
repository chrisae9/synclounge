---
name: synclounge-release
description: Use when creating a SyncLounge release, bumping the package version, writing release notes, tagging, pushing release tags, or verifying GitHub/GHCR release artifacts.
---

# SyncLounge Release

Run this skill from the SyncLounge repo root (`/home/chis/torrent/synclounge`).

## Release Workflow

1. **Check current state**

   ```bash
   git status --short
   git tag --sort=-v:refname | head -5
   LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo HEAD~20)
   git log --oneline "$LAST_TAG"..HEAD
   git diff "$LAST_TAG"..HEAD --stat
   ```

   If `git status --short` is not clean, stop and resolve/commit changes before releasing.

2. **Determine version**

   - If no tags exist, use `v1.0.0`.
   - Otherwise choose a SemVer bump:
     - patch: bug fixes (`x.y.z+1`)
     - minor: new backward-compatible features (`x.y+1.0`)
     - major: breaking changes (`x+1.0.0`)
   - Calculate the next version from the latest tag.

3. **Update version in code**

   Update the root `package.json` `version` field to the new version without the `v` prefix.

   Then run verification:

   ```bash
   npm test
   npm run build
   ```

   Commit and push the version bump:

   ```bash
   git add package.json package-lock.json
   git commit -m "chore: bump version to <VERSION>"
   git push origin main
   ```

4. **Write release changelog**

   Review all commits since the last tag. Read diffs when commit subjects are not enough.

   Use this format, omitting empty sections:

   ```markdown
   ## SyncLounge <VERSION>

   ### Changes
   * **Category/Area** — Description in present tense. Include technical details where helpful.

   ### Fixes
   * **Category/Area** — What was broken and how it was fixed. Be specific about symptom and resolution.

   ### Maintenance
   * **Category/Area** — Dependency updates, CI changes, cleanup, release work, etc.
   ```

   Style rules:
   - Bullets use `*`.
   - Category prefix is bold and followed by ` — ` (em dash).
   - Use specific categories: **Player**, **WebSocket**, **Docker**, **CI/CD**, **Server/Security**, **Release**, etc.
   - Use backticks for code references.
   - Reference commits as ``[`abc1234`](https://github.com/chrisae9/synclounge/commit/abc1234)``.
   - Do not mention AI tools, agents, or automated review processes.

5. **Approval gate before tagging**

   Present the full changelog to the user before creating the tag. Create the tag only after explicit approval, unless the user already explicitly authorized unattended release tagging in the same request.

6. **Create and push tag**

   ```bash
   git tag -a v<VERSION> -m "<FULL_CHANGELOG>"
   git push origin v<VERSION>
   ```

   The tag message is the release body. Make it complete and well formatted.

7. **Verify release automation**

   ```bash
   gh run list --repo chrisae9/synclounge --limit 3
   ```

   When the workflow completes, verify:

   ```bash
   gh release view v<VERSION> --repo chrisae9/synclounge
   docker pull ghcr.io/chrisae9/synclounge:<VERSION>
   ```

   If verification is still running, report the workflow URL and current status.

## Notes

- Tags trigger the release workflow automatically.
- Images are pushed to `ghcr.io/chrisae9/synclounge` with tags: `latest`, `x.y.z`, `x.y`, and `x`.
- Releases are built for `linux/amd64` and `linux/arm64`.
- The GitHub Release is created automatically from the tag annotation.
- Always update `package.json` before tagging.

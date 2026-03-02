# Release SyncLounge

Guide the user through creating a new release with a detailed, well-formatted changelog.

## Steps

1. **Check current state**:
   - Run `git tag --sort=-v:refname | head -5` to see recent tags
   - Run `git log --oneline $(git describe --tags --abbrev=0 2>/dev/null || echo HEAD~20)..HEAD` to see commits since last release
   - Run `git diff $(git describe --tags --abbrev=0 2>/dev/null || echo HEAD~20)..HEAD --stat` to see files changed

2. **Determine version**:
   - If no tags exist, suggest `v1.0.0` as the first release
   - Otherwise, ask user for bump type: patch (0.0.x), minor (0.x.0), or major (x.0.0)
   - Calculate the next version based on the latest tag

3. **Update version in code**:
   - Update `"version"` in `package.json` to the new version (without `v` prefix)
   - Run `npm run build` to verify the build passes
   - Run `npm test` to verify tests pass
   - Commit the version bump: `git commit -am "chore: bump version to <VERSION>"`
   - Push the commit: `git push origin main`

4. **Write release changelog**:
   - Carefully review ALL commits since the last release, reading diffs when needed to understand changes
   - Group changes into sections using this exact format:

   ```
   ## SyncLounge <VERSION>

   ### Changes
   * **Category/Area** — Description of the change in present tense. Include technical details
     where helpful (config keys in `backticks`, specific behavior). Reference commits or PRs
     where relevant ([`abc1234`](commit-url) or [#123](pr-url)).
   * **Another Area** — Another change description.

   ### Fixes
   * **Category/Area** — What was broken and how it was fixed. Be specific about the symptom
     and the resolution.

   ### Maintenance
   * **Category/Area** — Dependency updates, CI changes, cleanup, etc.
   ```

   - Each bullet uses `*` with **bold category prefix** followed by ` — ` (em dash) then description
   - Categories should be specific areas like: **UI/Mobile**, **Player**, **Server/Security**, **WebSocket**, **Docker**, **CI/CD**, etc.
   - Use `backticks` for code references: config keys, file names, function names, CLI flags
   - Reference PRs as `([#123](https://github.com/chrisae9/synclounge/pull/123))`
   - Reference commits as `([`abc1234`](https://github.com/chrisae9/synclounge/commit/abc1234))`
   - Keep each bullet to 1-3 sentences — concise but informative
   - Omit empty sections (if no fixes, skip the Fixes heading)
   - DO NOT mention specific AI tools or automated review processes in the changelog

5. **Create and push tag**:
   - Present the full changelog to the user for review before creating the tag
   - Once approved:
   ```bash
   git tag -a v<VERSION> -m "<FULL_CHANGELOG>"
   git push origin v<VERSION>
   ```
   - The tag message IS the release body — make it complete and well-formatted

6. **Verify release**:
   - Check the workflow started: `gh run list --repo chrisae9/synclounge --limit 3`
   - Once complete, verify the release: `gh release view v<VERSION> --repo chrisae9/synclounge`
   - Verify the Docker image: `docker pull ghcr.io/chrisae9/synclounge:<VERSION>`
   - Direct user to: https://github.com/chrisae9/synclounge/actions

## Notes
- Tags trigger the release workflow automatically
- Image is pushed to `ghcr.io/chrisae9/synclounge` with tags: `latest`, `x.y.z`, `x.y`, `x`
- Built for linux/amd64 and linux/arm64
- GitHub Release is created automatically from the tag annotation
- If the tag message only contains the version string, GitHub's auto-generated release notes are used as fallback
- ALWAYS update `package.json` version BEFORE tagging

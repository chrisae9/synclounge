# Release SyncLounge

Guide the user through creating a new release.

## Steps

1. **Check current state**:
   - Run `git tag --sort=-v:refname | head -5` to see recent tags
   - Run `git log --oneline $(git describe --tags --abbrev=0 2>/dev/null || echo HEAD~20)..HEAD` to see commits since last release

2. **Determine version**:
   - If no tags exist, suggest `v1.0.0` as the first release
   - Otherwise, ask user for bump type: patch (0.0.x), minor (0.x.0), or major (x.0.0)
   - Calculate the next version based on the latest tag

3. **Write release message**:
   - Review the commits since last release
   - Group changes into categories using this format:
     ```
     SyncLounge v<VERSION>

     ### Changes
     - Brief description of each feature or change, one bullet per item.
     - Use present tense ("Add X", "Update Y behavior").

     ### Fixes
     - Brief description of each bug fix.
     - Include what was broken and what the fix does.
     ```
   - Keep bullet points concise (1-2 sentences max)
   - Omit empty sections (if no fixes, skip the Fixes heading)

4. **Create and push tag**:
   ```bash
   git tag -a v<VERSION> -m "<RELEASE_MESSAGE>"
   git push origin v<VERSION>
   ```

5. **Monitor release**:
   - Direct user to: https://github.com/chrisae9/synclounge/actions
   - Once complete, verify at: https://github.com/chrisae9/synclounge/pkgs/container/synclounge

## Notes
- Tags trigger the release workflow automatically
- Image is pushed to `ghcr.io/chrisae9/synclounge` with tags: `latest`, `x.y.z`, `x.y`, `x`
- Built for linux/amd64 and linux/arm64
- GitHub Release is created automatically from the tag annotation

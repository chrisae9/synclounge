# Maintainers

| GitHub account | Role |
| --- | --- |
| [@chrisae9](https://github.com/chrisae9) | Owner, maintainer, and release manager |

## Merge and release policy

- Feature and fix pull requests target `dev` and require successful CI.
- Stable promotion pull requests originate from `dev` and target `main`.
- Review conversations and actionable automated findings must be resolved before merge.
- Direct pushes are reserved for emergency recovery through the repository-owner bypass.
- Releases use signed GitHub workflow provenance and must point to a commit contained in `main`.

The owner may self-merge because this is currently a single-maintainer project, but should preserve the pull-request review record and verification evidence. Adding another maintainer requires an update to this file and `.github/CODEOWNERS`.

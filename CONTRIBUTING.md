# Contributing

## Changelog

`CHANGELOG.md` has one `## X.Y.Z` entry per release, newest first. Group the
changes under `### Added`, `### Changed`, `### Deprecated`, `### Removed`, and
`### Fixed`. An entry that deprecates or removes something shows the migration
from the old call to the new one, as `AGENTS.md` requires. The entry becomes
the release's GitHub release notes, so write it for Tenants.

## Releasing

Pushing a `vX.Y.Z` tag is the whole release:

1. In a PR, bump `version` with `npm version X.Y.Z --no-git-tag-version` (it
   updates `package.json` and `package-lock.json`) and add a `## X.Y.Z` entry
   to `CHANGELOG.md`.
2. After it merges, tag the merge commit on `main` and push the tag:
   `git tag vX.Y.Z <merge-commit> && git push origin vX.Y.Z`.

`.github/workflows/publish.yml` then reruns CI and
`.github/scripts/release-check.sh`, which fails unless the tag matches the
`package.json` version and `CHANGELOG.md` has a non-empty `## X.Y.Z` entry. It
also fails when the tagged commit is not on `main`. Only after every check
passes does it publish `@blazingagents/sdk` to npm with trusted publishing
(skipped when npm already has the version) and create the GitHub release for
the tag, with the `CHANGELOG.md` entry as its notes. A tag with a prerelease
suffix, such as `v0.32.0-rc.1`, needs the same `package.json` version and
`CHANGELOG.md` entry, is not published to npm, and gets a GitHub prerelease.

The npm upload cannot be undone. If a check fails, nothing was published:
delete the tag (`git push origin :refs/tags/vX.Y.Z`), fix `main`, and tag
again. Rerunning a failed run is safe: a version npm already has and a GitHub
release that already exists are skipped, not recreated.

Before tagging, check a release without publishing anything: run the Publish
workflow from the Actions tab on `main` with the tag you are about to push
(`gh workflow run publish.yml -f tag=vX.Y.Z`). It runs CI and every check
except the one for `main`, and its summary shows what would be published and
the release notes. Locally, `.github/scripts/release-check.sh vX.Y.Z notes.md`
runs the same checks.

npm's trusted publisher for `@blazingagents/sdk` is bound to the workflow file
`publish.yml` and the `npm` environment. Renaming either breaks publishing
until the package settings on npmjs.com are updated to match.

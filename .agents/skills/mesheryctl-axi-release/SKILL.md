---
name: mesheryctl-axi-release
description: >-
  Cut (publish) a release of the mesheryctl-axi npm package by publishing the
  current Release Drafter draft. Use whenever asked to "cut a release",
  "release mesheryctl-axi", "publish the release", "ship a new version", or
  "release the latest merge". Confirms CI is green on master, waits for Release
  Drafter to fold the just-merged PR into the draft, publishes the draft as
  latest, then verifies that the "Publish Node.js Package" workflow built the
  package with tsc, published it to npm, and that the version is live on the
  registry. Release Drafter owns the tag and notes, so this skill never creates
  or bumps a tag and never runs npm publish by hand.
user-invocable: true
---

# Cut a mesheryctl-axi release

Adapted from the `cut-release` skills of `meshery/schemas` and `layer5io/sistent`.
Full reference: [`docs/release-procedure.md`](../../../docs/release-procedure.md).

Publishing a release here is a one-action step: **flip the existing Release Drafter
draft from draft to published.** Publishing the release *is* the npm publish.

- **Package:** `mesheryctl-axi` (unscoped, public), published with npm provenance.
- **Repository:** `meshery-extensions/mesheryctl-axi`, release branch `master`.
- **Workflows:**
  - [`node-checks.yml`](../../../.github/workflows/node-checks.yml) - build (`tsc`), tests, bin smoke-run, `npm pack` dry-run on every push to `master`.
  - [`release-drafter.yml`](../../../.github/workflows/release-drafter.yml) - maintains the draft release on every push to `master`; version from PR labels (`major` / `minor` / `patch`, default `patch`).
  - [`release.yml`](../../../.github/workflows/release.yml) ("Publish Node.js Package") - on `release: published`: stamps the version, `npm ci` → `npm run build` → `npm test` → `npm publish --provenance`, verifies the version on npm, opens and auto-merges the version-bump-back PR.

Do **not** create a tag, bump `package.json`, write release notes, or `npm publish` by hand.

## Steps

Set `R=meshery-extensions/mesheryctl-axi` for the commands below.

### 0. Preflight: npm Trusted Publisher (OIDC) is ready

Steady-state auth is **OIDC Trusted Publisher** (see `docs/release-procedure.md`), not a
long-lived `NPM_TOKEN`. Before publishing a draft:

1. Confirm the package exists on npm (`npm view mesheryctl-axi version`), **or** this is
   the documented one-time bootstrap and a maintainer is handling the short-lived token.
2. Confirm Trusted Publisher is configured: org `meshery-extensions`, repo
   `mesheryctl-axi`, workflow filename `release.yml`, environment empty, allow publish.
3. Do **not** expect `NPM_TOKEN` in `gh secret list` for steady-state releases.

If Trusted Publisher is missing and this is not a deliberate bootstrap, **stop** and ask
a maintainer — publishing the draft anyway burns the tag on a failed publish.

### 1. Confirm master is green

This package has no artifact-generation step (schemas waits for one here). The equivalent
gate is the `Node Checks` run for the current `master` head:

```bash
git fetch origin master --quiet && git rev-parse origin/master

gh run list -R "$R" --workflow node-checks.yml --branch master --limit 3 \
  --json databaseId,status,conclusion,headSha
```

The run whose `headSha` matches `origin/master` must be `completed` / `success`. If it is
still running, `gh run watch <databaseId> -R "$R" --exit-status`. If it failed, stop and
surface it - do not release a red `master`. (Docs-only pushes skip `Node Checks`; then use
the newest run for an earlier code-bearing commit.)

### 2. Confirm Release Drafter has caught up

The draft only includes a PR after the drafter run for that merge commit completes:

```bash
gh run list -R "$R" --workflow release-drafter.yml --branch master --limit 3 \
  --json databaseId,status,conclusion,headSha
```

Wait for the run whose `headSha` matches `origin/master` to succeed. If it failed, stop.

### 3. Identify and inspect the draft

```bash
gh release list -R "$R" --limit 25 --json tagName,isDraft \
  --jq '.[] | select(.isDraft) | .tagName'

gh release view <draftTag> -R "$R" --json tagName,name,isDraft,body
```

- Exactly one draft is expected. Zero drafts: no drafter run since the last release.
  More than one: stop and ask which to publish.
- The merged PR being released must appear in the notes. If not, go back to step 2.
- Check the version bump is intended. It comes from the merged PRs' labels; mesheryctl-axi
  is pre-1.0, so a breaking change to the agent-facing output contract is labelled `minor`.
  If it is wrong, relabel the PR and re-draft - never hand-edit the tag:
  ```bash
  gh workflow run release-drafter.yml -R "$R" --ref master
  ```

### 4. Publish the draft

```bash
gh release edit <draftTag> -R "$R" --draft=false --latest
```

This fires `release: published`, which runs `release.yml`.

### 5. Watch the publish workflow

```bash
gh run list -R "$R" --workflow release.yml --limit 1 --json databaseId,status,conclusion
gh run watch <databaseId> -R "$R" --exit-status
```

If it fails at `Publish Package`, read the npm error (OIDC / Trusted Publisher
misconfiguration, provenance, name ownership) and escalate - do not retry by publishing
locally, and do not reintroduce a long-lived `NPM_TOKEN` as the steady-state fix.

### 6. Verify at the registry, not the release page

```bash
npm view mesheryctl-axi dist-tags time --json   # latest must be the new version
npx -y mesheryctl-axi@<version> --version       # the published bin runs
```

### 7. Confirm the version-bump-back PR

`release.yml` opens `release/version-bump/v<version>` and tries to auto-merge it. Confirm it
merged (or is a no-op because `package.json` already matched). If it is still open, merge it.

Report the published version, the release URL, and the npm verification output.

## What to watch for

- **Don't publish ahead of the drafter run** - the notes would omit the change being released.
- **The release *is* the npm publish.** npm versions are permanent; treat publishing as production.
- **Never hand-author the tag or notes.** If you are computing a version number, something is wrong.
- **Restricted sessions.** Publishing is outward-facing and irreversible. If your session is not
  permitted to publish releases, hand step 4 to a maintainer with release rights.
- **Do not reintroduce `NPM_TOKEN` as the steady-state path.** OIDC Trusted Publisher is primary after bootstrap.

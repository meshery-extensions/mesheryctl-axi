# Release Procedure

How `mesheryctl-axi` is versioned, released, and published to npm. The flow is
copied from [`layer5io/sistent`](https://github.com/layer5io/sistent) (label-driven
Release Drafter + "Publish Node.js Package" workflow) with the install/publish
split from [`meshery/schemas`](https://github.com/meshery/schemas).

**Agents: use the [`mesheryctl-axi-release`](../.agents/skills/mesheryctl-axi-release/SKILL.md)
skill** to cut a release. It walks the whole procedure with its safeguards.

**Do not create releases by hand.** No `gh release create`, no local `npm publish`,
no `npm version`, no hand-written release notes, no hand-made tags.

## The release chain

1. **A PR merges to `master`.** [`release-drafter.yml`](../.github/workflows/release-drafter.yml)
   runs and updates the single **draft** GitHub Release: it folds the PR into the
   notes and computes the next version from the PR's labels (see [Versioning](#versioning)).
2. **A maintainer publishes the draft** (`gh release edit <tag> --draft=false --latest`).
   The tag, for example `v0.1.0`, becomes the version source of truth.
3. **Publishing fires `release: published`** and
   [`release.yml`](../.github/workflows/release.yml) ("Publish Node.js Package"):
   - fails fast with a clear error if the `NPM_TOKEN` secret is missing,
   - stamps the tag's version into `package.json` (`npm version --no-git-tag-version`),
   - `npm ci`, `npm run build` (`tsc`), `npm test`,
   - `npm publish --provenance --access public`,
   - polls the npm registry until `mesheryctl-axi@<version>` is visible,
   - opens (and tries to auto-merge) a `release/version-bump/v<version>` PR so
     `master`'s `package.json` / `package-lock.json` track the published version.

[`node-checks.yml`](../.github/workflows/node-checks.yml) builds, tests, smoke-runs the
bin, and dry-runs `npm pack` on every PR and every push to `master`, so a release only
ships code that already passed CI.

## One-time setup (maintainer with admin rights)

These steps need a human with npm and repository admin access. Until the first one is
done, publishing a release fails at the `Require NPM_TOKEN` step by design. Tracked in
[#4](https://github.com/meshery-extensions/mesheryctl-axi/issues/4).

1. **`NPM_TOKEN` repository secret (required).** Create an npm token that can publish
   the unscoped package `mesheryctl-axi`, owned by the npm account that should own the
   package (the Meshery/Layer5 npm org account is preferred over a personal one):
   - an npm **granular access token** with _Read and write_ permission (for the very
     first publish the package does not exist yet, so the token must be allowed to
     publish new packages for that account), or a classic **Automation** token.
   - Store it: `gh secret set NPM_TOKEN -R meshery-extensions/mesheryctl-axi`
     (or Settings → Secrets and variables → Actions → New repository secret).
2. **`GH_ACCESS_TOKEN` (optional).** Only needed once `master` is branch-protected:
   the version-bump-back PR is merged with `gh pr merge --admin`, which the default
   `GITHUB_TOKEN` cannot do under protection. Without it the bump PR is simply left
   open for a maintainer to merge.
3. **Actions may create pull requests.** Settings → Actions → General → "Allow GitHub
   Actions to create and approve pull requests" must stay enabled for the bump-back PR.

### After the first successful publish

1. Add the Meshery maintainers as npm owners of `mesheryctl-axi` so publishing does not
   depend on a single account: `npm owner add <npm-user> mesheryctl-axi`.
2. Configure **npm trusted publishing (OIDC)**, which is how `meshery/schemas` and
   `layer5io/sistent` publish today: npmjs.com → `mesheryctl-axi` → Settings →
   Trusted Publisher → GitHub Actions, organization `meshery-extensions`, repository
   `mesheryctl-axi`, workflow `release.yml`. npm >= 11.5 prefers OIDC when a trusted
   publisher is configured and falls back to `NODE_AUTH_TOKEN`, so `release.yml` keeps
   working unchanged. Once OIDC is verified, the `NPM_TOKEN` secret and the
   `Require NPM_TOKEN` gate can be removed.

## Versioning

Semantic versioning, driven entirely by the labels on merged PRs
([`.github/release-drafter.yml`](../.github/release-drafter.yml) owns the mapping):

| PR label                    | Bump                |
| --------------------------- | ------------------- |
| `major`                     | MAJOR               |
| `minor`                     | MINOR               |
| `patch` or no version label | PATCH (the default) |

- With no previous release, Release Drafter drafts **`v0.1.0`**, matching the initial
  `package.json` version.
- **Pre-1.0 rule (from sistent):** a breaking change to the agent-facing contract -
  renamed or removed TOON fields, changed error codes or exit codes, removed commands or
  flags - is a **`minor`**, not a `major`. `major` would assert 1.0 stability. The label
  is the only signal that moves the version, so an unlabelled breaking PR ships as a patch.
- A mislabelled release is corrected by relabelling the merged PR and re-running
  Release Drafter (`gh workflow run release-drafter.yml -R meshery-extensions/mesheryctl-axi --ref master`).
  Relabelling alone does not re-draft.

## Verifying a release

A published GitHub Release does not prove the package reached npm. Verify at the registry:

```bash
npm view mesheryctl-axi dist-tags time --json   # what is actually released, and when
npx -y mesheryctl-axi@<version> --version       # the published bin runs
```

## What NOT to do

- ❌ Do NOT `npm publish` or `npm version` locally; `release.yml` owns publishing (with provenance).
- ❌ Do NOT create tags or releases by hand, or edit the draft's version or notes; fix PR labels instead.
- ❌ Do NOT publish a draft before the Release Drafter run for the current `master` head has finished.
- ❌ Do NOT republish an existing npm version; npm versions are permanent. Cut a new patch instead.

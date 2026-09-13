<p align="center"><a href="https://meshery.io"><picture>
 <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/meshery/meshery/master/.github/assets/images/readme/meshery-logo-light-text-side.svg">
 <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/meshery/meshery/master/.github/assets/images/readme/meshery-logo-dark-text-side.svg">
<img src="https://raw.githubusercontent.com/meshery/meshery/master/.github/assets/images/readme/meshery-logo-dark-text-side.svg"
alt="Meshery Logo" width="50%" /></picture></a></p>

<p align="center">
<a href="https://www.npmjs.com/package/mesheryctl-axi" alt="npm version">
  <img src="https://img.shields.io/npm/v/mesheryctl-axi?color=informational" /></a>
<a href="https://github.com/meshery-extensions/mesheryctl-axi/actions/workflows/node-checks.yml" alt="Node Checks">
  <img src="https://img.shields.io/github/actions/workflow/status/meshery-extensions/mesheryctl-axi/node-checks.yml?branch=master&label=node%20checks" /></a>
<a href="https://github.com/meshery-extensions/mesheryctl-axi/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22help%20wanted%22" alt="Help wanted">
  <img src="https://img.shields.io/github/issues/meshery-extensions/mesheryctl-axi/help%20wanted?color=informational" /></a>
<a href="LICENSE" alt="LICENSE">
  <img src="https://img.shields.io/github/license/meshery-extensions/mesheryctl-axi?color=brightgreen" /></a>
<a href="https://slack.meshery.io" alt="Join Slack">
  <img src="https://img.shields.io/badge/Slack-@meshery.svg?logo=slack" /></a>
</p>

# mesheryctl-axi

Agent-ergonomic [AXI](https://axi.md/) wrapper around [`mesheryctl`](https://docs.meshery.io/reference/mesheryctl). Prefer this over raw `mesheryctl` for agent workflows: token-efficient **TOON** list/view reporting, definitive empty states, structured errors, `help[]` next-step suggestions, and always-non-interactive execution.

It follows the [`gh-axi`](https://github.com/kunchenguid/gh-axi) pattern: it wraps the human CLI instead of changing it. Design and scope: [meshery/meshery#20979](https://github.com/meshery/meshery/issues/20979).

```bash
npx -y mesheryctl-axi
```

## Project status

**Pre-release (v0.x).** The package structure, error contract, TOON rendering, and release pipeline are in place. Some v1 commands still depend on `mesheryctl` output that does not exist yet (for example, JSON output from `mesheryctl <resource> list`). [#12](https://github.com/meshery-extensions/mesheryctl-axi/issues/12) tracks everything left before the first npm release. Issues labelled [`good first issue`](https://github.com/meshery-extensions/mesheryctl-axi/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22good%20first%20issue%22) are a good place to start.

## Prerequisites

- **Node.js >= 22**
- **`mesheryctl` installed and authenticated.** This package spawns `mesheryctl`; it does not embed Meshery.
  - Install: https://docs.meshery.io/installation
  - Override the binary: `MESHERYCTL_BIN=/path/to/mesheryctl`

## Quick start

```bash
# Content-first home: description, bin path, best-effort system status/context
npx -y mesheryctl-axi

# TOON list/view reporting
npx -y mesheryctl-axi connection list
npx -y mesheryctl-axi system status
npx -y mesheryctl-axi system context
npx -y mesheryctl-axi design list
npx -y mesheryctl-axi model list
npx -y mesheryctl-axi component list

# Schema-faithful content retrieve (YAML/JSON - never TOON-as-content)
npx -y mesheryctl-axi design content <name> --format yaml
npx -y mesheryctl-axi model content <name> --format json
```

## Design notes

| Concern                    | Behavior                                        |
| -------------------------- | ----------------------------------------------- |
| List / view metadata       | TOON                                            |
| Design / model **content** | Raw YAML or JSON only                           |
| Unknown flags              | Non-zero exit + structured TOON error           |
| Empty results              | Definitive empty states (e.g. `connections: 0`) |
| Success                    | Includes `help[]` suggestions                   |
| Interactivity              | Always non-interactive (no TTY prompts)         |

## Commands (v1)

```
mesheryctl-axi                        # home
mesheryctl-axi connection list|view
mesheryctl-axi system status|context
mesheryctl-axi design list|view|content
mesheryctl-axi model list|view|content
mesheryctl-axi component list|view
```

## Development

```bash
make setup    # npm ci
make build    # tsc -> dist/
make tests    # vitest
make dev ARGS="connection list"   # run from source
```

CI ([`node-checks.yml`](.github/workflows/node-checks.yml)) builds, tests, smoke-runs the built bin, and dry-runs `npm pack` on Node.js 22 and 24.

## Releasing

Releases are automation-driven: merged PRs update a Release Drafter draft, and publishing that draft publishes `mesheryctl-axi` to npm. Never `npm publish` by hand. See [`docs/release-procedure.md`](docs/release-procedure.md); agents use the [`mesheryctl-axi-release`](.agents/skills/mesheryctl-axi-release/SKILL.md) skill.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md), and sign off your commits ([DCO](https://docs.meshery.io/project/contributing#signing-off-on-commits-developer-certificate-of-origin)). New to Meshery? Start with the [Newcomers' Guide](https://layer5.io/community/newcomers) and say hello in the [community Slack](https://slack.meshery.io).

Security issues: see [SECURITY.md](SECURITY.md).

## License

[Apache-2.0](LICENSE)

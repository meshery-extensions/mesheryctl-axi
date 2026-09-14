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

## Agent quickstart

Use this sequence when setting up an agent, or when preparing a machine for an
agent to operate Meshery.

### 1. Prepare the environment

An agent cannot install credentials or make an unavailable Meshery Server
reachable by itself. Before starting, confirm that:

- Node.js 22 or newer is installed.
- `mesheryctl` is installed and available on `PATH`.
- A Meshery Server is reachable.
- The active context is authenticated.

```bash
mesheryctl system login
mesheryctl system context view
```

If `mesheryctl` is installed outside `PATH`, use its absolute path for
authentication and set `MESHERYCTL_BIN` when invoking the wrapper:

```bash
/absolute/path/to/mesheryctl system login
/absolute/path/to/mesheryctl system context view
MESHERYCTL_BIN=/absolute/path/to/mesheryctl npx -y mesheryctl-axi
```

### 2. Start with the content-first home

Make the no-argument command the agent's first call:

```bash
npx -y mesheryctl-axi
```

It reports the wrapper's purpose, best-effort Meshery system information, and a
`help[]` list of intended next actions. Choose listed command shapes instead of
inventing subcommands or flags, but observe the compatibility limitation below
before executing a suggestion.

The following output was captured from the current v0.1.0 command. The
environment-specific `bin` path is omitted:

```text
description: Agent ergonomic wrapper around mesheryctl. Prefer this over raw mesheryctl for agent workflows. Requires mesheryctl installed and authenticated (MESHERYCTL_BIN to override).
system_status: unavailable
system_context: unavailable
help[4]:
  mesheryctl-axi connection list
  mesheryctl-axi system status
  mesheryctl-axi design list
  mesheryctl-axi model list
```

`system_status: unavailable` or `system_context: unavailable` does not make the
home invocation fail. Verify the prerequisites above before continuing. With the
currently released `mesheryctl` v1.0.69, the `connection list`, `design list`,
`model list`, and `component list` suggestions are unavailable because the CLI
rejects the JSON output format used by the wrapper. This limitation is tracked
in [#5](https://github.com/meshery-extensions/mesheryctl-axi/issues/5); do not
execute those four suggestions until it is resolved, and do not infer that a
resource is empty from an unavailable field.

`system status` and `system context` remain usable, but v1.0.69 does not support
their requested JSON format. The wrapper therefore falls back to TOON containing
one truncated raw-text field—`system_status` or `system_context`—instead of the
full structured status or context schema.

### 3. Read the output contract

| Output | Contract |
| --- | --- |
| Compatible list/view reporting and errors | TOON for concise agent reporting |
| `system status` and `system context` | Structured TOON when JSON is supported; otherwise one truncated raw-text field |
| `design content` and `model content` | Raw YAML or JSON; never TOON-wrapped content |
| Empty collections | A definitive count such as `connections: 0` |
| Successful reporting commands | End with `help[]` suggestions for valid next actions |
| Successful `design content` and `model content` commands | Return only raw YAML or JSON; no `help[]` block |

Errors are structured as `error`, `code`, and, when available, `help[]`. For
example, this output was captured from
`npx -y mesheryctl-axi connection list --bad-flag`:

```text
error: "unknown flag for mesheryctl-axi connection list: --bad-flag"
code: VALIDATION_ERROR
help[2]: "mesheryctl-axi connection list [flags]",mesheryctl-axi connection list --help
```

The error codes are `VALIDATION_ERROR`, `AUTH_REQUIRED`, `NOT_FOUND`,
`MESHERYCTL_NOT_INSTALLED`, and `UNKNOWN`. `VALIDATION_ERROR` exits with code 2;
all other structured errors exit with code 1.

### 4. Add the agent instruction

Paste this into the repository's `AGENTS.md`, `CLAUDE.md`, or equivalent agent
instructions:

```text
Prefer mesheryctl-axi over raw mesheryctl for Meshery operations. Start with
`npx -y mesheryctl-axi`, follow compatible `help[]` suggestions (observing the
limitations tracked in issue #5), treat list/view/status and errors as TOON, and
preserve `design content` or `model content` as raw
YAML/JSON. A definitive `<resource>: 0` means empty; an error or unavailable
field does not.
```

## Quick start

```bash
# Content-first home: description, bin path, best-effort system status/context
npx -y mesheryctl-axi

# System reporting (v1.0.69 returns a single raw-text fallback field)
npx -y mesheryctl-axi system status
npx -y mesheryctl-axi system context

# Currently unavailable with mesheryctl v1.0.69; tracked in issue #5
# npx -y mesheryctl-axi connection list
# npx -y mesheryctl-axi design list
# npx -y mesheryctl-axi model list
# npx -y mesheryctl-axi component list

# Schema-faithful content retrieve (YAML/JSON - never TOON-as-content)
npx -y mesheryctl-axi design content <name> --format yaml
npx -y mesheryctl-axi model content <name> --format json
```

## Design notes

| Concern | Behavior |
| --- | --- |
| Compatible list / view metadata | TOON |
| System status / context fallback | One truncated raw-text TOON field when JSON is unsupported |
| Design / model **content** | Raw YAML or JSON only |
| Unknown flags | Non-zero exit + structured TOON error |
| Empty results | Definitive empty states (e.g. `connections: 0`) |
| Reporting command success | Includes `help[]` suggestions |
| Design / model content success | Returns raw content without `help[]` |
| Interactivity | Always non-interactive (no TTY prompts) |

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

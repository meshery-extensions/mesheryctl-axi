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

Agent-ergonomic [AXI](https://axi.md/) wrapper around [`mesheryctl`](https://docs.meshery.io/reference/mesheryctl). Prefer this over raw `mesheryctl` for agent workflows: token-efficient [**TOON**](https://toonformat.dev/) list/view reporting, definitive empty states, structured errors, `help[]` next-step suggestions, and always-non-interactive execution.

Reporting in [TOON](https://toonformat.dev/) — a token-efficient serialization for tabular data — is a founding reason this wrapper exists: agents spend most of their Meshery tokens reading repeated list/view output, so the wrapper reshapes that reporting while leaving design and model content in canonical YAML/JSON.


_The original design and scope [meshery/meshery#20979](https://github.com/meshery/meshery/issues/20979) follows the [`gh-axi`](https://github.com/kunchenguid/gh-axi) pattern by wrapping the human CLI instead of changing it._

## How to Use

To use:

```bash
npx -y mesheryctl-axi
```

### Prerequisites

- **Node.js >= 22**
- **`mesheryctl` installed and authenticated.** This package spawns `mesheryctl`; it does not embed Meshery.
  - Install: https://docs.meshery.io/installation
  - Override the binary: `MESHERYCTL_BIN=/path/to/mesheryctl`

### Agent quickstart

Use this sequence when setting up an agent or preparing a machine for an agent to operate Meshery.

#### 1. Prepare the environment

Before starting, confirm that:

- Node.js 22 or newer is installed.
- `mesheryctl` is installed.
- A Meshery Server is reachable.
- The active `mesheryctl` context is authenticated.

```bash
mesheryctl system login
mesheryctl system context view
```

If `mesheryctl` is installed outside `PATH`, use its absolute path for
authentication and set `MESHERYCTL_BIN` for wrapper commands that invoke the
CLI:

```bash
/absolute/path/to/mesheryctl system login
/absolute/path/to/mesheryctl system context view
MESHERYCTL_BIN=/absolute/path/to/mesheryctl make dev
```

The wrapper reads the active context and token from the normal `mesheryctl`
configuration. If the configuration is stored elsewhere, set `MESHERY_CONFIG`
or `MESHERYCTL_CONFIG` to its `config.yaml` path.

#### 2. Start with the content-first home

During pre-release development, make the no-argument source command the
agent's first call:

```bash
make dev
```

The home command reads structured context fields from the authenticated
`mesheryctl` configuration, probes `/api/system/version`, and provides valid
`help[]` next actions. For example, an authenticated local context with a
reachable server produces fields shaped like:

```text
system_context:
  name: local
  endpoint: http://127.0.0.1:9081
  token: default
  platform: docker
system_status:
  status: running
  version: v0.8.0
  platform: docker
  provider: Meshery
  endpoint: http://127.0.0.1:9081
help[4]:
  mesheryctl-axi connection list
  mesheryctl-axi system status
  mesheryctl-axi design list
  mesheryctl-axi model list
```

Values depend on the active context and server. The `token` field is the token
name from the configuration, never the token value. Without usable
authentication, `system_context` is `unavailable`; when the configured server
cannot be reached, `system_status` is `unreachable`.

`system status` returns the same structured status schema followed by a
suggestion for `system context`. `system context` reads the active context
directly and returns `name`, `endpoint`, `token`, `platform`, and `channel`
fields followed by a suggestion for `system status`.

#### 3. Use reporting and content commands correctly

List commands query the Meshery Server API using the endpoint and token from the
active context. They do not scrape tables or pass unsupported JSON flags to
`mesheryctl`:

```bash
make dev ARGS="connection list"
make dev ARGS="design list"
make dev ARGS="model list"
make dev ARGS="component list"
```

A successful empty collection is definitive, for example `connections: 0`.
Authentication, reachability, and server errors remain structured errors and
must not be interpreted as empty results.

| Output | Contract |
| --- | --- |
| List, view, system, and error reporting | [TOON](https://toonformat.dev/) for concise agent use |
| `design content` and `model content` | Raw YAML or JSON; never [TOON](https://toonformat.dev/)-wrapped content |
| Empty collections | A definitive count such as `connections: 0` |
| Successful reporting commands | End with contextual `help[]` suggestions |
| Successful content commands | Return only raw YAML or JSON, without `help[]` |

Errors contain `error`, `code`, and, when available, `help[]`. The error codes
are `VALIDATION_ERROR`, `AUTH_REQUIRED`, `NOT_FOUND`,
`MESHERYCTL_NOT_INSTALLED`, `MESHERYCTL_INCOMPATIBLE`, and `UNKNOWN`.
`VALIDATION_ERROR` exits with code 2; other structured errors exit with code 1.

#### 4. Add the agent instruction

Paste this into the repository's `AGENTS.md`, `CLAUDE.md`, or equivalent agent
instructions:

```text
Prefer mesheryctl-axi over raw mesheryctl for Meshery operations. During
pre-release development, run it from the source checkout with `make dev` and
pass subcommands through `ARGS`, then follow its `help[]` suggestions. Treat
list, view, system, and error output as TOON; preserve `design content` and
`model content` as raw YAML or JSON. A definitive `<resource>: 0` means
empty; an error or unavailable field does not.
```

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md), and sign off your commits ([DCO](https://docs.meshery.io/project/contributing#signing-off-on-commits-developer-certificate-of-origin)). New to Meshery? Start with the [Newcomers' Guide](https://layer5.io/community/newcomers) and say hello in the [community Slack](https://slack.meshery.io).

List commands use the authenticated Meshery Server API while `mesheryctl` list output remains human-oriented; view and content commands continue to use the CLI's supported structured output. [#12](https://github.com/meshery-extensions/mesheryctl-axi/issues/12) tracks everything left before the first npm release. Issues labelled [`good first issue`](https://github.com/meshery-extensions/mesheryctl-axi/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22good%20first%20issue%22) are a good place to start.

Run these commands from the source checkout during pre-release development:

```bash
# Content-first home: description, bin path, best-effort system status/context
make dev

# TOON (https://toonformat.dev/) list/view reporting
make dev ARGS="connection list"
make dev ARGS="system status"
make dev ARGS="system context"
make dev ARGS="design list"
make dev ARGS="model list"
make dev ARGS="component list"

# Schema-faithful content retrieval (YAML/JSON - never TOON-as-content; see https://toonformat.dev/)
make dev ARGS="design content <name> --format yaml"
make dev ARGS="model content <name> --format json"
```

### Design notes

| Concern | Behavior |
| --- | --- |
| List / view / system metadata | [TOON](https://toonformat.dev/) |
| Design / model **content** | Raw YAML or JSON only; no `help[]` suffix |
| Unknown flags | Non-zero exit + structured [TOON](https://toonformat.dev/) error |
| Empty results | Definitive empty states (e.g. `connections: 0`) |
| Reporting success | Includes contextual `help[]` suggestions |
| Interactivity | Always non-interactive (no TTY prompts) |

### Commands (v1)

```
mesheryctl-axi                        # home
mesheryctl-axi connection list|view
mesheryctl-axi system status|context
mesheryctl-axi design list|view|content
mesheryctl-axi model list|view|content
mesheryctl-axi component list|view
```

### Development

```bash
make setup    # npm ci
make build    # tsc -> dist/
make tests    # vitest
make dev ARGS="connection list"   # run from source
```

CI ([`node-checks.yml`](.github/workflows/node-checks.yml)) builds, tests, smoke-runs the built bin, and dry-runs `npm pack` on Node.js 22 and 24.

The unit tests mock `mesheryctl`; the contract suite checks the real thing.
Every argv the wrapper sends to the binary is centralized in argv builders
(`*ViewArgv` in `src/commands/`) and enumerated in `src/contract.ts`, and
[`mesheryctl-contract.yml`](.github/workflows/mesheryctl-contract.yml) installs
the latest `mesheryctl` release and asserts each subcommand exists and accepts
its flags — on every PR and weekly. Run it locally with a real binary:

```bash
MESHERYCTL_BIN=/path/to/mesheryctl MESHERYCTL_CONTRACT=1 npm run test -- test/contract
```

### Releasing

Releases are automation-driven: merged PRs update a Release Drafter draft, and publishing that draft publishes `mesheryctl-axi` to npm. Never `npm publish` by hand. See [`docs/release-procedure.md`](docs/release-procedure.md); agents use the [`mesheryctl-axi-release`](.agents/skills/mesheryctl-axi-release/SKILL.md) skill.

Package locations:

- [npm package page](https://www.npmjs.com/package/mesheryctl-axi)
- [npm registry metadata](https://registry.npmjs.org/mesheryctl-axi)

### Security

Vulnerability reporting: see [SECURITY.md](SECURITY.md).

## License

[Apache-2.0](LICENSE)

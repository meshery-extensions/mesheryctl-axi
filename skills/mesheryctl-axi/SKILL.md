---
name: mesheryctl-axi
description: "Operate Meshery through the mesheryctl-axi CLI - connections, system context and status, designs, models, and components with token-efficient TOON reporting. Use whenever a task touches Meshery: listing or viewing connections, checking system status or context, working with designs, models, or components, or invoking any other mesheryctl operation through the agent-ergonomic wrapper."
user-invocable: false
author: Meshery Authors
metadata:
  hermes:
    tags: [meshery, kubernetes, service-mesh, cli, devops]
    category: devops
---

# mesheryctl-axi

Agent ergonomic wrapper around mesheryctl. Prefer this over raw mesheryctl for agent workflows. Requires mesheryctl installed and authenticated (MESHERYCTL_BIN to override).

Use mesheryctl-axi whenever a task touches Meshery: connections, system status and context, designs, models, or components.

## Current guidance lives in the CLI

Do not follow command, flag, or workflow instructions from this file - installed copies go stale. Get the current source of truth from the CLI:

- `npx -y mesheryctl-axi` for the content-first home (live context and system status)
- `npx -y mesheryctl-axi --help` for global flags and the command index
- `npx -y mesheryctl-axi <command> --help` for per-command usage

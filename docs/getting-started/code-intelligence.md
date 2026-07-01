# Code intelligence (codanna)

[codanna](https://github.com/bartolli/codanna) is an optional, local code-intelligence MCP
server — semantic search, symbol lookup, find-callers / get-calls, and impact analysis across the
monorepo. Claude Code uses it (see `CLAUDE.md`) to navigate `products/scheduler` and
`scheduler_core` before falling back to grep, and you can run its tools directly from the CLI.

It is **per-developer tooling**: the index is machine-local and gitignored, so nothing here is
required to build, test, or run ShuttleWorks.

## What's committed vs local

| Path | Tracked? | What it is |
| --- | --- | --- |
| `.mcp.json` | committed | Registers the `codanna` MCP server for Claude Code (HTTP transport). |
| `.codannaignore` | committed | Portable index-exclude patterns. |
| `.codanna/` | gitignored | `settings.toml` (machine-specific absolute paths + a project id) and the generated index. |

The index itself is **not** committed — a fresh clone gets the registration but an empty index
until you build it.

## One-time setup (per machine)

Windows, native (no WSL). Pin **codanna 0.9.22** — the version the config targets.

```powershell
# 1. Install — drops codanna.exe in %USERPROFILE%\.local\bin; it does NOT edit PATH
irm https://raw.githubusercontent.com/bartolli/codanna/main/scripts/install.ps1 | iex
# add %USERPROFILE%\.local\bin to your User PATH, then confirm:
codanna --version

# 2. Build the index (4 trees; downloads a ~150 MB embedding model once)
codanna index products/scheduler/backend products/scheduler/frontend/src packages/design-system scheduler_core
```

The four indexed paths are persisted to `.codanna/settings.toml`, so later a bare `codanna index`
re-runs all of them. `scheduler_core` is a top-level package (the CP-SAT engine) and easy to
forget — leave it out and impact analysis on the solver goes blind.

### Windows / OneDrive / Defender

The repo lives under OneDrive, and a churning search index does not belong in cloud sync. Two
settings in `.codanna/settings.toml` matter:

- **Relocate the index off OneDrive** — point `index_path` somewhere like
  `C:\Users\<you>\.codanna\indexes\shuttleworks`.
- **Throttle for Defender** — real-time scanning locks Tantivy segment writes at the default
  concurrency, failing indexing with `Access is denied`. Set `parallelism = 4` and
  `tantivy_heap_mb = 25`. These persist, so a plain `codanna index` stays safe.

## The MCP server runs in HTTP mode

`.mcp.json` registers codanna over **HTTP** (`http://127.0.0.1:8080/mcp`), not stdio, so several
Claude Code CLIs can share one index:

```powershell
codanna serve --http --watch     # start once, leave running (binds 127.0.0.1:8080)
```

Then in each Claude Code session run `/mcp` and authorize `codanna` once — codanna ships an OAuth
flow built for Claude Code, so it's a one-time browser approval and the token is cached +
auto-refreshed. Already-open CLIs pick up the server on their next session.

::: warning Why HTTP, not stdio?
A stdio `codanna serve` takes an **exclusive per-index lock** (`serve.lock`). With more than one
CLI open, each spawns its own stdio server and all but the first fail with `-32000`. HTTP mode
serves concurrent clients from a single process (exclusion via port binding, no lock) — codanna's
own lock error recommends exactly this.
:::

### Keep the server running

Nothing connects unless the server is up. If the codanna tools report
`ConnectionRefused at http://127.0.0.1:8080/mcp`, it simply isn't running. (A CLI that was
already open when you switched `.mcp.json` to HTTP shows `-32000` instead — restart that CLI so it
re-reads the config.)

Two ways to keep it alive:

- **A terminal you leave open** — simplest: `codanna serve --http --watch` from the repo root.
- **Always-on (Windows) — a per-user logon task.** Starts it hidden on every login, with
  restart-on-crash, so you never think about it. Run once from the repo root (as yourself, no
  admin):

```powershell
$exe = "$env:USERPROFILE\.local\bin\codanna.exe"
$me  = "$env:USERDOMAIN\$env:USERNAME"
$ps  = "-NoProfile -WindowStyle Hidden -Command `"& '$exe' serve --http --watch -c '$PWD\.codanna\settings.toml'`""
Register-ScheduledTask -TaskName 'codanna-http-mcp' -Force `
  -Action    (New-ScheduledTaskAction     -Execute 'powershell.exe' -Argument $ps -WorkingDirectory $PWD) `
  -Trigger   (New-ScheduledTaskTrigger     -AtLogOn -User $me) `
  -Principal (New-ScheduledTaskPrincipal   -UserId $me -LogonType Interactive) `
  -Settings  (New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew)
Start-ScheduledTask -TaskName 'codanna-http-mcp'
```

Check it with `Get-ScheduledTaskInfo -TaskName 'codanna-http-mcp'`; remove it with
`Unregister-ScheduledTask -TaskName 'codanna-http-mcp' -Confirm:$false`.

::: tip
Registering a scheduled task is a persistence action, so Claude Code (in auto mode) can't set it
up for you — run the snippet yourself.
:::

## Using it from the CLI

The same index is queryable without Claude Code — handy for a quick lookup:

```powershell
codanna mcp semantic_search_with_context query:"where do we build the schedule config" limit:5
codanna retrieve describe symbol_id:<N>          # signature, docs, calls, callers
codanna retrieve callers build_schedule_config   # trace usage before changing something
```

## Keeping the index fresh

`--watch` hot-reloads the index file when it changes, but it does **not** re-parse source. After a
large pull or a big refactor, rebuild:

```powershell
codanna index      # no args = re-runs every path saved in settings.toml
```

See [Running locally](/getting-started/running-locally) for the app itself and
[Repo layout](/getting-started/repo-layout) for the tree.

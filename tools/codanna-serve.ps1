<#
.SYNOPSIS
  Keep codanna's HTTP MCP server up for concurrent Claude Code CLIs - self-healing.

.DESCRIPTION
  Runs `codanna serve --http --watch` in a restart loop: if codanna exits for any
  reason (crash, index-reload hiccup) it comes back in a couple seconds, so the
  server on http://127.0.0.1:8080/mcp is effectively always up. Leave this
  terminal open; Ctrl+C stops it cleanly.

  This is the SIMPLE always-on option. The fully hands-off alternative (survives
  terminal closure, auto-starts at logon) is the `codanna-http-mcp` Scheduled Task
  documented in docs/getting-started/code-intelligence.md.

  Note: codanna keeps its OAuth keys in memory, so each restart invalidates a
  cached token - expect to re-auth via `/mcp` after a restart. This loop only
  keeps the server *available*; it does not change that (the 0.9.22 floor).

.EXAMPLE
  .\scripts\codanna-serve.ps1
#>

$ErrorActionPreference = 'Continue'

# Config path is resolved relative to THIS script, so it works from any cwd and
# for any user (no hardcoded home path).
$cfg = (Resolve-Path (Join-Path $PSScriptRoot '..\.codanna\settings.toml')).Path

Write-Host "codanna: serving http://127.0.0.1:8080/mcp"
Write-Host "codanna: config $cfg"
Write-Host "codanna: auto-restarts on exit. Ctrl+C to stop." -ForegroundColor DarkGray

while ($true) {
    codanna serve --http --watch -c $cfg
    $code = $LASTEXITCODE

    # Windows console Ctrl+C surfaces as 0xC000013A (-1073741510). Exit cleanly on
    # that instead of restarting, so Ctrl+C actually stops the loop.
    if ($code -eq -1073741510) { break }

    Write-Warning "codanna exited (code $code) - restarting in 2s..."
    Start-Sleep -Seconds 2
}

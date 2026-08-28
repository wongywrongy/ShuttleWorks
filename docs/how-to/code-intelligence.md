# Code intelligence (Zed)

Zed's project search and language-server integration provide the code navigation
needed for ShuttleWorks without a repository-specific index, background process,
or MCP registration. The repository does not require editor-specific setup to
build, test, or run.

## Open the project

Open the repository root as a Zed project. Zed detects the JavaScript/TypeScript and Python
workspaces and starts the available language servers. Keep the repository's
usual dependencies installed so language-server results include the workspace
packages and their types.

## Find code quickly

- Use Project Search (`Cmd/Ctrl-Shift-F`) for a concept, route, type, or exact
  string across the monorepo.
- Use the File Finder (`Cmd/Ctrl-P`) when you already know the path or filename.
- Use the symbol outline and Go to Definition / Go to References commands from
  the editor or command palette to follow a function across module boundaries.
- Narrow broad searches to an app or package directory, then read the relevant
  line range. This keeps navigation aligned with the repository's code-health
  practice.

For command-line and agent sessions, `rg` is the equivalent targeted search
tool. Markdown, YAML, and other configuration files should be searched directly;
they are not language-server indexed.

## Troubleshooting

If definitions or references are missing, confirm the correct workspace root is
open and that dependencies are installed. Restart the language server from Zed's
command palette after changing lockfiles or workspace configuration. No generated
index is checked in or expected, and there is no local code-intelligence service
to start.

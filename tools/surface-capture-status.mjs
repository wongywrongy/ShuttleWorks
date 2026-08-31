/** Summarize repeatable UI surface-book capture runs. */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function summarizeStatus(paths, { now = Date.now() } = {}) {
  const lines = [];
  let failed = false;
  for (const manifestPath of paths) {
    const runningPath = manifestPath.replace(
      /\.manifest\.json$/,
      ".running.json",
    );
    const path = existsSync(runningPath) ? runningPath : manifestPath;
    if (!existsSync(path)) {
      lines.push(`${manifestPath}: not run`);
      failed = true;
      continue;
    }

    const run = JSON.parse(readFileSync(path, "utf8"));
    const elapsedMs = run.durationMs ?? now - Date.parse(run.startedAt);
    const failures = run.failedViewports?.length ?? 0;
    const consoleErrors = (run.surfaces ?? []).reduce(
      (count, surface) =>
        count +
        Object.values(surface.viewports ?? {}).reduce(
          (viewportCount, viewport) =>
            viewportCount + (viewport.consoleErrors?.length ?? 0),
          0,
        ),
      0,
    );
    lines.push(
      `${run.tier}: ${run.status} · ${run.completedSurfaces}/${run.surfaceCount} surfaces · ` +
        `${(elapsedMs / 1000).toFixed(1)}s · ${failures} failed viewport(s) · ` +
        `${consoleErrors} browser-console error(s)`,
    );
    if (run.artifacts?.pdf) lines.push(`  PDF: ${run.artifacts.pdf}`);
    if (run.failedViewports?.length) {
      for (const failure of run.failedViewports) {
        lines.push(`  ${failure.ref} ${failure.viewport}: ${failure.error}`);
      }
    }
    if (run.status !== "complete") failed = true;
  }

  return { lines, exitCode: failed ? 1 : 0 };
}

export function main(args = process.argv.slice(2)) {
  if (args.length === 0) {
    console.error(
      "usage: surface-capture-status.mjs <report.manifest.json> [...]",
    );
    return 2;
  }
  const result = summarizeStatus(args);
  for (const line of result.lines) console.log(line);
  return result.exitCode;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = main();
}

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { main, summarizeStatus } from "../surface-capture-status.mjs";

function fixtureDirectory() {
  return mkdtempSync(join(tmpdir(), "surface-capture-status-"));
}

function writeManifest(directory, name, overrides = {}) {
  const manifestPath = join(directory, `${name}.manifest.json`);
  writeFileSync(
    manifestPath,
    JSON.stringify({
      tier: "entrant",
      status: "complete",
      surfaceCount: 2,
      completedSurfaces: 2,
      startedAt: "2026-08-31T00:00:00.000Z",
      durationMs: 1250,
      artifacts: { pdf: `${name}.pdf` },
      surfaces: [],
      ...overrides,
    }),
  );
  return manifestPath;
}

function writeRunning(manifestPath, overrides = {}) {
  const runningPath = manifestPath.replace(
    /\.manifest\.json$/,
    ".running.json",
  );
  writeFileSync(
    runningPath,
    JSON.stringify({
      tier: "entrant",
      status: "running",
      surfaceCount: 2,
      completedSurfaces: 1,
      startedAt: "2026-08-31T00:00:00.000Z",
      durationMs: 600,
      surfaces: [],
      ...overrides,
    }),
  );
  return runningPath;
}

describe("surface-capture-status", () => {
  it("reports a running capture and exits non-zero", () => {
    const directory = fixtureDirectory();
    const manifest = writeManifest(directory, "running", {
      status: "complete",
    });
    writeRunning(manifest);

    const result = summarizeStatus([manifest]);

    assert.equal(result.exitCode, 1);
    assert.match(result.lines.join("\n"), /entrant: running · 1\/2 surfaces/);
    assert.match(result.lines.join("\n"), /0 failed viewport\(s\)/);
  });

  it("reports a complete capture and exits zero", () => {
    const directory = fixtureDirectory();
    const manifest = writeManifest(directory, "complete");

    const result = summarizeStatus([manifest]);

    assert.equal(result.exitCode, 0);
    assert.match(result.lines.join("\n"), /entrant: complete · 2\/2 surfaces/);
    assert.match(result.lines.join("\n"), /PDF: complete\.pdf/);
  });

  it("reports a partial capture, including each failed viewport, and exits non-zero", () => {
    const directory = fixtureDirectory();
    const manifest = writeManifest(directory, "partial", {
      status: "partial",
      completedSurfaces: 1,
      failedViewports: [{ ref: "S02", viewport: "mobile", error: "HTTP 500" }],
    });

    const result = summarizeStatus([manifest]);

    assert.equal(result.exitCode, 1);
    assert.match(result.lines.join("\n"), /entrant: partial · 1\/2 surfaces/);
    assert.match(result.lines.join("\n"), /1 failed viewport\(s\)/);
    assert.match(result.lines.join("\n"), /S02 mobile: HTTP 500/);
  });

  it("reports a failed capture and exits non-zero", () => {
    const directory = fixtureDirectory();
    const manifest = writeManifest(directory, "failed", {
      status: "failed",
      completedSurfaces: 0,
      failedViewports: [
        { ref: "S01", viewport: "desktop", error: "browser launch failed" },
      ],
    });

    const result = summarizeStatus([manifest]);

    assert.equal(result.exitCode, 1);
    assert.match(result.lines.join("\n"), /entrant: failed · 0\/2 surfaces/);
    assert.match(result.lines.join("\n"), /S01 desktop: browser launch failed/);
  });

  it("reports missing manifests and exits non-zero", () => {
    const directory = fixtureDirectory();
    const missing = join(directory, "missing.manifest.json");

    const result = summarizeStatus([missing]);

    assert.equal(result.exitCode, 1);
    assert.equal(result.lines.join("\n"), `${missing}: not run`);
  });

  it("aggregates statuses and remains non-zero if any requested run is incomplete", () => {
    const directory = fixtureDirectory();
    const complete = writeManifest(directory, "aggregate-complete");
    const partial = writeManifest(directory, "aggregate-partial", {
      status: "partial",
      completedSurfaces: 1,
    });

    const result = summarizeStatus([complete, partial]);

    assert.equal(result.exitCode, 1);
    assert.match(result.lines.join("\n"), /entrant: complete · 2\/2 surfaces/);
    assert.match(result.lines.join("\n"), /entrant: partial · 1\/2 surfaces/);
  });

  it("accepts a running capture with no stale manifest", () => {
    const directory = fixtureDirectory();
    const manifest = join(directory, "only-running.manifest.json");
    writeRunning(manifest, { surfaceCount: 3, completedSurfaces: 0 });

    const result = summarizeStatus([manifest]);

    assert.equal(result.exitCode, 1);
    assert.match(result.lines.join("\n"), /entrant: running · 0\/3 surfaces/);
  });

  it("returns the usage exit code when no manifests are supplied", () => {
    assert.equal(main([]), 2);
  });
});

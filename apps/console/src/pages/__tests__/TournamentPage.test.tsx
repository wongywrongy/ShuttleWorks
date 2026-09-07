import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { TournamentPage } from "../TournamentPage";
import { useUiStore } from "../../store/uiStore";
import { WORKFLOW_ROUTES } from "../../platform/product-shell/workspaceNav";

// Stub the heavy AppShell + the kind fetch so we test only TournamentPage's
// URL→store syncing (no network, no product mount). AppShell renders a marker
// so the not-found cases can assert the workspace chrome did NOT mount.
vi.mock("../../app/AppShell", () => ({
  AppShell: () => <div data-testid="app-shell" />,
}));
const kind = vi.hoisted(() => ({ notFound: false }));
vi.mock("../../hooks/useTournamentKind", () => ({
  useTournamentKind: () => kind.notFound,
}));

function renderAt(seg: string) {
  return render(
    <MemoryRouter initialEntries={[`/tournaments/t1/${seg}`]}>
      <Routes>
        <Route path="/tournaments/:id/*" element={<TournamentPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  kind.notFound = false;
  useUiStore.setState({ activeTab: "setup", activeTournamentKind: "meet" });
});

describe("TournamentPage URL→activeTab sync (no kind-snap)", () => {
  it("canonical workflow paths select their renderer", async () => {
    renderAt("participants/people");
    await waitFor(() =>
      expect(useUiStore.getState().activeTab).toBe("roster"),
    );
  });

  it("resolves workflow-first setup paths to the existing shell surface", async () => {
    renderAt("setup/details");
    await waitFor(() => expect(useUiStore.getState().activeTab).toBe("setup"));
  });

  it("adapts shared workflow paths to the bracket renderer", async () => {
    useUiStore.setState({ activeTournamentKind: "bracket" });
    renderAt("participants/people");
    await waitFor(() =>
      expect(useUiStore.getState().activeTab).toBe("bracket-roster"),
    );
  });

  it("does not resurrect retired aliases", async () => {
    renderAt("publish/site");
    await waitFor(() => expect(screen.getByTestId("workspace-not-found")).toBeTruthy());
  });
});

describe("an unrecognised segment is an honest not-found", () => {
  it("renders not-found instead of silently falling back to Meet Configuration", async () => {
    renderAt("zzzz-not-a-segment");
    await waitFor(() =>
      expect(screen.getByTestId("workspace-not-found")).toBeTruthy(),
    );
    // The URL never became a tab, so the shell must not have rendered a surface
    // under it (before the fix this left activeTab on its default and the Meet
    // Configuration page rendered under a nonsense URL).
    expect(useUiStore.getState().activeTab).toBe("setup");
  });

  /**
   * D4 (2026-08-10 browser pass). A workspace belonging to another
   * organisation answers a uniform 404 (`TOURNAMENT_NOT_FOUND`) — "exists but
   * isn't yours" is byte-identical to "doesn't exist", which is the tenancy
   * guarantee working. The SPA swallowed that 404 and fell through to client
   * defaults: an "Untitled" workspace with a module sidebar and a
   * Configuration form carrying a Save button. Nothing leaked (every field
   * was a default) but offering to save a workspace you cannot reach makes
   * the strongest guarantee in the product look like a bug.
   */
  it("renders not-found for a workspace the account cannot see", async () => {
    kind.notFound = true;
    renderAt("setup/details");
    await waitFor(() =>
      expect(screen.getByTestId("workspace-not-found")).toBeTruthy(),
    );
    // The chrome — and with it the Save button — must not mount at all.
    expect(screen.queryByTestId("app-shell")).toBeNull();
  });

  it("NEGATIVE CONTROL: a workspace we CAN see still renders the shell", () => {
    renderAt("setup/details");
    expect(screen.getByTestId("app-shell")).toBeTruthy();
    expect(screen.queryByTestId("workspace-not-found")).toBeNull();
  });

  it("accepts every canonical route", () => {
    for (const route of WORKFLOW_ROUTES) {
      const { unmount } = renderAt(route.path);
      expect(
        screen.queryByTestId("workspace-not-found"),
        `route ${route.path}`,
      ).toBeNull();
      unmount();
    }
  });
});

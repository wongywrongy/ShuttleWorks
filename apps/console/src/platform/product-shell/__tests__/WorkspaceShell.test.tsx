import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WorkspaceShell } from "../WorkspaceShell";
import type { WorkspaceIdentity } from "../types";
import { modulesForWorkspace } from "../../domain/moduleModel";

const identity: WorkspaceIdentity = {
  name: "Spring Finals",
  date: "2026-04-01",
  status: "active",
  kind: "meet",
};

const base = {
  modules: modulesForWorkspace("meet"),
  tid: "t1",
  kind: "meet" as const,
  activeTab: "overview" as const,
  adminActive: false,
  onOpenAdmin: () => {},
  onBackToHub: () => {},
};

function renderShell(
  props: Partial<React.ComponentProps<typeof WorkspaceShell>> = {},
  initialEntries: string[] = ["/"],
) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <WorkspaceShell identity={identity} {...base} {...props}>
        <div data-testid="content">content</div>
      </WorkspaceShell>
    </MemoryRouter>,
  );
}

describe("WorkspaceShell", () => {
  it("shows identity, status, the workspace sidebar, status slot and children", () => {
    renderShell({ statusSlot: <span data-testid="chip">chip</span> });
    expect(screen.getByText("Spring Finals")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
    // The identity date is formatted (Apr 1, 2026), not raw ISO (2026-04-01).
    expect(screen.queryByText("2026-04-01")).not.toBeInTheDocument();
    expect(screen.getByText(/Apr\s*1,\s*2026/)).toBeInTheDocument();
    // The left workspace sidebar (Overview always present) replaces the dock.
    expect(screen.getByTestId("ws-nav-overview")).toBeInTheDocument();
    expect(screen.getByTestId("chip")).toBeInTheDocument();
    expect(screen.getByTestId("content")).toBeInTheDocument();
  });

  it("omits the status pill when status is null and shows a name fallback", () => {
    renderShell({
      identity: { name: null, date: null, status: null, kind: "meet" },
    });
    expect(screen.getByText("Untitled")).toBeInTheDocument();
    expect(screen.queryByText("active")).not.toBeInTheDocument();
  });

  it("fires onBackToHub from the back control", async () => {
    const onBackToHub = vi.fn();
    renderShell({ onBackToHub });
    await userEvent.click(screen.getByLabelText("Back to workspaces"));
    expect(onBackToHub).toHaveBeenCalledTimes(1);
  });

  it("the admin gear fires onOpenAdmin and reflects adminActive", async () => {
    const onOpenAdmin = vi.fn();
    renderShell({ onOpenAdmin, adminActive: true });
    const gear = screen.getByTestId("workspace-admin-gear");
    expect(gear).toHaveAttribute("aria-current", "page");
    await userEvent.click(gear);
    expect(onOpenAdmin).toHaveBeenCalledTimes(1);
  });

  it("uses real destination links and a separate disclosure control", async () => {
    renderShell();
    // SP-OPCON-1 RDY-3: the section header lands on the readiness-checklist
    // landing (the first item, "Checklist"), not on a section page.
    expect(screen.getByRole("link", { name: "Setup" })).toHaveAttribute(
      "href",
      "/tournaments/t1/setup",
    );

    const disclosure = screen.getByRole("button", { name: "Show Setup links" });
    await userEvent.click(disclosure);
    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Dates" })).toHaveAttribute(
      "href",
      "/tournaments/t1/setup/dates",
    );
  });

  it("keeps workflow context when the workspace id is URL encoded", () => {
    renderShell(
      {
        tid: "spring finals",
        kind: "bracket",
        modules: modulesForWorkspace("bracket"),
        activeTab: "bracket-draw",
      },
      ["/tournaments/spring%20finals/competition/draw?event=MS"],
    );

    const section = screen.getByTestId("ws-section-competition");
    expect(section).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("link", { name: "Competition" })).toHaveClass(
      "text-foreground",
    );
    expect(
      screen.getByRole("button", { name: "Hide Competition links" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("aligns section destinations and disclosures without default module badges", async () => {
    renderShell(
      {
        kind: "bracket",
        modules: modulesForWorkspace("bracket"),
        activeTab: "bracket-draws",
      },
      ["/tournaments/t1/competition/draws"],
    );
    const sectionLink = screen.getByRole("link", { name: "Competition" });
    const disclosure = screen.getByRole("button", {
      name: "Hide Competition links",
    });
    const sectionRow = screen.getByTestId("ws-section-competition");
    const activeChild = screen.getByTestId("ws-nav-competition-draws");
    expect(sectionRow).toHaveClass("h-8", "items-center");
    expect(sectionLink).toHaveClass("h-8");
    expect(disclosure).toHaveClass("size-8");
    expect(disclosure).toHaveAttribute(
      "aria-controls",
      "ws-section-competition-links",
    );
    expect(activeChild.tagName).toBe("A");
    expect(activeChild).toHaveClass(
      "bg-action-primary",
      "text-text-on-accent",
    );
    expect(activeChild).not.toHaveClass(
      "bg-action-selected-bg",
      "text-action-selected-foreground",
      "text-accent",
      "font-semibold",
      "shadow-[inset_2px_0_0_hsl(var(--accent))]",
    );
    expect(sectionLink).not.toHaveClass("bg-action-selected-bg");
    expect(screen.queryByTitle(/module$/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("ws-nav-administration")).toHaveAttribute(
      "href",
      "/tournaments/t1/administration/team",
    );
  });

  it("keeps retired tint and sliver mechanisms out of the workspace nav owner", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/platform/product-shell/WorkspaceSidebar.tsx"),
      "utf8",
    );
    expect(source).not.toContain("bg-action-selected-bg");
    expect(source).not.toContain("text-action-selected-foreground");
    expect(source).not.toContain("inset_2px_0_0");
    expect(source).toContain("<ActiveChoice");
  });
});

/**
 * When the module catalog is UNKNOWN (the `/modules` fetch failed), an empty
 * section list is as much a lie as a guessed one — it reads as "this
 * workspace has no modules". The rail has to say it doesn't know, and offer
 * a way to find out.
 */
describe("WorkspaceShell — an unknown module catalog", () => {
  it("says the modules are unknown instead of drawing a guessed rail", () => {
    renderShell({ modules: [], modulesUnknown: true });
    expect(screen.getByTestId("ws-modules-unknown")).toBeInTheDocument();
    expect(screen.queryByTestId("ws-section-meet")).toBeNull();
    // Overview + Workspace admin still work — they belong to the shell, not
    // to any module, so they are known regardless.
    expect(screen.getByTestId("ws-nav-overview")).toBeInTheDocument();
    expect(
      screen.getByTestId("ws-nav-administration-modules"),
    ).toBeInTheDocument();
  });

  it("offers a retry rather than a dead end", async () => {
    const onRetryModules = vi.fn();
    renderShell({ modules: [], modulesUnknown: true, onRetryModules });
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetryModules).toHaveBeenCalledTimes(1);
  });

  it("NEGATIVE CONTROL: a known catalog still renders its sections", () => {
    renderShell({ modules: modulesForWorkspace("meet") });
    expect(screen.getByTestId("ws-section-setup")).toBeInTheDocument();
    expect(screen.getByTestId("ws-section-participants")).toBeInTheDocument();
    expect(screen.getByTestId("ws-section-operations")).toBeInTheDocument();
    expect(screen.queryByTestId("ws-modules-unknown")).toBeNull();
  });
});

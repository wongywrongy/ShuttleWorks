import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ModuleCatalogRow } from "../ModuleCatalogRow";

const module = {
  id: "meet" as const,
  label: "Meet",
  status: "enabled" as const,
  hasData: true,
};

/** The row's one control. */
const switchFor = (name: string) => screen.getByRole("radiogroup", { name });

describe("ModuleCatalogRow", () => {
  it("is a name, one line of description, and one switch", () => {
    render(
      <ul>
        <ModuleCatalogRow
          module={{ ...module, hasData: false }}
          onEnable={vi.fn()}
          onDisable={vi.fn()}
        />
      </ul>,
    );
    expect(screen.getByText("Meet")).toBeInTheDocument();
    expect(screen.getByText(/roster, build a court schedule/i)).toBeInTheDocument();
    expect(within(switchFor("Meet")).getByRole("radio", { name: "On" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    // Everything the row used to say around the switch is gone.
    expect(screen.queryByRole("button", { name: "Configure" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Review impact" })).toBeNull();
    expect(screen.queryByTestId("module-impact-meet")).toBeNull();
    expect(screen.queryByTestId("module-completion-meet")).toBeNull();
    expect(screen.queryByText(/^ON$/)).toBeNull();
    expect(screen.queryByText(/^AVAILABLE$/)).toBeNull();
  });

  it("turns the module off through the switch", () => {
    const onDisable = vi.fn();
    render(
      <ul>
        <ModuleCatalogRow
          module={{ ...module, hasData: false }}
          onEnable={vi.fn()}
          onDisable={onDisable}
        />
      </ul>,
    );
    fireEvent.click(within(switchFor("Meet")).getByRole("radio", { name: "Off" }));
    expect(onDisable).toHaveBeenCalledOnce();
  });

  it("disables the switch with one reason when the module owns data", () => {
    const onDisable = vi.fn();
    render(
      <ul>
        <ModuleCatalogRow module={module} onEnable={vi.fn()} onDisable={onDisable} />
      </ul>,
    );
    expect(screen.getByTestId("module-reason-meet")).toHaveTextContent(
      "Has draws or matches: can't turn off.",
    );
    expect(switchFor("Meet")).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(within(switchFor("Meet")).getByRole("radio", { name: "Off" }));
    expect(onDisable).not.toHaveBeenCalled();
  });

  it("disables the switch with the caller's reason (dependency / last engine)", () => {
    render(
      <ul>
        <ModuleCatalogRow
          module={{ id: "display", label: "Display", status: "available" }}
          onEnable={vi.fn()}
          onDisable={vi.fn()}
          blockedReason="Needs Meet or Bracket on."
        />
      </ul>,
    );
    expect(screen.getByTestId("module-reason-display")).toHaveTextContent(
      "Needs Meet or Bracket on.",
    );
    expect(switchFor("Display")).toHaveAttribute("aria-disabled", "true");
  });
});

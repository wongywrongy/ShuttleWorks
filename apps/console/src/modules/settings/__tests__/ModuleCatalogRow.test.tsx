import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ModuleCatalogRow } from "../ModuleCatalogRow";

const module = {
  id: "meet" as const,
  label: "Meet",
  status: "enabled" as const,
  hasData: true,
};

describe("ModuleCatalogRow", () => {
  it("shows purpose, data impact, configuration status, and configure action", () => {
    const onConfigure = vi.fn();
    render(
      <ul>
        <ModuleCatalogRow
          module={module}
          onEnable={vi.fn()}
          onDisable={vi.fn()}
          onConfigure={onConfigure}
        />
      </ul>,
    );
    expect(screen.getByText(/roster, CP-SAT scheduling/i)).toBeInTheDocument();
    expect(screen.getByTestId("module-impact-meet")).toHaveTextContent(
      /owns operational data/i,
    );
    expect(screen.getByTestId("module-completion-meet")).toHaveTextContent(
      /active with data/i,
    );
    fireEvent.click(screen.getByRole("button", { name: "Configure" }));
    expect(onConfigure).toHaveBeenCalledOnce();
  });

  it("opens configuration from the row without double-firing nested actions", () => {
    const onConfigure = vi.fn();
    render(
      <ul>
        <ModuleCatalogRow
          module={module}
          onEnable={vi.fn()}
          onDisable={vi.fn()}
          onConfigure={onConfigure}
        />
      </ul>,
    );
    fireEvent.click(screen.getByTestId("settings-module-meet"));
    expect(onConfigure).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Configure" }));
    expect(onConfigure).toHaveBeenCalledTimes(2);
  });

  it("requires reviewing impact before offering any disable behavior", () => {
    const onDisable = vi.fn();
    render(
      <ul>
        <ModuleCatalogRow
          module={module}
          onEnable={vi.fn()}
          onDisable={onDisable}
        />
      </ul>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Review impact" }));
    expect(
      screen.getByRole("heading", { name: /Review Meet data impact/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No data will be removed here/i),
    ).toBeInTheDocument();
    expect(onDisable).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Keep module enabled" }),
    );
    expect(
      screen.queryByRole("heading", { name: /Review Meet data impact/i }),
    ).toBeNull();
  });
});

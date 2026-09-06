import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PanZoomCanvas, readableOffset } from "../PanZoomCanvas";

describe("PanZoomCanvas", () => {
  it("exposes one labelled canvas with readable default and overview controls", () => {
    render(
      <PanZoomCanvas roundLabels={["Round of 32", "Round of 16", "Final"]}>
        <div style={{ width: 2400, height: 1800 }}>Draw</div>
      </PanZoomCanvas>,
    );

    expect(
      screen.getByRole("region", { name: "Bracket draw canvas" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Readable view" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Fit whole draw" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reset view" }),
    ).toBeInTheDocument();
  });

  it("keeps the first round on the left when a readable draw overflows", () => {
    expect(readableOffset(1200, 1800, 0.9)).toBe(24);
    expect(readableOffset(1200, 800, 0.9)).toBe(240);
  });
});

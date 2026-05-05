import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InlineManaText, ManaSymbols, SetSymbol } from "@/components/CardSymbols";

describe("CardSymbols", () => {
  it("renders mana costs with Mana font classes", () => {
    render(<ManaSymbols value="{2}{W/U}{W/P}{T}" />);

    expect(screen.getByLabelText("{2}")).toHaveClass("ms", "ms-cost", "ms-2");
    expect(screen.getByLabelText("{W/U}")).toHaveClass("ms-wu");
    expect(screen.getByLabelText("{W/P}")).toHaveClass("ms-wp");
    expect(screen.getByLabelText("{T}")).toHaveClass("ms-tap");
  });

  it("renders inline oracle symbols without dropping surrounding text", () => {
    render(<InlineManaText value="{T}: Add {G}. Spend this mana only to cast creatures." />);

    expect(screen.getByText(/Add/)).toBeInTheDocument();
    expect(screen.getByLabelText("{T}")).toHaveClass("ms-tap");
    expect(screen.getByLabelText("{G}")).toHaveClass("ms-g");
    expect(screen.getByText(/Spend this mana/)).toBeInTheDocument();
  });

  it("renders Keyrune set symbols with rarity classes", () => {
    render(<SetSymbol code="M10" rarity="rare" />);

    const symbol = screen.getByRole("img", { name: /m10 rare set symbol/i });
    expect(symbol).toHaveClass("ss", "ss-m10", "ss-rare");
  });
});

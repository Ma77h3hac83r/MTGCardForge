import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SearchCombobox } from "@/components/SearchCombobox";

describe("SearchCombobox", () => {
  it("highlights options with arrow keys and selects with Enter", () => {
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <SearchCombobox
        id="test-search"
        label="Search cards"
        open
        options={["Sol Ring", "Solitude", "Temple of Sol"]}
        placeholder="Card"
        value="sol"
        getOptionKey={(option) => option}
        getOptionLabel={(option) => option}
        onChange={vi.fn()}
        onOpenChange={onOpenChange}
        onSelect={onSelect}
      />,
    );

    const input = screen.getByRole("combobox");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: "Sol Ring" })).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: "Solitude" })).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("Solitude");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes the list on Escape", () => {
    const onOpenChange = vi.fn();

    render(
      <SearchCombobox
        id="test-search"
        label="Search cards"
        open
        options={["Sol Ring"]}
        placeholder="Card"
        value="sol"
        getOptionKey={(option) => option}
        getOptionLabel={(option) => option}
        onChange={vi.fn()}
        onOpenChange={onOpenChange}
        onSelect={vi.fn()}
      />,
    );

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

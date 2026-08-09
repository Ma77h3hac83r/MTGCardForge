import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { Input } from "@/components/ui/input";

export type SearchComboboxProps<T> = {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  options: T[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  getOptionKey: (option: T) => string;
  getOptionLabel: (option: T) => string;
  onSelect: (option: T) => void;
  /** Called when Enter is pressed with no active option (form still submits via parent). */
  onEnterWithoutSelection?: () => void;
  renderOption?: (option: T, active: boolean) => ReactNode;
  className?: string;
};

export function SearchCombobox<T>({
  id,
  label,
  placeholder,
  value,
  onChange,
  options,
  open,
  onOpenChange,
  getOptionKey,
  getOptionLabel,
  onSelect,
  onEnterWithoutSelection,
  renderOption,
  className = "pr-12",
}: SearchComboboxProps<T>) {
  const listboxId = `${id}-suggestions`;
  const reactId = useId();
  const [activeIndex, setActiveIndex] = useState(-1);
  const showList = open && options.length > 0;
  const activeOption = activeIndex >= 0 && activeIndex < options.length ? options[activeIndex] : null;
  const activeDescendant =
    activeOption != null ? `${reactId}-option-${getOptionKey(activeOption)}` : undefined;

  useEffect(() => {
    setActiveIndex(-1);
  }, [options, value]);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (showList) {
        event.preventDefault();
        onOpenChange(false);
        setActiveIndex(-1);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      if (!options.length) {
        return;
      }

      event.preventDefault();
      onOpenChange(true);
      setActiveIndex((current) => (current + 1) % options.length);
      return;
    }

    if (event.key === "ArrowUp") {
      if (!options.length) {
        return;
      }

      event.preventDefault();
      onOpenChange(true);
      setActiveIndex((current) => (current <= 0 ? options.length - 1 : current - 1));
      return;
    }

    if (event.key === "Home" && showList && options.length) {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }

    if (event.key === "End" && showList && options.length) {
      event.preventDefault();
      setActiveIndex(options.length - 1);
      return;
    }

    if (event.key === "Enter" && showList && activeOption != null) {
      event.preventDefault();
      onSelect(activeOption);
      onOpenChange(false);
      setActiveIndex(-1);
      return;
    }

    if (event.key === "Enter" && onEnterWithoutSelection) {
      onEnterWithoutSelection();
    }
  }

  return (
    <>
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <Input
        id={id}
        aria-activedescendant={activeDescendant}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={showList}
        autoComplete="off"
        className={className}
        placeholder={placeholder}
        role="combobox"
        value={value}
        onBlur={() => {
          window.setTimeout(() => {
            onOpenChange(false);
            setActiveIndex(-1);
          }, 120);
        }}
        onChange={(event) => {
          onChange(event.target.value);
          onOpenChange(true);
          setActiveIndex(-1);
        }}
        onFocus={() => {
          if (options.length) {
            onOpenChange(true);
          }
        }}
        onKeyDown={handleKeyDown}
      />
      {showList ? (
        <div
          className="absolute left-0 right-0 top-12 z-30 max-h-72 overflow-auto rounded-lg border bg-card shadow-lg"
          id={listboxId}
          role="listbox"
        >
          {options.map((option, index) => {
            const key = getOptionKey(option);
            const labelText = getOptionLabel(option);
            const active = index === activeIndex;

            return (
              <button
                aria-label={labelText}
                aria-selected={active}
                className={`block w-full px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none ${
                  active ? "bg-muted" : "hover:bg-muted focus-visible:bg-muted"
                }`}
                id={`${reactId}-option-${key}`}
                key={key}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onSelect(option);
                  onOpenChange(false);
                  setActiveIndex(-1);
                }}
                onPointerDown={(event) => {
                  event.preventDefault();
                  onSelect(option);
                  onOpenChange(false);
                  setActiveIndex(-1);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                role="option"
                type="button"
              >
                {renderOption ? renderOption(option, active) : labelText}
              </button>
            );
          })}
        </div>
      ) : null}
    </>
  );
}

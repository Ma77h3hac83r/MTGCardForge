import { CircleHelp } from "lucide-react";
import { useEffect } from "react";

type SearchHotkeyHintProps = {
  label?: string;
  targetId: string;
};

export function SearchHotkeyHint({ label = "search", targetId }: SearchHotkeyHintProps) {
  useSearchHotkey(targetId);

  function focusTarget() {
    document.getElementById(targetId)?.focus();
  }

  return (
    <button
      aria-label="Press slash to focus this field"
      className="group relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={focusTarget}
      type="button"
    >
      <CircleHelp aria-hidden="true" className="h-4 w-4" />
      <span
        className="pointer-events-none absolute left-1/2 top-full z-40 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md border bg-card px-2 py-1 text-xs font-medium text-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        role="tooltip"
      >
        Press / to focus {label}
      </span>
    </button>
  );
}

function useSearchHotkey(targetId: string) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (isEditableElement(event.target)) {
        return;
      }

      const target = document.getElementById(targetId);

      if (!target) {
        return;
      }

      event.preventDefault();
      target.focus();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [targetId]);
}

function isEditableElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

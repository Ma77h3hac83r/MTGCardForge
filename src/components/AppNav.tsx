import type { ReactNode } from "react";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import logoUrl from "@/images/logo.png";
import { NAV_ITEMS } from "@/lib/navigation";

type AppNavProps = {
  children?: ReactNode;
  layout?: "center" | "split";
};

export function AppNav({ children, layout = "center" }: AppNavProps) {
  const isSplit = layout === "split";

  return (
    <>
    <ServiceWorkerRegister />
    <nav className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur">
      <div
        className={
          isSplit
            ? "relative mx-auto flex min-h-16 max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8"
            : "relative mx-auto flex min-h-16 max-w-7xl items-center justify-center px-4 py-3 sm:px-6 lg:px-8"
        }
      >
        <a
          className={
            isSplit
              ? "flex items-center gap-2 text-lg font-semibold tracking-normal text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              : "absolute left-4 flex items-center gap-2 text-lg font-semibold tracking-normal text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:left-6 lg:left-8"
          }
          href="/"
          aria-label="MTG Card Forge"
        >
          <img alt="" className="h-10 w-auto" src={logoUrl.src ?? logoUrl} />
          <span>MTG Card Forge</span>
        </a>
        {children}
        <div
          className={
            isSplit
              ? "hidden items-center gap-0.5 text-sm font-medium lg:flex xl:gap-1"
              : "absolute right-4 hidden items-center gap-0.5 text-sm font-medium lg:flex xl:gap-1"
          }
        >
          {NAV_ITEMS.map((item) => (
            <a
              className="rounded-md px-2 py-2 text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:px-3"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </a>
          ))}
        </div>
      </div>
    </nav>
    </>
  );
}

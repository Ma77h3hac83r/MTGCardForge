import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { clearInFlightRequestsForTests } from "@/lib/dedupedFetch";

afterEach(() => {
  clearInFlightRequestsForTests();
});

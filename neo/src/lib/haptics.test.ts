import { afterEach, describe, expect, it, vi } from "vitest";
import { haptic } from "./haptics.js";

describe("haptic feedback", () => {
  afterEach(() => vi.restoreAllMocks());

  it("is safe in non-browser runtimes", () => {
    expect(() => haptic()).not.toThrow();
  });
});

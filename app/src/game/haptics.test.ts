import { describe, expect, it, vi } from "vitest";

/**
 * Native haptic feedback (#11). The scope is exactly these three calls with
 * Capacitor's own fixed vocabulary — nothing here should ever be able to
 * throw into gameplay, on a platform with no native bridge and no
 * `navigator.vibrate` (most CI/browser environments, including this one).
 */

const impact = vi.fn();
const notification = vi.fn();

vi.mock("@capacitor/haptics", () => ({
  Haptics: {
    impact: (...args: unknown[]): unknown => impact(...args),
    notification: (...args: unknown[]): unknown => notification(...args),
  },
  ImpactStyle: { Light: "LIGHT", Medium: "MEDIUM", Heavy: "HEAVY" },
  NotificationType: { Success: "SUCCESS", Warning: "WARNING", Error: "ERROR" },
}));

describe("haptics", () => {
  it("fires a light impact on discard", async () => {
    impact.mockResolvedValueOnce(undefined);
    const { hapticDiscard } = await import("./haptics");
    hapticDiscard();
    expect(impact).toHaveBeenCalledWith({ style: "LIGHT" });
  });

  it("fires a medium impact on claim", async () => {
    impact.mockResolvedValueOnce(undefined);
    const { hapticClaim } = await import("./haptics");
    hapticClaim();
    expect(impact).toHaveBeenCalledWith({ style: "MEDIUM" });
  });

  it("fires a success notification on a win, a warning otherwise", async () => {
    notification.mockResolvedValue(undefined);
    const { hapticResult } = await import("./haptics");
    hapticResult(true);
    expect(notification).toHaveBeenLastCalledWith({ type: "SUCCESS" });
    hapticResult(false);
    expect(notification).toHaveBeenLastCalledWith({ type: "WARNING" });
  });

  it("never throws or leaves a rejection unhandled when the platform has no haptics", async () => {
    impact.mockRejectedValueOnce(new Error("Browser does not support the vibrate API"));
    notification.mockRejectedValueOnce(new Error("Browser does not support the vibrate API"));
    const { hapticClaim, hapticResult } = await import("./haptics");
    expect(() => { hapticClaim(); }).not.toThrow();
    expect(() => { hapticResult(true); }).not.toThrow();
    // Let the swallowed rejections settle before the test ends.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

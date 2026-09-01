import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

/**
 * Native haptic feedback (#11), scoped to the few moments a physical thump
 * actually means something: committing a discard, taking a claim, and a
 * hand's outcome. This is the whole of the scope: #11 explicitly carries no
 * decided haptic vocabulary beyond "native haptics", so nothing here invents
 * one — three calls, three fixed Capacitor styles, no per-concept design.
 *
 * Capacitor's web implementation falls back to the Vibration API where the
 * browser has one, and no-ops where it does not — it never throws for
 * missing hardware or permission, but a failure is swallowed here anyway so
 * a haptic can never become a gameplay dependency. Same code path on the PWA
 * and the Android app; nothing here branches on platform.
 */

function fireAndForget(promise: Promise<void>): void {
  promise.catch(() => {
    // A haptic is a nicety. Nothing here is allowed to surface as an error.
  });
}

/** A discard just committed. */
export function hapticDiscard(): void {
  fireAndForget(Haptics.impact({ style: ImpactStyle.Light }));
}

/** A chow, pung, kong or win claim was just taken (not a pass). */
export function hapticClaim(): void {
  fireAndForget(Haptics.impact({ style: ImpactStyle.Medium }));
}

/** A hand just ended, from the viewing seat's own result. */
export function hapticResult(won: boolean): void {
  fireAndForget(
    Haptics.notification({ type: won ? NotificationType.Success : NotificationType.Warning }),
  );
}

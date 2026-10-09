let lastPulseAt = 0;

/** Small tactile confirmation for touch devices. Never blocks the action. */
export function haptic(duration = 6): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  const now = Date.now();
  if (now - lastPulseAt < 80) return;
  lastPulseAt = now;
  try { navigator.vibrate(Math.max(1, Math.min(8, Math.round(duration)))); } catch { /* Haptics are optional. */ }
}

import { has } from "./platform";

// Semantic haptics. Call sites name the MEANING ("the door opened"), never an intensity, so the
// feel of the whole app is tuned here in one place.
//
// - Native only. No navigator.vibrate fallback: an Android browser buzzing on every tap is noise,
//   and iOS Safari has no vibration at all.
// - Lazy-imported: the plugin never sits on the path to first paint.
// - Throttled per kind, so a repeated event (a double tap, a re-render) can't machine-gun.
// - Mutable by the member (localStorage "fittin-haptics" = "off").

const MIN_GAP_MS = { tap: 40, select: 60, success: 700, warning: 700, error: 700, heavy: 400 };
const last = {};
let mod;
const load = () => (mod ??= import("@capacitor/haptics"));

function fire(kind, run) {
  if (!has("Haptics")) return;
  try { if (localStorage.getItem("fittin-haptics") === "off") return; } catch { /* storage blocked: keep haptics on */ }
  const now = Date.now();
  if (now - (last[kind] || 0) < MIN_GAP_MS[kind]) return;
  last[kind] = now;
  load().then(run).catch(() => {});
}

/** A light tick: pressing a primary control. */
export const hapticTap = () => fire("tap", ({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light }));
/** Changing a selection: a tab, a day, a time slot. */
export const hapticSelect = () => fire("select", ({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light }));
/** Something worked: booked, saved, paid. */
export const hapticSuccess = () => fire("success", ({ Haptics, NotificationType }) => Haptics.notification({ type: NotificationType.Success }));
/** Heads-up: a destructive confirm, the rest timer ran out. */
export const hapticWarning = () => fire("warning", ({ Haptics, NotificationType }) => Haptics.notification({ type: NotificationType.Warning }));
/** Something failed. */
export const hapticError = () => fire("error", ({ Haptics, NotificationType }) => Haptics.notification({ type: NotificationType.Error }));
/** A physical event: the door unlocked. */
export const hapticHeavy = () => fire("heavy", ({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Heavy }));

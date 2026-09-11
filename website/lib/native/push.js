import { has, platform } from "./platform";
import { capabilities } from "./fittinNative";

// Native push: permission, registration, and what a tap does.
//
// - Permission is asked at a meaningful moment (PushOptIn card, after the member taps it), never on
//   cold start. Push is never required to use the app (Apple 4.5.4).
// - Listeners are attached once, as early as possible (NativeBoot), so a tap that cold-starts the
//   app still routes to its page.
// - The token is re-sent on every launch and resume: tokens rotate, and re-registering is the only
//   thing that revives a token the server deactivated by mistake.

let listenersAttached = false;

/** 'unsupported' | 'prompt' | 'granted' | 'denied' */
export async function pushStatus() {
  if (!has("PushNotifications")) return "unsupported";
  const caps = await capabilities();
  if (!caps.push) return "unsupported"; // e.g. Android binary built without Firebase
  const { PushNotifications } = await import("@capacitor/push-notifications");
  const { receive } = await PushNotifications.checkPermissions();
  if (receive === "granted") return "granted";
  if (receive === "denied") return "denied";
  return "prompt";
}

/** Ask (if needed) and register. Returns the resulting status. */
export async function enablePush() {
  if ((await pushStatus()) === "unsupported") return "unsupported";
  const { PushNotifications } = await import("@capacitor/push-notifications");
  const { receive } = await PushNotifications.requestPermissions();
  if (receive !== "granted") return receive === "denied" ? "denied" : "prompt";
  await PushNotifications.register();
  return "granted";
}

/** Launch / resume: re-register silently when permission already exists. */
export async function registerIfGranted() {
  if ((await pushStatus()) !== "granted") return;
  const { PushNotifications } = await import("@capacitor/push-notifications");
  await PushNotifications.register().catch(() => {});
}

/** Attach once. `navigate(path)` is the router push. */
export async function initPushListeners(navigate) {
  if (listenersAttached || !has("PushNotifications")) return;
  const caps = await capabilities();
  if (!caps.push) return;
  listenersAttached = true;
  const { PushNotifications } = await import("@capacitor/push-notifications");

  await PushNotifications.addListener("registration", ({ value }) => {
    fetch("/api/me/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: value, platform: platform(), environment: caps.apnsEnvironment || "production" }),
    }).catch(() => {});
  });

  // Tap on a notification: open the page it is about (the same `link` as the in-app bell).
  await PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
    const link = notification?.data?.link;
    if (typeof link === "string" && link.startsWith("/")) navigate(link);
    else navigate("/notificaties");
  });

  if (platform() === "android") {
    // Android 8+: the member controls notifications per channel, so give it a clear name.
    await PushNotifications.createChannel({
      id: "fittin",
      name: "Fittin’",
      description: "Boekingen, berichten van je coach en je deur",
      importance: 4,
      visibility: 1,
    }).catch(() => {});
  }
}

/** Log out: stop pushes for this device before the session is gone. */
export async function unregisterPushToken() {
  if (!has("PushNotifications")) return;
  await fetch("/api/me/push", { method: "DELETE" }).catch(() => {});
}

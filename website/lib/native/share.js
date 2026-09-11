import { has } from "./platform";

/**
 * Share a link or text. In the app: the native share sheet. On the web: Web Share, then clipboard.
 * @returns {Promise<"shared"|"copied"|"dismissed"|"failed">}
 */
export async function deel({ title, text, url }) {
  if (has("Share")) {
    const { Share } = await import("@capacitor/share");
    try {
      await Share.share({ title, text, url, dialogTitle: title });
      return "shared";
    } catch {
      return "dismissed"; // the plugin rejects when the sheet is closed without sharing
    }
  }
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return "shared";
    } catch {
      return "dismissed";
    }
  }
  try {
    await navigator.clipboard.writeText(url || text || "");
    return "copied";
  } catch {
    return "failed";
  }
}

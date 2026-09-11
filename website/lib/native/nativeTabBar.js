import { registerPlugin } from "@capacitor/core";
import { has, isIOS } from "./platform";

// Bridge to ios/App/App/plugins/NativeTabBarPlugin.swift: a real UITabBar laid OVER the single
// webview. The webview is never resized or reparented; JS owns navigation (tabSelect → router).
//
// configure({ items, activeId, visible, tintColor, unselectedColor, style }) → { height }
// setActiveId({ id }) · setVisible({ visible }) · setBadge({ id, value }) · destroy()
// event: tabSelect { id, reselected }
export const NativeTabBar = registerPlugin("NativeTabBar");

/** iOS only: Android and the web keep the React bottom bar (components/BottomTabBar). */
export const nativeTabBarAvailable = () => isIOS() && has("NativeTabBar");

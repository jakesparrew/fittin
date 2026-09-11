"use client";
import dynamic from "next/dynamic";
import useIsApp from "./useIsApp";

// The native layer is only ever DOWNLOADED inside the app. On the website this component renders
// nothing and the chunk with Capacitor and the plugins is never requested.
const NativeBoot = dynamic(() => import("./NativeBoot"), { ssr: false });
const NativeTabBarSync = dynamic(() => import("./NativeTabBarSync"), { ssr: false });

export default function NativeGate() {
  const app = useIsApp();
  if (!app) return null;
  return (
    <>
      <NativeBoot />
      <NativeTabBarSync />
    </>
  );
}

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Read by the native app on launch and resume (components/native/NativeBoot). The site and the
// binaries deploy independently; APP_MIN_BUILD is the escape hatch that retires an old binary
// with one blocking "update" screen instead of letting it call server code it can't handle.
export function GET() {
  const iosId = process.env.IOS_APP_STORE_ID;
  return NextResponse.json(
    {
      minBuild: Number(process.env.APP_MIN_BUILD || 0),
      iosStoreUrl: iosId ? `itms-apps://apps.apple.com/app/id${iosId}` : "itms-apps://apps.apple.com/be/search?term=fittin",
      androidStoreUrl: "https://play.google.com/store/apps/details?id=be.fittin.app",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

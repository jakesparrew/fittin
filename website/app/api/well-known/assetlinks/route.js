import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Served at https://fittin.be/.well-known/assetlinks.json (rewrite in next.config.mjs).
// ANDROID_CERT_SHA256 = comma-separated SHA-256 fingerprints. The Play App Signing one is the one
// that matters: with only the upload key, every store install opens links in the browser.
export function GET() {
  const prints = (process.env.ANDROID_CERT_SHA256 || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!prints.length) return new NextResponse("Not configured", { status: 404 });
  return NextResponse.json(
    [{
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: "be.fittin.app", sha256_cert_fingerprints: prints },
    }],
    { headers: { "Cache-Control": "public, max-age=3600" } }
  );
}

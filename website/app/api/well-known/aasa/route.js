import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Served at https://fittin.be/.well-known/apple-app-site-association (rewrite in next.config.mjs):
// no extension, application/json, no redirect — Apple's three requirements.
//
// Which links open the app: the app's own pages. NOT /auth/* (a PKCE sign-in started in a browser
// can only be finished in that browser) and not /api/*. Keep in sync with the Android intent filter
// in android/app/src/main/AndroidManifest.xml.
export const APP_PATHS = [
  "/boeken", "/account", "/training", "/plannen", "/workouts", "/oefeningen", "/community",
  "/notificaties", "/coaching", "/events", "/coach", "/beheer", "/uitnodiging/", "/w/", "/f/", "/app",
];

export function GET() {
  const team = process.env.APPLE_TEAM_ID;
  if (!team) return new NextResponse("Not configured", { status: 404 });
  const appID = `${team}.be.fittin.app`;
  const components = [
    { "/": "/auth/*", exclude: true },
    { "/": "/api/*", exclude: true },
    ...APP_PATHS.flatMap((p) => (p.endsWith("/") ? [{ "/": `${p}*` }] : [{ "/": p }, { "/": `${p}/*` }])),
  ];
  return NextResponse.json(
    { applinks: { details: [{ appIDs: [appID], components }] }, webcredentials: { apps: [appID] } },
    { headers: { "Cache-Control": "public, max-age=3600" } }
  );
}

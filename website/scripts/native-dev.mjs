// npm run ios:dev  /  npm run android:dev  [-- --target <device-id>]
//
// One command for live app development: starts `next dev` when it isn't running yet, waits until
// /app answers, then builds and runs the app pointed at it. Without this, a dev build whose laptop
// server is down opens straight on the offline screen — which looks like a broken app.
//
// A dev build keeps pointing at the laptop. Before running a normal Xcode/Android Studio build
// against fittin.be again: `npm run cap:sync`.
import { spawn } from "node:child_process";

const platform = process.argv[2];
if (platform !== "ios" && platform !== "android") {
  console.error("usage: node scripts/native-dev.mjs ios|android [--target <id>]");
  process.exit(1);
}
const PORT = 3000;
// The Android emulator reaches the Mac as 10.0.2.2; the iOS simulator shares its localhost.
const host = platform === "android" ? "10.0.2.2" : "localhost";

const up = async () => {
  try {
    const r = await fetch(`http://localhost:${PORT}/app`, { signal: AbortSignal.timeout(3000) });
    return r.status < 500;
  } catch {
    return false;
  }
};

let server = null;
if (!(await up())) {
  console.log(`▶ next dev -p ${PORT}`);
  server = spawn("npx", ["next", "dev", "-p", String(PORT)], { stdio: "inherit" });
  let ok = false;
  for (let i = 0; i < 120 && !(ok = await up()); i++) await new Promise((r) => setTimeout(r, 1000));
  if (!ok) {
    console.error("dev server did not come up on :3000");
    server.kill();
    process.exit(1);
  }
}

const env = { ...process.env, NODE_ENV: "development", CAPACITOR_SERVER_URL: `http://${host}:${PORT}/app` };
// Gradle 8.14 can't run on JDK 25; Android Studio ships a JDK 21.
if (platform === "android" && !env.JAVA_HOME) env.JAVA_HOME = "/Applications/Android Studio.app/Contents/jbr/Contents/Home";

const run = spawn("npx", ["cap", "run", platform, ...process.argv.slice(3)], { stdio: "inherit", env });
run.on("exit", (code) => {
  if (!server) process.exit(code ?? 0);
  console.log("\n✓ App running. The dev server keeps serving for live changes — Ctrl+C to stop.");
});
process.on("SIGINT", () => {
  server?.kill();
  process.exit(0);
});

// One source of truth for the app version: package.json "version". Writes it everywhere the stores
// read it, so the simulator and the archive can never disagree (playbook §27).
//
//   npm run native:version                 → version from package.json, build = MMmmpp (1.2.3 → 10203)
//   npm run native:version -- --build 10204 → same display version, higher build (a re-upload)
//
// iOS: MARKETING_VERSION + CURRENT_PROJECT_VERSION for EVERY configuration (Debug AND Release — the
// classic miss is bumping only Debug). Add extension targets here if the app ever gets one.
// Android: versionName + versionCode. Build numbers only ever go up.
import { readFileSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const version = pkg.version;
if (!/^\d+\.\d+\.\d+$/.test(version || "")) throw new Error(`package.json version must be x.y.z, got "${version}"`);
const [maj, min, pat] = version.split(".").map(Number);
const flag = process.argv.indexOf("--build");
const build = flag > -1 ? Number(process.argv[flag + 1]) : maj * 10000 + min * 100 + pat;
if (!Number.isInteger(build) || build < 1) throw new Error("--build must be a positive integer");

const pbx = "ios/App/App.xcodeproj/project.pbxproj";
let p = readFileSync(pbx, "utf8");
const mv = (p.match(/MARKETING_VERSION = /g) || []).length;
const cv = (p.match(/CURRENT_PROJECT_VERSION = /g) || []).length;
p = p.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`);
p = p.replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${build};`);
writeFileSync(pbx, p);

const gradle = "android/app/build.gradle";
let g = readFileSync(gradle, "utf8");
g = g.replace(/versionCode \d+/, `versionCode ${build}`).replace(/versionName "[^"]*"/, `versionName "${version}"`);
writeFileSync(gradle, g);

console.log(`version ${version} (build ${build}) → iOS: ${mv} marketing + ${cv} build entries · Android: versionName/versionCode`);

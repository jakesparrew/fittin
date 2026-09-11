// Generates EVERY native icon, launch logo and splash image from the two brand sources:
//   assets/brand/app-mark.svg   the F + leaf mark (app icon)
//   assets/brand/logo-white.svg the wordmark (launch screen, splash)
// Run: npm run native:assets   (then a clean build in Xcode: the asset cache can ship an old icon)
//
// Why our own script and not @capacitor/assets: that tool pins sharp 0.32 with a native install
// step, and we already ship sharp 0.34. This also knows our layout rules (launch logo = 200pt, the
// same size the /app welcome screen uses), which the generic tool can't.
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const INDIGO = "#22194F";
const MARK = readFileSync("assets/brand/app-mark.svg");
const LOGO = readFileSync("assets/brand/logo-white.svg");
const LOGO_RATIO = 3456 / 992; // viewBox of logo-white.svg
const IOS = "ios/App/App/Assets.xcassets";
const RES = "android/app/src/main/res";
const STORE = "assets/store";

const out = [];
const write = async (path, pipeline) => {
  mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  await pipeline.png({ compressionLevel: 9 }).toFile(path);
  out.push(path);
};
const svgPng = (svg, width, height = width) => sharp(svg, { density: 300 }).resize(width, height, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();

/** Mark on an indigo square. `scale` = how much of the canvas the mark's 1024 box takes. */
async function icon(size, { scale = 1, shape = "square", alpha = false } = {}) {
  const inner = Math.round(size * scale);
  const mark = await svgPng(MARK, inner);
  const r = shape === "round" ? size / 2 : shape === "rounded" ? size * 0.22 : 0;
  const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" fill="${INDIGO}"/></svg>`);
  let img = sharp(bg).composite([{ input: mark, gravity: "center" }]);
  if (!alpha) img = sharp(await img.png().toBuffer()).flatten({ background: INDIGO }).removeAlpha();
  return img;
}

/** Wordmark centred on transparent (or indigo) canvas, `logoWidth` px wide. */
async function wordmark(w, h, logoWidth, { bg = null } = {}) {
  const lh = Math.round(logoWidth / LOGO_RATIO);
  const logo = await svgPng(LOGO, logoWidth, lh);
  const base = sharp({ create: { width: w, height: h, channels: 4, background: bg || { r: 0, g: 0, b: 0, alpha: 0 } } });
  return sharp(await base.composite([{ input: logo, gravity: "center" }]).png().toBuffer());
}

// ---------- iOS ----------
// App icon: one 1024 universal image, NO alpha channel (App Store rejects it otherwise).
await write(`${IOS}/AppIcon.appiconset/AppIcon-512@2x.png`, await icon(1024));

// Launch logo: 200pt wide in LaunchScreen.storyboard (and on the /app welcome screen).
mkdirSync(`${IOS}/LaunchLogo.imageset`, { recursive: true });
for (const [s, suffix] of [[1, ""], [2, "@2x"], [3, "@3x"]]) {
  const w = 200 * s;
  await write(`${IOS}/LaunchLogo.imageset/launch-logo${suffix}.png`, sharp(await svgPng(LOGO, w, Math.round(w / LOGO_RATIO))));
}
writeFileSync(`${IOS}/LaunchLogo.imageset/Contents.json`, JSON.stringify({
  images: [["", "1x"], ["@2x", "2x"], ["@3x", "3x"]].map(([s, scale]) => ({ idiom: "universal", filename: `launch-logo${s}.png`, scale })),
  info: { author: "xcode", version: 1 },
}, null, 2) + "\n");

// "Splash" image: only a fallback — the SplashScreen plugin renders LaunchScreen.storyboard.
for (const f of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) {
  await write(`${IOS}/Splash.imageset/${f}`, await wordmark(2732, 2732, 600, { bg: INDIGO }));
}

// ---------- Android ----------
const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(DENS)) {
  // Legacy launcher icons (API < 26).
  await write(`${RES}/mipmap-${d}/ic_launcher.png`, await icon(Math.round(48 * k), { shape: "rounded", alpha: true }));
  await write(`${RES}/mipmap-${d}/ic_launcher_round.png`, await icon(Math.round(48 * k), { shape: "round", alpha: true }));
  // Adaptive foreground: 108dp canvas, the launcher masks it to ~66dp. 0.68 keeps the mark's
  // corners (F foot, leaf tip) inside even the round mask.
  const fg = Math.round(108 * k);
  await write(`${RES}/mipmap-${d}/ic_launcher_foreground.png`, sharp(await svgPng(MARK, Math.round(fg * 0.68))).extend(pad(fg, Math.round(fg * 0.68))));
  // Themed icon (Android 13+): one colour, the system tints it.
  const mono = Buffer.from(MARK.toString().replaceAll("#5FDA6B", "#FFFFFF"));
  await write(`${RES}/mipmap-${d}/ic_launcher_monochrome.png`, sharp(await svgPng(mono, Math.round(fg * 0.68))).extend(pad(fg, Math.round(fg * 0.68))));
  // Android 12+ system splash icon: 288dp canvas, visible inside a 192dp circle. The wordmark is
  // 160dp wide — close to the 200pt of iOS, and it fits the circle.
  const sp = Math.round(288 * k);
  await write(`${RES}/drawable-${d}/splash_icon.png`, await wordmark(sp, sp, Math.round(160 * k)));
}

// Legacy full-screen splash drawables (pre-Android 12): regenerate at their existing sizes.
for (const dir of readdirSync(RES).filter((x) => x === "drawable" || x.startsWith("drawable-port") || x.startsWith("drawable-land"))) {
  const f = join(RES, dir, "splash.png");
  if (!existsSync(f)) continue;
  const { width, height } = await sharp(f).metadata();
  const buf = await (await wordmark(width, height, Math.round(Math.min(width, height) * 0.5), { bg: INDIGO })).png().toBuffer();
  writeFileSync(f, buf);
  out.push(f);
}

// ---------- Store graphics ----------
await write(`${STORE}/app-store-icon-1024.png`, await icon(1024));
await write(`${STORE}/play-icon-512.png`, await icon(512, { alpha: true }));
await write(`${STORE}/play-feature-graphic-1024x500.png`, await wordmark(1024, 500, 520, { bg: INDIGO }));

console.log(`wrote ${out.length} files`);

function pad(canvas, inner) {
  const a = Math.floor((canvas - inner) / 2);
  const b = canvas - inner - a;
  return { top: a, bottom: b, left: a, right: b, background: { r: 0, g: 0, b: 0, alpha: 0 } };
}

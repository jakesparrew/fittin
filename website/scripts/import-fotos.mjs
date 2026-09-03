// Importeert de echte gymfoto's naar web-formaat.
//
// WAAROM EEN SCRIPT EN GEEN HANDWERK: een merkbestand dat geen generator heeft, loopt vroeg of laat
// achter op de rest — dat is in dit project al eens gebeurd met de advertentiebeelden. De
// originelen blijven buiten de repo (60 MB); wat er wél in gaat zijn de geoptimaliseerde varianten
// die de site echt gebruikt.
//
//   node scripts/import-fotos.mjs "C:/pad/naar/map-met-originelen"
//
// Uitvoer: website/public/gym/<slug>-{1600,800}.webp + een base64-miniatuur per foto in
// public/gym/blur.json, zodat next/image een fatsoenlijke placeholder kan tonen.
import { readdir, mkdir, writeFile, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";
import sharp from "sharp";

const HIER = dirname(fileURLToPath(import.meta.url));
const PUBLIEK = join(HIER, "..", "public", "gym");
const BEWAAR = join(HIER, "..", "..", "_raw-assets", "foto");

// Semantische namen in plaats van "Fittin zaal logo 5.jpeg". De bestandsnaam van de fotograaf zegt
// niets over waar een beeld hoort; deze slugs wel, en ze staan in de code.
const KAART = {
  "Krachttraining (De gym) (voorkeur).jpeg": "zaal-breed",      // voorkeur van de eigenaar
  "Krachttraining rek optie 2.jpeg": "zaal-rek",
  "Fittin zaal logo 5.jpeg": "zaal-logo",
  "Fittin zaal logo 6.jpeg": "zaal-logo-2",
  "Fittin zaal logo 2.jpeg": "zaal-logo-staand",
  "Fittin rek.jpeg": "rek",
  "Fittin rek bench press.jpeg": "bench",
  "Fittin dumbell rek 2.jpeg": "dumbbells",
  "Fittin training Jelle logo.jpeg": "training-logo",
  "Fittin training Jelle functioneel 4.jpeg": "training-duo",
  "Fittin training Jelle functioneel 2.jpeg": "training-duo-staand",
  "Fittin logo Yoshe.jpeg": "training-pulldown",
};

const BREEDTES = [1600, 800];

const bron = process.argv[2];
if (!bron || !existsSync(bron)) {
  console.error("Geef de map met de originelen mee.\n  node scripts/import-fotos.mjs \"C:/pad/naar/map\"");
  process.exit(1);
}

await mkdir(PUBLIEK, { recursive: true });
await mkdir(BEWAAR, { recursive: true });

const bestanden = (await readdir(bron)).filter((f) => /\.jpe?g$/i.test(f));
const blur = {};
const index = [];

for (const f of bestanden) {
  const slug = KAART[f] || basename(f, ".jpeg").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const pad = join(bron, f);
  // Origineel bewaren buiten de repo, zodat een latere hersnede niet opnieuw om de bestanden vraagt.
  await copyFile(pad, join(BEWAAR, `${slug}.jpeg`));

  const meta = await sharp(pad).metadata();
  for (const w of BREEDTES) {
    if (meta.width < w && w !== BREEDTES.at(-1)) continue; // niet opblazen
    // rotate() eerst: telefoon- en camerabeelden dragen hun stand in EXIF, en zonder dit staan
    // sommige foto's op de site gekanteld terwijl ze in de verkenner rechtop lijken.
    await sharp(pad).rotate().resize({ width: w, withoutEnlargement: true })
      .webp({ quality: 82 }).toFile(join(PUBLIEK, `${slug}-${w}.webp`));
  }
  const mini = await sharp(pad).rotate().resize({ width: 16 }).webp({ quality: 40 }).toBuffer();
  blur[slug] = `data:image/webp;base64,${mini.toString("base64")}`;
  const m2 = await sharp(join(PUBLIEK, `${slug}-${BREEDTES[0]}.webp`)).metadata().catch(() => null);
  index.push({ slug, breedte: m2?.width || 0, hoogte: m2?.height || 0, staand: (m2?.height || 0) > (m2?.width || 0) });
  console.log(`✓ ${slug.padEnd(22)} ${meta.width}x${meta.height} → webp`);
}

await writeFile(join(PUBLIEK, "blur.json"), JSON.stringify(blur, null, 0));
await writeFile(join(PUBLIEK, "index.json"), JSON.stringify(index, null, 2));
console.log(`\n${bestanden.length} foto's in public/gym/ — originelen in _raw-assets/foto/`);

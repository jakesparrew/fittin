// Bijlagen bij een coach-aanmelding: een cv (pdf) en een foto, allebei optioneel.
//
// Deze keuring staat los van de databank zodat ze testbaar is, en ze is bewust streng op één punt:
// het MIME-type dat de browser meestuurt is een BEWERING van de indiener, geen feit. Iemand kan
// elk bestand "application/pdf" noemen. Daarom kijken we ook naar de eerste bytes. Voor de foto
// hoeft dat niet: die wordt door sharp opnieuw gecodeerd, en wat sharp niet kan lezen, is geen
// afbeelding — dat hercoderen strippt meteen ook de EXIF-gegevens (locatie van de kandidaat).

export const MAX_BYTES = 8 * 1024 * 1024;
export const MAX_MB = MAX_BYTES / 1024 / 1024;
export const FOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

// De pdf-header hoort vooraan te staan, maar de specificatie laat wat voorloop toe en sommige
// exporteurs maken daar gebruik van. Een kilobyte scannen dekt dat af zonder een willekeurig
// bestand met "%PDF-" ergens diep erin alsnog door te laten.
export function isPdf(bytes) {
  if (!bytes || bytes.length < 5) return false;
  const kop = Buffer.from(bytes.subarray(0, Math.min(1024, bytes.length))).toString("latin1");
  return kop.indexOf("%PDF-") !== -1;
}

// Een lege file-input levert een File met size 0 op; dat is "niets bijgevoegd", geen fout.
export const leeg = (f) => !f || typeof f === "string" || !f.size;

export function keurCv(file, bytes) {
  if (leeg(file)) return { ok: true, bestand: null };
  if (file.size > MAX_BYTES) return { error: `Je cv is te groot (max ${MAX_MB} MB).` };
  if (!isPdf(bytes)) return { error: "Je cv moet een pdf zijn. Exporteer je document als pdf en probeer opnieuw." };
  return { ok: true, bestand: file };
}

export function keurFoto(file) {
  if (leeg(file)) return { ok: true, bestand: null };
  if (file.size > MAX_BYTES) return { error: `Je foto is te groot (max ${MAX_MB} MB).` };
  // Het type mag hier wél leidend zijn: sharp moet er straks toch iets van kunnen maken, en een
  // vroege, begrijpelijke melding is beter dan "verwerken mislukt".
  if (!FOTO_TYPES.includes(String(file.type || "").toLowerCase())) {
    return { error: "Kies een foto (jpg, png of webp)." };
  }
  return { ok: true, bestand: file };
}

// De naam die de kandidaat meestuurt, komt in de beheerinbox te staan en wordt een downloadnaam.
// Alles wat een pad, een aanhalingsteken of een regeleinde kan worden, gaat eruit.
export function veiligeBestandsnaam(naam, val = "bestand") {
  const schoon = String(naam || "")
    .replace(/[\\/]/g, "-")
    .replace(/[^A-Za-z0-9._ -]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[.\s-]+/, "")
    .trim()
    .slice(0, 80);
  return schoon || val;
}

// Opslagpad in de privébak. Nooit de naam van de kandidaat in het pad: die naam is niet uniek en
// niet altijd veilig, en het pad belandt in de databank.
export const opslagPad = (gymId, id, soort, ext) => `${gymId}/${id}-${soort}.${ext}`;

export const SOORT_LABEL = { cv: "Cv", foto: "Foto" };

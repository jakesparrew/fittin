"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { leesClip, mapSleutel, standaardTitel } from "@/lib/clips";

// De serverkant van de persoonlijke videobibliotheek. Elke actie doet zijn eigen auth-controle:
// de RLS (0149) is de echte grens, maar een nette foutmelding hoort hier — niet als lege lijst
// verderop in de UI.

async function ikBenHet() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Je moet ingelogd zijn." };
  return { supabase, userId: user.id };
}

const kort = (v, n) => String(v ?? "").trim().slice(0, n);

// ── Deellinks oplossen ───────────────────────────────────────────────────────────────
// Instagram en TikTok delen tegenwoordig ondoorzichtige kortlinks (/share/reel/..., vm.tiktok.com).
// Daar valt geen kader uit te bouwen zonder te weten waar ze heen wijzen, dus volgen we de
// omleiding zelf.
//
// Bewust `redirect: "manual"` met een eigen hostcontrole per sprong: met "follow" bepaalt de
// tegenpartij waar onze server naartoe verbindt, en dat is precies het patroon waarmee je een
// server een intern adres laat opvragen. Hier kan elke sprong alleen naar Instagram of TikTok.
const OMLEID_OK = /(^|\.)(instagram\.com|tiktok\.com)$/i;

async function volgOmleiding(start) {
  let url = start;
  for (let hop = 0; hop < 4; hop++) {
    let u;
    try { u = new URL(url); } catch { return null; }
    if (u.protocol !== "https:" || !OMLEID_OK.test(u.hostname)) return null;
    let res;
    try {
      res = await fetch(u.href, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(6000),
        headers: {
          // Zonder een echte browser-user-agent stuurt Instagram iedereen naar de inlogmuur in
          // plaats van naar de post — gemeten, niet aangenomen.
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
          "accept-language": "nl-BE,nl;q=0.9,en;q=0.8",
        },
      });
    } catch { return null; }
    if (res.status < 300 || res.status >= 400) return hop === 0 ? null : url;
    const next = res.headers.get("location");
    if (!next) return null;
    url = new URL(next, u).href;
    const gelezen = leesClip(url);
    if (gelezen.ok && gelezen.embed) return url; // klaar zodra er een echt kader uit komt
  }
  return url;
}

// ── Titel voorstellen ────────────────────────────────────────────────────────────────
// YouTube en TikTok hebben een open oEmbed-eindpunt: één verzoek geeft de echte titel, zonder
// sleutel en zonder iets binnen te halen. Instagram heeft dat niet meer (sinds 2020 met token),
// dus daar typt de gebruiker zelf een naam. Mislukt dit, dan valt alles terug op standaardTitel:
// bewaren mag nooit stuklopen op een titel.
async function haalTitel(provider, url) {
  const punt = provider === "youtube"
    ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`
    : provider === "tiktok"
      ? `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`
      : null;
  if (!punt) return null;
  try {
    const res = await fetch(punt, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const json = await res.json();
    return kort(json?.title, 120) || null;
  } catch {
    return null;
  }
}

// Map zoeken of aanmaken op naam. De unieke index in 0149 gebruikt dezelfde normalisatie als
// mapSleutel, dus een botsing hier betekent "bestaat al" en niet "kapot".
async function zoekOfMaakMap(supabase, userId, naam) {
  const schoon = kort(naam, 40).replace(/\s+/g, " ");
  if (!schoon) return null;
  const { data: bestaande } = await supabase.from("clip_folders").select("id, name").eq("user_id", userId);
  const gevonden = (bestaande || []).find((m) => mapSleutel(m.name) === mapSleutel(schoon));
  if (gevonden) return gevonden.id;
  const { data, error } = await supabase
    .from("clip_folders").insert({ user_id: userId, name: schoon }).select("id").single();
  if (error) {
    // Race of hoofdlettervariant die we net misten: opnieuw lezen in plaats van falen.
    const { data: nogmaals } = await supabase.from("clip_folders").select("id, name").eq("user_id", userId);
    return (nogmaals || []).find((m) => mapSleutel(m.name) === mapSleutel(schoon))?.id || null;
  }
  return data.id;
}

/**
 * Een geplakte of gedeelde link bewaren. Bestaat de link al, dan verhuist die kaart naar de
 * gekozen map in plaats van een tweede kaart te maken — dat is wat iemand bedoelt die dezelfde
 * reel nog eens deelt.
 */
export async function bewaarClip({ ruw, titel, map, mapId, note } = {}) {
  const ctx = await ikBenHet();
  if (ctx.error) return ctx;
  const { supabase, userId } = ctx;

  let gelezen = leesClip(ruw);
  if (!gelezen.ok) return { error: gelezen.reden };

  if (gelezen.onopgelost) {
    const echt = await volgOmleiding(gelezen.url);
    if (echt) {
      const opnieuw = leesClip(echt);
      if (opnieuw.ok) gelezen = opnieuw;
    }
  }

  const gekozenMap = mapId ? kort(mapId, 40) : await zoekOfMaakMap(supabase, userId, map);
  const eigenTitel = kort(titel, 120);
  const eigenNote = kort(note, 500);

  // Bestaat deze link al? Dan is dit geen nieuwe kaart maar een herhaling — typisch iemand die
  // vanuit Instagram nog eens deelt wat hij vorige maand al bewaarde.
  const { data: bestaand } = await supabase
    .from("clips").select("id, title").eq("user_id", userId).eq("url", gelezen.url).maybeSingle();

  if (bestaand) {
    // Alleen bijwerken wat er écht ingevuld is. Blind overschrijven wiste de naam die iemand ooit
    // zelf typte ("Bulgarian split squat" werd weer "Instagram-reel") en gooide de map leeg —
    // stil verlies dat je pas weken later merkt. Verhuizen naar "Zonder map" kan bewust, in de
    // kaart zelf, waar het een expliciete keuze is en geen bijwerking.
    const patch = {};
    if (eigenTitel) patch.title = eigenTitel;
    if (eigenNote) patch.note = eigenNote;
    if (gekozenMap) patch.folder_id = gekozenMap;
    if (Object.keys(patch).length) {
      const { error } = await supabase.from("clips").update(patch).eq("id", bestaand.id).eq("user_id", userId);
      if (error) return { error: "Bijwerken lukte niet. Probeer het opnieuw." };
    }
    revalidatePath("/bewaard");
    return { ok: true, id: bestaand.id, titel: patch.title || bestaand.title, provider: gelezen.provider, alBekend: true };
  }

  const naam = eigenTitel || (await haalTitel(gelezen.provider, gelezen.url)) || standaardTitel(gelezen.provider);
  const { data, error } = await supabase.from("clips").insert({
    user_id: userId,
    folder_id: gekozenMap || null,
    url: gelezen.url,
    provider: gelezen.provider,
    ref: gelezen.ref,
    title: naam,
    note: eigenNote || null,
  }).select("id, title, folder_id").single();
  if (error) return { error: "Bewaren lukte niet. Probeer het opnieuw." };

  revalidatePath("/bewaard");
  return { ok: true, id: data.id, titel: data.title, provider: gelezen.provider, folderId: data.folder_id };
}

export async function hernoemClip(id, titel) {
  const ctx = await ikBenHet();
  if (ctx.error) return ctx;
  const naam = kort(titel, 120);
  if (!naam) return { error: "Geef een naam." };
  const { error } = await ctx.supabase.from("clips").update({ title: naam }).eq("id", id).eq("user_id", ctx.userId);
  if (error) return { error: "Hernoemen lukte niet." };
  revalidatePath("/bewaard");
  return { ok: true };
}

export async function verplaatsClip(id, folderId) {
  const ctx = await ikBenHet();
  if (ctx.error) return ctx;
  const { error } = await ctx.supabase
    .from("clips").update({ folder_id: folderId || null }).eq("id", id).eq("user_id", ctx.userId);
  if (error) return { error: "Verplaatsen lukte niet." };
  revalidatePath("/bewaard");
  return { ok: true };
}

export async function verwijderClip(id) {
  const ctx = await ikBenHet();
  if (ctx.error) return ctx;
  const { error } = await ctx.supabase.from("clips").delete().eq("id", id).eq("user_id", ctx.userId);
  if (error) return { error: "Verwijderen lukte niet." };
  revalidatePath("/bewaard");
  return { ok: true };
}

export async function nieuweMap(naam) {
  const ctx = await ikBenHet();
  if (ctx.error) return ctx;
  const id = await zoekOfMaakMap(ctx.supabase, ctx.userId, naam);
  if (!id) return { error: "Geef een naam voor de map." };
  revalidatePath("/bewaard");
  return { ok: true, id };
}

export async function hernoemMap(id, naam) {
  const ctx = await ikBenHet();
  if (ctx.error) return ctx;
  const schoon = kort(naam, 40).replace(/\s+/g, " ");
  if (!schoon) return { error: "Geef een naam." };
  const { error } = await ctx.supabase
    .from("clip_folders").update({ name: schoon }).eq("id", id).eq("user_id", ctx.userId);
  if (error) return { error: "Er bestaat al een map met die naam." };
  revalidatePath("/bewaard");
  return { ok: true };
}

// De clips blijven bestaan (folder_id valt op null → "Zonder map"). Een map wissen mag nooit
// stilletjes tien bewaarde links meenemen; dat is precies het soort verlies dat je pas weken
// later merkt.
export async function verwijderMap(id) {
  const ctx = await ikBenHet();
  if (ctx.error) return ctx;
  const { error } = await ctx.supabase.from("clip_folders").delete().eq("id", id).eq("user_id", ctx.userId);
  if (error) return { error: "Verwijderen lukte niet." };
  revalidatePath("/bewaard");
  return { ok: true };
}

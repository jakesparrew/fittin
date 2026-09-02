// Een videolink lezen: van welke bron komt hij, welk fragment is het, en hoe tonen we hem?
//
// WAAROM DIT BESTAAT: coaches en leden halen hun oefeningen van Instagram, YouTube en TikTok. Die
// link mogen we bewaren en tonen in het officiële kader van de bron. Wat we NIET mogen: de video
// zelf binnenhalen en op onze servers zetten. Dat zou vlot afspelen geven, maar het is tegen de
// voorwaarden van die platformen. Vandaar dat dit bestand links leest en nooit media ophaalt.
//
// Alles hier is puur — geen netwerk, geen database. Eén plek die beslist wat een geldige link is,
// in plaats van dezelfde regels half in het formulier en half op de server.

const IG_HOSTS = new Set(["instagram.com", "www.instagram.com", "m.instagram.com", "instagr.am", "www.instagr.am"]);
const YT_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "www.youtube-nocookie.com", "youtube-nocookie.com"]);
const YT_KORT = new Set(["youtu.be", "www.youtu.be"]);
const TT_HOSTS = new Set(["tiktok.com", "www.tiktok.com", "m.tiktok.com"]);
const TT_KORT = new Set(["vm.tiktok.com", "vt.tiktok.com"]);

const IG_CODE = /^[A-Za-z0-9_-]{5,30}$/;
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const TT_ID = /^\d{6,25}$/;

export const BRONNEN = {
  instagram: { label: "Instagram", kleur: "#C13584" },
  youtube: { label: "YouTube", kleur: "#FF0000" },
  tiktok: { label: "TikTok", kleur: "#000000" },
  video: { label: "Video", kleur: "#22194f" },
  link: { label: "Link", kleur: "#5a5479" },
};

// Een deelmenu plakt zelden een kale URL: Instagram stuurt de caption mee, WhatsApp zet er tekst
// omheen. Daarom vissen we de eerste http(s)-link uit wat er ook binnenkomt, in plaats van te
// eisen dat iemand netjes knipt. Sluitende leestekens horen niet bij de link.
export function vindLink(tekst) {
  const m = String(tekst || "").match(/https?:\/\/[^\s<>"'`]+/i);
  if (!m) return "";
  return m[0].replace(/[).,;!?\]]+$/, "");
}

// Het pad van een Instagram-link zegt om welk soort post het gaat (/reel/, /p/, /tv/). Dat houden
// we vast: /p/ omleiden naar /reel/ werkt niet altijd, en een verkeerd soort geeft een leeg kader.
function leesInstagram(u) {
  const delen = u.pathname.split("/").filter(Boolean);
  // Nieuwe deellinks (/share/reel/XXX, /share/XXX) zijn ondoorzichtige omleidingen: de code erin
  // is niet de code van de post. Die kunnen we hier niet oplossen — de server probeert de
  // omleiding te volgen, en lukt dat niet, dan blijft het een gewone link die gewoon opent.
  if (delen[0] === "share") {
    return { provider: "instagram", ref: null, url: u.href, embed: null, onopgelost: true };
  }
  const i = delen.findIndex((d) => d === "reel" || d === "reels" || d === "p" || d === "tv");
  if (i === -1 || !delen[i + 1]) return null;
  const code = delen[i + 1];
  if (!IG_CODE.test(code)) return null;
  const soort = delen[i] === "reels" ? "reel" : delen[i];
  const url = `https://www.instagram.com/${soort}/${code}/`;
  return { provider: "instagram", ref: code, url, embed: `${url}embed/captioned/` };
}

function leesYoutube(u) {
  let id = "";
  if (YT_KORT.has(u.hostname)) id = u.pathname.split("/").filter(Boolean)[0] || "";
  else {
    const delen = u.pathname.split("/").filter(Boolean);
    if (delen[0] === "watch") id = u.searchParams.get("v") || "";
    else if (["shorts", "embed", "live", "v"].includes(delen[0])) id = delen[1] || "";
  }
  if (!YT_ID.test(id)) return null;
  return {
    provider: "youtube",
    ref: id,
    url: `https://www.youtube.com/watch?v=${id}`,
    // nocookie: YouTube zet dan pas een cookie als er echt afgespeeld wordt. Fittin' draait
    // bewust zonder cookiebanner (zie de juridische nota) — dat willen we zo houden.
    embed: `https://www.youtube-nocookie.com/embed/${id}?rel=0`,
  };
}

function leesTiktok(u) {
  if (TT_KORT.has(u.hostname)) {
    return { provider: "tiktok", ref: null, url: u.href, embed: null, onopgelost: true };
  }
  const delen = u.pathname.split("/").filter(Boolean);
  const i = delen.indexOf("video");
  const id = i === -1 ? "" : delen[i + 1] || "";
  if (!TT_ID.test(id)) return null;
  const gebruiker = delen[0] && delen[0].startsWith("@") ? delen[0] : "@tiktok";
  return {
    provider: "tiktok",
    ref: id,
    url: `https://www.tiktok.com/${gebruiker}/video/${id}`,
    embed: `https://www.tiktok.com/embed/v2/${id}`,
  };
}

// Het enige geval waarin we de video wél zelf afspelen: een rechtstreeks bestand. Dat is meestal
// een clip die de coach zelf filmde en ergens neerzette — geen platformmateriaal.
function leesBestand(u) {
  if (!/\.(mp4|webm|mov|m4v)$/i.test(u.pathname)) return null;
  return { provider: "video", ref: null, url: u.href, embed: u.href };
}

/**
 * Leest ruwe invoer (een link, of tekst met een link erin) tot een bewaarbare clip.
 * @returns {{ok: true, provider: string, ref: string|null, url: string, embed: string|null,
 *            label: string, onopgelost?: boolean} | {ok: false, reden: string}}
 */
export function leesClip(ruw) {
  const tekst = String(ruw || "").trim();
  if (!tekst) return { ok: false, reden: "Plak eerst een link." };
  // Een gedeelde tekst kan lang zijn (caption + link). De link zelf is nooit zo lang; alles
  // daarboven is geen link maar een lap tekst, en die hoort niet in de database.
  if (tekst.length > 4000) return { ok: false, reden: "Dit is te lang om een link te zijn." };

  const kaal = vindLink(tekst) || tekst;
  let u;
  try {
    u = new URL(kaal);
  } catch {
    return { ok: false, reden: "Dat lijkt geen geldige link. Kopieer hem opnieuw uit de app." };
  }
  // Alleen http(s). Zonder deze grens kan een `javascript:`-link in een kaart belanden en op een
  // tik uitgevoerd worden — precies de klassieke fout bij door gebruikers geplakte links.
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    return { ok: false, reden: "Alleen links die met https:// beginnen." };
  }
  if (u.href.length > 1000) return { ok: false, reden: "Deze link is te lang." };

  const host = u.hostname.toLowerCase();
  let res = null;
  if (IG_HOSTS.has(host)) res = leesInstagram(u);
  else if (YT_HOSTS.has(host) || YT_KORT.has(host)) res = leesYoutube(u);
  else if (TT_HOSTS.has(host) || TT_KORT.has(host)) res = leesTiktok(u);
  if (!res) res = leesBestand(u);
  // Alles wat we niet herkennen blijft bewaarbaar als gewone link. Een bibliotheek die de helft
  // van wat je plakt weigert, gebruik je niet — openen in een nieuw tabblad werkt altijd.
  if (!res) res = { provider: "link", ref: null, url: u.href, embed: null };

  return { ok: true, label: BRONNEN[res.provider].label, ...res };
}

// Een naam om mee te beginnen als iemand er zelf geen typt. Bewaren mag nooit vastlopen op een
// verplicht veld: hernoemen kan later in één tik, een verloren link niet.
export function standaardTitel(provider) {
  return provider === "instagram" ? "Instagram-reel"
    : provider === "youtube" ? "YouTube-video"
    : provider === "tiktok" ? "TikTok-video"
    : "Video";
}

// Mapnamen normaliseren zodat "Leg day", "leg day" en " Leg Day " één map zijn. De schrijfwijze
// die iemand als eerste koos blijft staan; alleen het vergelijken gebeurt hierop.
export function mapSleutel(naam) {
  return String(naam || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Een bewaarde rij aanvullen met wat we niet opslaan omdat het altijd afleidbaar is: het
// kaderadres en het bronlabel. Zo staat de embed-regel op één plek in plaats van in elke pagina.
export function verrijkClip(rij) {
  const gelezen = leesClip(rij?.url || "");
  return {
    ...rij,
    provider: rij?.provider || (gelezen.ok ? gelezen.provider : "link"),
    embed: gelezen.ok ? gelezen.embed : null,
    label: BRONNEN[rij?.provider]?.label || (gelezen.ok ? gelezen.label : "Link"),
    // YouTube publiceert per video een blijvend beeldadres. Instagram en TikTok doen dat niet
    // (hun URL's zijn ondertekend en verlopen), dus daar krijgt de kaart onze eigen tegel.
    poster: rij?.provider === "youtube" && rij?.ref ? `https://img.youtube.com/vi/${rij.ref}/hqdefault.jpg` : null,
  };
}

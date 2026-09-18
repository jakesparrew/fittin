// Ondertekende links voor één handeling van één persoon — zonder token-kolom in de databank.
//
// Waarom niet nog een token op `bookings`: 0160 leerde dat één sleutel die in twee mails staat, twee bevoegdheden
// draagt (de coach kon via het meldtoken de sessie van zijn klant afvinken). En `bookings` is voor ingelogde leden
// tabelbreed leesbaar, dus een token-kolom is ook zichtbaar voor wie de boeking mag lezen (een coach bij zijn klant).
// Een HMAC over (doel, id) heeft die problemen niet: de link bestaat enkel in de mail die hem krijgt, en een link
// voor 'zaal' werkt niet als 'kom'.
//
// De sleutel is afgeleid van de service-role key: die staat al op de server, nooit in de browser. Wordt hij
// geroteerd, dan werken oude mails niet meer — voor links die een paar uur tot dagen leven, is dat aanvaardbaar.

import crypto from "node:crypto";

function geheim() {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.CRON_SECRET;
  if (!k) throw new Error("geen server-sleutel voor ondertekende links");
  return k;
}

const handtekening = (doel, id) =>
  crypto.createHmac("sha256", geheim()).update(`fittin-link:${doel}:${id}`).digest("base64url").slice(0, 22);

/** "<id>.<handtekening>" — veilig in een URL-pad. */
export const maakSleutel = (doel, id) => `${id}.${handtekening(doel, id)}`;

/** Geeft het id terug als de sleutel klopt voor dit doel, anders null. */
export function leesSleutel(doel, sleutel) {
  const s = String(sleutel || "").slice(0, 120);
  const i = s.lastIndexOf(".");
  if (i <= 0) return null;
  const id = s.slice(0, i), sig = s.slice(i + 1);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const goed = handtekening(doel, id);
  if (sig.length !== goed.length) return null;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(goed)) ? id : null;
}

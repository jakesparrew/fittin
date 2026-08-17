// Bouwt de auth-cookies voor een bestaand account, zónder iets in de databank te wijzigen.
//
// generateLink() verstuurt géén mail en zet niks om — het geeft enkel een eenmalig token terug.
// Dat token wisselen we bij /auth/v1/verify om voor tokens, en die laten we door @supabase/ssr
// zélf in cookievorm gieten. Zo raden we het cookieformaat niet: de bibliotheek die de app
// gebruikt schrijft ze, dus ze kloppen per definitie.
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

export async function authCookies(email) {
  const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error("generateLink: " + error.message);
  const token = data?.properties?.hashed_token;
  if (!token) throw new Error("geen hashed_token teruggekregen");

  const res = await fetch(
    `${URL_}/auth/v1/verify?token=${encodeURIComponent(token)}&type=magiclink&redirect_to=http://localhost:3210/`,
    { redirect: "manual", headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY } }
  );
  const loc = res.headers.get("location") || "";
  const hash = new URLSearchParams(loc.split("#")[1] || "");
  const access_token = hash.get("access_token");
  const refresh_token = hash.get("refresh_token");
  if (!access_token) throw new Error("verify gaf geen token: " + loc.slice(0, 200));

  const jar = [];
  const ssr = createServerClient(URL_, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: { getAll: () => [], setAll: (cs) => jar.push(...cs) },
  });
  await ssr.auth.setSession({ access_token, refresh_token });
  if (!jar.length) throw new Error("ssr schreef geen cookies");

  return jar.map((c) => ({
    name: c.name, value: c.value, domain: "localhost", path: "/",
    httpOnly: false, secure: false, sameSite: "Lax",
  }));
}

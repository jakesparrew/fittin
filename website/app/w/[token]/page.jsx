import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { publiekSchema } from "@/lib/workout-share";
import AdoptButton from "@/components/workouts/AdoptButton";

export const dynamic = "force-dynamic";

// Login-vrije pagina voor een gedeeld schema. Een lid dat zijn schema in een WhatsApp-groep zet,
// is het goedkoopste acquisitiekanaal dat er bestaat: wie het opent ziet meteen wat hij krijgt,
// en heeft één duidelijke reden om een account te maken — het schema overnemen.
//
// Bewust géén index in Google: dit zijn persoonlijke schema's die iemand met vrienden deelt, geen
// publieke content. De link is een sleutel, geen publicatie.
export const metadata = { robots: { index: false, follow: false } };

// De service-role-client is hier juist: de bezoeker is niet ingelogd en heeft dus geen recht op
// programs. De TOKEN is de toegangscontrole, en die controleren we hieronder expliciet.
export default async function GedeeldSchema({ params }) {
  const { token } = await params;
  if (!token || token.length < 10) notFound();
  const admin = createAdminClient();

  const { data: program } = await admin
    .from("programs")
    .select("id, name, subtitle, level, est_minutes, focus, member_id, share_token")
    .eq("share_token", token)
    .maybeSingle();
  // Ingetrokken link (share_token op null) → gewoon 404, geen uitleg. Wie de link niet meer mag
  // zien, hoeft ook niet te weten dat er ooit iets stond.
  if (!program) notFound();

  const [{ data: dagen }, { data: eigenaar }] = await Promise.all([
    admin.from("program_days").select("id, day_no, name").eq("program_id", program.id).order("day_no"),
    admin.from("profiles").select("full_name").eq("id", program.member_id).maybeSingle(),
  ]);

  const dagIds = (dagen || []).map((d) => d.id);
  const { data: oef } = dagIds.length
    ? await admin
        .from("program_exercises")
        .select("program_day_id, sets, reps, rep_text, rest_sec, position, exercise:exercises(name, slug, image_url)")
        .in("program_day_id", dagIds).order("position")
    : { data: [] };

  const perDag = new Map();
  for (const o of oef || []) {
    if (!perDag.has(o.program_day_id)) perDag.set(o.program_day_id, []);
    perDag.get(o.program_day_id).push(o);
  }
  const schema = publiekSchema(
    program,
    (dagen || []).map((d) => ({ ...d, oefeningen: perDag.get(d.id) || [] })),
    eigenaar?.full_name
  );

  const totaalOefeningen = schema.dagen.reduce((a, d) => a + d.oefeningen.length, 0);

  return (
    <main className="min-h-screen bg-paper">
      <div className="mx-auto max-w-2xl px-5 py-12">
        <p className="text-sm font-black uppercase tracking-[0.25em] text-accentdark">Gedeeld schema</p>
        <h1 className="mt-2 text-3xl font-black text-brand md:text-4xl">{schema.naam}</h1>
        {schema.door && <p className="mt-1 text-sm text-brand/55">Gedeeld door {schema.door}</p>}

        <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
          {schema.niveau && <span className="rounded-full bg-white px-3 py-1.5 capitalize text-brand/70">{schema.niveau}</span>}
          {schema.minuten && <span className="rounded-full bg-white px-3 py-1.5 text-brand/70">± {schema.minuten} min</span>}
          <span className="rounded-full bg-white px-3 py-1.5 text-brand/70">{schema.dagen.length} {schema.dagen.length === 1 ? "dag" : "dagen"} · {totaalOefeningen} oefeningen</span>
        </div>

        {/* De overneemknop staat BOVEN het schema én eronder: wie overtuigd is door de kop hoeft
            niet eerst langs alles te scrollen, wie twijfelt vindt hem na het lezen. */}
        <div className="mt-6"><AdoptButton token={token} /></div>

        <div className="mt-8 space-y-4">
          {schema.dagen.map((d, i) => (
            <section key={i} className="rounded-3xl border border-borderc bg-white p-5">
              <h2 className="font-black text-brand">{d.naam}</h2>
              <ol className="mt-3 space-y-2">
                {d.oefeningen.map((o, j) => (
                  <li key={j} className="flex items-center gap-3 rounded-2xl bg-paper/60 p-3">
                    <span className="w-6 shrink-0 text-center font-black text-brand/35">{j + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-bold text-brand">
                        {o.slug ? <Link href={`/oefeningen/${o.slug}`} className="hover:text-accentdark hover:underline">{o.naam}</Link> : o.naam}
                      </span>
                      <span className="text-xs text-brand/55">
                        {o.sets ? `${o.sets} × ` : ""}{o.reps || "—"}{o.rust ? ` · rust ${o.rust}s` : ""}
                      </span>
                    </span>
                  </li>
                ))}
                {d.oefeningen.length === 0 && <li className="text-sm text-brand/40">Nog geen oefeningen op deze dag.</li>}
              </ol>
            </section>
          ))}
        </div>

        <div className="mt-8 rounded-3xl bg-brand p-6 text-center text-white">
          <p className="text-lg font-black">Train dit schema bij Fittin&rsquo;</p>
          <p className="mt-1 text-sm text-lav">
            Je eigen privégym in Gent — de hele zaal voor jou alleen tijdens je uur. Neem dit schema over en begin.
          </p>
          <div className="mt-4"><AdoptButton token={token} donker /></div>
        </div>
      </div>
    </main>
  );
}

import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/auth";
import { fmtHour } from "@/lib/time";

export const dynamic = "force-dynamic";
const WD = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const dagdeel = (h) => (h < 12 ? "Voormiddag" : h < 17 ? "Namiddag" : "Avond");

export async function generateMetadata({ params }) {
  const { id } = await params;
  const admin = createAdminClient();
  const { data: c } = await admin.from("profiles").select("full_name, coach_specialty, coach_public, role").eq("id", id).maybeSingle();
  if (!c || c.role !== "coach" || !c.coach_public) return { title: "Coach | Fittin'" };
  return { title: `${c.full_name} — coach bij Fittin'`, description: `${c.full_name}${c.coach_specialty ? ` · ${c.coach_specialty}` : ""} — personal trainer bij Fittin' in Gent.` };
}

export default async function CoachProfile({ params }) {
  const { id } = await params;
  const admin = createAdminClient();
  const [{ data: c }, { data: avail }] = await Promise.all([
    admin.from("profiles").select("id, full_name, role, coach_public, coach_bio, coach_specialty, coach_photo_url, coach_pricelist").eq("id", id).maybeSingle(),
    admin.from("coach_availability").select("weekday, from_hour, to_hour").eq("coach_id", id).order("weekday"),
  ]);
  if (!c || c.role !== "coach" || !c.coach_public) notFound();
  const { user } = await getSessionProfile();

  return (
    <main className="bg-paper">
      <div className="mx-auto max-w-4xl px-5 py-16">
        <Link href="/coaches" className="text-sm font-semibold text-brand/50 hover:text-brand">← Alle coaches</Link>

        <div className="mt-6 grid gap-8 md:grid-cols-[300px_1fr]">
          <div>
            <div className="relative aspect-[4/5] overflow-hidden rounded-3xl border border-borderc bg-white">
              {c.coach_photo_url ? (
                <Image src={c.coach_photo_url} alt={c.full_name || "Coach"} fill sizes="(max-width: 768px) 100vw, 300px" className="object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-7xl font-black text-brand/15">{(c.full_name || "C").slice(0, 1)}</div>
              )}
            </div>
            <Link href={user ? "/boeken" : "/login?next=/boeken"} className="mt-4 block rounded-full bg-accent px-6 py-3.5 text-center text-sm font-black text-brand transition hover:opacity-90">
              {user ? "Boek een sessie →" : "Maak een account om te boeken →"}
            </Link>
          </div>

          <div>
            <h1 className="text-4xl font-black text-brand">{c.full_name}</h1>
            {c.coach_specialty && <p className="mt-1 text-lg font-bold text-accentdark">{c.coach_specialty}</p>}
            {c.coach_bio && <p className="mt-5 whitespace-pre-line leading-relaxed text-brand/70">{c.coach_bio}</p>}

            {c.coach_pricelist && (
              <div className="mt-6 rounded-2xl border border-borderc bg-white p-5">
                <p className="text-xs font-bold uppercase tracking-widest text-lav">Prijzen</p>
                <p className="mt-2 whitespace-pre-line text-sm text-brand/80">{c.coach_pricelist}</p>
              </div>
            )}

            {(avail || []).length > 0 && (
              <div className="mt-4 rounded-2xl border border-borderc bg-white p-5">
                <p className="text-xs font-bold uppercase tracking-widest text-lav">Beschikbaarheid</p>
                <div className="mt-3 space-y-2">
                  {[1, 2, 3, 4, 5, 6, 0].map((wd) => {
                    const slots = (avail || []).filter((a) => a.weekday === wd).sort((a, b) => a.from_hour - b.from_hour);
                    if (!slots.length) return null;
                    return (
                      <div key={wd} className="flex flex-wrap items-center gap-2">
                        <span className="w-24 shrink-0 font-bold capitalize text-brand">{WD[wd]}</span>
                        <div className="flex flex-wrap gap-1.5">
                          {slots.map((a, i) => (
                            <span key={i} className="inline-flex items-center rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accentdark">
                              {dagdeel(a.from_hour)} · {fmtHour(a.from_hour)}–{fmtHour(a.to_hour)}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

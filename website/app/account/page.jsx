import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { cancelBookingAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mijn account | Fittin'" };

const euro = (c) => "€ " + (c / 100).toFixed(2).replace(".", ",");

function fmtRange(startIso, endIso) {
  const date = new Intl.DateTimeFormat("nl-BE", {
    timeZone: "Europe/Brussels",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(startIso));
  const t = (iso) =>
    new Intl.DateTimeFormat("nl-BE", {
      timeZone: "Europe/Brussels",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  return `${date} · ${t(startIso)}–${t(endIso)}`;
}

const ROLE_LABEL = { lid: "Lid", coach: "Coach", beheerder: "Beheerder" };

export default async function AccountPage() {
  if (!isSupabaseConfigured) redirect("/login");
  const { user, profile } = await getSessionProfile();
  if (!user) redirect("/login?next=/account");

  const supabase = await createClient();
  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, starts_at, ends_at, status, persons, price_cents, payment_source, services(name,type)")
    .eq("user_id", user.id)
    .order("starts_at", { ascending: true });

  const { data: ledger } = await supabase.from("credits_ledger").select("delta").eq("user_id", user.id);
  const credits = (ledger || []).reduce((a, r) => a + r.delta, 0);

  const now = Date.now();
  const all = bookings || [];
  const upcoming = all.filter((b) => b.status === "bevestigd" && new Date(b.starts_at).getTime() >= now);
  const history = all
    .filter((b) => !(b.status === "bevestigd" && new Date(b.starts_at).getTime() >= now))
    .reverse();

  const firstName = (profile?.full_name || "").split(" ")[0] || "daar";

  return (
    <main className="bg-paper">
      <div className="mx-auto max-w-4xl px-5 py-16">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">Mijn account</p>
            <h1 className="mt-2 text-3xl font-black md:text-4xl">Hey {firstName} 👋</h1>
            <p className="mt-2 text-sm text-brand/60">
              {profile?.email} · {ROLE_LABEL[profile?.role] || "Lid"}
            </p>
          </div>
          <form action="/auth/signout" method="post">
            <button className="rounded-full border-2 border-borderc px-5 py-2.5 text-sm font-bold text-brand transition hover:border-lav">
              Uitloggen
            </button>
          </form>
        </div>

        {/* Stat row */}
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Stat label="Aankomende sessies" value={upcoming.length} />
          <Stat label="Credits" value={credits} />
          <Stat
            label="Welkomstsessie"
            value={profile?.welcome_code_used ? "Gebruikt" : "Beschikbaar"}
            accent={!profile?.welcome_code_used}
          />
        </div>

        {/* Upcoming */}
        <section className="mt-12">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black">Aankomende boekingen</h2>
            <Link
              href="/boeken"
              className="rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-brand transition hover:opacity-90"
            >
              + Nieuwe boeking
            </Link>
          </div>

          {upcoming.length === 0 ? (
            <div className="mt-5 rounded-3xl border border-dashed border-borderc bg-white p-10 text-center">
              <p className="font-semibold text-brand/70">Je hebt nog geen sessies geboekt.</p>
              <Link
                href="/boeken"
                className="mt-5 inline-block rounded-full bg-brand px-7 py-3.5 font-bold text-white transition hover:opacity-90"
              >
                Reserveer de gym
              </Link>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {upcoming.map((b) => (
                <div
                  key={b.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-borderc bg-white p-5"
                >
                  <div>
                    <p className="font-black">{b.services?.name || "Sessie"}</p>
                    <p className="mt-1 text-sm capitalize text-brand/60">
                      {fmtRange(b.starts_at, b.ends_at)}
                    </p>
                    <p className="mt-1 text-xs text-brand/50">
                      {b.persons} {b.persons === 1 ? "persoon" : "personen"} ·{" "}
                      {b.payment_source === "gratis_code" ? "Gratis (FittinWelcome)" : euro(b.price_cents)}
                    </p>
                  </div>
                  <form action={cancelBookingAction}>
                    <input type="hidden" name="bookingId" value={b.id} />
                    <button className="rounded-full border-2 border-borderc px-5 py-2.5 text-sm font-bold text-brand transition hover:border-red-300 hover:text-red-600">
                      Annuleren
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* History */}
        {history.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xl font-black">Geschiedenis</h2>
            <div className="mt-5 divide-y divide-borderc rounded-2xl border border-borderc bg-white">
              {history.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div>
                    <p className="font-bold text-brand/80">{b.services?.name || "Sessie"}</p>
                    <p className="mt-0.5 text-sm capitalize text-brand/50">
                      {fmtRange(b.starts_at, b.ends_at)}
                    </p>
                  </div>
                  <span
                    className={
                      "rounded-full px-3 py-1 text-xs font-bold " +
                      (b.status === "geannuleerd"
                        ? "bg-paper text-brand/50"
                        : "bg-accent/15 text-accentdark")
                    }
                  >
                    {b.status === "geannuleerd" ? "Geannuleerd" : "Voltooid"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="rounded-2xl border border-borderc bg-white p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-lav">{label}</p>
      <p className={"mt-2 text-2xl font-black " + (accent ? "text-accentdark" : "text-brand")}>{value}</p>
    </div>
  );
}

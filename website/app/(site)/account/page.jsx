import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { cancelBookingAction } from "./actions";
import { resumeCheckoutAction } from "../boeken/actions";
import { openBillingPortal, activateWelcome } from "../lidmaatschap/actions";
import DoorButton from "@/components/DoorButton";
import PendingPaymentBanner from "@/components/PendingPaymentBanner";
import NextSessionTimer from "@/components/NextSessionTimer";
import BookingBuddies from "@/components/booking/BookingBuddies";
import ShareRank from "@/components/ShareRank";
import AccountSettings from "@/components/account/AccountSettings";
import AccountLinking from "@/components/account/AccountLinking";

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

export default async function AccountPage({ searchParams }) {
  if (!isSupabaseConfigured) redirect("/login");
  const { user, profile } = await getSessionProfile();
  if (!user) redirect("/login?next=/account");
  const sp = (await searchParams) || {};

  const supabase = await createClient();
  // Release any of this gym's abandoned unpaid slots first (so they show as cancelled + free up).
  await supabase.rpc("expire_unpaid_bookings", { p_gym: profile.gym_id });
  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, starts_at, ends_at, status, persons, price_cents, payment_source, paid, created_at, services(name,type)")
    .eq("user_id", user.id)
    .order("starts_at", { ascending: true });

  const { data: ledger } = await supabase.from("credits_ledger").select("delta").eq("user_id", user.id);
  const credits = (ledger || []).reduce((a, r) => a + r.delta, 0);

  const { data: membership } = await supabase
    .from("memberships")
    .select("status, current_period_end, cancel_at_period_end")
    .eq("user_id", user.id)
    .eq("status", "actief")
    .maybeSingle();

  // Sessions you were invited to by another member (you're a participant, not the booker).
  const admin = createAdminClient();
  const { data: invitedRows } = await admin
    .from("booking_participants")
    .select("booking:bookings(id, starts_at, ends_at, status, persons, paid, price_cents, payment_source, services(name,type), booker:profiles!bookings_user_id_fkey(full_name))")
    .eq("user_id", user.id);
  const invitedSessions = (invitedRows || [])
    .map((r) => r.booking)
    // Only surface an invited session once the booker actually paid (or it's a free/credit session).
    .filter((b) => b && b.status === "bevestigd" && (b.paid || b.price_cents === 0 || b.payment_source !== "los"))
    .map((b) => ({ ...b, invited: true, paid: true, payment_source: "invite", price_cents: 0, services: b.services }));

  // Your assigned coach (if any).
  const { data: coachLink } = await admin
    .from("coach_clients")
    .select("coach:profiles!coach_clients_coach_id_fkey(full_name, email)")
    .eq("client_id", user.id)
    .maybeSingle();
  const myCoach = coachLink?.coach || null;

  // Monthly leaderboard (this gym) + the member's rank.
  const monthStartLb = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const { data: boardRows } = await admin
    .from("bookings")
    .select("user_id, member:profiles!bookings_user_id_fkey(full_name)")
    .eq("gym_id", profile.gym_id)
    .eq("status", "bevestigd")
    .gte("starts_at", monthStartLb.toISOString())
    .lt("starts_at", new Date().toISOString());
  const lbCounts = {};
  for (const b of boardRows || []) { const k = b.user_id; (lbCounts[k] ||= { name: b.member?.full_name || "Lid", n: 0 }).n++; }
  const leaderboard = Object.entries(lbCounts).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.n - a.n);
  const myRank = leaderboard.findIndex((r) => r.id === user.id);

  const now = Date.now();
  const all = [...(bookings || []), ...invitedSessions];
  const doorActive = all.some(
    (b) =>
      b.status === "bevestigd" &&
      now >= new Date(b.starts_at).getTime() - 5 * 60000 &&
      now <= new Date(b.ends_at).getTime()
  );
  const upcoming = all.filter((b) => b.status === "bevestigd" && new Date(b.starts_at).getTime() >= now);
  const nextSession = upcoming[0]; // upcoming is sorted ascending by starts_at
  const bookedCount = all.filter((b) => b.status === "bevestigd").length; // lifetime confirmed (scoreboard)
  // Pending payment: confirmed-but-unpaid 'los' bookings (20-min window from creation).
  const pendingPay = upcoming
    .filter((b) => !b.paid && b.payment_source === "los" && b.price_cents > 0)
    .map((b) => ({
      id: b.id,
      name: b.services?.name || "Sessie",
      price: b.price_cents,
      deadline: new Date(new Date(b.created_at).getTime() + 20 * 60000).toISOString(),
    }));
  const history = all
    .filter((b) => !(b.status === "bevestigd" && new Date(b.starts_at).getTime() >= now))
    .reverse();

  // Who you've already invited to each of your own bookings (for the manage-buddies UI).
  const ownIds = (bookings || []).map((b) => b.id);
  const partMap = {};
  if (ownIds.length) {
    const { data: parts } = await admin
      .from("booking_participants")
      .select("booking_id, user_id, member:profiles!booking_participants_user_id_fkey(full_name)")
      .in("booking_id", ownIds);
    for (const p of parts || []) (partMap[p.booking_id] ||= []).push({ id: p.user_id, name: p.member?.full_name || "Lid" });
  }

  const firstName = (profile?.full_name || "").split(" ")[0] || "daar";

  return (
    <main className="bg-paper">
      <div className="mx-auto max-w-4xl px-5 py-16">
        {pendingPay.length > 0 && <PendingPaymentBanner items={pendingPay} />}

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
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Aankomende sessies" value={upcoming.length} />
          <Stat label="Sessies (saldo)" value={credits} />
          <Stat label="Totaal geboekt" value={bookedCount} />
          <Stat
            label="Welkomstsessie"
            value={profile?.welcome_code_used ? "Gebruikt" : "Beschikbaar"}
            accent={!profile?.welcome_code_used}
          />
        </div>

        {nextSession && <NextSessionTimer startsAt={nextSession.starts_at} name={nextSession.services?.name} />}

        {myCoach && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-borderc bg-white p-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-lav">Jouw coach</p>
              <p className="mt-1 text-lg font-black text-brand">{myCoach.full_name || "Je coach"}</p>
            </div>
            <Link href="/training" className="rounded-full bg-paper px-5 py-2.5 text-sm font-bold text-brand transition hover:bg-accent/15">Mijn training →</Link>
          </div>
        )}

        {/* Leaderboard + share */}
        <section className="mt-6 rounded-3xl border border-borderc bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-black text-brand">Leaderboard <span className="text-brand/40">· deze maand</span></h2>
              <p className="text-sm text-brand/60">
                {myRank >= 0 ? <>Je staat <span className="font-black text-accentdark">#{myRank + 1}</span> van de {leaderboard.length} leden.</> : "Boek een sessie deze maand om mee te doen."}
              </p>
            </div>
            {myRank >= 0 && <ShareRank />}
          </div>
          <div className="mt-4 space-y-2">
            {leaderboard.slice(0, 5).map((r, i) => (
              <div key={r.id} className={"flex items-center justify-between rounded-xl px-3 py-2 text-sm " + (r.id === user.id ? "bg-brand text-white" : "bg-paper")}>
                <span className="flex items-center gap-3">
                  <span className={"flex h-6 w-6 items-center justify-center rounded-full text-xs font-black " + (i < 3 ? "bg-accent text-brand" : r.id === user.id ? "bg-white/20" : "bg-white")}>{i + 1}</span>
                  <span className="font-bold">{r.name}</span>
                </span>
                <span className="font-black">{r.n}</span>
              </div>
            ))}
            {leaderboard.length === 0 && <p className="text-sm text-brand/50">Nog geen sessies deze maand. Wees de eerste!</p>}
            {myRank >= 5 && <p className="pt-1 text-center text-xs text-brand/50">Jij: #{myRank + 1} · {leaderboard[myRank].n} sessies</p>}
          </div>
        </section>

        {!profile?.welcome_code_used && profile?.welcome_status !== "used" && (
          <div className="mt-6 rounded-3xl border-2 border-accent/40 bg-accent/5 p-6">
            {profile?.welcome_status === "eligible" ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-bold text-brand">🎁 Je gratis eerste sessie staat klaar!</p>
                <Link href="/boeken" className="rounded-full bg-accent px-6 py-3 text-sm font-bold text-brand transition hover:opacity-90">Boek gratis sessie</Link>
              </div>
            ) : profile?.welcome_status === "blocked" ? (
              <p className="text-sm font-semibold text-brand/70">Je gratis sessie is al gebruikt — deze kaart heeft al eerder een gratis sessie geactiveerd.</p>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-brand">🎁 Activeer je gratis eerste sessie</p>
                  <p className="mt-1 text-sm text-brand/60">Voeg eenmalig een kaart toe (geen kosten). Zo houden we de gratis sessie eerlijk — één per persoon.</p>
                </div>
                <form action={activateWelcome}>
                  <button className="rounded-full bg-brand px-6 py-3 text-sm font-bold text-white transition hover:opacity-90">Activeer gratis sessie</button>
                </form>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2 text-sm font-bold">
          <Link href="/boeken" className="rounded-full bg-accent px-5 py-2.5 text-brand transition hover:opacity-90">+ Boek een sessie</Link>
          <Link href="/lidmaatschap" className="rounded-full border-2 border-borderc px-5 py-2.5 text-brand transition hover:border-lav">Beurtenkaart kopen</Link>
          <Link href="/training" className="rounded-full border-2 border-borderc px-5 py-2.5 text-brand transition hover:border-lav">Mijn training</Link>
          <Link href="/community" className="rounded-full border-2 border-borderc px-5 py-2.5 text-brand transition hover:border-lav">Leaderboard</Link>
        </div>

        {sp.betaald === "1" && (
          <p className="mt-6 rounded-2xl bg-accent/15 p-4 text-sm font-semibold text-accentdark">
            Betaling gelukt — je boeking is bevestigd. Je ontvangt een bevestiging per e-mail.
          </p>
        )}
        {(sp.abo === "1" || sp.credits === "1") && (
          <p className="mt-6 rounded-2xl bg-accent/15 p-4 text-sm font-semibold text-accentdark">
            {sp.abo === "1" ? "Welkom als member! Je abonnement is actief." : "Sessies bijgeschreven — veel plezier!"}
          </p>
        )}

        {membership && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-brand p-6 text-white">
            <div>
              <p className="font-black">✓ Member-abonnement actief</p>
              <p className="mt-1 text-sm text-lav">
                {membership.cancel_at_period_end ? "Loopt af op " : "Verlengt op "}
                {membership.current_period_end ? new Intl.DateTimeFormat("nl-BE", { day: "numeric", month: "long" }).format(new Date(membership.current_period_end)) : "—"} · je boekt aan € 8
              </p>
            </div>
            <form action={openBillingPortal}>
              <button className="rounded-full bg-accent px-6 py-3 text-sm font-bold text-brand transition hover:opacity-90">Beheer abonnement</button>
            </form>
          </div>
        )}

        {doorActive && (
          <div className="mt-8 rounded-3xl bg-brand p-6 text-white">
            <p className="text-sm font-bold uppercase tracking-widest text-lav">Je sessie is bezig</p>
            <p className="mb-4 mt-1 text-lg font-black">Open de deur met de app</p>
            <DoorButton />
          </div>
        )}

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
                  className="rounded-2xl border border-borderc bg-white p-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="font-black">{b.services?.name || "Sessie"}</p>
                    <p className="mt-1 text-sm capitalize text-brand/60">
                      {fmtRange(b.starts_at, b.ends_at)}
                    </p>
                    <p className="mt-1 text-xs text-brand/50">
                      {b.persons} {b.persons === 1 ? "persoon" : "personen"} ·{" "}
                      {b.invited
                        ? `🤝 Uitgenodigd door ${b.booker?.full_name || "een lid"}`
                        : b.payment_source === "gratis_code"
                          ? "Gratis (FittinWelcome)"
                          : b.paid
                            ? `${euro(b.price_cents)} · betaald`
                            : `${euro(b.price_cents)} · onbetaald`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!b.paid && b.payment_source !== "gratis_code" && (
                      <form action={resumeCheckoutAction}>
                        <input type="hidden" name="bookingId" value={b.id} />
                        <button className="rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-brand transition hover:opacity-90">
                          Afrekenen
                        </button>
                      </form>
                    )}
                    {!b.invited && (
                      <form action={cancelBookingAction}>
                        <input type="hidden" name="bookingId" value={b.id} />
                        <button className="rounded-full border-2 border-borderc px-5 py-2.5 text-sm font-bold text-brand transition hover:border-red-300 hover:text-red-600">
                          Annuleren
                        </button>
                      </form>
                    )}
                  </div>
                  </div>
                  {!b.invited && b.persons > 1 && (
                    <BookingBuddies bookingId={b.id} capacity={b.persons} participants={partMap[b.id] || []} paid={b.paid || b.price_cents === 0} />
                  )}
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

        <AccountSettings userId={user.id} initialName={profile?.full_name || ""} initialPhone={profile?.phone || ""} />
        <AccountLinking providers={user.app_metadata?.providers || (user.app_metadata?.provider ? [user.app_metadata.provider] : [])} />
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

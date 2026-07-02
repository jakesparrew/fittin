import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { payCoachRequest, respondJoinRequest, logBodyMetrics, setLeaderboardOptIn, clientRequestCoach } from "./actions";
import { respondCoachLink } from "@/app/coach/actions";
import WeightChart from "@/components/WeightChart";
import ActionForm from "@/components/ui/ActionForm";
import { resumeCheckoutAction } from "../boeken/actions";
import { openBillingPortal } from "../lidmaatschap/actions";
import DoorButton from "@/components/DoorButton";
import PendingPaymentBanner from "@/components/PendingPaymentBanner";
import NextSessionTimer from "@/components/NextSessionTimer";
import BookingBuddies from "@/components/booking/BookingBuddies";
import BuddyJoin from "@/components/booking/BuddyJoin";
import RescheduleBooking from "@/components/booking/RescheduleBooking";
import ShareRank from "@/components/ShareRank";
import AccountSettings from "@/components/account/AccountSettings";
import AccountLinking from "@/components/account/AccountLinking";
import BodyMetricsForm from "@/components/account/BodyMetricsForm";

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
  // Coaches don't have a member account dashboard — send them to their coach dashboard.
  if (profile?.role === "coach") redirect("/coach");
  const sp = (await searchParams) || {};

  const supabase = await createClient();
  const admin = createAdminClient();
  const monthStartLb = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const monthIso = monthStartLb.toISOString();
  const nowIso = new Date().toISOString();

  // One parallel batch instead of a dozen serial round-trips (each query is independent).
  // expire_unpaid_bookings runs alongside; freed slots show correctly on the next render.
  const [
    , // expire rpc result (ignored)
    { data: bookings },
    { data: ledger },
    { data: membership },
    { data: invitedRows },
    { data: coachLinks },
    { data: payReqs },
    { data: boardRows },
    { data: buddyLinks },
    { data: sentJoins },
    { data: incomingJoins },
    { data: bodyProfile },
    { data: weights },
  ] = await Promise.all([
    supabase.rpc("expire_unpaid_bookings", { p_gym: profile.gym_id }),
    supabase.from("bookings").select("id, starts_at, ends_at, status, persons, price_cents, payment_source, paid, created_at, nuki_code, services(name,type)").eq("user_id", user.id).order("starts_at", { ascending: true }),
    supabase.rpc("credits_balance", { p_user: user.id }),
    supabase.from("memberships").select("status, current_period_end, cancel_at_period_end").eq("user_id", user.id).eq("status", "actief").maybeSingle(),
    admin.from("booking_participants").select("booking:bookings(id, starts_at, ends_at, status, persons, paid, price_cents, payment_source, services(name,type), booker:profiles!bookings_user_id_fkey(full_name))").eq("user_id", user.id),
    admin.from("coach_clients").select("id, status, requested_by, coach:profiles!coach_clients_coach_id_fkey(id, full_name, email)").eq("client_id", user.id),
    supabase.from("coach_payment_requests").select("id, amount_cents, description, coach:profiles!coach_payment_requests_coach_id_fkey(full_name)").eq("client_id", user.id).eq("status", "pending").order("created_at", { ascending: false }),
    admin.from("bookings").select("user_id, member:profiles!bookings_user_id_fkey(full_name, role, leaderboard_opt_in)").eq("gym_id", profile.gym_id).eq("status", "bevestigd").gte("starts_at", monthIso).lt("starts_at", nowIso),
    admin.from("buddies").select("requester_id, addressee_id, requester:profiles!buddies_requester_id_fkey(id, full_name), addressee:profiles!buddies_addressee_id_fkey(id, full_name)").eq("status", "accepted").eq("gym_id", profile.gym_id).or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
    supabase.from("booking_join_requests").select("booking_id, to_user").eq("from_user", user.id),
    admin.from("booking_join_requests").select("id, booking:bookings(starts_at, ends_at, services(name)), from:profiles!booking_join_requests_from_user_fkey(full_name)").eq("to_user", user.id).eq("status", "pending"),
    supabase.from("profiles").select("height_cm, goal_weight_kg").eq("id", user.id).single(),
    supabase.from("body_metrics").select("weight_kg, logged_on").eq("user_id", user.id).order("logged_on", { ascending: true }).limit(120),
  ]);

  const { data: gym } = await supabase.from("gyms").select("open_hour, close_hour").eq("id", profile.gym_id).maybeSingle();
  const gymOpen = gym?.open_hour ?? 6;
  const gymClose = gym?.close_hour ?? 23;

  const credits = ledger || 0;
  const invitedSessions = (invitedRows || [])
    .map((r) => r.booking)
    // Only surface an invited session once the booker actually paid (or it's a free/credit session).
    .filter((b) => b && b.status === "bevestigd" && (b.paid || b.price_cents === 0 || b.payment_source !== "los"))
    .map((b) => ({ ...b, invited: true, paid: true, payment_source: "invite", price_cents: 0, services: b.services }));
  const coachLinksAll = (coachLinks || []).filter((l) => l.coach);
  const acceptedCoachLink = coachLinksAll.find((l) => l.status === "accepted");
  const myCoach = acceptedCoachLink?.coach || null;
  const incomingCoachReqs = coachLinksAll.filter((l) => l.status === "pending" && l.requested_by === "coach"); // a coach invited me
  const sentCoachReqs = coachLinksAll.filter((l) => l.status === "pending" && l.requested_by === "client");    // I asked a coach

  const lbCounts = {};
  // Coaches/beheerders never appear; members who opted out are excluded. PT sessions count
  // because the booking's user_id is the member.
  for (const b of boardRows || []) { if (b.member?.role !== "lid" || b.member?.leaderboard_opt_in === false) continue; const k = b.user_id; (lbCounts[k] ||= { name: b.member?.full_name || "Lid", n: 0 }).n++; }
  const leaderboard = Object.entries(lbCounts).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.n - a.n);
  const myRank = leaderboard.findIndex((r) => r.id === user.id);

  const now = Date.now();
  const all = [...(bookings || []), ...invitedSessions];
  // A booking is "settled" (door-eligible) only if paid, or settled at creation (credit/free/invited).
  // Unpaid 'los'/'abo' bookings must NOT open the door until Stripe confirms payment.
  const isSettled = (b) => b.paid || b.payment_source === "credit" || b.payment_source === "gratis_code" || b.payment_source === "invite";
  const doorActive = all.some(
    (b) =>
      b.status === "bevestigd" && isSettled(b) &&
      now >= new Date(b.starts_at).getTime() - 5 * 60000 &&
      now <= new Date(b.ends_at).getTime()
  );
  const upcoming = all.filter((b) => b.status === "bevestigd" && new Date(b.starts_at).getTime() >= now);
  // A session only counts as "booked" once it's paid — credit/abo/free/invite count as paid; an
  // unpaid 'los' checkout-in-progress lives in the pending-payment banner, not in the list.
  const upcomingPaid = upcoming.filter(isSettled);
  const nextSession = upcomingPaid[0]; // sorted ascending by starts_at
  const bookedCount = all.filter((b) => b.status === "bevestigd").length; // lifetime confirmed (scoreboard)
  // Pending payment: confirmed-but-unpaid 'los' bookings (20-min window from creation).
  const pendingPay = upcoming
    .filter((b) => !b.paid && (b.payment_source === "los" || b.payment_source === "abo") && b.price_cents > 0)
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

  // Derived from the batch above.
  const myBuddies = (buddyLinks || []).map((l) => { const o = l.requester_id === user.id ? l.addressee : l.requester; return { id: o?.id, name: o?.full_name || "Buddy" }; }).filter((b) => b.id);
  const askedByBooking = {};
  for (const r of sentJoins || []) (askedByBooking[r.booking_id] ||= []).push(r.to_user);

  const latestWeight = (weights || []).length ? Number(weights[weights.length - 1].weight_kg) : null;
  const bmi = bodyProfile?.height_cm && latestWeight ? +(latestWeight / Math.pow(bodyProfile.height_cm / 100, 2)).toFixed(1) : null;

  const firstName = (profile?.full_name || "").split(" ")[0] || "daar";

  return (
    <main className="bg-paper">
      <div className="mx-auto max-w-4xl px-5 py-16">
        {/* Active session → door opener pinned to the top; hidden again outside the slot window */}
        {doorActive && (
          <div className="mb-6 rounded-3xl bg-brand p-6 text-white">
            <p className="text-sm font-bold uppercase tracking-widest text-lav">Je sessie is bezig</p>
            <p className="mb-4 mt-1 text-lg font-black">Open de deur met de app</p>
            <DoorButton />
            <Link href="/huisregels" className="mt-3 inline-block text-sm font-bold text-accent underline-offset-2 hover:underline">Toegang &amp; huisregels →</Link>
          </div>
        )}
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

        {/* Primary CTA — drive bookings */}
        <section className="mt-8 rounded-3xl bg-brand p-7 text-white md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div className="max-w-md">
              <p className="text-xs font-bold uppercase tracking-widest text-accent">Klaar om te trainen</p>
              <h2 className="mt-1 text-2xl font-black md:text-3xl">Boek jouw volgende sessie</h2>
              <p className="mt-2 text-sm leading-relaxed text-lav">
                {credits > 0 ? (
                  <>Je hebt <span className="font-black text-white">{credits} sessie{credits === 1 ? "" : "s"}</span> op je saldo — kies meteen een moment.</>
                ) : profile?.welcome_status === "eligible" && !profile?.welcome_code_used ? (
                  <>Je <span className="font-black text-white">gratis sessie</span> staat klaar. Reserveer de hele zaal voor jezelf.</>
                ) : (
                  <>Reserveer de hele zaal voor jou en je vrienden — <span className="font-black text-white">€ 15</span> per sessie van 1 uur.</>
                )}
              </p>
            </div>
            <Link href="/boeken" className="shrink-0 rounded-full bg-accent px-8 py-4 text-base font-black text-brand shadow-lg shadow-accent/25 transition hover:-translate-y-0.5 hover:opacity-95">
              Boek jouw volgende sessie →
            </Link>
          </div>

          {/* Buy more sessions — bundles + membership */}
          <div className="mt-6 grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-3">
            <Link href="/lidmaatschap" className="rounded-2xl bg-white/5 p-4 transition hover:bg-white/10">
              <p className="text-sm font-black text-white">10-beurtenkaart</p>
              <p className="mt-0.5 text-xs text-lav">€ 150 · 11 sessies (10 + 1 gratis)</p>
            </Link>
            {membership ? (
              <div className="rounded-2xl bg-accent/15 p-4">
                <p className="text-sm font-black text-accent">Je bent member ✓</p>
                <p className="mt-0.5 text-xs text-lav">Voordeeltarief + voorrang bij piekuren</p>
              </div>
            ) : (
              <Link href="/lidmaatschap" className="rounded-2xl bg-white/5 p-4 transition hover:bg-white/10">
                <p className="text-sm font-black text-white">Word member</p>
                <p className="mt-0.5 text-xs text-lav">€ 12/maand · 1 sessie incl. + alles aan € 12</p>
              </Link>
            )}
            <Link href="/boeken" className="rounded-2xl bg-white/5 p-4 transition hover:bg-white/10">
              <p className="text-sm font-black text-white">Losse sessie</p>
              <p className="mt-0.5 text-xs text-lav">€ 15 · 1 uur, de hele zaal voor jou</p>
            </Link>
          </div>
        </section>

        {/* Stat row */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Aankomende sessies" value={upcomingPaid.length} />
          <Stat label="Sessies (saldo)" value={credits} />
          <Stat label="Totaal geboekt" value={bookedCount} />
          {!profile?.welcome_code_used && profile?.welcome_status !== "used" && (
            <Stat label="Welkomstsessie" value="Beschikbaar" accent />
          )}
        </div>

        {nextSession && <NextSessionTimer startsAt={nextSession.starts_at} name={nextSession.services?.name} />}

        {(incomingJoins || []).length > 0 && (
          <div className="mt-6 rounded-3xl border-2 border-accent/40 bg-accent/5 p-6">
            <p className="font-black text-brand">🤝 Kom je mee trainen?</p>
            <div className="mt-3 space-y-2">
              {incomingJoins.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4">
                  <div>
                    <p className="font-bold text-brand">{r.from?.full_name || "Een buddy"} gaat trainen</p>
                    <p className="text-xs capitalize text-brand/50">{r.booking ? fmtRange(r.booking.starts_at, r.booking.ends_at) : ""} · {r.booking?.services?.name || "Sessie"}</p>
                  </div>
                  <div className="flex gap-2">
                    <ActionForm action={respondJoinRequest} success="Je komt mee ✓"><input type="hidden" name="id" value={r.id} /><input type="hidden" name="decision" value="accept" /><button className="rounded-full bg-accent px-4 py-2 text-sm font-bold text-brand">Ik kom mee</button></ActionForm>
                    <ActionForm action={respondJoinRequest} success="Afgemeld ✓"><input type="hidden" name="id" value={r.id} /><input type="hidden" name="decision" value="decline" /><button className="rounded-full border-2 border-borderc px-4 py-2 text-sm font-bold text-brand/60">Kan niet</button></ActionForm>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Incoming coach connection requests (a coach invited me) */}
        {incomingCoachReqs.length > 0 && (
          <div className="mt-6 rounded-3xl border-2 border-accent bg-accent/5 p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-accentdark">Verbindingsverzoek</p>
            <div className="mt-2 space-y-2">
              {incomingCoachReqs.map((l) => (
                <div key={l.id} className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-brand/80"><span className="font-black text-brand">{l.coach.full_name || "Een coach"}</span> wil je coachen.</p>
                  <div className="flex gap-2">
                    <ActionForm action={respondCoachLink} success="Verbonden ✓"><input type="hidden" name="linkId" value={l.id} /><input type="hidden" name="accept" value="1" /><button className="rounded-full bg-accent px-4 py-2 text-xs font-bold text-brand transition hover:opacity-90">Aanvaarden</button></ActionForm>
                    <ActionForm action={respondCoachLink} success="Geweigerd ✓"><input type="hidden" name="linkId" value={l.id} /><input type="hidden" name="accept" value="0" /><button className="rounded-full border-2 border-borderc px-4 py-2 text-xs font-bold text-brand transition hover:border-red-300 hover:text-red-600">Weiger</button></ActionForm>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {myCoach ? (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-borderc bg-white p-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-lav">Jouw coach</p>
              <p className="mt-1 text-lg font-black text-brand">{myCoach.full_name || "Je coach"}</p>
            </div>
            <Link href="/training" className="rounded-full bg-paper px-5 py-2.5 text-sm font-bold text-brand transition hover:bg-accent/15">Mijn training →</Link>
          </div>
        ) : (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-borderc bg-white p-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-lav">Coaching</p>
              <p className="mt-1 font-bold text-brand">Wil je begeleiding van een coach?</p>
              <p className="text-sm text-brand/55">Bekijk onze coaches en stuur een verbindingsverzoek. Eens verbonden kan je samen trainen en plant je coach je sessies in.</p>
              {sentCoachReqs.length > 0 && <p className="mt-1 text-xs font-bold text-accentdark">Aanvraag verstuurd — wachten op bevestiging van {sentCoachReqs.map((l) => l.coach.full_name || "de coach").join(", ")}.</p>}
            </div>
            <Link href="/coaches" className="rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-brand transition hover:opacity-90">Bekijk coaches →</Link>
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
          <ActionForm action={setLeaderboardOptIn} success={profile?.leaderboard_opt_in === false ? "Je staat nu op de leaderboard ✓" : "Je staat niet meer op de leaderboard."} className="mt-2">
            <input type="hidden" name="opt_in" value={profile?.leaderboard_opt_in === false ? "true" : "false"} />
            <button className="text-xs font-bold text-brand/50 transition hover:text-brand">
              {profile?.leaderboard_opt_in === false ? "→ Doe weer mee aan de leaderboard" : "Mij verbergen van de leaderboard"}
            </button>
          </ActionForm>
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

        {!profile?.welcome_code_used && profile?.welcome_status === "eligible" && (
          <div className="mt-6 rounded-3xl border-2 border-accent/40 bg-accent/5 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-bold text-brand">🎁 Je gratis eerste sessie staat klaar!</p>
                <p className="mt-1 text-sm text-brand/60">Welkomstpromo — je allereerste uur in de privégym is gratis. Geen kaart nodig, je betaalt pas vanaf je tweede sessie.</p>
              </div>
              <Link href="/boeken" className="shrink-0 rounded-full bg-accent px-6 py-3 text-sm font-bold text-brand transition hover:opacity-90">Boek gratis sessie</Link>
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2 text-sm font-bold">
          <Link href="/boeken" className="rounded-full bg-accent px-5 py-2.5 text-brand transition hover:opacity-90">+ Boek een sessie</Link>
          <Link href="/training" className="rounded-full border-2 border-borderc px-5 py-2.5 text-brand transition hover:border-lav">Mijn training</Link>
          <Link href="/oefeningen" className="rounded-full border-2 border-borderc px-5 py-2.5 text-brand transition hover:border-lav">Oefeningen</Link>
          <Link href="/community" className="rounded-full border-2 border-borderc px-5 py-2.5 text-brand transition hover:border-lav">Community</Link>
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
                {membership.current_period_end ? new Intl.DateTimeFormat("nl-BE", { day: "numeric", month: "long" }).format(new Date(membership.current_period_end)) : "—"} · je boekt aan € 12
              </p>
            </div>
            <form action={openBillingPortal}>
              <button className="rounded-full bg-accent px-6 py-3 text-sm font-bold text-brand transition hover:opacity-90">Beheer abonnement</button>
            </form>
          </div>
        )}

        {/* Lichaam & voortgang */}
        <section className="mt-8 rounded-3xl border border-borderc bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-black text-brand">Lichaam &amp; voortgang</h2>
              <p className="mt-1 text-sm text-brand/60">Log je gewicht en volg je evolutie. Straks gebruiken we dit voor AI-coachingtips op maat.</p>
            </div>
            {bmi && <span className="rounded-full bg-paper px-3 py-1 text-xs font-bold text-brand/60">BMI {bmi}</span>}
          </div>

          <BodyMetricsForm heightCm={bodyProfile?.height_cm} goalKg={bodyProfile?.goal_weight_kg} />

          <div className="mt-6">
            <WeightChart points={(weights || []).map((w) => ({ logged_on: w.logged_on, weight_kg: w.weight_kg }))} goal={bodyProfile?.goal_weight_kg ? Number(bodyProfile.goal_weight_kg) : null} />
          </div>

          {/* Logged entries — newest first */}
          {(weights || []).length > 0 && (
            <div className="mt-6">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-lav">Je metingen</p>
              <div className="overflow-hidden rounded-2xl border border-borderc">
                {[...weights].reverse().map((w, i) => {
                  const prev = [...weights].reverse()[i + 1];
                  const diff = prev ? Number(w.weight_kg) - Number(prev.weight_kg) : null;
                  return (
                    <div key={w.logged_on + i} className={"flex items-center justify-between px-4 py-2.5 text-sm " + (i % 2 ? "bg-paper/50" : "bg-white")}>
                      <span className="capitalize text-brand/60">{new Intl.DateTimeFormat("nl-BE", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(w.logged_on))}</span>
                      <span className="flex items-center gap-2">
                        <span className="font-black text-brand">{Number(w.weight_kg).toFixed(1)} kg</span>
                        {diff != null && diff !== 0 && (
                          <span className={"text-xs font-bold " + (diff < 0 ? "text-accentdark" : "text-brand/40")}>{diff < 0 ? "▼" : "▲"} {Math.abs(diff).toFixed(1)}</span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

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

          {upcomingPaid.length === 0 ? (
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
              {upcomingPaid.map((b) => (
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
                      <RescheduleBooking bookingId={b.id} startsAt={b.starts_at} openHour={gymOpen} closeHour={gymClose} />
                    )}
                  </div>
                  </div>
                  {b.nuki_code && (
                    <div className="mt-3 flex items-center gap-3 rounded-xl bg-accent/10 px-4 py-3">
                      <span className="text-xl">🔑</span>
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-accentdark">Jouw deurcode</p>
                        <p className="text-2xl font-black tracking-[0.2em] text-brand">{b.nuki_code}</p>
                      </div>
                      <span className="ml-auto text-xs text-brand/45">werkt tijdens je sessie</span>
                    </div>
                  )}
                  {!b.invited && b.persons > 1 && (
                    <BookingBuddies bookingId={b.id} capacity={b.persons} participants={partMap[b.id] || []} paid={b.paid || b.price_cents === 0} />
                  )}
                  {!b.invited && myBuddies.length > 0 && (
                    <BuddyJoin bookingId={b.id} buddies={myBuddies} askedIds={askedByBooking[b.id] || []} />
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Payments & downloadable Stripe receipts */}
        <div className="mt-12">
          <Link href="/account/betalingen" className="inline-flex items-center gap-2 rounded-full border-2 border-borderc bg-white px-5 py-2.5 text-sm font-bold text-brand transition hover:border-accent">💳 Betalingen &amp; betaalbewijzen →</Link>
        </div>

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
function Lbl({ t, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">{t}</span>
      {children}
    </label>
  );
}

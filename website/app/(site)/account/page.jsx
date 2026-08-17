import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionProfile } from "@/lib/auth";
import { isSettled } from "@/lib/booking-status";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { payCoachRequest, respondJoinRequest, setLeaderboardOptIn } from "./actions";
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
import ShareReferral from "@/components/ShareReferral";
import AccountSettings from "@/components/account/AccountSettings";
import ProblemReport from "@/components/ProblemReport";
import DoorCodeCard from "@/components/booking/DoorCodeCard";
import { getGymSecrets } from "@/lib/gym-secrets";
import AccountLinking from "@/components/account/AccountLinking";
import BodyMetricsForm from "@/components/account/BodyMetricsForm";
import PrivacyControls from "@/components/account/PrivacyControls";
import { hasConsent } from "@/lib/legal";
import { euro } from "@/lib/format";
import TrackBookingCompleted from "./TrackBookingCompleted";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mijn account | Fittin'" };

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

// "Boek opnieuw": zelfde duur/personen + een suggestie voor dezelfde weekdag+uur binnen 7 dagen.
// Duur in HALVE uren (0117) — de oude link deed Math.round(ms/3600000) en maakte van 90 min 2 uur,
// waardoor het lid 2 beurten betaalde i.p.v. 1,5. De suggestie is best-effort: BookingClient
// valideert hem zelf met canBook() en laat hem vallen als het slot niet vrij is.
const bxl = (iso, opts) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Brussels", ...opts }).format(new Date(iso));
// "Boek opnieuw": neem personen, duur, weekdag en uur van de vorige sessie over en spring
// naar de eerstvolgende keer dat die weekdag terugkomt. De oude versie rekende de duur met
// /3600000 af te ronden, waardoor 90 min als 2 uur terugkwam — het lid kreeg dan 2 beurten
// aangerekend in plaats van 1,5. Halfuurraster (/1800000) dus.
function rebookHref(b) {
  const durH = Math.min(4, Math.max(1, Math.round((new Date(b.ends_at) - new Date(b.starts_at)) / 1800000) / 2));
  const persons = String(b.persons || 1);
  const p = new URLSearchParams({ personen: persons, duur: String(durH) });
  // Alles in Brusselse tijd bepalen: op de server (UTC) zou new Date().getDay() 's avonds
  // een dag verkeerd zitten en dus de verkeerde weekdag voorstellen.
  const wd = (iso) => bxl(iso, { weekday: "short" });
  const hh = parseInt(bxl(b.starts_at, { hour: "2-digit", hour12: false }), 10);
  const mm = parseInt(bxl(b.starts_at, { minute: "2-digit" }), 10);
  if (Number.isFinite(hh)) {
    const want = wd(b.starts_at);
    for (let i = 1; i <= 7; i++) {
      const d = new Date(Date.now() + i * 86400000);
      if (wd(d.toISOString()) !== want) continue;
      p.set("d", new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(d));
      p.set("h", String(hh + (mm >= 30 ? 0.5 : 0))); // decimaal uur op het halfuurrooster
      p.set("u", String(durH));
      p.set("p", persons);
      break;
    }
  }
  return `/boeken?${p.toString()}`;
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
    { data: myMems },
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
    supabase.from("bookings").select("id, starts_at, ends_at, status, persons, price_cents, payment_source, paid, created_at, nuki_code, nuki_cleaned, access_sent, services(name,type)").eq("user_id", user.id).order("starts_at", { ascending: true }),
    supabase.rpc("credits_balance_detail", { p_user: user.id }),
    supabase.from("memberships").select("status, current_period_end, cancel_at_period_end").eq("user_id", user.id).in("status", ["actief", "past_due"]),
    admin.from("booking_participants").select("booking:bookings(id, starts_at, ends_at, status, persons, paid, price_cents, payment_source, nuki_code, nuki_cleaned, access_sent, services(name,type), booker:profiles!bookings_user_id_fkey(full_name))").eq("user_id", user.id),
    admin.from("coach_clients").select("id, status, requested_by, coach:profiles!coach_clients_coach_id_fkey(id, full_name, email)").eq("client_id", user.id),
    supabase.from("coach_payment_requests").select("id, amount_cents, description, coach:profiles!coach_payment_requests_coach_id_fkey(full_name)").eq("client_id", user.id).eq("status", "pending").order("created_at", { ascending: false }),
    admin.from("bookings").select("user_id, member:profiles!bookings_user_id_fkey(full_name, role, leaderboard_opt_in)").eq("gym_id", profile.gym_id).eq("status", "bevestigd").gte("starts_at", monthIso).lt("starts_at", nowIso),
    admin.from("buddies").select("requester_id, addressee_id, requester:profiles!buddies_requester_id_fkey(id, full_name), addressee:profiles!buddies_addressee_id_fkey(id, full_name)").eq("status", "accepted").eq("gym_id", profile.gym_id).or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
    supabase.from("booking_join_requests").select("booking_id, to_user").eq("from_user", user.id),
    admin.from("booking_join_requests").select("id, booking:bookings(starts_at, ends_at, services(name)), from:profiles!booking_join_requests_from_user_fkey(full_name)").eq("to_user", user.id).eq("status", "pending"),
    supabase.from("profiles").select("height_cm, goal_weight_kg").eq("id", user.id).single(),
    supabase.from("body_metrics").select("weight_kg, logged_on").eq("user_id", user.id).order("logged_on", { ascending: true }).limit(120),
  ]);

  const { data: gym } = await supabase.from("gyms").select("open_hour, close_hour, address").eq("id", profile.gym_id).maybeSingle();
  const gymOpen = gym?.open_hour ?? 6;
  const gymClose = gym?.close_hour ?? 23;

  // Deurcode-venster. Nuki is actief: de access-cron laat Nuki ~5 min vóór elke sessie een verse
  // keypadcode aanmaken, zet die in bookings.nuki_code, en revokeExpiredKeypadCodes() wist hem weer
  // zodra de sessie voorbij is. nuki_code bestaat dus PRECIES tijdens het venster waarin het lid
  // hem nodig heeft — dat is meteen de beveiliging: buiten dat venster is er niets te tonen.
  // De statische gymcode hieronder is enkel de reserve als het minten faalt (staat vandaag leeg;
  // dan valt de kaart terug op "je code verschijnt hier"). Strikt gated op access_sent + tijdslot.
  // gym_integrations heeft geen RLS-policies (service-role only) → via admin, en NOOIT het hele
  // configobject doorgeven (dat bevat de Nuki-token); enkel de code-string gaat naar de client.
  const [{ access_code: staticDoorCode }, { data: keypadCfg }] = await Promise.all([
    getGymSecrets(admin, profile.gym_id).catch(() => ({})),
    admin.from("gym_integrations").select("keypad_lead_min").eq("gym_id", profile.gym_id).maybeSingle(),
  ]);
  const leadMin = keypadCfg?.keypad_lead_min ?? 5;

  // AVG-status van dit lid: heeft hij toestemming gegeven voor gezondheidsgegevens, en loopt er
  // een verwijderingsaanvraag? Bepaalt of het toestemmingsvinkje nog getoond moet worden.
  const [healthConsent, { data: delRow }, { data: subRow }] = await Promise.all([
    hasConsent(admin, user.id, "gezondheidsdata"),
    admin.from("profiles").select("deletion_requested_at").eq("id", user.id).maybeSingle(),
    // Nieuwsbriefstatus voor de aan/uit-knop. Geen rij = nooit iets aangeraakt; dan tonen we
    // "ingeschreven", want dat is de toestand waarin een nieuw account start.
    profile?.email
      ? admin.from("subscribers").select("status").eq("gym_id", profile.gym_id).eq("email", profile.email.toLowerCase()).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const newsletterOptIn = (subRow?.status || "active") === "active";
  // Geeft { code, personal } terug. De reservecode is permanent en voor iedereen dezelfde, dus die
  // verschijnt ALLEEN als het minten van de persoonlijke code effectief mislukte (nuki_code leeg
  // terwijl de toegangsmail al vertrok) én we in het tijdslot zitten — precies dezelfde code die
  // dat lid op dat moment ook per mail kreeg, niet méér. Lukt het minten wel, dan zie je hem nooit.
  const doorCodeFor = (b) => {
    if (b.nuki_code) return { code: b.nuki_code, personal: true };
    if (!b.access_sent || !staticDoorCode || b.nuki_cleaned) return { code: null, personal: true };
    const t = Date.now();
    const from = new Date(b.starts_at).getTime() - leadMin * 60000;
    const inWindow = t >= from && t <= new Date(b.ends_at).getTime();
    return inWindow ? { code: staticDoorCode, personal: false } : { code: null, personal: true };
  };

  // credits_balance_detail returns one row: { balance, next_expiry, expiring }.
  const creditDetail = (Array.isArray(ledger) ? ledger[0] : ledger) || {};
  const credits = Number(creditDetail.balance ?? 0); // numeric (0117) kan als string binnenkomen
  // Active abo drives the € 12 UI; past_due suppresses the "word member"-nudge (they HAVE an abo,
  // their payment is just failing — Stripe retries + they already got the fix-your-card mail).
  const membership = (myMems || []).find((m) => m.status === "actief") || null;
  const aboPastDue = (myMems || []).some((m) => m.status === "past_due");
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
  // Eén keer chronologisch sorteren vóór het splitsen. Meegenodigde sessies kwamen als los blok
  // achteraan de lijst, dus in de geschiedenis stonden ze als groep bovenaan en wees "Boek opnieuw"
  // niet naar de laatste sessie maar naar de laatste uitnodiging.
  const all = [...(bookings || []), ...invitedSessions].sort(
    (a, b) => new Date(a.starts_at) - new Date(b.starts_at)
  );
  // A booking is "settled" (door-eligible) only if paid, or settled at creation (credit/free/invited).
  // Unpaid 'los'/'abo' bookings must NOT open the door until Stripe confirms payment.
  // Shared definition (lib/booking-status) — same logic the admin list + detail panel now use.
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
  // Abo-kandidaat (automatische nudge): trainde ≥3× in 60 dagen op eigen kosten (los mét prijs, of
  // beurtenkaart) zonder abonnement. Admin-ingeplande gratis sessies (los + € 0) tellen niet mee.
  const since60 = now - 60 * 86400000;
  const nudgeLos = (bookings || []).filter((b) => b.status === "bevestigd" && new Date(b.starts_at).getTime() >= since60 && b.payment_source === "los" && (b.price_cents || 0) > 0 && b.paid).length;
  const nudgeCredit = (bookings || []).filter((b) => b.status === "bevestigd" && new Date(b.starts_at).getTime() >= since60 && b.payment_source === "credit").length;
  const nudgeSessions = nudgeLos + nudgeCredit;
  // Besparing t.o.v. wat ze betaalden: los € 15→€ 12, kaart ± € 13,64→€ 12, + 2 inclusieve sessies (€ 24) over 60d.
  const nudgeSaving = Math.round(nudgeLos * 3 + nudgeCredit * 1.64 + 24);
  // First-visit state (Batch 2.6): has this member actually trained yet? Drives the "eerste bezoek" card.
  const hasVisited = all.some((b) => b.status === "bevestigd" && new Date(b.starts_at).getTime() < now);
  const gymAddress = gym?.address || "Aannemersstraat 186, 9040 Gent";
  // Pending payment: bevestigde maar onbetaalde 'los'-boekingen. De reservering duurt 15 min
  // (0121) — daarna geeft de sweep het uur weer vrij, zodat niemand slots kan blokkeren.
  const pendingPay = upcoming
    .filter((b) => !b.paid && (b.payment_source === "los" || b.payment_source === "abo") && b.price_cents > 0)
    .map((b) => ({
      id: b.id,
      name: b.services?.name || "Sessie",
      price: b.price_cents,
      deadline: new Date(new Date(b.created_at).getTime() + 15 * 60000).toISOString(),
    }));
  const history = all
    .filter((b) => !(b.status === "bevestigd" && new Date(b.starts_at).getTime() >= now))
    .reverse(); // nieuwste eerst (all staat chronologisch)
  // Laatste écht gevolgde sessie — voedt zowel de lege agenda als "Boek opnieuw".
  const lastDone = history.find((b) => b.status === "bevestigd" && b.services?.type !== "pt") || null;
  const welcomeReady = !profile?.welcome_code_used && profile?.welcome_status === "eligible";
  const HISTORY_VISIBLE = 10; // de rest zit achter één klik; een lid met 40 sessies scrolt anders eindeloos

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
        {/* Wie zijn Stripe-betaling afbreekt, landt hier (cancel_url) — sinds kort niet alleen bij een
            boeking, maar ook bij een beurtenkaart of abonnement, want /lidmaatschap leest geen
            searchParams en zweeg dus volledig. De tekst mag daarom geen "je uur" veronderstellen
            tenzij er écht een reservering wacht. Zonder afgebroken betaling: onzichtbaar. */}
        {sp.betaling === "afgebroken" && (
          <p className="mb-6 rounded-2xl border border-borderc bg-white p-4 text-sm text-brand/70">
            {pendingPay.length > 0 ? (
              <>Je betaling is afgebroken — er is niets aangerekend. Je uur blijft nog even gereserveerd; reken hierboven af om het vast te zetten.</>
            ) : (
              <>Je betaling is afgebroken — er is niets aangerekend. <Link href="/boeken" className="font-bold text-accentdark hover:underline">Boek een sessie →</Link> of <Link href="/lidmaatschap" className="font-bold text-accentdark hover:underline">bekijk de prijzen →</Link></>
            )}
          </p>
        )}

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
                  <>Je hebt <span className="font-black text-white">{String(credits).replace(".", ",")} sessie{credits === 1 ? "" : "s"}</span> op je saldo — kies meteen een moment.</>
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
                {/* "Voorrang bij piekuren" bestond nergens in de code: create_booking, de wachtlijst
                    en het rooster kennen geen verschil tussen member en niet-member. De boekhorizon
                    in components/booking/BookingClient.jsx is het enige abo-voordeel dat écht bestaat
                    naast het tarief — zelfde bewoording als /lidmaatschap. */}
                <p className="mt-0.5 text-xs text-lav">Voordeeltarief + boek tot 8 weken vooruit</p>
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

        {/* Stat row — op mobiel drie smalle tegels naast elkaar i.p.v. drie brede blokken onder
            elkaar. Ze dragen elk één getal; die verdienen samen geen halve schermhoogte. */}
        <div className="mt-8 grid grid-cols-3 gap-2 sm:gap-4 lg:grid-cols-4">
          <Stat label="Aankomende sessies" value={upcomingPaid.length} />
          <Stat
            label="Sessies (saldo)"
            value={String(credits).replace(".", ",")}
            hint={creditDetail.next_expiry && creditDetail.expiring > 0
              ? `${creditDetail.expiring === credits ? "Vervalt" : `${creditDetail.expiring} vervalt`} op ${new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short", year: "numeric" }).format(new Date(creditDetail.next_expiry))}`
              : null}
          />
          <Stat label="Totaal geboekt" value={bookedCount} />
          {!profile?.welcome_code_used && profile?.welcome_status !== "used" && (
            <Stat label="Welkomstsessie" value="Beschikbaar" accent />
          )}
        </div>

        {nextSession && <NextSessionTimer startsAt={nextSession.starts_at} name={nextSession.services?.name} bookingId={nextSession.id} />}

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
          <Link href="/training#voortgang" className="rounded-full border-2 border-borderc px-5 py-2.5 text-brand transition hover:border-lav">📈 Voortgang</Link>
          <Link href="/oefeningen" className="rounded-full border-2 border-borderc px-5 py-2.5 text-brand transition hover:border-lav">Oefeningen</Link>
          <Link href="/community" className="rounded-full border-2 border-borderc px-5 py-2.5 text-brand transition hover:border-lav">Community</Link>
        </div>

        {sp.betaald === "1" && (
          <div className="mt-6 rounded-2xl bg-accent/15 p-4">
            {/* Betaalde boekingen keren via Stripe hier terug; zonder dit event telt de trechter
                enkel gratis- en tegoedboekingen en lijkt elke betaalpoging te stranden. */}
            <TrackBookingCompleted />
            <p className="text-sm font-semibold text-accentdark">
              Betaling gelukt — je boeking is bevestigd. Je ontvangt een bevestiging per e-mail.
            </p>
            {/* S4 checkout-nudge: zelfde 60d-berekening als de banner + de suggestie-mail, zodat het lid
                overal hetzelfde bedrag ziet. Vanaf 2 sessies al — dit moment (net betaald) is het meest ontvankelijk. */}
            {!membership && !aboPastDue && nudgeSessions >= 2 && (
              <p className="mt-2 text-sm text-brand/70">
                {/* "gratis" is het verkeerde woord: die maandsessie is net wat je met de € 12 koopt.
                    /lidmaatschap noemt ze "inbegrepen" — hou dat hier gelijk. */}
                Dat waren al {nudgeSessions} zelfbetaalde sessies in 60 dagen. Met het Member-abonnement (€ 12/sessie + elke maand 1 sessie inbegrepen) was dat ≈ € {nudgeSaving} voordeel.{" "}
                <Link href="/lidmaatschap" className="font-bold text-accentdark hover:underline">Bekijk het abonnement →</Link>
              </p>
            )}
            {profile?.referral_code && (
              <div className="mt-3 border-t border-accent/20 pt-3">
                <p className="text-sm font-semibold text-brand">Breng volgende keer een vriend mee — die traint gratis 🎁</p>
                <div className="mt-2"><ShareReferral code={profile.referral_code} compact /></div>
              </div>
            )}
          </div>
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
            {/* Opzeggen moet even makkelijk zijn als inschrijven, en dat moet je ook kúnnen zien.
                "Beheer abonnement" verzweeg waar je opzegt; nu staat het er letterlijk bij. */}
            <form action={openBillingPortal} className="text-right">
              <button className="rounded-full bg-accent px-6 py-3 text-sm font-bold text-brand transition hover:opacity-90">
                Beheer of zeg op
              </button>
              <p className="mt-1.5 text-xs text-lav">Opzeggen kan op elk moment, zonder opzegtermijn.</p>
            </form>
          </div>
        )}

        {/* Automatische abo-nudge: veelboeker zonder abo ziet zijn eigen cijfers + echte besparing.
            past_due wordt uitgesloten (die heeft al een abo — enkel de betaling hapert). */}
        {!membership && !aboPastDue && nudgeSessions >= 3 && (
          <div className="mt-6 rounded-3xl border-2 border-accent bg-accent/10 p-6">
            <p className="font-black text-brand">💡 Jij traint vaak — het abonnement is voor jou voordeliger</p>
            <p className="mt-1 text-sm text-brand/70">
              Je trainde <b>{nudgeSessions}×</b> in de laatste 60 dagen. Met het Member-abonnement (€ 12/mnd) betaal je <b>€ 12 per sessie</b> én
              zit er <b>elke maand 1 sessie inbegrepen</b> — voor jou was dat ≈ <b>€ {nudgeSaving} voordeel</b> geweest.
            </p>
            <Link href="/lidmaatschap" className="mt-3 inline-block rounded-full bg-accent px-6 py-2.5 text-sm font-black text-brand transition hover:opacity-90">Word member →</Link>
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

          <BodyMetricsForm heightCm={bodyProfile?.height_cm} goalKg={bodyProfile?.goal_weight_kg} healthConsent={healthConsent} />

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

        {/* Coach payment requests (Batch 3.6) — pay your coach for PT via Stripe */}
        {(payReqs || []).length > 0 && (
          <section className="mt-8 space-y-3">
            {(payReqs || []).map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border-2 border-accent/40 bg-accent/5 p-5">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-accentdark">Betaalverzoek van je coach</p>
                  <p className="mt-1 font-black text-brand">{euro(r.amount_cents)} · {r.description || "Personal training"}</p>
                  <p className="mt-0.5 text-sm text-brand/55">van {r.coach?.full_name || "je coach"}</p>
                </div>
                <form action={payCoachRequest}>
                  <input type="hidden" name="requestId" value={r.id} />
                  <button className="rounded-full bg-accent px-6 py-3 text-sm font-bold text-brand transition hover:opacity-90">Betaal {euro(r.amount_cents)}</button>
                </form>
              </div>
            ))}
          </section>
        )}

        {/* First-visit primer (Batch 2.6) — nervous first-timers find the door story only in email today */}
        {!hasVisited && (
          <section className="mt-8 overflow-hidden rounded-3xl border-2 border-accent/40 bg-accent/5">
            <div className="p-6">
              <p className="text-xs font-black uppercase tracking-widest text-accentdark">Jouw eerste bezoek</p>
              <h2 className="mt-1 text-xl font-black text-brand">Zo raak je binnen 🔑</h2>
              <ol className="mt-4 space-y-3">
                {[
                  ["Je code komt vanzelf", "± 5 minuten voor je sessie krijg je je persoonlijke toegangscode — per e-mail én hier in de app."],
                  ["Toets in op het paneel", "Bij de voordeur staat een codepaneel. Toets je code in, of open de deur met de knop hierboven."],
                  ["Werkt enkel tijdens je slot", "De toegang is alleen actief tijdens jouw gereserveerde uur. Sluit de deur goed achter je."],
                ].map(([t, b], i) => (
                  <li key={t} className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-black text-brand">{i + 1}</span>
                    <div>
                      <p className="font-bold text-brand">{t}</p>
                      <p className="text-sm text-brand/65">{b}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mt-5 flex flex-wrap gap-3">
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(gymAddress)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
                >
                  📍 Navigeer naar de gym
                </a>
                <Link href="/huisregels" className="rounded-full border-2 border-borderc bg-white px-5 py-2.5 text-sm font-bold text-brand transition hover:border-accent">
                  Toegang &amp; huisregels
                </Link>
              </div>
              <p className="mt-4 text-xs leading-relaxed text-brand/55">
                De gym is onbemand. Bij nood bel je altijd eerst <b className="text-brand">112</b>. De EHBO-kit hangt bij de ingang. Adres: <b className="text-brand">{gymAddress}</b>.
              </p>
            </div>
          </section>
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

          {upcomingPaid.length === 0 ? (
            <div className="mt-5 rounded-3xl border border-dashed border-borderc bg-white p-10 text-center">
              {welcomeReady ? (
                <>
                  <p className="text-2xl">🎁</p>
                  <p className="mt-2 font-black text-brand">Je gratis eerste sessie staat klaar</p>
                  <p className="mt-1 text-sm text-brand/60">Ze wordt automatisch verrekend — kies gewoon een moment dat past.</p>
                </>
              ) : lastDone ? (
                // Een lid dat al trainde is geen nieuw lid: "je hebt nog geen sessies geboekt" is
                // dan gewoon onwaar. Zijn eigen vorige moment is het makkelijkste volgende moment.
                <>
                  <p className="font-black text-brand">
                    Je laatste sessie was {new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", weekday: "long" }).format(new Date(lastDone.starts_at))} om{" "}
                    {new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", hour: "2-digit", minute: "2-digit" }).format(new Date(lastDone.starts_at))}.
                  </p>
                  <p className="mt-1 text-sm text-brand/60">Zelfde moment volgende week?</p>
                </>
              ) : (
                <p className="font-semibold text-brand/70">Je hebt nog geen sessies geboekt.</p>
              )}
              <Link
                href={!welcomeReady && lastDone ? rebookHref(lastDone) : "/boeken"}
                className="mt-5 inline-block rounded-full bg-brand px-7 py-3.5 font-bold text-white transition hover:opacity-90"
              >
                {welcomeReady ? "Boek je gratis sessie" : lastDone ? "Boek hetzelfde moment" : "Reserveer de gym"}
              </Link>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {upcomingPaid.map((b) => (
                <div
                  key={b.id}
                  id={`sessie-${b.id}`}
                  className="scroll-mt-24 rounded-2xl border border-borderc bg-white p-5"
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
                    <a
                      href={`/api/ics/${b.id}`}
                      className="inline-flex items-center gap-1.5 rounded-full border-2 border-borderc bg-white px-4 py-2.5 text-sm font-bold text-brand transition hover:border-accent"
                      title="Voeg deze sessie toe aan je agenda"
                    >
                      📅 Agenda
                    </a>
                  </div>
                  </div>
                  <DoorCodeCard {...doorCodeFor(b)} leadMin={leadMin} />
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

        {/* Rechten van betrokkenen (AVG): downloaden, gezondheidsgegevens wissen, verwijdering aanvragen. */}
        <div>
          <PrivacyControls healthConsent={healthConsent} deletionRequestedAt={delRow?.deletion_requested_at} newsletterOptIn={newsletterOptIn} trainingVisible={!!profile?.training_visible_to_buddies} />
        </div>

        {/* History */}
        {history.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xl font-black">Geschiedenis</h2>
            <div className="mt-5 divide-y divide-borderc rounded-2xl border border-borderc bg-white">
              {history.slice(0, HISTORY_VISIBLE).map((b) => <HistoryRow key={b.id} b={b} />)}
            </div>
            {/* De rest zit achter één klik (details werkt zonder JavaScript) — de laatste tien
                sessies zijn wat een lid nodig heeft; de rest is archief. */}
            {history.length > HISTORY_VISIBLE && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-bold text-brand/60 transition hover:text-brand">
                  Toon {history.length - HISTORY_VISIBLE} oudere {history.length - HISTORY_VISIBLE === 1 ? "sessie" : "sessies"}
                </summary>
                <div className="mt-3 divide-y divide-borderc rounded-2xl border border-borderc bg-white">
                  {history.slice(HISTORY_VISIBLE).map((b) => <HistoryRow key={b.id} b={b} />)}
                </div>
              </details>
            )}
          </section>
        )}

        <AccountSettings userId={user.id} initialName={profile?.full_name || ""} initialPhone={profile?.phone || ""} />
        <AccountLinking providers={user.app_metadata?.providers || (user.app_metadata?.provider ? [user.app_metadata.provider] : [])} />
        <div className="mt-6"><ProblemReport /></div>
      </div>
    </main>
  );
}

function HistoryRow({ b }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <div>
        <p className="font-bold text-brand/80">{b.services?.name || "Sessie"}</p>
        <p className="mt-0.5 text-sm capitalize text-brand/50">{fmtRange(b.starts_at, b.ends_at)}</p>
      </div>
      <div className="flex items-center gap-3">
        {b.status !== "geannuleerd" && b.services?.type !== "pt" && (
          <Link
            href={rebookHref(b)}
            className="rounded-full border-2 border-borderc bg-white px-4 py-1.5 text-xs font-bold text-brand transition hover:border-accent"
          >
            Boek opnieuw
          </Link>
        )}
        <span
          className={
            "rounded-full px-3 py-1 text-xs font-bold " +
            (b.status === "geannuleerd" ? "bg-paper text-brand/50" : "bg-accent/15 text-accentdark")
          }
        >
          {b.status === "geannuleerd" ? "Geannuleerd" : "Voltooid"}
        </span>
      </div>
    </div>
  );
}

function Stat({ label, value, accent, hint }) {
  // min-w-0 + break-words: in een driekoloms raster op een smal scherm moet een lang label als
  // "Aankomende sessies" kunnen afbreken in plaats van de kaart open te duwen.
  return (
    <div className="min-w-0 rounded-2xl border border-borderc bg-white p-3 sm:p-5">
      <p className="break-words text-[10px] font-bold uppercase text-lav sm:text-xs sm:tracking-widest">{label}</p>
      <p className={"mt-1 text-xl font-black sm:mt-2 sm:text-2xl " + (accent ? "text-accentdark" : "text-brand")}>{value}</p>
      {hint && <p className="mt-1 break-words text-[10px] font-semibold text-amber-600 sm:text-xs">{hint}</p>}
    </div>
  );
}

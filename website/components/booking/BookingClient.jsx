"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBookingAction, searchMembersAction, validateDiscountAction, toggleWaitlistAction, recoverBookingAction } from "@/app/(site)/boeken/actions";
import { slotInstant, brusselsDateStr, slotRangeLabel, fmtHour } from "@/lib/time";
import { isNetworkError, waitForNetwork } from "@/lib/net";
// sess() formatteert halve beurten met een komma (1,5). Deze import ONTBRAK terwijl sess() al in de
// prijsregels stond: de fout sloeg enkel toe bij leden mét tegoed of abo, en die tak van de UI
// wordt nooit geraakt door een uitgelogde test — vandaar dat build, tests én eigen klikwerk hem
// misten tot een lid met een vers abonnement niet meer kon boeken.
import { sess } from "@/lib/format";
import ShareReferral from "@/components/ShareReferral";
import { track } from "@/lib/track";

const euro = (cents) => "€ " + (cents / 100).toFixed(2).replace(".", ",");
const toast = (type, msg) => { try { window.dispatchEvent(new CustomEvent("fittin:toast", { detail: { type, msg } })); } catch {} };

export default function BookingClient({
  gym,
  services,
  takenSlots = [],
  coaches = [],
  availability = [],
  isLoggedIn,
  welcomeAvailable,
  creditBalance = 0,
  isMember = false,
  buddies = [],
  referralCode = "",
  prefill = {},
}) {
  const router = useRouter();
  const [serviceId, setServiceId] = useState(
    (services.find((s) => s.type === "fit60") || services[0])?.id
  );
  const [weekOffset, setWeekOffset] = useState(0);
  const [showNight, setShowNight] = useState(false);
  const [mobileDay, setMobileDay] = useState(null);
  const [selected, setSelected] = useState(null); // { dateStr, hour } — hour is decimal (6.5 = 06:30)
  // Quick-rebook: /boeken?personen=&duur= pre-fills persons + duration from a past session.
  const [persons, setPersons] = useState(Math.min(4, Math.max(1, Number(prefill.persons) || 1)));
  // Duur in stappen van een half uur (1 · 1,5 · 2 · 3 · 4) — 90 min is een volwaardige optie.
  const [duration, setDuration] = useState(Math.min(4, Math.max(1, Math.round((Number(prefill.duration) || 1) * 2) / 2)));
  const [coachId, setCoachId] = useState(coaches[0]?.id || "");
  const [useWelcome, setUseWelcome] = useState(welcomeAvailable);
  // Auto-apply the sessietegoed/abo balance by default (opt-OUT) — a €150-card holder should never
  // silently pay €15 cash again. Free welcome session still wins when available.
  const [useCredit, setUseCredit] = useState(!welcomeAvailable && creditBalance >= 1);
  const [discountCode, setDiscountCode] = useState("");
  const [discountInfo, setDiscountInfo] = useState(null); // {ok,cents,off,label} | {error}
  const [applyingCode, setApplyingCode] = useState(false);
  const [invitees, setInvitees] = useState([]); // [{id,name}] members to bring along
  const [memberQuery, setMemberQuery] = useState("");
  const [memberResults, setMemberResults] = useState([]);
  const [emailInvitees, setEmailInvitees] = useState([]); // [email] non-members invited by e-mail
  const [emailInput, setEmailInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(null);

  const service = services.find((s) => s.id === serviceId) || services[0];
  const isFit60 = service?.type === "fit60";
  const isPT = service?.type === "pt";
  // Booking horizon (in weeks) is a membership perk: members plan up to 8 weeks out, others 2.
  // Let op: dit is een week-OFFSET vanaf de huidige week, dus 7 = de 8e week. Met 8 kon een member
  // door negen weken bladeren terwijl de hele site "8 weken" belooft.
  const maxWeek = isMember ? 7 : 1;
  // Reset the person count when the service changes (gym-persons vs PT-formule mean different things).
  // Skip the very first run so a ?personen= prefill (quick-rebook) survives mount.
  const didMountService = useRef(false);
  useEffect(() => {
    if (!didMountService.current) { didMountService.current = true; return; }
    setPersons(1);
  }, [serviceId]);

  const days = useMemo(() => {
    const out = [];
    const base = Date.now() + weekOffset * 7 * 86400000;
    for (let i = 0; i < 7; i++) {
      const d = new Date(base + i * 86400000);
      out.push({
        dateStr: brusselsDateStr(d),
        weekday: new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", weekday: "short" }).format(d),
        dayMonth: new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short" }).format(d),
      });
    }
    return out;
  }, [weekOffset]);

  const takenSet = useMemo(() => new Set(takenSlots.map((s) => new Date(s).getTime())), [takenSlots]);

  const allHours = useMemo(() => {
    const list = [];
    for (let h = gym.open_hour; h < gym.close_hour; h += 0.5) list.push(h);
    return list;
  }, [gym.open_hour, gym.close_hour]);
  // Het rooster toonde ALLE openingsuren: bij 06–23 zijn dat 34 halfuur-rijen, een scherm vol
  // waar je doorheen moet vóór je de rest van het formulier ziet. De randuren dragen daar nauwelijks
  // iets bij — in de praktijk komt minder dan 5 % van de boekingen vóór 07:00 of na 21:00. Die staan
  // dus standaard dicht, met één knop om ze alsnog te tonen. Niets wordt onbereikbaar.
  const CORE_FROM = 7, CORE_TO = 21;
  const fringeCount = allHours.filter((h) => h < CORE_FROM || h >= CORE_TO).length;
  const hours = !fringeCount || showNight ? allHours : allHours.filter((h) => h >= CORE_FROM && h < CORE_TO);
  const activeDay = (days.find((d) => d.dateStr === mobileDay) || days[0])?.dateStr;

  // Restore a slot chosen BEFORE signup (guest picks a moment → creates account → lands back on
  // /boeken?d=…&h=…): re-select it so the biggest funnel seam doesn't drop their choice. Only when
  // the slot is still actually bookable.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const d = sp.get("d");
    const h = parseFloat(sp.get("h"));
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(h)) return;
    // parseInt kapte 1.5 af naar 1 → een 90-minutensuggestie (en de gast-signup-terugkeer met
    // ?u=1.5) werd stil 1 uur. Ontbreekt ?u=, hou dan de duur die al uit ?duur= kwam.
    const uRaw = sp.get("u") != null ? parseFloat(sp.get("u")) : duration;
    const u = Math.min(4, Math.max(1, Math.round((Number.isFinite(uRaw) ? uRaw : 1) * 2) / 2));
    // Een gast mag tot twee weken vooruit bladeren, maar het herstel keek enkel in de huidige week:
    // wie een moment uit week 2 koos en dan een account maakte, kwam terug op een lege week 1 en
    // zag zijn keuze zonder één woord verdwijnen. Leid de week dus af uit de datum zelf.
    const dayIdx = Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${brusselsDateStr(new Date())}T12:00:00Z`)) / 86400000);
    const wk = Math.floor(dayIdx / 7);
    if (dayIdx < 0 || wk > maxWeek) return;
    if (!canBook(d, h, u)) {
      setError("Dat moment is net weg — kies gerust een ander.");
      return;
    }
    setWeekOffset(wk);
    setSelected({ dateStr: d, hour: h });
    if (h < 7 || h >= 21) setShowNight(true); // randuur uit een deeplink: rooster meteen openvouwen
    setMobileDay(d);
    setDuration(u);
    const p = parseInt(sp.get("p"), 10);
    if (p >= 1 && p <= 4) setPersons(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function coachOpen(dateStr, h) {
    if (!isPT || !coachId) return true;
    const wd = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
    return availability.some((a) => a.coach_id === coachId && a.weekday === wd && a.from_hour <= h && h < a.to_hour);
  }

  // Is one 30-min slot bookable (free + open + future)?
  function slotFree(dateStr, h) {
    const t = slotInstant(dateStr, h).getTime();
    return !takenSet.has(t) && t >= Date.now() && coachOpen(dateStr, h);
  }
  // Can a booking of `dur` whole hours START at half-hour slot h? Every 30-min slice in
  // [h, h+dur) must be free and the whole thing must fit before closing time.
  function canBook(dateStr, h, dur) {
    if (h + dur > gym.close_hour) return false;
    for (let s = h; s < h + dur - 1e-9; s += 0.5) if (!slotFree(dateStr, s)) return false;
    return true;
  }

  // De duur waarop het ROOSTER moet toetsen. Sinds de duurkeuze bóven het rooster staat, toont het
  // rooster enkel momenten waar de gekozen duur ook echt pást — daarvoor was elk slot groen en
  // sprong de duur achteraf stilletjes terug naar 1 uur. PT boekt altijd één uur.
  const fitDur = isFit60 ? duration : 1;
  const welcomeApplies = isFit60 && welcomeAvailable && useWelcome && duration === 1;
  const creditApplies = isFit60 && !welcomeApplies && useCredit && creditBalance >= duration;
  const durLabel = (n) => (n % 1 ? `${Math.floor(n)}u30` : `${n} uur`);
  // Een uitgelogde bezoeker heeft nog geen profiel, dus we weten NIET of zijn gratis uur nog
  // bestaat — de meeste leden hebben het al opgebruikt. Daarom is dit enkel een voorwaardelijke
  // belofte in tekst; het bedrag zelf blijft de echte prijs. Vroeger werd hier € 15,00 doorstreept
  // met "Gratis", wat voor elk terugkerend lid onwaar was zodra het inlogde.
  const guestWelcome = !isLoggedIn && isFit60 && duration === 1;
  // Het gratis uur geldt enkel voor 1 uur. Ingelogd staat die waarschuwing er al; uitgelogd las de
  // bezoeker "Totaal € 30,00" recht boven een knop die zijn eerste uur gratis beloofde.
  const guestWelcomeTooLong = !isLoggedIn && isFit60 && duration > 1;
  // De stapnummers moeten volgen wat er écht staat: valt de dienstkeuze weg, dan begint het
  // formulier bij 1.
  const showServicePicker = services.length > 1;
  const stepNr = (n) => String(showServicePicker ? n : n - 1);
  const durFactor = 1; // geen korting op langere sessies — je betaalt (en gebruikt) 1 credit per uur
  // Members book Fit60 at the member price; PT uses the chosen coach's per-formule rate (matches the
  // server): 1-op-1 = coach_pt_price_cents, 1-op-2/1-op-3 = prijs per persoon → totaal = tarief × personen.
  const memberRate = isFit60 && isMember && service?.member_price_cents != null;
  const ptCoach = isPT && coachId ? coaches.find((c) => c.id === coachId) : null;
  const ptByPersons = ptCoach ? (persons >= 3 ? ptCoach.coach_pt3_price_cents : persons === 2 ? ptCoach.coach_pt2_price_cents : ptCoach.coach_pt_price_cents) : null;
  const ptUnit = (ptByPersons != null ? ptByPersons : ptCoach?.coach_pt_price_cents) ?? (service?.price_cents ?? 0);
  const unitCents = memberRate ? service.member_price_cents : (isPT ? ptUnit : (service?.price_cents ?? 0));
  const priceCents = welcomeApplies || creditApplies ? 0
    : isPT ? Math.round(ptUnit * persons * duration)
    : Math.round(unitCents * (isFit60 ? duration : 1) * (isFit60 ? durFactor : 1));

  // Het bedrag onder "Totaal" en in de mobiele balk komt uit één berekening — die twee mogen nooit
  // iets anders zeggen.
  const totalValue = () =>
    welcomeApplies ? "Gratis"
    : creditApplies ? `${sess(duration)} sessie${duration === 1 ? "" : "s"}`
    : discountInfo?.ok ? euro(discountInfo.cents)
    : euro(priceCents);
  // Volgt er straks een Stripe-pagina? Dan moet de bezoeker het venster van 15 minuten kennen.
  const willPay = isLoggedIn && !welcomeApplies && !creditApplies && (discountInfo?.ok ? discountInfo.cents : priceCents) > 0;

  // Een kortingsweergave hoort bij één bedrag: verandert de duur of het aantal personen, dan bleef
  // het oude bedrag staan tot de bezoeker op de Stripe-pagina een ander cijfer zag.
  useEffect(() => { setDiscountInfo(null); }, [priceCents]);

  // Invite slots = the booking's free spots (persons − you). Members + e-mail invites share them.
  const inviteSlots = isFit60 ? Math.max(0, persons - 1) : 0;
  const usedInvites = invitees.length + emailInvitees.length;
  const addEmailInvite = () => {
    const e = emailInput.trim().toLowerCase();
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && usedInvites < inviteSlots && !emailInvitees.includes(e)) {
      setEmailInvitees((s) => [...s, e]);
      setEmailInput("");
    }
  };

  async function submit() {
    if (!selected || !service) return;
    setBusy(true);
    setError("");
    track("checkout_started"); // funnel: confirm clicked (→ Stripe for paid, or instant for free/credit)

    const payload = {
      serviceId: service.id,
      date: selected.dateStr,
      hour: selected.hour,
      hours: isFit60 ? duration : 1,
      persons: isFit60 || isPT ? persons : 1,
      useWelcome: welcomeApplies,
      coachId: isPT ? coachId : null,
      useCredit: creditApplies,
      discountCode: !welcomeApplies && !creditApplies ? discountCode.trim() : "",
      participantIds: invitees.map((i) => i.id),
      emailInvites: emailInvitees,
    };

    // Valt het netwerk weg tijdens het bevestigen, dan is dit het pijnlijkste moment van de hele
    // app: het lid weet niet of het geboekt is of niet, en durft niet opnieuw te klikken.
    // We proberen daarom zelf opnieuw — maar NOOIT blind: eerst vragen we de server of de vorige
    // poging tóch is aangekomen. Zo kan een herhaling geen tweede boeking maken.
    let res;
    try {
      res = await createBookingAction(payload);
    } catch (err) {
      if (!isNetworkError(err)) {
        setBusy(false);
        setError("Er ging iets mis bij het boeken. Probeer het opnieuw.");
        return;
      }
      toast("info", "Verbinding weggevallen — we proberen het even opnieuw…");
      let recovered = null;
      try { recovered = await recoverBookingAction({ date: selected.dateStr, hour: selected.hour }); } catch {}
      if (recovered?.found) {
        // De eerste poging was wél geslaagd. Niet opnieuw boeken.
        if (recovered.checkoutUrl) { window.location.href = recovered.checkoutUrl; return; }
        toast("success", "Je boeking was toch doorgekomen ✓");
        setBusy(false);
        router.refresh();
        router.push("/account");
        return;
      }
      await waitForNetwork();
      try {
        res = await createBookingAction(payload);
      } catch {
        setBusy(false);
        setError("We konden je boeking niet doorsturen — je verbinding viel weg. Er is niets vastgelegd en er is niets aangerekend. Probeer het opnieuw zodra je weer online bent.");
        toast("error", "Nog steeds geen verbinding — er is niets geboekt");
        return;
      }
    }
    if (res?.error) {
      setBusy(false);
      setError(res.error);
      // Op de telefoon zweeft de bevestigknop onderaan terwijl de foutzone in het overzichtspaneel
      // ver daarboven staat: zonder toast leek er letterlijk niets te gebeuren bij een weigering.
      toast("error", res.error);
      router.refresh();
      return;
    }
    if (res?.checkoutUrl) {
      window.location.href = res.checkoutUrl;
      return;
    }
    setBusy(false);
    track("booking_completed"); // funnel: geeft checkout_started zijn noemer
    const day = days.find((d) => d.dateStr === selected.dateStr);
    setConfirmed({
      id: res?.bookingId || null,
      service: service.name,
      day: day ? `${day.weekday} ${day.dayMonth}` : selected.dateStr,
      range: slotRangeLabel(selected.hour, (isFit60 ? duration : 1) * 60),
      persons: isFit60 || isPT ? persons : 1,
      free: welcomeApplies,
    });
    router.refresh();
  }

  if (confirmed) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-24">
        <div className="rounded-3xl border border-borderc bg-white p-10 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent text-3xl font-black text-brand">✓</div>
          <h1 className="mt-6 text-3xl font-black">Boeking bevestigd!</h1>
          <p className="mt-3 leading-relaxed text-brand/70">
            {confirmed.service} · {confirmed.day} · {confirmed.range} · {confirmed.persons}{" "}
            {confirmed.persons === 1 ? "persoon" : "personen"}
            {confirmed.free && " · gratis (je eerste uur)"}
          </p>
          {/* Voor een nieuw lid is dit het allereerste scherm na zijn allereerste boeking. Zonder
              deze regel eindigt de flow bij "bevestigd" en blijft de belangrijkste vraag open:
              hoe raak ik straks binnen? */}
          <p className="mt-3 text-sm leading-relaxed text-brand/55">
            Je bevestiging staat in je mailbox. Je deurcode komt automatisch ± 5 min vóór je sessie —
            verplaatsen kan tot 6u vooraf.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            {confirmed.id && (
              <a href={`/api/ics/${confirmed.id}`} className="inline-flex items-center gap-1.5 rounded-full border-2 border-borderc bg-white px-6 py-3.5 font-bold text-brand transition hover:border-accent" title="Voeg deze sessie toe aan je agenda">📅 Agenda</a>
            )}
            <Link href="/account" className="rounded-full bg-brand px-7 py-3.5 font-bold text-white transition hover:opacity-90">Naar mijn account</Link>
            <button onClick={() => { setConfirmed(null); setSelected(null); }} className="rounded-full border-2 border-borderc px-7 py-3.5 font-bold text-brand transition hover:border-lav">Nieuwe boeking</button>
          </div>
          {/* De deelknop hing tot nu aan een betaald=1-conditie op /account, waardoor gratis-,
              tegoed- en kaartboekers hem nooit zagen. Hier staat hij op het enige moment waarop
              iemand net zelf overtuigd is. */}
          {referralCode && (
            <div className="mt-8 border-t border-borderc pt-6">
              <p className="text-sm font-bold text-brand">Breng een vriend mee — zijn eerste uur is ook gratis.</p>
              <div className="mt-3 flex justify-center"><ShareReferral code={referralCode} compact /></div>
            </div>
          )}
        </div>
      </main>
    );
  }

  const weekLabel = `${days[0].dayMonth} – ${days[6].dayMonth}`;

  return (
    <main className="bg-paper">
      <div className="mx-auto max-w-6xl px-5 py-16">
        <Link href={isLoggedIn ? "/account" : "/"} className="inline-flex items-center gap-1.5 text-sm font-bold text-brand/60 transition hover:text-brand">← {isLoggedIn ? "Terug naar account" : "Terug naar home"}</Link>
        <p className="mt-6 text-sm font-bold uppercase tracking-[0.25em] text-lav">Online boeken</p>
        <h1 className="mt-3 text-3xl font-black md:text-4xl">Reserveer je sessie</h1>
        {/* De code-framing is weg: de kortingsvalidatie weigert "FittinWelcome" expliciet, dus wie
            hem effectief intikte kreeg een foutmelding op de belofte van de homepage. Het gratis uur
            hangt aan het profiel, niet aan een code. */}
        {welcomeAvailable || !isLoggedIn ? (
          <p className="mt-3 max-w-xl text-brand/70">
            Je eerste privé sessie van 1 uur is <span className="font-bold text-accentdark">gratis</span>
            {isLoggedIn ? "." : " — dat geldt voor je eerste boeking bij Fittin'."}
          </p>
        ) : (
          <p className="mt-3 max-w-xl text-brand/70">De hele zaal is van jou tijdens je boeking — open van {gym.open_hour}u tot {gym.close_hour}u, kies je moment.</p>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {/* Service — één dienst is geen keuze: die kaart duwde op de telefoon het hele rooster
                een scherm naar beneden om een knop te tonen die al aan stond. serviceId wordt bij
                mount gezet, dus zonder kaart blijft alles werken. */}
            {showServicePicker && (
              <Card step="1" title="Kies je sessie">
                <div className={"grid gap-4 " + (services.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
                  {services.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => { setServiceId(s.id); setSelected(null); }}
                      className={"rounded-2xl border-2 p-5 text-left transition " + (serviceId === s.id ? "border-accent bg-accent/10" : "border-borderc hover:border-lav")}
                    >
                      <p className="font-black">{s.name}</p>
                      {s.type === "fit60" && isMember && s.member_price_cents != null ? (
                        <p className="mt-1 text-sm text-brand/60">{s.duration_min} min · <span className="font-bold text-accentdark">{euro(s.member_price_cents)}</span> <span className="text-brand/40 line-through">{euro(s.price_cents)}</span> <span className="font-bold text-accentdark">ledenprijs</span></p>
                      ) : (
                        <p className="mt-1 text-sm text-brand/60">{s.duration_min} min · {s.type === "fit60" ? euro(s.price_cents) : "op aanvraag"}</p>
                      )}
                    </button>
                  ))}
                </div>
              </Card>
            )}

            {/* Coach (PT) */}
            {isPT && (
              <Card step="•" title="Kies je coach">
                {coaches.length === 0 ? (
                  <p className="text-sm text-brand/50">Nog geen coaches beschikbaar — neem contact op.</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-3">
                    {coaches.map((c) => (
                      <button key={c.id} onClick={() => { setCoachId(c.id); setSelected(null); }} className={"rounded-2xl border-2 p-4 text-left text-sm font-bold transition " + (coachId === c.id ? "border-accent bg-accent/10" : "border-borderc hover:border-lav")}>
                        {c.full_name || "Coach"}
                      </button>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {/* Persons */}
            {isFit60 && (
              <Card step={stepNr(2)} title="Met hoeveel &amp; hoe lang?">
                {/* Personen en duur naast elkaar op desktop: twee korte keuzerijen onder elkaar lieten
                    de halve kaartbreedte leeg en maakten de pagina onnodig lang. */}
                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 text-sm font-black text-brand">Met hoeveel kom je?</p>
                    <div className="flex gap-3">
                      {[1, 2, 3, 4].map((n) => (
                        <button key={n} onClick={() => setPersons(n)} className={"h-12 w-12 rounded-2xl border-2 font-black transition " + (persons === n ? "border-accent bg-accent/10" : "border-borderc hover:border-lav")}>{n}</button>
                      ))}
                    </div>
                    <p className="mt-3 text-xs text-brand/50">Zelfde prijs, ook met vrienden — geen extra kosten.</p>
                    {/* Uitgelogd kan je nog niemand uitnodigen (dat vraagt een account). Zonder deze regel
                        lijkt het alsof samen boeken niet bestaat — je ziet enkel dat er niets verschijnt. */}
                    {!isLoggedIn && persons >= 2 && (
                      <p className="mt-2 text-xs text-brand/50">
                        Vrienden uitnodigen in de app kan zodra je een account hebt — ze krijgen dan zelf een
                        uitnodiging. Je kan ze uiteraard ook gewoon meebrengen.
                      </p>
                    )}
                  </div>

                  <div className="sm:border-l sm:border-borderc sm:pl-6">
                    <p className="mb-2 text-sm font-black text-brand">Hoe lang?</p>
                    <div className="flex flex-wrap gap-2">
                      {[1, 1.5, 2, 3, 4].map((n) => (
                        // Altijd kiesbaar: de duur bepaalt wélke momenten het rooster hieronder toont, niet
                        // omgekeerd. Ze grijs maken tot er een moment gekozen is, verborg 1u30 volledig.
                        <button key={n} onClick={() => { setDuration(n); if (selected && !canBook(selected.dateStr, selected.hour, n)) setSelected(null); }} className={"rounded-2xl border-2 px-3.5 py-2.5 text-center transition " + (duration === n ? "border-accent bg-accent/10" : "border-borderc hover:border-lav")}>
                          <span className="block text-sm font-black text-brand">{n % 1 ? `${Math.floor(n)}u30` : `${n} uur`}</span>
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-brand/40">Hieronder zie je meteen welke momenten vrij zijn voor deze duur.</p>
                    {duration > 1 && <p className="mt-2 text-xs text-brand/50">Je boekt de zaal exclusief voor de volledige duur — {durLabel(duration)} kost {sess(duration)} sessie{duration === 1 ? "" : "s"}.</p>}
                    {welcomeAvailable && useWelcome && duration > 1 && (
                      <p className="mt-2 text-xs font-bold text-amber-600">Let op: je gratis eerste sessie geldt enkel voor 1 uur. Bij {durLabel(duration)} betaal je de volledige prijs — zet de duur op 1 uur om ze gratis te houden.</p>
                    )}
                  </div>
                </div>

                {/* Invite friends — members by name, or non-members straight by e-mail */}
                {isLoggedIn && persons >= 2 && (
                  <div className="mt-4 rounded-2xl border border-borderc bg-paper p-4">
                    <p className="text-sm font-black text-brand">Nodig vrienden uit ({usedInvites}/{inviteSlots})</p>
                    <p className="mt-0.5 text-xs text-brand/50">Leden: hun bezoek telt mee voor hun stats. Nog geen account? Nodig ze uit via e-mail — ze krijgen een uitnodiging + link om een account te maken.</p>

                    {(invitees.length > 0 || emailInvitees.length > 0) && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {invitees.map((m) => (
                          <span key={m.id} className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-brand">{m.name}<button type="button" aria-label={`Verwijder ${m.name}`} onClick={() => setInvitees((s) => s.filter((x) => x.id !== m.id))} className="text-brand/60 hover:text-brand">×</button></span>
                        ))}
                        {emailInvitees.map((e) => (
                          <span key={e} className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-xs font-bold text-white">{e}<button type="button" aria-label={`Verwijder uitnodiging voor ${e}`} onClick={() => setEmailInvitees((s) => s.filter((x) => x !== e))} className="text-white/60 hover:text-white">×</button></span>
                        ))}
                      </div>
                    )}

                    {usedInvites < inviteSlots && buddies.filter((b) => !invitees.some((i) => i.id === b.id)).length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {buddies.filter((b) => !invitees.some((i) => i.id === b.id)).map((b) => (
                          <button key={b.id} type="button" onClick={() => setInvitees((s) => (usedInvites < inviteSlots ? [...s, { id: b.id, name: b.name }] : s))} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-brand/70 transition hover:bg-accent/15">+ {b.name}</button>
                        ))}
                      </div>
                    )}

                    {usedInvites < inviteSlots && (
                      <div className="relative mt-3">
                        <input
                          value={memberQuery}
                          onChange={async (e) => {
                            const q = e.target.value;
                            setMemberQuery(q);
                            if (q.trim().length >= 2) {
                              const r = await searchMembersAction(q);
                              setMemberResults(r.filter((m) => !invitees.some((i) => i.id === m.id)));
                            } else setMemberResults([]);
                          }}
                          placeholder="Zoek een lid op naam…"
                          aria-label="Zoek een lid op naam om uit te nodigen"
                          className="w-full rounded-xl border-2 border-borderc bg-white px-3 py-2 text-sm text-brand outline-none focus:border-accent"
                        />
                        {memberResults.length > 0 && (
                          <div className="absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-xl border border-borderc bg-white shadow-lg">
                            {memberResults.map((m) => (
                              <button key={m.id} type="button" onClick={() => { setInvitees((s) => (usedInvites < inviteSlots ? [...s, m] : s)); setMemberQuery(""); setMemberResults([]); }} className="block w-full px-3 py-2 text-left text-sm text-brand transition hover:bg-paper">{m.name}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {usedInvites < inviteSlots && (
                      <div className="mt-2 flex gap-2">
                        <input type="email" aria-label="Nodig iemand zonder account uit via e-mail" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEmailInvite(); } }} placeholder="Geen account? E-mailadres…" className="min-w-0 flex-1 rounded-xl border-2 border-borderc bg-white px-3 py-2 text-sm text-brand outline-none focus:border-accent" />
                        <button type="button" onClick={addEmailInvite} className="shrink-0 rounded-xl bg-white px-4 py-2 text-sm font-bold text-brand transition hover:bg-accent/15">Uitnodigen</button>
                      </div>
                    )}
                  </div>
                )}

              </Card>
            )}

            {/* Schedule grid */}
            <Card step={stepNr(3)} title="Kies je moment">
              <div className="mb-3 flex items-center justify-between">
                <button onClick={() => setWeekOffset((w) => Math.max(0, w - 1))} disabled={weekOffset === 0} className="rounded-full border-2 border-borderc px-4 py-1.5 text-sm font-bold text-brand transition enabled:hover:border-lav disabled:opacity-30">‹ vorige</button>
                <span className="text-sm font-bold text-brand/60">{weekLabel}</span>
                <button onClick={() => setWeekOffset((w) => Math.min(maxWeek, w + 1))} disabled={weekOffset >= maxWeek} className="rounded-full border-2 border-borderc px-4 py-1.5 text-sm font-bold text-brand transition enabled:hover:border-lav disabled:opacity-30">volgende ›</button>
              </div>
              {/* Honest membership perk: members can book further ahead than non-members. */}
              {!isMember && weekOffset >= maxWeek && (
                <div className="mb-3 rounded-xl bg-accent/10 px-4 py-3 text-sm text-brand/70">
                  Leden boeken tot 8 weken vooruit (jij 2). <Link href="/lidmaatschap" className="font-bold text-accentdark hover:underline">Word lid →</Link>
                </div>
              )}

              {/* Mobiel: dagkiezer + tijdslots in 1 kolom — geen horizontale scroll */}
              <div className="md:hidden">
                <div className="grid grid-cols-7 gap-1">
                  {days.map((d) => {
                    const act = activeDay === d.dateStr;
                    return (
                      <button key={d.dateStr} onClick={() => setMobileDay(d.dateStr)} className={"rounded-xl border-2 py-1.5 text-center transition " + (act ? "border-accent bg-accent/15" : "border-borderc")}>
                        <span className="block text-[9px] font-bold uppercase text-brand/40">{d.weekday}</span>
                        <span className="block text-xs font-black text-brand">{d.dayMonth.split(" ")[0]}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {hours.map((h) => {
                    const t = slotInstant(activeDay, h).getTime();
                    const taken = takenSet.has(t);
                    const past = t < Date.now();
                    const closed = !coachOpen(activeDay, h);
                    const inRange = selected && selected.dateStr === activeDay && h >= selected.hour && h < selected.hour + (isFit60 ? duration : 1);
                    const isSel = selected && selected.dateStr === activeDay && selected.hour === h;
                    const label = fmtHour(h);
                    if (past || closed) return <div key={h} className="rounded-xl bg-paper py-3 text-center text-xs font-bold text-brand/25">{label}</div>;
                    if (taken) return <WaitlistSlot key={h} date={activeDay} hour={h} label={label} isLoggedIn={isLoggedIn} />;
                    if (!inRange && !canBook(activeDay, h, fitDur)) return <div key={h} className="rounded-xl bg-paper py-3 text-center text-xs font-bold text-brand/20">{label}</div>;
                    return (
                      <button key={h} onClick={() => { setSelected({ dateStr: activeDay, hour: h }); track("booking_slot_chosen"); }} className={"rounded-xl border-2 py-3 text-center text-xs font-black transition " + (inRange ? "border-accent bg-accent text-brand" : "border-accent/30 bg-accent/10 text-accentdark")}>
                        {label}{isSel ? " ✓" : ""}
                      </button>
                    );
                  })}
                </div>
                {hours.length === 0 && <p className="mt-2 text-xs text-brand/40">Geen vrije uren op deze dag.</p>}
              </div>

              {/* Desktop: volledige weekrooster */}
              <div className="hidden overflow-x-auto md:block">
                <div className="min-w-[620px]">
                  {/* header */}
                  <div className="grid grid-cols-[44px_repeat(7,1fr)] gap-1">
                    <div />
                    {days.map((d) => (
                      <div key={d.dateStr} className="pb-1 text-center">
                        <p className="text-[10px] font-bold uppercase text-brand/40">{d.weekday}</p>
                        <p className="text-xs font-black text-brand">{d.dayMonth}</p>
                      </div>
                    ))}
                  </div>
                  {/* rows */}
                  <div>
                    {hours.map((h) => (
                      <div key={h} className="grid grid-cols-[44px_repeat(7,1fr)] gap-1 py-0.5">
                        <div className="flex items-center justify-end pr-1 text-[10px] font-bold text-brand/30">{fmtHour(h)}</div>
                        {days.map((d) => {
                          const t = slotInstant(d.dateStr, h).getTime();
                          const taken = takenSet.has(t);
                          const past = t < Date.now();
                          const closed = !coachOpen(d.dateStr, h);
                          const inRange = selected && selected.dateStr === d.dateStr && h >= selected.hour && h < selected.hour + (isFit60 ? duration : 1);
                          const isSel = selected && selected.dateStr === d.dateStr && selected.hour === h;
                          if (past || closed) return <div key={d.dateStr} className="h-7 rounded-md bg-paper" />;
                          if (taken) return <WaitlistSlot key={d.dateStr} date={d.dateStr} hour={h} compact isLoggedIn={isLoggedIn} />;
                          if (!inRange && !canBook(d.dateStr, h, fitDur)) return <div key={d.dateStr} className="h-7 rounded-md bg-paper/60" />;
                          return (
                            <button
                              key={d.dateStr}
                              onClick={() => { setSelected({ dateStr: d.dateStr, hour: h }); track("booking_slot_chosen"); }}
                              className={"h-7 select-none rounded-md border text-[9px] font-bold transition " + (inRange ? "border-accent bg-accent text-brand" : "border-accent/30 bg-accent/10 text-accentdark hover:bg-accent/25")}
                            >
                              {isSel ? "✓" : inRange ? "•" : ""}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                {/* De legende moet de wáárheid zeggen: sinds het rooster op de gekozen duur toetst,
                    kan grijs óók "past niet in deze duur" betekenen. Dat verzwijgen zou lezen als
                    "alles is volgeboekt" terwijl het uur gewoon te kort is vóór sluitingstijd. */}
                <p className="text-xs text-brand/40">
                  Groen = vrij voor {fitDur % 1 ? `${Math.floor(fitDur)}u30` : `${fitDur} uur`} · grijs = geboekt of te kort · de zaal is exclusief van jou tijdens je sessie.
                </p>
                {fringeCount > 0 && (
                  <button onClick={() => setShowNight((s) => !s)} className={"inline-flex items-center gap-1.5 rounded-full border-2 px-4 py-2 text-xs font-black transition " + (showNight ? "border-brand bg-brand text-white" : "border-accent bg-accent/15 text-accentdark hover:bg-accent/30")}>
                    🕕 {showNight
                      ? "Verberg vroege & late uren"
                      : `Toon vroeger & later (${fmtHour(gym.open_hour)}–${fmtHour(CORE_FROM)} · ${fmtHour(CORE_TO)}–${fmtHour(gym.close_hour)})`}
                  </button>
                )}
              </div>
            </Card>

            {/* PT formule (1-op-1 / 1-op-2 / 1-op-3) met het tarief van de gekozen coach */}
            {isPT && (
              <Card step="•" title="Kies je formule">
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { n: 1, label: "1-op-1", price: ptCoach?.coach_pt_price_cents, per: "" },
                    { n: 2, label: "1-op-2", price: ptCoach?.coach_pt2_price_cents, per: "p.p." },
                    { n: 3, label: "1-op-3", price: ptCoach?.coach_pt3_price_cents, per: "p.p." },
                  ].map((f) => {
                    const offered = !ptCoach || f.n === 1 || f.price != null;
                    return (
                      <button key={f.n} type="button" disabled={!offered} onClick={() => offered && setPersons(f.n)}
                        className={"rounded-2xl border-2 p-4 text-left transition disabled:opacity-40 " + (persons === f.n ? "border-accent bg-accent/10" : "border-borderc hover:border-lav")}>
                        <span className="block text-sm font-black text-brand">{f.label}</span>
                        <span className="mt-0.5 block text-xs text-brand/55">{f.price != null ? `${euro(f.price)}${f.per ? " " + f.per : ""}` : (ptCoach ? "op aanvraag" : "—")}</span>
                      </button>
                    );
                  })}
                </div>
                {ptCoach && (
                  <p className="mt-3 text-xs text-brand/50">
                    1-op-2 en 1-op-3 zijn prijs per persoon. Totaal: <span className="font-bold text-brand">{euro(priceCents)}</span> voor {persons} {persons === 1 ? "persoon" : "personen"}.
                  </p>
                )}
              </Card>
            )}

          </div>

          {/* Summary */}
          <div className="h-fit rounded-3xl bg-brand p-7 text-white lg:sticky lg:top-24">
            <h2 className="text-lg font-black">Jouw boeking</h2>
            <dl className="mt-5 space-y-3 text-sm">
              <Row label="Sessie" value={service?.name || "—"} />
              {isPT && <Row label="Coach" value={coaches.find((c) => c.id === coachId)?.full_name || "—"} />}
              <Row label="Moment" value={selected ? `${days.find((d) => d.dateStr === selected.dateStr)?.weekday || ""} ${days.find((d) => d.dateStr === selected.dateStr)?.dayMonth || ""} · ${slotRangeLabel(selected.hour, (isFit60 ? duration : 1) * 60)}` : "—"} />
              {isFit60 && <Row label="Personen" value={persons} />}
              {isFit60 && <Row label="Duur" value={durLabel(duration)} />}
            </dl>

            {isFit60 && welcomeAvailable && (
              <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl bg-white/10 p-3 text-sm">
                <input type="checkbox" checked={useWelcome} onChange={(e) => setUseWelcome(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#5fda6b]" />
                {/* Het label moet de werkelijkheid volgen: bij een langere sessie bleef hier
                    "je eerste uur is gratis" staan terwijl het totaal € 30 toonde. */}
                <span className="text-lav">
                  {duration > 1
                    ? <>Je gratis uur geldt enkel voor een sessie van <b className="text-white">1 uur</b> — bij {durLabel(duration)} betaal je de volledige prijs</>
                    : <>Gebruik je <b className="text-white">gratis eerste uur</b> — deze sessie kost je niets</>}
                </span>
              </label>
            )}

            {isFit60 && !welcomeApplies && creditBalance >= 1 && (
              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl bg-white/10 p-3 text-sm">
                <input type="checkbox" checked={useCredit} onChange={(e) => setUseCredit(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#5fda6b]" />
                {/* "Sessietegoed" i.p.v. "beurtenkaart": een abo-sessie komt in hetzelfde grootboek
                    terecht en is geen kaart. En een ontoereikend saldo moet je hier lezen, niet pas
                    op de Stripe-pagina. */}
                <span className="text-lav">Betaal met je <span className="font-bold text-accent">sessietegoed</span> — saldo: {sess(creditBalance)}{creditApplies ? ` · je gebruikt ${sess(duration)}, daarna ${sess(creditBalance - duration)}` : useCredit ? ` · je saldo volstaat niet voor ${durLabel(duration)} — je betaalt deze sessie` : " · vink uit om cash/kaart te betalen"}</span>
              </label>
            )}


            {isLoggedIn && !welcomeApplies && !creditApplies && (
              <div className="mt-4">
                <p className="text-xs font-bold uppercase tracking-wide text-lav">Kortingscode</p>
                <div className="mt-2 flex gap-2">
                  <input value={discountCode} onChange={(e) => { setDiscountCode(e.target.value); setDiscountInfo(null); }} placeholder="bv. TERUG50" aria-label="Kortingscode"
                    className="min-w-0 flex-1 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm uppercase text-white placeholder:text-lav/60 outline-none focus:border-accent" />
                  <button type="button" disabled={!discountCode.trim() || applyingCode}
                    onClick={async () => {
                      setApplyingCode(true);
                      setDiscountInfo(null);
                      const r = await validateDiscountAction(discountCode.trim(), priceCents);
                      setApplyingCode(false);
                      setDiscountInfo(r);
                    }}
                    className="shrink-0 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-brand transition hover:opacity-90 disabled:opacity-40">
                    {applyingCode ? "…" : "Toepassen"}
                  </button>
                </div>
                {discountInfo?.error && <p className="mt-1.5 text-xs font-semibold text-red-200">{discountInfo.error}</p>}
                {discountInfo?.ok && <p className="mt-1.5 text-xs font-semibold text-accent">✓ {discountInfo.label} — je betaalt {euro(discountInfo.cents)}</p>}
              </div>
            )}

            <div className="mt-6 flex items-baseline justify-between border-t border-white/15 pt-5">
              <span className="text-lav">Totaal</span>
              <span className="text-3xl font-black text-accent">{totalValue()}</span>
            </div>
            {guestWelcome && <p className="mt-1 text-right text-xs text-lav">Is dit je állereerste boeking? Dan is dit uur gratis — je rekent niets af.</p>}
            {guestWelcomeTooLong && <p className="mt-1 text-right text-xs font-bold text-amber-300">Een gratis eerste uur geldt enkel voor een sessie van 1 uur — bij {durLabel(duration)} betaal je de volledige prijs.</p>}

            {error && <p className="mt-4 rounded-xl bg-red-500/20 p-3 text-sm font-semibold text-red-100">{error}</p>}

            {isLoggedIn ? (
              <button onClick={submit} disabled={!selected || busy} className="mt-6 w-full rounded-full bg-accent py-3.5 font-bold text-brand transition enabled:hover:opacity-90 disabled:opacity-40">
                {busy ? "Even geduld…" : !selected ? "Kies eerst een moment" : "Bevestig boeking"}
              </button>
            ) : (
              <div className="mt-6 space-y-2">
                {/* Carry the chosen slot through signup/login so it's pre-selected when they land back. */}
                <Link href={`/login?mode=signup&next=${encodeURIComponent(selected ? `/boeken?d=${selected.dateStr}&h=${selected.hour}&p=${persons}&u=${duration}` : "/boeken")}`} className="block w-full rounded-full bg-accent py-3.5 text-center font-bold text-brand transition hover:opacity-90">
                  {/* De knoptekst mag niets beloven wat het totaal erboven tegenspreekt: het gratis
                      uur geldt enkel voor een sessie van 1 uur. */}
                  {duration === 1 ? "Maak account & boek je eerste uur gratis" : "Maak account & reserveer"}
                </Link>
                <p className="text-center text-xs text-lav">
                  Al een account?{" "}
                  <Link href={`/login?next=${encodeURIComponent(selected ? `/boeken?d=${selected.dateStr}&h=${selected.hour}&p=${persons}&u=${duration}` : "/boeken")}`} className="font-bold text-white/80 hover:underline">Inloggen</Link>
                </p>
              </div>
            )}
            {/* Eén regel die zegt wat er nú telt: de accountdrempel voor gasten, het betaalvenster
                van 15 minuten voor wie zo naar Stripe gaat, anders de verplaatsingsregel. */}
            <p className="mt-3 text-center text-xs text-lav">
              {!isLoggedIn
                ? "Een account is nodig om je deurcode te sturen — 30 seconden, geen betaalgegevens. Verplaatsen kan tot 6u voor je sessie."
                : willPay
                  ? "Rond je betaling binnen 15 minuten af, anders komt je uur weer vrij. Verplaatsen kan tot 6u voor je sessie."
                  : "Verplaatsen kan tot 6u voor je sessie. Sessies worden altijd betaald."}
            </p>
          </div>
        </div>
      </div>

      {/* Mobile sticky confirm bar — the summary panel is lg:sticky only, so on phones the price +
          confirm sit far below the pickers. This keeps them one tap away. Sits above the tab bar. */}
      {selected && (
        // bottom-[4.75rem] houdt de tabbalk vrij, maar die verdwijnt al vanaf md — daarboven bleef
        // er een lege strook onder deze balk staan.
        <div className="fixed inset-x-0 bottom-[4.75rem] z-40 border-t border-borderc bg-white/95 px-4 py-3 shadow-[0_-6px_20px_rgba(34,25,79,0.08)] backdrop-blur md:bottom-0 lg:hidden">
          <div className="mx-auto flex max-w-md items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-brand">{days.find((d) => d.dateStr === selected.dateStr)?.dayMonth || ""} · {slotRangeLabel(selected.hour, (isFit60 ? duration : 1) * 60)}</p>
              <p className="text-sm font-black text-accentdark">{totalValue()}</p>
            </div>
            {isLoggedIn ? (
              <button onClick={submit} disabled={busy} className="shrink-0 rounded-full bg-accent px-6 py-3 text-sm font-black text-brand shadow-lg shadow-accent/30 transition enabled:hover:-translate-y-0.5 disabled:opacity-50">
                {busy ? "Even geduld…" : "Bevestig"}
              </button>
            ) : (
              <Link href={`/login?mode=signup&next=${encodeURIComponent(`/boeken?d=${selected.dateStr}&h=${selected.hour}&p=${persons}&u=${duration}`)}`} className="shrink-0 rounded-full bg-accent px-6 py-3 text-sm font-black text-brand shadow-lg shadow-accent/30">
                Account & boeken
              </Link>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function Card({ step, title, children }) {
  return (
    // p-5 op de telefoon: p-7 aan beide kanten kostte 24px inhoudsbreedte, en net daar staat het
    // rooster van zeven dagen naast elkaar.
    <div className="rounded-3xl border border-borderc bg-white p-5 sm:p-7">
      <h2 className="font-black"><span className="text-accentdark">{step} · </span>{title}</h2>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-lav">{label}</dt>
      <dd className="text-right font-bold">{value}</dd>
    </div>
  );
}

// A full ("vol") slot. Logged-in members can tap it to join the waitlist and get pinged when it frees.
// Guests just see "vol" (no dead-end — they can still browse other slots).
function WaitlistSlot({ date, hour, label, compact = false, isLoggedIn }) {
  const [state, setState] = useState("idle"); // idle | busy | on
  const toggle = async () => {
    if (state === "busy") return;
    setState("busy");
    try {
      const res = await toggleWaitlistAction({ date, hour: String(hour) });
      // De knop slikte zowel succes als fout: een tik gaf hoogstens een ander icoontje, en een
      // weigering gaf helemaal niets. De action geeft haar eigen Nederlandse tekst mee.
      if (res?.error) {
        setState("idle");
        toast("error", res.error);
        return;
      }
      setState(res?.on ? "on" : "idle");
      if (res?.on) track("waitlist_joined");
      if (res?.message) toast(res.on ? "success" : "info", res.message);
    } catch {
      setState("idle");
      toast("error", "Dat lukte niet — probeer het zo nog eens.");
    }
  };
  if (!isLoggedIn) {
    return compact
      ? <div className="flex h-7 items-center justify-center rounded-md bg-borderc/40 text-[9px] font-bold text-brand/30">vol</div>
      : <div className="rounded-xl bg-borderc/40 py-3 text-center text-[10px] font-bold leading-tight text-brand/35">{label}<br />vol</div>;
  }
  const on = state === "on";
  if (compact) {
    return (
      <button type="button" onClick={toggle} title={on ? "Je staat op de wachtlijst — tik om te verwijderen" : "Vol — zet me op de wachtlijst"}
        className={"flex h-7 items-center justify-center rounded-md text-[9px] font-bold transition " + (on ? "bg-accent/25 text-accentdark" : "bg-borderc/40 text-brand/30 hover:bg-amber-100 hover:text-amber-700")}>
        {state === "busy" ? "…" : on ? "🔔" : "vol"}
      </button>
    );
  }
  return (
    <button type="button" onClick={toggle} title={on ? "Je staat op de wachtlijst — tik om te verwijderen" : "Vol — zet me op de wachtlijst"}
      className={"rounded-xl py-3 text-center text-[10px] font-bold leading-tight transition " + (on ? "bg-accent/20 text-accentdark" : "bg-borderc/40 text-brand/35 hover:bg-amber-100 hover:text-amber-700")}>
      {label}<br />{state === "busy" ? "…" : on ? "🔔 wachtlijst" : "vol · wachtlijst?"}
    </button>
  );
}

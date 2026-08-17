"use client";
import { useEffect, useState } from "react";

// Eén gedeeld antwoord van /api/me voor de hele pagina.
//
// Nav en BottomTabBar hangen allebei in de (site)-layout en vroegen tot nu elk hun eigen antwoord
// op: twee identieke, niet-cachebare rondritten naar Supabase. De tabbalk deed dat bovendien
// opnieuw bij élke paginawissel (`[pathname]` in zijn effect), terwijl rol en ongelezen-teller
// tussen twee kliks niet veranderen. Ze delen nu dezelfde belofte, en verversen enkel wanneer de
// app weer in beeld komt — dat is het moment waarop er écht iets veranderd kan zijn (nieuwe
// deurcode, nieuw bericht) bij wie de PWA gewoon open laat staan.
let antwoord = null;   // laatste bekende antwoord
let lopend = null;     // lopende fetch, zodat een tweede lezer aanhaakt i.p.v. opnieuw te vragen
const luisteraars = new Set();

function haal({ vers = false } = {}) {
  if (!vers && antwoord) return Promise.resolve(antwoord);
  if (!vers && lopend) return lopend;
  lopend = fetch("/api/me", { cache: "no-store" })
    .then((r) => r.json())
    .then((d) => {
      antwoord = d || { loggedIn: false };
      luisteraars.forEach((zet) => zet(antwoord));
      return antwoord;
    })
    // Netwerkfout: hou het laatste bekende antwoord aan in plaats van iemand uit te loggen in de UI.
    .catch(() => antwoord || { loggedIn: false })
    .finally(() => { lopend = null; });
  return lopend;
}

// `undefined` zolang er nog niets bekend is — dat verschilt van "niet ingelogd".
export function useMe() {
  const [me, setMe] = useState(antwoord || undefined);

  useEffect(() => {
    luisteraars.add(setMe);
    haal().then(setMe);
    const bijBeeld = () => { if (document.visibilityState === "visible") haal({ vers: true }); };
    document.addEventListener("visibilitychange", bijBeeld);
    window.addEventListener("focus", bijBeeld);
    return () => {
      luisteraars.delete(setMe);
      document.removeEventListener("visibilitychange", bijBeeld);
      window.removeEventListener("focus", bijBeeld);
    };
  }, []);

  return me;
}

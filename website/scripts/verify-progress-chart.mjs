// Controleert dat de balken in "Volume per week" op /training écht getekend worden.
//
// Aanleiding (17-08-2026): de balken kregen een hoogte in procent, maar hun kolom had door
// `items-end` geen vaste hoogte — percentages losten dan op naar 0. Weken mét volume waren
// onzichtbaar, terwijl lege weken hun 3px-stompje wél toonden, dus de grafiek zag er "leeg maar
// werkend" uit. Een gewone unit-test vangt dat niet: het is puur opmaak. Daarom meten we hier de
// echt gerenderde hoogte en kleur in een browser.
//
// Vereist een dev-server op 3210 en demodata op het testaccount (scripts/nieuwsbrief-demodata.mjs).
//   node --env-file=.env.local scripts/verify-progress-chart.mjs

import { chromium } from "playwright";
import { authCookies } from "./screenshot-auth.mjs";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 900 } });
await ctx.addCookies(await authCookies("coach@fittin.be"));
const p = await ctx.newPage();
await p.goto("http://localhost:3210/training", { waitUntil: "networkidle", timeout: 90000 });
const data = await p.locator('[aria-label="Trainingsvolume per week"] > div').evaluateAll((cols) =>
  cols.map((c) => {
    const bar = c.querySelector(":scope > div > div");
    return { h: Math.round(bar.getBoundingClientRect().height), kleur: getComputedStyle(bar).backgroundColor };
  })
);
console.log(data.map((d) => `${d.h}px ${d.kleur}`).join(" | "));
const groen = data.filter((d) => d.h > 5 && d.kleur.includes("95, 218, 107")).length;
console.log(groen >= 8 ? `OK — ${groen} groene balken met echte hoogte` : `NOG STUK (${groen} groen)`);
await b.close();

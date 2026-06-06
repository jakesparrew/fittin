"use client";
import { useMemo, useState } from "react";
import Link from "next/link";

// Calorie + macro + food-plan calculator. All client-side (instant), Mifflin-St Jeor BMR →
// TDEE → goal calories → macros → a simple meal split. NL.
const ACTIVITY = [
  { v: 1.2, label: "Zittend", hint: "weinig of geen sport" },
  { v: 1.375, label: "Licht actief", hint: "1–3× sport per week" },
  { v: 1.55, label: "Matig actief", hint: "3–5× sport per week" },
  { v: 1.725, label: "Zeer actief", hint: "6–7× sport per week" },
  { v: 1.9, label: "Extreem actief", hint: "fysieke job + dagelijks sporten" },
];
const GOALS = [
  { k: "cut", label: "Afvallen", factor: 0.8, protein: 2.0, note: "−20% · vetverlies met behoud spiermassa" },
  { k: "maintain", label: "Op gewicht blijven", factor: 1.0, protein: 1.8, note: "onderhoud · evenwicht" },
  { k: "bulk", label: "Spiermassa opbouwen", factor: 1.1, protein: 1.8, note: "+10% · gecontroleerd bijkomen" },
];
const MEALS = [
  { name: "Ontbijt", pct: 0.25 },
  { name: "Lunch", pct: 0.3 },
  { name: "Diner", pct: 0.3 },
  { name: "Snacks", pct: 0.15 },
];

const round = (n) => Math.round(n);

export default function CalorieCalculator() {
  const [sex, setSex] = useState("man");
  const [age, setAge] = useState(30);
  const [height, setHeight] = useState(178);
  const [weight, setWeight] = useState(78);
  const [act, setAct] = useState(1.55);
  const [goalK, setGoalK] = useState("cut");

  const r = useMemo(() => {
    const a = Number(age), h = Number(height), w = Number(weight);
    if (!a || !h || !w) return null;
    const bmr = 10 * w + 6.25 * h - 5 * a + (sex === "man" ? 5 : -161);
    const tdee = bmr * act;
    const goal = GOALS.find((g) => g.k === goalK);
    const cals = tdee * goal.factor;
    const protein = goal.protein * w; // g
    const fat = 0.8 * w; // g
    const carbs = Math.max(0, (cals - protein * 4 - fat * 9) / 4); // g
    return { bmr, tdee, cals, protein, fat, carbs, goal };
  }, [sex, age, height, weight, act, goalK]);

  return (
    <div className="rounded-3xl border border-borderc bg-white p-6 md:p-8">
      <div className="grid gap-8 lg:grid-cols-[340px_1fr]">
        {/* Inputs */}
        <div className="space-y-5">
          <div>
            <Label>Geslacht</Label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {["man", "vrouw"].map((s) => (
                <button key={s} onClick={() => setSex(s)} className={"rounded-xl border-2 px-3 py-2.5 text-sm font-bold capitalize transition " + (sex === s ? "border-accent bg-accent/10 text-brand" : "border-borderc text-brand/60 hover:border-lav")}>{s}</button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Num label="Leeftijd" value={age} onChange={setAge} suffix="jr" />
            <Num label="Lengte" value={height} onChange={setHeight} suffix="cm" />
            <Num label="Gewicht" value={weight} onChange={setWeight} suffix="kg" />
          </div>

          <div>
            <Label>Activiteit</Label>
            <select value={act} onChange={(e) => setAct(Number(e.target.value))} className="mt-2 w-full rounded-xl border-2 border-borderc px-3 py-2.5 text-sm font-semibold text-brand">
              {ACTIVITY.map((a) => <option key={a.v} value={a.v}>{a.label} — {a.hint}</option>)}
            </select>
          </div>

          <div>
            <Label>Doel</Label>
            <div className="mt-2 space-y-2">
              {GOALS.map((g) => (
                <button key={g.k} onClick={() => setGoalK(g.k)} className={"block w-full rounded-xl border-2 px-3 py-2.5 text-left transition " + (goalK === g.k ? "border-accent bg-accent/10" : "border-borderc hover:border-lav")}>
                  <span className="block text-sm font-bold text-brand">{g.label}</span>
                  <span className="block text-xs text-brand/50">{g.note}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Results */}
        <div>
          {!r ? (
            <p className="text-sm text-brand/50">Vul je gegevens in om je resultaat te zien.</p>
          ) : (
            <>
              <div className="rounded-2xl bg-brand p-6 text-white">
                <p className="text-xs font-bold uppercase tracking-widest text-lav">Jouw streefdoel per dag</p>
                <p className="mt-1 text-4xl font-black">{round(r.cals)} <span className="text-xl font-bold text-lav">kcal</span></p>
                <p className="mt-1 text-sm text-lav">Onderhoud: {round(r.tdee)} kcal · ruststofwisseling (BMR): {round(r.bmr)} kcal</p>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3">
                <Macro label="Eiwitten" grams={r.protein} kcal={r.protein * 4} total={r.cals} color="bg-accent" />
                <Macro label="Koolhydraten" grams={r.carbs} kcal={r.carbs * 4} total={r.cals} color="bg-brand" />
                <Macro label="Vetten" grams={r.fat} kcal={r.fat * 9} total={r.cals} color="bg-lav" />
              </div>

              {/* Food plan / meal split */}
              <div className="mt-6">
                <p className="text-sm font-black text-brand">Voorbeeld dagplan</p>
                <p className="text-xs text-brand/50">Verdeling van je {round(r.cals)} kcal over de dag.</p>
                <div className="mt-3 overflow-hidden rounded-2xl border border-borderc">
                  <table className="w-full text-sm">
                    <thead className="bg-paper text-left text-xs uppercase tracking-wide text-lav">
                      <tr><th className="px-4 py-2">Maaltijd</th><th className="px-4 py-2 text-right">kcal</th><th className="px-4 py-2 text-right">E</th><th className="px-4 py-2 text-right">K</th><th className="px-4 py-2 text-right">V</th></tr>
                    </thead>
                    <tbody className="divide-y divide-borderc">
                      {MEALS.map((m) => (
                        <tr key={m.name}>
                          <td className="px-4 py-2 font-semibold text-brand">{m.name}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-brand">{round(r.cals * m.pct)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-brand/60">{round(r.protein * m.pct)}g</td>
                          <td className="px-4 py-2 text-right tabular-nums text-brand/60">{round(r.carbs * m.pct)}g</td>
                          <td className="px-4 py-2 text-right tabular-nums text-brand/60">{round(r.fat * m.pct)}g</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/personal-training" className="rounded-full bg-accent px-6 py-3 text-sm font-bold text-brand transition hover:opacity-90">Laat een coach je plan maken →</Link>
                <Link href="/boeken" className="rounded-full border-2 border-borderc px-6 py-3 text-sm font-bold text-brand transition hover:border-lav">Reserveer de gym</Link>
              </div>
              <p className="mt-3 text-sm text-brand/60">
                💡 {Math.round(r.protein)} g eiwit per dag haal je makkelijk met een goede shake — bekijk{" "}
                <Link href="/supplementen" className="font-bold text-accentdark hover:underline">onze supplementen-aanraders</Link>.
              </p>
              <p className="mt-4 text-xs text-brand/40">Richtwaarden o.b.v. de Mifflin-St Jeor-formule. Geen medisch advies — bij twijfel raadpleeg een arts of diëtist.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Label({ children }) {
  return <span className="block text-xs font-bold uppercase tracking-wide text-lav">{children}</span>;
}
function Num({ label, value, onChange, suffix }) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <div className="mt-2 flex items-center rounded-xl border-2 border-borderc px-3 focus-within:border-accent">
        <input type="number" value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-transparent py-2.5 text-sm font-semibold text-brand outline-none" />
        <span className="text-xs font-bold text-brand/40">{suffix}</span>
      </div>
    </label>
  );
}
function Macro({ label, grams, kcal, total, color }) {
  const pct = total ? Math.round((kcal / total) * 100) : 0;
  return (
    <div className="rounded-2xl border border-borderc p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-lav">{label}</p>
      <p className="mt-1 text-2xl font-black text-brand">{Math.round(grams)}<span className="text-sm font-bold text-brand/50">g</span></p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper">
        <div className={"h-full rounded-full " + color} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-brand/40">{pct}% · {Math.round(kcal)} kcal</p>
    </div>
  );
}

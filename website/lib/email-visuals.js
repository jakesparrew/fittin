// Visuals voor e-mail. Alles met tabellen en inline styles: Gmail strookt <svg>, <style>-blokken
// en flexbox, en externe grafiek-afbeeldingen worden standaard geblokkeerd of lekken naar derden.
// Een gekleurde <td> met een breedte in procent is dus de enige balk die overal écht rendert —
// ook in Outlook en de Gmail-app.

const BRAND = "#22194F";
const ACCENT = "#33B24A";
const MUTED = "#6b6685";
const LINE = "#ece9f5";
const PAPER = "#f6f5fb";

export const eur = (c) => `€ ${((c || 0) / 100).toFixed(2).replace(".", ",")}`;
export const num = (n) => String(Math.round((n || 0) * 10) / 10).replace(".", ",");

// Verschil t.o.v. de vorige periode. Zonder vergelijking is een cijfer alleen maar een cijfer:
// "12 sessies" zegt niets, "12 sessies (+3)" zegt of het de goede kant op gaat.
export function delta(now, prev, { money = false } = {}) {
  const d = (now || 0) - (prev || 0);
  if (!prev && !now) return { text: "", color: MUTED };
  if (d === 0) return { text: "gelijk aan vorige week", color: MUTED };
  const up = d > 0;
  const val = money ? eur(Math.abs(d)) : num(Math.abs(d));
  const pct = prev ? ` (${up ? "+" : "−"}${Math.round((Math.abs(d) / prev) * 100)}%)` : "";
  return { text: `${up ? "▲" : "▼"} ${val}${pct} t.o.v. vorige week`, color: up ? ACCENT : "#c2410c" };
}

// Blok van kerncijfers, 2 per rij — de enige indeling die op een telefoon niet uit elkaar valt.
export function statGrid(stats) {
  const cell = (s) => `
    <td width="50%" style="padding:4px" valign="top">
      <table role="presentation" width="100%" style="border-collapse:collapse;background:${PAPER};border-radius:12px">
        <tr><td style="padding:14px 16px">
          <div style="font-size:11px;font-weight:bold;color:${MUTED};text-transform:uppercase;letter-spacing:.4px">${s.label}</div>
          <div style="font-size:26px;font-weight:800;color:${BRAND};line-height:1.15;margin-top:4px">${s.value}</div>
          ${s.delta?.text ? `<div style="font-size:11px;font-weight:bold;color:${s.delta.color};margin-top:3px">${s.delta.text}</div>` : ""}
        </td></tr>
      </table>
    </td>`;
  let html = `<table role="presentation" width="100%" style="border-collapse:collapse;margin:14px 0"><tr>`;
  stats.forEach((s, i) => {
    html += cell(s);
    if (i % 2 === 1 && i !== stats.length - 1) html += `</tr><tr>`;
  });
  if (stats.length % 2 === 1) html += `<td width="50%"></td>`;
  return html + `</tr></table>`;
}

// Horizontale balken. `items` = [{ label, value, note }]. De breedte is relatief t.o.v. de
// hoogste waarde, zodat de vorm meteen leesbaar is zonder assen of legende.
export function barChart(items, { unit = "", highlight = null } = {}) {
  const max = Math.max(1, ...items.map((i) => i.value || 0));
  const rows = items
    .map((i) => {
      const pct = Math.round(((i.value || 0) / max) * 100);
      const on = highlight ? highlight(i) : false;
      const color = on ? ACCENT : BRAND;
      return `
      <tr>
        <td width="88" style="padding:5px 10px 5px 0;font-size:13px;color:${MUTED};white-space:nowrap">${i.label}</td>
        <td style="padding:5px 0">
          <table role="presentation" width="100%" style="border-collapse:collapse;background:${LINE};border-radius:5px">
            <tr><td width="${pct}%" style="background:${color};border-radius:5px;height:16px;font-size:0;line-height:16px">&nbsp;</td><td>&nbsp;</td></tr>
          </table>
        </td>
        <td width="72" style="padding:5px 0 5px 10px;font-size:13px;font-weight:bold;color:${BRAND};text-align:right;white-space:nowrap">${num(i.value)}${unit}</td>
      </tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" style="border-collapse:collapse;margin:8px 0 4px">${rows}</table>`;
}

export function sectionTitle(text, sub = "") {
  return `<h2 style="margin:26px 0 2px;font-size:15px;color:${BRAND};font-weight:800">${text}</h2>${
    sub ? `<p style="margin:0 0 8px;font-size:12px;color:${MUTED};line-height:1.5">${sub}</p>` : ""
  }`;
}

// Actiepunt: één regel die zegt wat te doen, met de link erbij. Zonder link is het geen actiepunt
// maar een observatie — dan hoort het hier niet.
export function actionItem({ icon, title, sub, href, label = "Openen" }) {
  return `
  <table role="presentation" width="100%" style="border-collapse:collapse;margin:6px 0;background:#fff;border:1px solid ${LINE};border-radius:12px">
    <tr>
      <td width="34" style="padding:12px 0 12px 14px;font-size:17px;vertical-align:top">${icon}</td>
      <td style="padding:12px 14px 12px 0">
        <div style="font-size:14px;font-weight:bold;color:${BRAND};line-height:1.4">${title}</div>
        ${sub ? `<div style="font-size:12px;color:${MUTED};line-height:1.5;margin-top:2px">${sub}</div>` : ""}
        ${href ? `<a href="${href}" style="display:inline-block;margin-top:7px;font-size:12px;font-weight:bold;color:${ACCENT};text-decoration:none">${label} →</a>` : ""}
      </td>
    </tr>
  </table>`;
}

export function calloutBox(html, tone = "neutral") {
  const bg = tone === "good" ? "#eefaf0" : tone === "warn" ? "#fff7ed" : PAPER;
  const bd = tone === "good" ? "#bfe8c6" : tone === "warn" ? "#fed7aa" : LINE;
  return `<table role="presentation" width="100%" style="border-collapse:collapse;margin:12px 0;background:${bg};border:1px solid ${bd};border-radius:12px"><tr><td style="padding:14px 16px;font-size:14px;line-height:1.55;color:${BRAND}">${html}</td></tr></table>`;
}

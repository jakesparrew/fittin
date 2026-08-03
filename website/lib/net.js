// Netwerkfouten herkennen en erop wachten (client-side).
//
// Een afgebroken server-action geeft geen nette foutcode terug: afhankelijk van browser en
// moment krijg je een TypeError "Failed to fetch", een "Load failed" (Safari), of Next's eigen
// "An unexpected response was received from the server". Alleen op `instanceof TypeError`
// testen mist dus net de gevallen die op de trein of in de gym-kelder gebeuren.

export function isNetworkError(e) {
  if (!e) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (e instanceof TypeError) return true;
  const m = String(e?.message || e).toLowerCase();
  return (
    m.includes("failed to fetch") ||
    m.includes("load failed") ||
    m.includes("network") ||
    m.includes("connection") ||
    m.includes("err_internet") ||
    m.includes("err_network") ||
    m.includes("unexpected response was received from the server")
  );
}

// Wacht tot de browser weer online is, met een harde deadline: eindeloos wachten voelt als een
// bevroren app. Is de browser al "online" (maar was het verzoek toch stuk — typisch flaky 4G),
// dan wachten we kort zodat een onmiddellijke retry niet in dezelfde dip valt.
export function waitForNetwork(ms = 8000) {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(true);
    if (navigator.onLine !== false) return setTimeout(() => resolve(true), 1200);
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("online", onOnline);
      clearTimeout(timer);
      resolve(ok);
    };
    const onOnline = () => finish(true);
    window.addEventListener("online", onOnline);
    const timer = setTimeout(() => finish(navigator.onLine !== false), ms);
  });
}

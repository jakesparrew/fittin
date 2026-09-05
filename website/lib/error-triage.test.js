import { describe, it, expect } from "vitest";

// Een stuk JavaScript dat niet binnenkomt hoort NIET als app-bug te alarmeren: de app herlaadt
// zichzelf (ChunkErrorRecovery) en aan de code valt niets te fixen. Deze test bewaakt dat, want
// zolang het "app" heet, krijgt de eigenaar bij elke deploy een alarmmail.
describe("chunk-fouten", () => {
  const gevallen = [
    "ChunkLoadError",
    "Loading chunk 13 failed.\n(timeout: https://fittin.be/_next/static/chunks/app/(site)/page-22a2b6d9.js)",
    "Loading chunk 2471 failed.\n(error: https://fittin.be/_next/static/chunks/2471-83a3490f.js)",
    "Loading CSS chunk 7 failed",
    "Failed to fetch dynamically imported module: https://fittin.be/_next/static/chunks/x.js",
    "importing a module script failed",
  ];
  for (const m of gevallen) {
    it(`herkent: ${m.slice(0, 42)}…`, async () => {
      const { classifyClientError, isAppBug } = await import("./error-triage.js");
      expect(classifyClientError(m)).toBe("chunk");
      expect(isAppBug(classifyClientError(m))).toBe(false);
    });
  }

  it("laat een echte app-fout wél als bug staan", async () => {
    const { classifyClientError, isAppBug } = await import("./error-triage.js");
    expect(classifyClientError("sess is not defined")).toBe("app");
    expect(isAppBug("app")).toBe(true);
  });

  it("geeft de eigenaar uitleg bij een chunk-groep", async () => {
    const { explainClass } = await import("./error-triage.js");
    expect(explainClass("chunk")).toMatch(/herlaadt zichzelf/i);
  });
});
import { classifyClientError, isAppBug } from "@/lib/error-triage";

// Deze indeling bepaalt of een fout de owner alarmeert of niet. Te streng = echte bugs verdwijnen
// in de ruis; te los = de lijst wordt weer genegeerd. Vandaar de echte productiestrings hieronder.
describe("classifyClientError", () => {
  it("herkent de netwerkfouten zoals ze in productie binnenkwamen", () => {
    expect(classifyClientError("Load failed")).toBe("netwerk");             // Safari iOS
    expect(classifyClientError("Failed to fetch")).toBe("netwerk");         // Chrome
    expect(classifyClientError("The network connection was lost.")).toBe("netwerk");
    expect(classifyClientError("Error in input stream")).toBe("netwerk");   // Firefox, stream brak af
    // Een Event als afwijzingsreden komt van een mislukte resource, nooit uit onze eigen code.
    expect(classifyClientError("unhandledrejection: [object Event]")).toBe("netwerk");
    // Maar een échte fout die toevallig via een afwijzing binnenkomt, blijft wél een app-fout.
    expect(classifyClientError("unhandledrejection: x is not a function")).toBe("app");
  });

  it("herkent DOM-gerommel van buitenaf", () => {
    expect(classifyClientError("The object can not be found here.")).toBe("extern");
    expect(classifyClientError("NotFoundError: Failed to execute 'removeChild' on 'Node'")).toBe("extern");
    expect(classifyClientError("ResizeObserver loop completed with undelivered notifications.")).toBe("extern");
  });

  // De échte melding die op 04-09-2026 om 18:13 op /boeken binnenkwam, van een Android-toestel dat
  // via de Meta-advertentie kwam. De in-app browser van Facebook injecteert zijn eigen logger; bij
  // het wegnavigeren valt de brug naar de app weg. Zolang de advertentie loopt kan dit bij elke
  // klik gebeuren, en elke keer vertrok er een alarmmail.
  it("herkent de in-app browser van Facebook en Instagram", () => {
    const stack = "at sendDataToNative (iabjs://navigation_performance_logger_android:1:10198)";
    expect(classifyClientError("Uncaught Error: Error invoking postMessage: Java object is gone", stack)).toBe("extern");
    // Ook zonder bruikbare stack, want `postMessage` gebruiken we zelf nergens.
    expect(classifyClientError("Error invoking postMessage: Java object is gone")).toBe("extern");
    expect(isAppBug(classifyClientError("Error invoking postMessage: Java object is gone"))).toBe(false);
  });

  it("herkent geïnjecteerde code aan het schema in de stack", () => {
    // Een boodschap die op zichzelf als app-fout zou tellen, maar uit een extensie komt.
    expect(classifyClientError("x is not a function", "at f (chrome-extension://abc/inject.js:1:1)")).toBe("extern");
    expect(classifyClientError("x is not a function", "at f (moz-extension://abc/inject.js:1:1)")).toBe("extern");
    expect(classifyClientError("x is not a function", "at f (webkit-masked-url://hidden/script.js:1:1)")).toBe("extern");
    // Onze eigen code staat op https en blijft dus gewoon een app-fout.
    expect(classifyClientError("x is not a function", "at f (https://fittin.be/_next/static/chunk.js:1:1)")).toBe("app");
  });

  it("herkent removeChild ook als alleen de stack het verraadt", () => {
    expect(classifyClientError("The object can not be found here.", "removeChild@[native code]")).toBe("extern");
  });

  it("laat échte app-fouten staan — dit is het signaal dat niet verloren mag gaan", () => {
    expect(classifyClientError("Uncaught Error: Minified React error #418")).toBe("app");
    expect(classifyClientError("unhandledrejection: undefined is not an object (evaluating 'a.J')")).toBe("app");
    expect(classifyClientError("Error: fa")).toBe("app");
    expect(isAppBug(classifyClientError("Cannot read properties of undefined"))).toBe(true);
  });

  it("valt terug op 'app' bij lege of rare invoer — liever te veel tonen dan iets missen", () => {
    expect(classifyClientError("")).toBe("app");
    expect(classifyClientError(null)).toBe("app");
    expect(classifyClientError(undefined, undefined)).toBe("app");
  });
});

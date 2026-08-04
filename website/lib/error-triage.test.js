import { describe, it, expect } from "vitest";
import { classifyClientError, isAppBug } from "@/lib/error-triage";

// Deze indeling bepaalt of een fout de owner alarmeert of niet. Te streng = echte bugs verdwijnen
// in de ruis; te los = de lijst wordt weer genegeerd. Vandaar de echte productiestrings hieronder.
describe("classifyClientError", () => {
  it("herkent de netwerkfouten zoals ze in productie binnenkwamen", () => {
    expect(classifyClientError("Load failed")).toBe("netwerk");             // Safari iOS
    expect(classifyClientError("Failed to fetch")).toBe("netwerk");         // Chrome
    expect(classifyClientError("The network connection was lost.")).toBe("netwerk");
  });

  it("herkent DOM-gerommel van buitenaf", () => {
    expect(classifyClientError("The object can not be found here.")).toBe("extern");
    expect(classifyClientError("NotFoundError: Failed to execute 'removeChild' on 'Node'")).toBe("extern");
    expect(classifyClientError("ResizeObserver loop completed with undelivered notifications.")).toBe("extern");
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

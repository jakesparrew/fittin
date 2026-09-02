import { describe, it, expect } from "vitest";
import { leesClip, vindLink, mapSleutel, standaardTitel } from "@/lib/clips";

// Deze lezer staat tussen "iemand plakt iets" en "er staat een kaart in je bibliotheek". Faalt hij
// stil, dan bewaart de app een link die nooit iets toont — en dat merk je pas dagen later, want er
// gaat niets kapot. Vandaar dat elk linkformaat dat een deelmenu echt uitspuwt hier staat.

describe("vindLink", () => {
  it("haalt de link uit een gedeelde caption", () => {
    expect(vindLink("Bekijk dit! https://www.instagram.com/reel/ABC12345/ echt goed")).toBe(
      "https://www.instagram.com/reel/ABC12345/"
    );
  });
  it("laat sluitende leestekens buiten de link", () => {
    expect(vindLink("(zie https://youtu.be/dQw4w9WgXcQ).")).toBe("https://youtu.be/dQw4w9WgXcQ");
  });
  it("geeft leeg terug als er geen link in staat", () => {
    expect(vindLink("gewoon tekst")).toBe("");
  });
});

describe("Instagram", () => {
  it("leest een reel met tracking-parameters en gooit die weg", () => {
    const r = leesClip("https://www.instagram.com/reel/DcMScVaoKMc/?igsi=MTNlNWhud3Nza3Z0Zg==");
    expect(r.ok).toBe(true);
    expect(r.provider).toBe("instagram");
    expect(r.ref).toBe("DcMScVaoKMc");
    expect(r.url).toBe("https://www.instagram.com/reel/DcMScVaoKMc/");
    expect(r.embed).toBe("https://www.instagram.com/reel/DcMScVaoKMc/embed/captioned/");
  });
  it("houdt het soort post vast — /p/ wordt geen /reel/", () => {
    expect(leesClip("https://instagram.com/p/ABC12345/").url).toBe("https://www.instagram.com/p/ABC12345/");
  });
  it("normaliseert /reels/ naar /reel/", () => {
    expect(leesClip("https://www.instagram.com/reels/ABC12345/").url).toBe("https://www.instagram.com/reel/ABC12345/");
  });
  it("markeert een ondoorzichtige deellink als onopgelost", () => {
    const r = leesClip("https://www.instagram.com/share/reel/XyZ123/");
    expect(r.ok).toBe(true);
    expect(r.onopgelost).toBe(true);
    expect(r.embed).toBe(null);
  });
  it("valt terug op een gewone link bij een profielpagina", () => {
    expect(leesClip("https://www.instagram.com/fittin.be/").provider).toBe("link");
  });
});

describe("YouTube", () => {
  it("leest een gewone watch-link", () => {
    const r = leesClip("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s");
    expect(r.ref).toBe("dQw4w9WgXcQ");
    expect(r.embed).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0");
  });
  it("leest een korte link en een short", () => {
    expect(leesClip("https://youtu.be/dQw4w9WgXcQ").ref).toBe("dQw4w9WgXcQ");
    expect(leesClip("https://www.youtube.com/shorts/dQw4w9WgXcQ").ref).toBe("dQw4w9WgXcQ");
  });
  it("weigert een id van de verkeerde lengte", () => {
    expect(leesClip("https://www.youtube.com/watch?v=kort").provider).toBe("link");
  });
});

describe("TikTok", () => {
  it("leest een videolink", () => {
    const r = leesClip("https://www.tiktok.com/@coach/video/7412345678901234567");
    expect(r.ref).toBe("7412345678901234567");
    expect(r.embed).toBe("https://www.tiktok.com/embed/v2/7412345678901234567");
  });
  it("markeert een vm.tiktok-kortlink als onopgelost", () => {
    expect(leesClip("https://vm.tiktok.com/ZGeAbCdEf/").onopgelost).toBe(true);
  });
});

describe("grenzen", () => {
  it("weigert javascript:", () => {
    const r = leesClip("javascript:alert(1)");
    expect(r.ok).toBe(false);
  });
  it("weigert lege invoer", () => {
    expect(leesClip("   ").ok).toBe(false);
  });
  it("weigert een lap tekst zonder link", () => {
    expect(leesClip("dit is gewoon een zin").ok).toBe(false);
  });
  it("speelt een rechtstreeks videobestand zelf af", () => {
    const r = leesClip("https://cdn.fittin.be/demo/squat.mp4");
    expect(r.provider).toBe("video");
    expect(r.embed).toBe("https://cdn.fittin.be/demo/squat.mp4");
  });
});

describe("hulpjes", () => {
  it("maakt van verschillende schrijfwijzen één map", () => {
    expect(mapSleutel(" Leg  Day ")).toBe(mapSleutel("leg day"));
  });
  it("geeft altijd een bruikbare naam", () => {
    expect(standaardTitel("instagram")).toBe("Instagram-reel");
    expect(standaardTitel("link")).toBe("Video");
  });
});

"use client";
import { BRONNEN } from "@/lib/clips";

// Het officiële kader van de bron tonen — en niets anders.
//
// TWEE DINGEN DIE HIER BEWUST NIET GEBEUREN:
// 1. We laden Instagram's embed.js niet. Dat script hoort bij hun kader en regelt de hoogte
//    automatisch, maar het is code van derden op onze pagina's. Fittin' draait zonder cookiebanner
//    (zie de juridische nota) en dat houden we zo. Een kale iframe doet het werk; de hoogte zetten
//    we zelf, en het kader mag intern scrollen zodat er nooit iets afgesneden wordt.
// 2. We tonen geen thumbnail van Instagram of TikTok. Hun beeld-URL's zijn ondertekend en verlopen
//    na enkele dagen — een gekopieerde thumbnail is een kapot beeld in wording. YouTube publiceert
//    wél een blijvend beeldadres per video; dat gebruiken we (zie ClipBibliotheek).
//
// De referrer laten we met opzet op de standaard staan. Instagram serveert de inlogmuur in plaats
// van de post wanneer een verzoek zonder herkomst binnenkomt — nagemeten: met `Referer: fittin.be`
// komt het echte kader terug, zonder niet.

const HOOGTE = {
  instagram: "h-[min(78vh,720px)]",
  tiktok: "h-[min(78vh,740px)]",
  youtube: "aspect-video h-auto",
  video: "aspect-video h-auto",
};

export default function ClipEmbed({ clip }) {
  const { provider, embed, url, title } = clip || {};

  if (provider === "video" && embed) {
    return (
      <video src={embed} controls playsInline preload="metadata" className="aspect-video w-full rounded-2xl bg-black" />
    );
  }

  if (!embed) {
    // Een link die we niet in een kader kunnen tonen blijft gewoon bruikbaar. Beter een eerlijke
    // knop dan een leeg vak dat op een fout lijkt.
    return (
      <div className="rounded-2xl border-2 border-dashed border-borderc bg-paper p-8 text-center">
        <p className="text-sm leading-relaxed text-ink-soft">
          Deze link kunnen we hier niet afspelen — hij opent bij {BRONNEN[provider]?.label || "de bron"} zelf.
        </p>
        <a
          href={url}
          target="_blank"
          rel="noreferrer nofollow"
          className="mt-4 inline-flex rounded-full bg-accent px-6 py-3 font-black text-brand transition hover:opacity-90"
        >
          Openen ↗
        </a>
      </div>
    );
  }

  return (
    <div className={`w-full overflow-hidden rounded-2xl bg-white ${HOOGTE[provider] || "h-[min(78vh,700px)]"}`}>
      <iframe
        src={embed}
        title={title || "Video"}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        className="h-full w-full border-0"
      />
    </div>
  );
}

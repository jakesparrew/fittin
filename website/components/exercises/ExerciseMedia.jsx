// Renders the best available exercise demo: looping MP4/WebM > GIF/image > still image > a clean
// branded placeholder. Plain component (no client JS needed — autoplay loop is native HTML).
"use client";
import Image from "next/image";
import FrameAnimator from "./FrameAnimator";

// next/image weigert (met een runtime-fout) elke host die niet in next.config.mjs staat. De
// oefeningstills komen uit onze eigen opslag en van jsDelivr, maar een coach kan in de editor
// perfect een willekeurige URL plakken. Zo'n URL mag de pagina niet slopen: onbekende host →
// gewone <img>. Kleiner voordeel, maar het blijft werken.
const OPTIMISABLE = /(^|\.)supabase\.co$/i;
function canOptimise(src) {
  if (typeof src !== "string" || !src) return false;
  // SVG staat bewust uit in next.config (dangerouslyAllowSVG): de optimizer geeft er een 400 op
  // terug, wat een gebroken beeld oplevert waar de kale <img> het gewoon toont.
  if (/\.svgz?(\?|#|$)/i.test(src)) return false;
  if (src.startsWith("/")) return true; // eigen /public-bestanden
  try {
    const { hostname, protocol } = new URL(src);
    if (protocol !== "https:") return false;
    return hostname === "cdn.jsdelivr.net" || OPTIMISABLE.test(hostname);
  } catch { return false; }
}

export default function ExerciseMedia({ exercise, className = "", rounded = "rounded-2xl", thumb = false }) {
  const { animation_url, image_url, frames, name } = exercise || {};
  const base = `relative overflow-hidden bg-paper ${rounded} ${className}`;
  const isVideo = animation_url && /\.(mp4|webm|mov)(\?|#|$)/i.test(animation_url);

  // Multi-frame demo (e.g. start/end photos) → cross-fade loop. Grid thumbnails stay static (perf).
  if (frames && frames.length > 1 && !thumb) {
    return <div className={base}><FrameAnimator frames={frames} alt={name} className="h-full w-full" /></div>;
  }

  // Grid thumbnails never autoplay a <video> (perf): fall back to the poster image or placeholder.
  if (isVideo && !thumb) {
    return (
      <div className={base}>
        <video
          src={animation_url}
          poster={image_url || undefined}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
        />
      </div>
    );
  }
  const still = (isVideo ? null : animation_url) || image_url || (frames && frames[0]); // GIF/poster/first frame
  if (still) {
    // Een rasterthumb is hooguit een paar honderd pixels breed; de bron is een origineel van tientallen
    // KB's. Met `sizes` haalt de browser de variant die bij het vakje past in plaats van het origineel.
    const sizes = thumb ? "(max-width: 640px) 33vw, 200px" : "(max-width: 768px) 100vw, 640px";
    const hide = (e) => { e.currentTarget.style.visibility = "hidden"; }; // dode media verbergen i.p.v. een gebroken icoon
    return (
      <div className={base}>
        {canOptimise(still) ? (
          <Image src={still} alt={name || "Oefening"} fill sizes={sizes} loading="lazy" onError={hide} className="object-cover" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={still} alt={name || "Oefening"} loading="lazy" decoding="async" onError={hide} className="h-full w-full object-cover" />
        )}
      </div>
    );
  }
  // Branded placeholder when no media is set yet.
  return (
    <div className={`${base} flex flex-col items-center justify-center gap-1 bg-gradient-to-br from-paper to-borderc/40`}>
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand/25">
        <path d="m6.5 6.5 11 11" /><path d="m21 21-1-1" /><path d="m3 3 1 1" />
        <path d="m18 22 4-4" /><path d="m2 6 4-4" /><path d="m3 10 7-7" /><path d="m14 21 7-7" />
      </svg>
      <span className="text-[10px] font-bold uppercase tracking-wider text-brand/30">Demo binnenkort</span>
    </div>
  );
}

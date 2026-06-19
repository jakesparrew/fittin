// Renders the best available exercise demo: looping MP4/WebM > GIF/image > still image > a clean
// branded placeholder. Plain component (no client JS needed — autoplay loop is native HTML).
"use client";
import FrameAnimator from "./FrameAnimator";

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
    return (
      <div className={base}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={still} alt={name || "Oefening"} loading="lazy" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} className="h-full w-full object-cover" />
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

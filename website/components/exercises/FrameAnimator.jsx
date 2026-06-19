"use client";
import { useState, useEffect } from "react";

// Cross-fades through an exercise's image frames (start↔end of the movement) to show a looping
// demo. Used for the public-domain dataset where each exercise ships 2+ position photos.
export default function FrameAnimator({ frames, alt, className = "" }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!frames || frames.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % frames.length), 800);
    return () => clearInterval(t);
  }, [frames]);
  if (!frames?.length) return null;
  return (
    <div className={"relative " + className}>
      {frames.map((src, idx) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={idx}
          src={src}
          alt={alt || "Oefening"}
          loading="lazy"
          onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
          style={{ opacity: idx === i ? 1 : 0 }}
        />
      ))}
    </div>
  );
}

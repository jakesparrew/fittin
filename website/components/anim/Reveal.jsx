"use client";
import { useEffect, useRef, useState } from "react";

// Fade-up on scroll. Reveals immediately if already in view (so above-the-fold content
// never stays hidden), uses IntersectionObserver for below-the-fold. Respects reduced-motion via CSS.
// `eager` renders visible on the SERVER (no opacity:0 until hydration) — use it for above-the-fold
// content like the homepage hero, whose text is the LCP element and must not wait for React (or,
// without JS, forever).
export default function Reveal({ children, className = "", delay = 0, eager = false }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(eager);
  useEffect(() => {
    if (eager) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.92 && rect.bottom > 0) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    // Safety net: never leave content hidden.
    const t = setTimeout(() => setShown(true), 2500);
    return () => { io.disconnect(); clearTimeout(t); };
  }, []);
  return (
    <div ref={ref} style={{ transitionDelay: `${delay}ms` }} className={`reveal ${shown ? "in" : ""} ${className}`}>
      {children}
    </div>
  );
}

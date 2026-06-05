"use client";
import { useEffect, useRef, useState } from "react";

// Counts up from 0 to `to` when in view (or immediately if already visible on mount).
export default function Counter({ to, suffix = "", prefix = "", duration = 1500 }) {
  const ref = useRef(null);
  const [val, setVal] = useState(0);
  const started = useRef(false);

  function run() {
    if (started.current) return;
    started.current = true;
    let t0 = null;
    const tick = (t) => {
      if (t0 === null) t0 = t;
      const p = Math.min(1, (t - t0) / duration);
      setVal(Math.round((1 - Math.pow(1 - p, 3)) * to));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      run();
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          run();
          io.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    const t = setTimeout(run, 2500);
    return () => { io.disconnect(); clearTimeout(t); };
  }, [to, duration]);

  return (
    <span ref={ref}>
      {prefix}
      {val}
      {suffix}
    </span>
  );
}

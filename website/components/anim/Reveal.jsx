"use client";
import { useEffect, useRef, useState } from "react";

// Fade-up on scroll — met ZICHTBAAR als standaardtoestand, ook in de server-HTML.
// Waarom omgekeerd: eerder startte elk blok op opacity:0 en maakte JavaScript het pas zichtbaar.
// Laadde de chunk niet (deze site kent aantoonbaar ChunkLoadErrors), dan bleef alles onder de hero
// leeg — prijzen en boekknoppen incluis. Nu verbergt JS pas ná mount wat op dat moment nog ónder de
// vouw staat: de bezoeker ziet die stap dus nooit, en zonder werkende JS blijft de pagina volledig.
// `eager` slaat het verbergen helemaal over (hero-content: nooit aan JS overlaten).
export default function Reveal({ children, className = "", delay = 0, eager = false }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(true);
  // Het verbergen zelf mag niet animeren, anders zou een bezoeker die meteen scrollt een blok
  // zien wegfaden dat hij net gelezen heeft.
  const [noAnim, setNoAnim] = useState(false);
  useEffect(() => {
    if (eager) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.92 && rect.bottom > 0) return; // al in beeld: laten staan
    setShown(false);
    setNoAnim(true);
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setNoAnim(false)));
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
    return () => { io.disconnect(); clearTimeout(t); cancelAnimationFrame(raf); };
  }, []);
  const style = { transitionDelay: `${delay}ms` };
  if (noAnim) style.transition = "none";
  return (
    <div ref={ref} style={style} className={`reveal ${shown ? "in" : ""} ${className}`}>
      {children}
    </div>
  );
}

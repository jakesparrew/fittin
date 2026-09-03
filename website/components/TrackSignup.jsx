"use client";
import { useEffect, useRef } from "react";
import { track } from "@/lib/track";

// Onzichtbaar. Vuurt één keer 'signup_completed' wanneer iemand net een account heeft aangemaakt
// via Google (of via een e-mailbevestiging) en op zijn eigen pagina landt.
//
// WAAROM DIT NODIG WAS: signup_completed werd alleen afgevuurd in het e-mailformulier
// (components/auth/LoginForm.jsx). De Google-knop stuurt je weg naar accounts.google.com en komt
// terug via /auth/callback — die hele weg telde niets. Gemeten gevolg: 6 signup-events in 90 dagen
// terwijl er 18 leden per maand bijkomen. De grootste stap van de trechter stond dus zo goed als
// leeg, precies de stap die je bij een advertentiecampagne wil kunnen afrekenen.
export default function TrackSignup() {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    track("signup_completed");
  }, []);
  return null;
}

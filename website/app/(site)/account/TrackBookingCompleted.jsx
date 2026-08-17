"use client";
import { useEffect, useRef } from "react";
import { track } from "@/lib/track";

// Onzichtbaar. Vuurt één keer 'booking_completed' wanneer een lid na een geslaagde Stripe-betaling
// op /account?betaald=1 terugkomt — het sluitstuk van de trechter naast checkout_started (een
// poging) en de gratis/tegoed-boekingen die in de boekflow zelf al geteld worden.
// De ref houdt het bij één beacon per mount: React draait effects in dev twee keer.
export default function TrackBookingCompleted() {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    track("booking_completed");
  }, []);
  return null;
}

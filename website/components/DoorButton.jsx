"use client";
import { useState } from "react";
import { openDoorAction } from "@/app/(site)/account/actions";

export default function DoorButton() {
  const [state, setState] = useState("idle"); // idle | busy | open | error
  const [msg, setMsg] = useState("");

  async function open() {
    setState("busy");
    let res;
    try {
      res = await openDoorAction();
    } catch {
      // Network dropped mid-request (weak signal at the door is common). Don't leave the button
      // stuck on "Openen…" — tell the member to retry or use the keypad code.
      setState("error");
      setMsg("Geen verbinding — probeer opnieuw of gebruik je deurcode op het paneel.");
      setTimeout(() => setState("idle"), 8000);
      return;
    }
    if (res?.error) {
      setState("error");
      setMsg(res.error);
      setTimeout(() => setState("idle"), 8000);
    } else if (res?.pending) {
      // Authorised + logged, but the automatic lock isn't connected yet — be honest.
      setState("pending");
      setMsg("Je toegang is bevestigd ✓ Het automatische deurslot wordt binnenkort gekoppeld — bel ons als de deur niet opengaat.");
      setTimeout(() => setState("idle"), 9000);
    } else {
      setState("open");
      setMsg("Deur geopend — kom binnen!");
      setTimeout(() => setState("idle"), 6000);
    }
  }

  return (
    <div>
      <button
        onClick={open}
        disabled={state === "busy"}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-4 text-lg font-black text-brand transition hover:opacity-90 disabled:opacity-50"
      >
        {state === "busy" ? "Openen…" : state === "open" ? "✓ Geopend" : state === "pending" ? "✓ Toegang bevestigd" : "🔓 Open de deur"}
      </button>
      {msg && (
        <p className={"mt-2 text-center text-sm font-semibold " + (state === "error" ? "text-red-600" : "text-accentdark")}>
          {msg}
        </p>
      )}
    </div>
  );
}

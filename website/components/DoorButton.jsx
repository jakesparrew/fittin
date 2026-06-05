"use client";
import { useState } from "react";
import { openDoorAction } from "@/app/(site)/account/actions";

export default function DoorButton() {
  const [state, setState] = useState("idle"); // idle | busy | open | error
  const [msg, setMsg] = useState("");

  async function open() {
    setState("busy");
    const res = await openDoorAction();
    if (res?.error) {
      setState("error");
      setMsg(res.error);
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
        {state === "busy" ? "Openen…" : state === "open" ? "✓ Geopend" : "🔓 Open de deur"}
      </button>
      {msg && (
        <p className={"mt-2 text-center text-sm font-semibold " + (state === "error" ? "text-red-600" : "text-accentdark")}>
          {msg}
        </p>
      )}
    </div>
  );
}

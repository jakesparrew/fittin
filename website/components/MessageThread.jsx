"use client";
import { useActionState, useEffect, useRef } from "react";
import { sendMessage } from "@/app/coach/message-actions";

const t = (iso) => new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

// Chat thread for a coach↔client pair. Bubbles align by sender; send via the shared action.
export default function MessageThread({ coachId, clientId, meId, messages = [], otherName }) {
  const formRef = useRef(null);
  const [state, action, pending] = useActionState(async (_p, fd) => {
    const r = await sendMessage(fd);
    return r?.error ? { error: r.error } : { ok: Date.now() };
  }, null);
  useEffect(() => { if (state?.ok) formRef.current?.reset(); }, [state]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto rounded-2xl bg-paper p-4" style={{ maxHeight: "60vh" }}>
        {messages.length === 0 && <p className="py-8 text-center text-sm text-brand/40">Nog geen berichten. Stuur het eerste!</p>}
        {messages.map((m) => {
          const mine = m.sender_id === meId;
          return (
            <div key={m.id} className={"flex " + (mine ? "justify-end" : "justify-start")}>
              <div className={"max-w-[78%] rounded-2xl px-3.5 py-2 text-sm " + (mine ? "bg-brand text-white" : "bg-white text-brand")}>
                <p className="whitespace-pre-wrap">{m.body}</p>
                <p className={"mt-0.5 text-[10px] " + (mine ? "text-white/50" : "text-brand/40")}>{t(m.created_at)}</p>
              </div>
            </div>
          );
        })}
      </div>
      <form ref={formRef} action={action} className="mt-3 flex items-end gap-2">
        <input type="hidden" name="coachId" value={coachId} />
        <input type="hidden" name="clientId" value={clientId} />
        <input name="body" required placeholder={`Bericht aan ${otherName || "…"}`} className="flex-1 rounded-full border-2 border-borderc px-4 py-2.5 text-sm outline-none focus:border-accent" />
        <button disabled={pending} className="rounded-full bg-accent px-5 py-2.5 text-sm font-black text-brand disabled:opacity-50">Stuur</button>
      </form>
      {state?.error && <p className="mt-1 text-xs font-semibold text-red-600">{state.error}</p>}
    </div>
  );
}

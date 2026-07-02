"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { markOne } from "@/app/(site)/notificaties/actions";

const ICON = { buddy_request: "🤝", buddy_accepted: "🤝", booking_invite: "💪", coach_booked: "🏋️", payment_request: "💳", credits: "🎟️", coach_assigned: "🧑‍🏫", event: "📅", challenge: "🏆", system: "🔔" };
const fmt = (iso) => new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

// One notification row. Marks itself read the moment it's opened (optimistic), then navigates if it
// carries a link. Rows without a link mark read on tap in place. Keeps the unread badge honest.
export default function NotifItem({ n }) {
  const router = useRouter();
  const [read, setRead] = useState(!!n.read);

  const open = async () => {
    if (!read) {
      setRead(true);
      try { await markOne(n.id); } catch {}
    }
    if (n.link) router.push(n.link);
  };

  return (
    <button type="button" onClick={open} className="block w-full text-left">
      <div className={"flex items-start gap-3 rounded-2xl border border-borderc p-4 transition " + (read ? "bg-white" : "bg-accent/5")}>
        <span className="text-xl">{ICON[n.type] || "🔔"}</span>
        <div className="min-w-0 flex-1">
          <p className={"text-sm " + (read ? "font-semibold text-brand/80" : "font-black text-brand")}>{n.title}</p>
          {n.body && <p className="text-sm text-brand/60">{n.body}</p>}
          <p className="mt-0.5 text-xs text-brand/40">{fmt(n.created_at)}</p>
        </div>
        {!read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" />}
      </div>
    </button>
  );
}

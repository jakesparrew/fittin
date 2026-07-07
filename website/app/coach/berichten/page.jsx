import Link from "next/link";
import { getCoachContext } from "@/lib/coach";
import { createAdminClient } from "@/lib/supabase/admin";
import MessageThread from "@/components/MessageThread";

export const dynamic = "force-dynamic";

export default async function CoachBerichten({ searchParams }) {
  const ctx = await getCoachContext();
  if (!ctx) return null;
  const { supabase, userId } = ctx;
  const sp = (await searchParams) || {};

  const { data: links } = await supabase
    .from("coach_clients")
    .select("client:profiles!coach_clients_client_id_fkey(id, full_name, email)")
    .eq("coach_id", userId)
    .eq("status", "accepted");
  const clients = (links || []).map((l) => l.client).filter(Boolean);
  const active = sp.client && clients.some((c) => c.id === sp.client) ? sp.client : clients[0]?.id || null;
  const activeClient = clients.find((c) => c.id === active);

  const admin = createAdminClient();
  // Opening a thread marks the client's messages in it as read (coach_messages has no UPDATE policy
  // for the coach, so this runs via the service role — scoped strictly to this coach's own thread).
  if (active) {
    try {
      await admin.from("coach_messages").update({ read_at: new Date().toISOString() })
        .eq("coach_id", userId).eq("client_id", active).neq("sender_id", userId).is("read_at", null);
    } catch {}
  }
  // Unread-per-client (messages FROM the client the coach hasn't read) → sidebar badges.
  const unreadByClient = {};
  try {
    const { data: un } = await admin.from("coach_messages").select("client_id")
      .eq("coach_id", userId).neq("sender_id", userId).is("read_at", null);
    for (const r of un || []) unreadByClient[r.client_id] = (unreadByClient[r.client_id] || 0) + 1;
  } catch {}

  let messages = [];
  if (active) {
    const { data } = await supabase
      .from("coach_messages")
      .select("id, sender_id, body, created_at")
      .eq("coach_id", userId).eq("client_id", active)
      .order("created_at", { ascending: true })
      .limit(200);
    messages = data || [];
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <Link href="/coach" className="text-sm font-semibold text-brand/50 hover:text-brand">← Dashboard</Link>
      <h1 className="mt-2 text-3xl font-black text-brand">Berichten</h1>
      <p className="mt-1 text-sm text-brand/50">Chat rechtstreeks met je clienten.</p>

      {clients.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-borderc bg-white p-8 text-center text-sm text-brand/50">Je hebt nog geen toegewezen clienten.</p>
      ) : (
        <div className="mt-6 grid gap-5 lg:grid-cols-[240px_1fr]">
          <div className="space-y-1">
            {clients
              .slice()
              .sort((a, b) => (unreadByClient[b.id] || 0) - (unreadByClient[a.id] || 0))
              .map((c) => {
                const unread = unreadByClient[c.id] || 0;
                return (
                  <Link key={c.id} href={`/coach/berichten?client=${c.id}`} className={"flex items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm font-bold transition " + (c.id === active ? "bg-brand text-white" : "bg-white text-brand hover:bg-paper")}>
                    <span className="truncate">{c.full_name || c.email}</span>
                    {unread > 0 && c.id !== active && (
                      <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[10px] font-black text-brand">{unread > 9 ? "9+" : unread}</span>
                    )}
                  </Link>
                );
              })}
          </div>
          <div className="rounded-3xl border border-borderc bg-white p-5">
            {activeClient && <p className="mb-3 font-black text-brand">{activeClient.full_name || activeClient.email}</p>}
            {active && <MessageThread coachId={userId} clientId={active} meId={userId} messages={messages} otherName={activeClient?.full_name} />}
          </div>
        </div>
      )}
    </div>
  );
}

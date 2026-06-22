import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { getViewAsCoach } from "@/lib/coach";
import { stopViewAsCoach } from "@/app/beheer/actions";
import CoachSidebar from "@/components/coach/CoachSidebar";
import ToastHost from "@/components/ui/ToastHost";

export const dynamic = "force-dynamic";
export const metadata = { title: "Coach | Fittin'" };

export default async function CoachLayout({ children }) {
  if (!isSupabaseConfigured) redirect("/");
  const { user, profile } = await getSessionProfile();
  if (!user) redirect("/login?next=/coach");
  if (!profile || !["coach", "beheerder"].includes(profile.role)) redirect("/account");

  // Beheerder kan read-only "als coach" kijken → toon diens gegevens + een duidelijke banner.
  const viewCoach = profile.role === "beheerder" ? await getViewAsCoach() : null;
  const shown = viewCoach || profile;
  const shownId = viewCoach?.id || user.id;

  // Credit-coaches mogen negatief saldo hebben → toon het openstaande bedrag prominent bovenaan.
  let owed = 0;
  if (shown.coach_billing_mode === "credit") {
    const supabase = await createClient();
    const { data: ledger } = await supabase.from("coach_ledger").select("delta").eq("coach_id", shownId);
    const bal = (ledger || []).reduce((a, r) => a + (r.delta || 0), 0);
    if (bal < 0) owed = -bal;
  }

  return (
    <div className="flex min-h-screen flex-col bg-paper md:flex-row">
      <CoachSidebar name={shown.full_name || "Coach"} role={shown.role || "coach"} />
      <main className="min-w-0 flex-1">
        {(viewCoach || owed > 0) && (
          <div className="z-30 md:sticky md:top-0">
            {viewCoach && (
              <div className="flex flex-wrap items-center justify-between gap-2 bg-brand px-4 py-2.5 text-white md:px-8">
                <span className="text-sm font-bold">👁️ Je bekijkt als <span className="text-accent">{viewCoach.full_name || "coach"}</span> · alleen-lezen</span>
                <form action={stopViewAsCoach}><button className="rounded-full bg-accent px-4 py-1.5 text-xs font-black text-brand transition hover:brightness-95">← Terug naar beheerder</button></form>
              </div>
            )}
            {owed > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 bg-amber-500 px-4 py-3 text-white md:px-8">
                <p className="text-sm font-black md:text-base">⚠️ Openstaand sessietegoed: {owed} {owed === 1 ? "sessie" : "sessies"} · € {owed * 12} te betalen</p>
                <a href="/coach#tegoed" className="shrink-0 rounded-full bg-white px-4 py-1.5 text-sm font-black text-amber-700 transition hover:bg-white/90">Sessietegoed aanvullen →</a>
              </div>
            )}
          </div>
        )}
        {children}
      </main>
      <ToastHost />
    </div>
  );
}

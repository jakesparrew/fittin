import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import CoachSidebar from "@/components/coach/CoachSidebar";
import ToastHost from "@/components/ui/ToastHost";

export const dynamic = "force-dynamic";
export const metadata = { title: "Coach | Fittin'" };

export default async function CoachLayout({ children }) {
  if (!isSupabaseConfigured) redirect("/");
  const { user, profile } = await getSessionProfile();
  if (!user) redirect("/login?next=/coach");
  if (!profile || !["coach", "beheerder"].includes(profile.role)) redirect("/account");

  // Coaches in credit mode may run a negative balance — show the outstanding amount prominently on top.
  let owed = 0;
  if (profile.coach_billing_mode === "credit") {
    const supabase = await createClient();
    const { data: ledger } = await supabase.from("coach_ledger").select("delta").eq("coach_id", user.id);
    const bal = (ledger || []).reduce((a, r) => a + (r.delta || 0), 0);
    if (bal < 0) owed = -bal;
  }

  return (
    <div className="flex min-h-screen flex-col bg-paper md:flex-row">
      <CoachSidebar name={profile.full_name || "Coach"} role={profile.role} />
      <main className="min-w-0 flex-1">
        {owed > 0 && (
          <div className="z-20 flex flex-wrap items-center justify-between gap-3 bg-amber-500 px-4 py-3 text-white md:sticky md:top-0 md:px-8">
            <p className="text-sm font-black md:text-base">⚠️ Openstaand sessietegoed: {owed} {owed === 1 ? "sessie" : "sessies"} · € {owed * 12} te betalen</p>
            <a href="/coach#tegoed" className="shrink-0 rounded-full bg-white px-4 py-1.5 text-sm font-black text-amber-700 transition hover:bg-white/90">Sessietegoed aanvullen →</a>
          </div>
        )}
        {children}
      </main>
      <ToastHost />
    </div>
  );
}

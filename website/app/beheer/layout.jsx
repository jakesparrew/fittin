import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import AdminSidebar from "@/components/admin/AdminSidebar";
import ToastHost from "@/components/ui/ToastHost";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Beheer | Fittin'" };

export default async function BeheerLayout({ children }) {
  if (!isSupabaseConfigured) redirect("/");
  const { user, profile } = await getSessionProfile();
  if (!user) redirect("/login?next=/beheer");
  // Beheer is superadmin-only. Coaches have their own /coach area (own clients, programs,
  // exercises) — they must never land in the admin panel.
  if (!profile || profile.role !== "beheerder") redirect(profile?.role === "coach" ? "/coach" : "/account");

  // Tellingen voor de zijbalk: ongelezen post en open meldingen. Twee lichte count-queries (head:
  // true haalt geen rijen op). Falen ze, dan tonen we gewoon niets — een teller mag nooit de reden
  // zijn dat het beheer niet laadt.
  let badges = {};
  try {
    const db = createAdminClient();
    const [post, meldingen] = await Promise.all([
      db.from("inbound_emails").select("id", { count: "exact", head: true }).eq("gym_id", profile.gym_id).eq("archived", false).eq("read", false),
      db.from("problem_reports").select("id", { count: "exact", head: true }).eq("gym_id", profile.gym_id).eq("status", "open"),
    ]);
    badges = { "/beheer/inbox": post.count || 0, "/beheer/meldingen": meldingen.count || 0 };
  } catch (e) { console.error("zijbalk-tellingen mislukt:", e?.message); }

  return (
    <div className="flex min-h-screen flex-col bg-paper md:flex-row">
      <AdminSidebar name={profile.full_name || "Beheerder"} role={profile.role} badges={badges} />
      <main className="min-w-0 flex-1">{children}</main>
      <ToastHost />
    </div>
  );
}

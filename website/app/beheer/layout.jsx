import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import AdminSidebar from "@/components/admin/AdminSidebar";
import ToastHost from "@/components/ui/ToastHost";

export const dynamic = "force-dynamic";
export const metadata = { title: "Beheer | Fittin'" };

export default async function BeheerLayout({ children }) {
  if (!isSupabaseConfigured) redirect("/");
  const { user, profile } = await getSessionProfile();
  if (!user) redirect("/login?next=/beheer");
  // Beheer is superadmin-only. Coaches have their own /coach area (own clients, programs,
  // exercises) — they must never land in the admin panel.
  if (!profile || profile.role !== "beheerder") redirect(profile?.role === "coach" ? "/coach" : "/account");

  return (
    <div className="flex min-h-screen flex-col bg-paper md:flex-row">
      <AdminSidebar name={profile.full_name || "Beheerder"} role={profile.role} />
      <main className="min-w-0 flex-1">{children}</main>
      <ToastHost />
    </div>
  );
}

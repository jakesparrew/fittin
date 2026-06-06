import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import CoachSidebar from "@/components/coach/CoachSidebar";
import ToastHost from "@/components/ui/ToastHost";

export const dynamic = "force-dynamic";
export const metadata = { title: "Coach | Fittin'" };

export default async function CoachLayout({ children }) {
  if (!isSupabaseConfigured) redirect("/");
  const { user, profile } = await getSessionProfile();
  if (!user) redirect("/login?next=/coach");
  if (!profile || !["coach", "beheerder"].includes(profile.role)) redirect("/account");

  return (
    <div className="flex min-h-screen bg-paper">
      <CoachSidebar name={profile.full_name || "Coach"} role={profile.role} />
      <main className="min-w-0 flex-1">{children}</main>
      <ToastHost />
    </div>
  );
}

import { Suspense } from "react";
import { redirect } from "next/navigation";
import LoginForm from "@/components/auth/LoginForm";
import { getSessionProfile, roleHome } from "@/lib/auth";

export const metadata = { title: "Inloggen | Fittin'" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Already signed in? Skip the form — go straight to where this user belongs.
  const { user, profile } = await getSessionProfile();
  if (user) redirect(roleHome(profile?.role));

  return (
    <Suspense fallback={<div className="min-h-[80vh] bg-paper" />}>
      <LoginForm />
    </Suspense>
  );
}

import { Suspense } from "react";
import LoginForm from "@/components/auth/LoginForm";

export const metadata = { title: "Inloggen | Fittin'" };

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-[80vh] bg-paper" />}>
      <LoginForm />
    </Suspense>
  );
}

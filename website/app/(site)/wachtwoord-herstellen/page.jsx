"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import PasswordInput from "@/components/PasswordInput";

export default function ResetPassword() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (password.length < 6) return setError("Minstens 6 tekens.");
    if (password !== confirm) return setError("Wachtwoorden komen niet overeen.");
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    setDone(true);
    setTimeout(() => {
      router.push("/account");
      router.refresh();
    }, 1200);
  }

  return (
    <main className="bg-paper">
      <div className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-5 py-16">
        <div className="rounded-3xl border border-borderc bg-white p-8 shadow-sm">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">Nieuw wachtwoord</p>
          <h1 className="mt-2 text-3xl font-black">Kies een nieuw wachtwoord</h1>
          {done ? (
            <p className="mt-4 rounded-2xl bg-accent/15 p-4 text-sm font-semibold text-accentdark">
              Wachtwoord aangepast — je wordt doorgestuurd…
            </p>
          ) : (
            <form onSubmit={submit} className="mt-5 space-y-3">
              <PasswordInput value={password} onChange={setPassword} placeholder="Nieuw wachtwoord" autoComplete="new-password" required />
              <PasswordInput value={confirm} onChange={setConfirm} placeholder="Herhaal wachtwoord" autoComplete="new-password" required />
              {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
              <button disabled={busy} className="w-full rounded-full bg-accent py-3.5 font-bold text-brand transition hover:opacity-90 disabled:opacity-40">
                {busy ? "Opslaan…" : "Wachtwoord opslaan"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

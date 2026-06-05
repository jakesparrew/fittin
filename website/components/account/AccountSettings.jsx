"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import PasswordInput from "@/components/PasswordInput";

export default function AccountSettings({ userId, initialName = "", initialPhone = "" }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const [pwMsg, setPwMsg] = useState("");

  async function saveProfile(e) {
    e.preventDefault();
    setMsg("");
    const supabase = createClient();
    const { error } = await supabase.from("profiles").update({ full_name: name, phone }).eq("id", userId);
    setMsg(error ? error.message : "Profiel opgeslagen ✓");
    if (!error) router.refresh();
  }

  async function savePassword(e) {
    e.preventDefault();
    setPwMsg("");
    if (pw.length < 6) return setPwMsg("Minstens 6 tekens.");
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: pw });
    setPwMsg(error ? error.message : "Wachtwoord aangepast ✓");
    if (!error) setPw("");
  }

  return (
    <section className="mt-12 grid gap-6 md:grid-cols-2">
      <form onSubmit={saveProfile} className="rounded-3xl border border-borderc bg-white p-6">
        <h2 className="font-black text-brand">Profiel</h2>
        <label className="mt-4 block">
          <span className="mb-1 block text-sm font-bold text-brand">Naam</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-2xl border-2 border-borderc px-4 py-3 outline-none focus:border-accent" />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-sm font-bold text-brand">Telefoon</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+32…" className="w-full rounded-2xl border-2 border-borderc px-4 py-3 outline-none focus:border-accent" />
        </label>
        {msg && <p className="mt-3 text-sm font-semibold text-accentdark">{msg}</p>}
        <button className="mt-4 rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-white transition hover:opacity-90">Opslaan</button>
      </form>

      <form onSubmit={savePassword} className="rounded-3xl border border-borderc bg-white p-6">
        <h2 className="font-black text-brand">Wachtwoord wijzigen</h2>
        <div className="mt-4">
          <PasswordInput value={pw} onChange={setPw} placeholder="Nieuw wachtwoord" autoComplete="new-password" />
        </div>
        {pwMsg && <p className="mt-3 text-sm font-semibold text-accentdark">{pwMsg}</p>}
        <button className="mt-4 rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-white transition hover:opacity-90">Wijzig wachtwoord</button>
      </form>
    </section>
  );
}

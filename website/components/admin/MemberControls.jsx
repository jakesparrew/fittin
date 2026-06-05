"use client";
import { useActionState } from "react";
import { adminAddUser, deleteUser } from "@/app/beheer/actions";

const ROLES = [
  { v: "lid", l: "Lid" },
  { v: "coach", l: "Coach" },
  { v: "beheerder", l: "Beheerder" },
];

// Add a new account (any role). Emails a set-password link.
export function AddMemberForm() {
  const [state, action, pending] = useActionState(async (_prev, fd) => adminAddUser(fd), null);
  return (
    <form action={action} className="rounded-2xl border border-borderc bg-white p-5">
      <p className="font-black text-brand">Nieuw lid toevoegen</p>
      <p className="mt-0.5 text-xs text-brand/50">Maakt een account aan en mailt een link om het wachtwoord in te stellen.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <input name="full_name" placeholder="Naam" className="rounded-lg border-2 border-borderc px-3 py-2 text-sm lg:col-span-1" />
        <input name="email" type="email" required placeholder="E-mailadres" className="rounded-lg border-2 border-borderc px-3 py-2 text-sm lg:col-span-2" />
        <input name="phone" placeholder="Telefoon (optioneel)" className="rounded-lg border-2 border-borderc px-3 py-2 text-sm" />
        <select name="role" defaultValue="lid" className="rounded-lg border-2 border-borderc px-3 py-2 text-sm">
          {ROLES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
        </select>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button disabled={pending} className="rounded-full bg-brand px-5 py-2 text-sm font-bold text-white disabled:opacity-60">
          {pending ? "Bezig…" : "+ Account aanmaken"}
        </button>
        {state?.error && <span className="text-sm font-semibold text-red-500">{state.error}</span>}
        {state?.ok && <span className="text-sm font-semibold text-accentdark">Account aangemaakt — uitnodiging verstuurd ✓</span>}
      </div>
    </form>
  );
}

// Permanently remove a user (with confirm).
export function DeleteUserButton({ userId, name }) {
  const [state, action, pending] = useActionState(async (_prev, fd) => deleteUser(fd), null);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`"${name}" definitief verwijderen? Dit verwijdert het account en alle gekoppelde data. Betaalgeschiedenis blijft bewaard.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <button disabled={pending} className="rounded-full border-2 border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-600 transition hover:bg-red-100 disabled:opacity-60">
        {pending ? "Verwijderen…" : "Lid verwijderen"}
      </button>
      {state?.error && <p className="mt-2 text-sm font-semibold text-red-500">{state.error}</p>}
    </form>
  );
}

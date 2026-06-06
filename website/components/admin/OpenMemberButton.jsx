"use client";

// Opens the member side-drawer (MemberDrawer listens for this event).
export default function OpenMemberButton({ id, name, email }) {
  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent("fittin:open-member", { detail: { id } }))}
      className="text-left font-bold text-brand transition hover:text-accentdark"
    >
      {name || "—"}
    </button>
  );
}

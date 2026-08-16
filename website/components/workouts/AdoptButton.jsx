"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { adoptProgram } from "@/app/(site)/oefeningen/loop-actions";

// "Neem dit schema over" — op de deelpagina (login-vrij) en op publieke workouts.
//
// Voor wie nog geen account heeft: niet stilletjes falen met "log in", maar meteen naar de
// registratie mét de bestemming erin. Na het inloggen komt hij terug op dezelfde pagina en drukt
// hij nog één keer. Een bezoeker die via een vriend binnenkomt is de warmste lead die er is;
// die mag je niet kwijtspelen aan een foutmelding.
const toast = (type, msg) => {
  try { window.dispatchEvent(new CustomEvent("fittin:toast", { detail: { type, msg } })); } catch {}
};

export default function AdoptButton({ token = null, programId = null, donker = false, label = "Neem dit schema over" }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const neemOver = () =>
    start(async () => {
      const fd = new FormData();
      if (token) fd.set("token", token);
      if (programId) fd.set("programId", programId);
      const r = await adoptProgram(fd);
      if (r?.error) {
        if (/log in/i.test(r.error)) {
          const terug = typeof location !== "undefined" ? location.pathname : "/";
          router.push(`/login?mode=signup&next=${encodeURIComponent(terug)}`);
          return;
        }
        return toast("error", r.error);
      }
      toast("success", r.message);
      router.push(`/plannen/${r.programId}`);
    });

  return (
    <button
      type="button"
      onClick={neemOver}
      disabled={pending}
      className={
        "rounded-full px-6 py-3 text-sm font-black transition disabled:opacity-50 " +
        (donker ? "bg-accent text-brand hover:opacity-90" : "bg-brand text-white hover:opacity-90")
      }
    >
      {pending ? "Bezig…" : `${label} →`}
    </button>
  );
}

"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadCoachPhoto } from "@/app/coach/actions";

const toast = (type, msg) => window.dispatchEvent(new CustomEvent("fittin:toast", { detail: { type, msg } }));

// Resize + recompress in the browser before upload: caps the longest side at 1280px and re-encodes
// to JPEG ~0.82 — so a 5 MB phone photo becomes ~150–300 KB, saving storage + bandwidth.
async function compress(file, maxDim = 1280, quality = 0.82) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", quality));
    if (!blob) return file;
    return new File([blob], (file.name || "photo").replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // fall back to the original if the browser can't process it
  }
}

export default function PhotoUpload({ currentUrl, name }) {
  const router = useRouter();
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(currentUrl || null);
  const [busy, setBusy] = useState(false);

  async function onChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast("error", "Alleen afbeeldingen."); return; }
    if (file.size > 5 * 1024 * 1024) { toast("error", "Max 5 MB."); e.target.value = ""; return; }
    setBusy(true);
    const small = await compress(file);
    const fd = new FormData();
    fd.append("photo", small);
    const res = await uploadCoachPhoto(fd);
    setBusy(false);
    if (res?.error) { toast("error", res.error); return; }
    toast("success", res?.message || "Foto geüpload ✓");
    setPreview(URL.createObjectURL(small));
    router.refresh();
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-3xl border border-borderc bg-white p-6">
      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-paper">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Profielfoto" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-3xl font-black text-brand/20">{(name || "C").slice(0, 1)}</div>
        )}
      </div>
      <div className="flex-1">
        <span className="block text-xs font-bold uppercase tracking-wide text-lav">Profielfoto</span>
        <input ref={inputRef} type="file" accept="image/*" disabled={busy} onChange={onChange} className="mt-2 block w-full text-sm text-brand file:mr-3 file:rounded-full file:border-0 file:bg-paper file:px-4 file:py-2 file:text-sm file:font-bold file:text-brand" />
        <p className="mt-1 text-xs text-brand/40">{busy ? "Uploaden…" : "Max 5 MB — wordt automatisch gecomprimeerd."}</p>
      </div>
    </div>
  );
}

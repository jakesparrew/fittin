import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ok = () => new NextResponse(null, { status: 204 });
const clip = (s, n) => (s == null ? null : String(s).slice(0, n));

// First-party client-error sink. Best-effort, always 204. No external tracker.
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const message = clip(body.message, 1000);
    if (!message) return ok();
    // Fouten van een ontwikkelmachine horen niet in het productielogboek, en al zeker niet in de
    // alarmmail. Ze staan er wél: op 03-09 zette één testronde 44 rijen en negen alarmmails op de
    // stapel, allemaal van localhost. Een alarm dat vals blaast, wordt genegeerd wanneer het echt
    // moet. Bewust alleen filteren wanneer de herkomst EXPLICIET lokaal is — ontbreekt de header,
    // dan loggen we gewoon, zodat er nooit een echte fout stilvalt.
    const herkomst = req.headers.get("origin") || req.headers.get("referer") || "";
    if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(herkomst)) return ok();
    let userId = null;
    try { const { data: { user } } = await (await createClient()).auth.getUser(); userId = user?.id || null; } catch {}
    await createAdminClient().from("client_errors").insert({
      message,
      stack: clip(body.stack, 4000),
      path: clip(body.path, 300),
      ua: clip(req.headers.get("user-agent"), 300),
      user_id: userId,
    });
  } catch {}
  return ok();
}

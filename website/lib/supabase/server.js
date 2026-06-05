import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";

// Keep the auth cookie across browser restarts ("remember me"). Supabase sometimes omits
// maxAge → a session cookie that dies on close, forcing re-login. Inject a long maxAge on
// real values only; never on deletions (maxAge:0 / expires set during sign-out).
const REMEMBER_SECONDS = 60 * 60 * 24 * 400; // 400 days (Chrome's cap)
function persist(value, options = {}) {
  if (value && options.maxAge === undefined && options.expires === undefined) {
    return { ...options, maxAge: REMEMBER_SECONDS };
  }
  return options;
}

// Server-side Supabase client bound to the request cookies (anon key, RLS enforced).
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, persist(value, options))
          );
        } catch {
          // Called from a Server Component (read-only cookies) — refresh persists via /api/me.
        }
      },
    },
  });
}

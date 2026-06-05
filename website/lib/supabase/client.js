"use client";
import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";

// Singleton browser client. Multiple instances share GoTrue's navigator.locks lock and can
// deadlock auth calls; one instance + a pass-through lock keeps signIn/getUser from hanging.
let browserClient;
const passthroughLock = async (_name, _acquireTimeout, fn) => fn();

export function createClient() {
  if (!browserClient) {
    browserClient = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { lock: passthroughLock },
    });
  }
  return browserClient;
}

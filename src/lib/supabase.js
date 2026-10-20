import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Invite and password-reset links land with `type=invite|recovery` in the URL
// hash. Read it before the client consumes and clears the hash, so the app can
// ask the user to choose a password even if Supabase redirected to the site root.
const linkType =
  typeof window === "undefined"
    ? null
    : new URLSearchParams(window.location.hash.slice(1)).get("type");
export const arrivedFromPasswordLink =
  linkType === "invite" || linkType === "recovery";

export const supabase = url && key ? createClient(url, key) : null;

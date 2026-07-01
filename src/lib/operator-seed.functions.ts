import { createServerFn } from "@tanstack/react-start";

const SEED_EMAIL = "operator@bdcvietnam.app";
const SEED_PASSWORD = "admin123";

/**
 * Idempotently seeds the single shared operator account.
 * Safe to call multiple times — returns ok if the user already exists.
 */
export const seedOperator = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: existing } = await supabaseAdmin.auth.admin.listUsers();
  const already = existing?.users?.find((u) => u.email === SEED_EMAIL);
  if (already) {
    return { ok: true, email: SEED_EMAIL, created: false };
  }
  const { error } = await supabaseAdmin.auth.admin.createUser({
    email: SEED_EMAIL,
    password: SEED_PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(error.message);
  return { ok: true, email: SEED_EMAIL, created: true };
});

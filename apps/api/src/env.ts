export type Env = {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  APP_ORIGIN: string;
};

/** The signed-in user making the request. `token` is their Supabase access token. */
export type AuthUser = { id: string; token: string };

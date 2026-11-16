-- Operational state, independent of historical request traces and pack lifetime.
CREATE TABLE IF NOT EXISTS public.openrouter_cooldowns (
  credential_hash text NOT NULL CHECK (credential_hash ~ '^[a-f0-9]{64}$'),
  scope text NOT NULL CHECK (scope IN ('credential', 'free_models', 'model', 'request')),
  target text NOT NULL,
  expires_at timestamptz NOT NULL,
  details jsonb NOT NULL CHECK (octet_length(details::text) <= 16384),
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (credential_hash, scope, target)
);
CREATE INDEX IF NOT EXISTS openrouter_cooldowns_expiry_idx ON public.openrouter_cooldowns(expires_at);
REVOKE ALL ON public.openrouter_cooldowns FROM PUBLIC;
ALTER TABLE public.openrouter_cooldowns ENABLE ROW LEVEL SECURITY;
-- No public policies; trusted application/operator access only.

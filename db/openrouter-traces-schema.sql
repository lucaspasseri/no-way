-- Additive and independent of temporary packs: traces outlive their 24h parent.
CREATE TABLE IF NOT EXISTS public.openrouter_request_traces (
  id uuid PRIMARY KEY,
  pack_id uuid NOT NULL,
  batch_number integer NOT NULL CHECK (batch_number > 0),
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  http_attempt_number integer NOT NULL CHECK (http_attempt_number > 0),
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  duration_ms integer CHECK (duration_ms >= 0),
  environment text NOT NULL,
  outcome text NOT NULL,
  requested_model text NOT NULL,
  response_model text,
  http_status integer,
  error_category text,
  details jsonb NOT NULL CHECK (octet_length(details::text) <= 131072),
  expires_at timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP + interval '14 days'),
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS openrouter_traces_started_idx ON public.openrouter_request_traces(started_at DESC);
CREATE INDEX IF NOT EXISTS openrouter_traces_pack_idx ON public.openrouter_request_traces(pack_id, attempt_number, http_attempt_number);
CREATE INDEX IF NOT EXISTS openrouter_traces_expiry_idx ON public.openrouter_request_traces(expires_at);
REVOKE ALL ON public.openrouter_request_traces FROM PUBLIC;
ALTER TABLE public.openrouter_request_traces ENABLE ROW LEVEL SECURITY;
-- No public policies. The trusted table owner writes and inspects diagnostics.

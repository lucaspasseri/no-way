-- Additive, repeatable installation. Does not change the canonical question bank.
CREATE TABLE IF NOT EXISTS public.question_lab_packs (
  id uuid PRIMARY KEY,
  owner_hash text NOT NULL,
  config jsonb NOT NULL,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP + interval '24 hours')
);
CREATE INDEX IF NOT EXISTS question_lab_owner_created_idx ON public.question_lab_packs(owner_hash, created_at);
CREATE INDEX IF NOT EXISTS question_lab_created_idx ON public.question_lab_packs(created_at);

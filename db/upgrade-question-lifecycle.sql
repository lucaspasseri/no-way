-- Review and run manually against the PREVIOUS canonical schema only.
-- No question primary keys, content, or foreign keys are changed.
BEGIN;
LOCK TABLE public.questions IN ACCESS EXCLUSIVE MODE;
DO $upgrade$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
    AND table_name = 'questions' AND column_name = 'verification_source_url') THEN
    RAISE EXCEPTION 'Unsupported older schema: reconcile its columns separately before this upgrade.';
  END IF;
END;
$upgrade$;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS seed_key text;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS curated_id integer;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS validated_at timestamptz;
ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_status_check;
ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_approval;
ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_verification;
ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_validation;
ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_category_check;
-- Legacy approval is retained as VALIDATED pending the stricter curation pass.
-- Existing factual evidence remains available for review but is not active approval.
UPDATE public.questions SET
  status = CASE status WHEN 'approved' THEN 'validated' WHEN 'pending' THEN 'generated'
    WHEN 'rejected' THEN 'generated' ELSE status END,
  validated_at = CASE WHEN status = 'approved' THEN COALESCE(reviewed_at, CURRENT_TIMESTAMP) ELSE validated_at END,
  verified_at = CASE WHEN status IN ('approved', 'pending', 'rejected') THEN NULL ELSE verified_at END,
  seed_key = CASE WHEN origin = 'seed' THEN COALESCE(seed_key, 'predefined:' || id::text) ELSE seed_key END;
ALTER TABLE public.questions ALTER COLUMN status SET DEFAULT 'generated';
ALTER TABLE public.questions ADD CONSTRAINT questions_status_check CHECK (status IN ('generated','validated','curated'));
ALTER TABLE public.questions ADD CONSTRAINT questions_category_check CHECK
  (category IN ('science','geography','history','culture','sports','mathematics','technology','nature','human-body','everyday'));
ALTER TABLE public.questions ADD CONSTRAINT questions_validation CHECK (status = 'generated' OR validated_at IS NOT NULL);
ALTER TABLE public.questions ADD CONSTRAINT questions_approval CHECK (status <> 'curated' OR
  (curated_id IS NOT NULL AND unit IS NOT NULL AND category IS NOT NULL AND answer_context IS NOT NULL
   AND verified_at IS NOT NULL AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL
   AND review_notes IS NOT NULL AND verification_source_url IS NOT NULL));
ALTER TABLE public.questions ADD CONSTRAINT questions_verification CHECK (status = 'curated' OR verified_at IS NULL);
-- Idempotent constraint installation without replacing production identities.
DO $constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.questions'::regclass AND conname = 'questions_seed_key_check') THEN
    ALTER TABLE public.questions ADD CONSTRAINT questions_seed_key_check CHECK (seed_key ~ '^predefined:[1-9][0-9]*$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.questions'::regclass AND conname = 'questions_curated_id_check') THEN
    ALTER TABLE public.questions ADD CONSTRAINT questions_curated_id_check CHECK (curated_id > 0);
  END IF;
END;
$constraints$;
CREATE UNIQUE INDEX IF NOT EXISTS questions_seed_key_key ON public.questions(seed_key);
CREATE UNIQUE INDEX IF NOT EXISTS questions_curated_id_key ON public.questions(curated_id);
COMMIT;

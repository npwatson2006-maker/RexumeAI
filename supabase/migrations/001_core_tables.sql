-- ═══════════════════════════════════════════════════════════════
--  RexumeAI — Core Tables Migration
--  Run this in your Supabase project's SQL Editor:
--  https://app.supabase.com → Project → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
--  ENUM: ai_session_type
-- ─────────────────────────────────────────────────────────────
CREATE TYPE ai_session_type AS ENUM ('review', 'rewrite', 'tailor');


-- ─────────────────────────────────────────────────────────────
--  TABLE: profiles
--  One row per user. Created automatically on sign-up via trigger.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id     UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT        NOT NULL,
  full_name   TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index: look up a profile by email quickly
CREATE INDEX IF NOT EXISTS profiles_email_idx ON public.profiles (email);

-- Auto-update updated_at on every UPDATE
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Trigger: auto-create a profiles row whenever a new auth user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'
  )
  ON CONFLICT (user_id) DO NOTHING;   -- safe to re-run
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- Allow the trigger function (SECURITY DEFINER) to insert on sign-up
CREATE POLICY "Service role can insert profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (TRUE);


-- ─────────────────────────────────────────────────────────────
--  TABLE: resumes
--  Stores metadata + AI-parsed content for each resume.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.resumes (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  title             TEXT        NOT NULL DEFAULT 'Untitled Resume',
  original_file_url TEXT,                         -- Supabase Storage URL after upload
  parsed_content    JSONB,                        -- structured data from AI parsing
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS resumes_user_id_idx       ON public.resumes (user_id);
CREATE INDEX IF NOT EXISTS resumes_created_at_idx    ON public.resumes (created_at DESC);
CREATE INDEX IF NOT EXISTS resumes_parsed_content_idx ON public.resumes USING GIN (parsed_content);

-- Auto-update updated_at
CREATE OR REPLACE TRIGGER resumes_updated_at
  BEFORE UPDATE ON public.resumes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Row Level Security
ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own resumes"
  ON public.resumes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own resumes"
  ON public.resumes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own resumes"
  ON public.resumes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own resumes"
  ON public.resumes FOR DELETE
  USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────
--  TABLE: ai_sessions
--  Immutable log of every AI operation (review, rewrite, tailor).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_sessions (
  id           UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID             NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  resume_id    UUID             REFERENCES public.resumes(id) ON DELETE SET NULL,
  session_type ai_session_type  NOT NULL,
  input_data   JSONB,           -- original text / job description sent to AI
  output_data  JSONB,           -- AI response
  created_at   TIMESTAMPTZ      NOT NULL DEFAULT NOW()
  -- No updated_at: sessions are append-only / immutable
);

-- Indexes
CREATE INDEX IF NOT EXISTS ai_sessions_user_id_idx   ON public.ai_sessions (user_id);
CREATE INDEX IF NOT EXISTS ai_sessions_resume_id_idx ON public.ai_sessions (resume_id);
CREATE INDEX IF NOT EXISTS ai_sessions_created_at_idx ON public.ai_sessions (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_sessions_type_idx       ON public.ai_sessions (session_type);

-- Row Level Security
ALTER TABLE public.ai_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own AI sessions"
  ON public.ai_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own AI sessions"
  ON public.ai_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- No UPDATE or DELETE policies — sessions are immutable logs


-- ─────────────────────────────────────────────────────────────
--  Enable real-time on resumes and ai_sessions
-- ─────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.resumes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_sessions;

-- ============================================================
-- Memephant — Supabase RLS + Schema Fix
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================


-- ─── 1. Ensure unique constraint exists (required for upsert onConflict) ──────

ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_user_id_project_id_key;

ALTER TABLE projects
  ADD CONSTRAINT projects_user_id_project_id_key
  UNIQUE (user_id, project_id);


-- ─── 2. Enable RLS on all tables ─────────────────────────────────────────────

ALTER TABLE projects       ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions  ENABLE ROW LEVEL SECURITY;


-- ─── 3. Projects table — drop old policies then recreate cleanly ──────────────

DROP POLICY IF EXISTS "Users can select their own projects"  ON projects;
DROP POLICY IF EXISTS "Users can insert their own projects"  ON projects;
DROP POLICY IF EXISTS "Users can update their own projects"  ON projects;
DROP POLICY IF EXISTS "Users can delete their own projects"  ON projects;

CREATE POLICY "Users can select their own projects"
  ON projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own projects"
  ON projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own projects"
  ON projects FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own projects"
  ON projects FOR DELETE
  USING (auth.uid() = user_id);


-- ─── 4. Subscriptions table — read-only for users, write via service role ─────

DROP POLICY IF EXISTS "Users can read their own subscription"  ON subscriptions;

CREATE POLICY "Users can read their own subscription"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);


-- ─── 5. Verify ───────────────────────────────────────────────────────────────
-- After running, check this returns rows for projects + subscriptions:

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('projects', 'subscriptions')
ORDER BY tablename, cmd;

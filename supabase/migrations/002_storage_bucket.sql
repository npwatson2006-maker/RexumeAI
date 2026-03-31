-- ═══════════════════════════════════════════════════════════════
--  RexumeAI — Storage Bucket: resumes
--  Applied via: mcp__claude_ai_Supabase__apply_migration
-- ═══════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'resumes', 'resumes', false, 10485760,
  ARRAY['application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain']
) ON CONFLICT (id) DO NOTHING;

-- RLS: users can only access files inside their own subfolder ({user_id}/...)
CREATE POLICY "Users can upload their own resumes"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can read their own resumes"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own resumes"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

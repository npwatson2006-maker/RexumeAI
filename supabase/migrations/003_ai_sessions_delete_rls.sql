-- Add DELETE policy to ai_sessions so users can remove their own review records
CREATE POLICY "Users can delete their own AI sessions"
  ON public.ai_sessions FOR DELETE
  USING (auth.uid() = user_id);

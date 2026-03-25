/**
 * TypeScript types mirroring the Supabase database schema.
 *
 * Keep this file in sync with your Supabase tables.
 * To regenerate automatically (once Supabase CLI is installed):
 *   npx supabase gen types typescript --project-id mtnjxfkoyxsgyqetrciv > src/lib/supabase/types.ts
 */

// ─────────────────────────────────────────────────────────────
//  Row types  (what comes back from SELECT queries)
// ─────────────────────────────────────────────────────────────

export interface ProfileRow {
  user_id: string;           // uuid — references auth.users(id)
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;        // ISO 8601 timestamp
  updated_at: string;
}

export interface ResumeRow {
  id: string;                // uuid
  user_id: string;           // uuid — references profiles(user_id)
  title: string;
  original_file_url: string | null;
  parsed_content: Record<string, unknown> | null;  // jsonb
  created_at: string;
  updated_at: string;
}

export type AiSessionType = 'review' | 'rewrite' | 'tailor';

export interface AiSessionRow {
  id: string;                // uuid
  user_id: string;           // uuid — references profiles(user_id)
  resume_id: string | null;  // uuid — references resumes(id)
  session_type: AiSessionType;
  input_data: Record<string, unknown> | null;   // jsonb
  output_data: Record<string, unknown> | null;  // jsonb
  created_at: string;
}

// ─────────────────────────────────────────────────────────────
//  Insert types  (what you send to INSERT queries)
// ─────────────────────────────────────────────────────────────

export type ProfileInsert = Omit<ProfileRow, 'created_at' | 'updated_at'>;

export type ResumeInsert = Omit<ResumeRow, 'id' | 'created_at' | 'updated_at'>;

export type AiSessionInsert = Omit<AiSessionRow, 'id' | 'created_at'>;

// ─────────────────────────────────────────────────────────────
//  Update types  (partial updates)
// ─────────────────────────────────────────────────────────────

export type ProfileUpdate = Partial<Omit<ProfileRow, 'user_id' | 'created_at'>>;

export type ResumeUpdate = Partial<Omit<ResumeRow, 'id' | 'user_id' | 'created_at'>>;

// ─────────────────────────────────────────────────────────────
//  Database type  (used to type the Supabase client)
// ─────────────────────────────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
      };
      resumes: {
        Row: ResumeRow;
        Insert: ResumeInsert;
        Update: ResumeUpdate;
      };
      ai_sessions: {
        Row: AiSessionRow;
        Insert: AiSessionInsert;
        Update: never;  // sessions are immutable once created
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      ai_session_type: AiSessionType;
    };
  };
}

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
  user_id: string;               // uuid — references auth.users(id)
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  has_dismissed_welcome: boolean; // tracks if user closed the onboarding card
  created_at: string;            // ISO 8601 timestamp
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

// ─────────────────────────────────────────────────────────────
//  ParsedResume — structured output from the AI parsing step
//  Stored in resumes.parsed_content (JSONB)
// ─────────────────────────────────────────────────────────────

export interface ParsedResumeExperience {
  company: string;
  title: string;
  start_date: string;
  end_date: string;           // use "Present" if current role
  description: string;        // bullet points as a single string
  location: string | null;
}

export interface ParsedResumeEducation {
  institution: string;
  degree: string;
  field_of_study: string | null;
  start_date: string | null;
  end_date: string | null;
  gpa: string | null;
}

export interface ParsedResumeCertification {
  name: string;
  issuer: string | null;
  date: string | null;
}

export interface ParsedResumeProject {
  name: string;
  description: string;
  url: string | null;
}

export interface ParsedResume {
  full_name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedin: string | null;
  website: string | null;
  summary: string | null;
  experience: ParsedResumeExperience[];
  education: ParsedResumeEducation[];
  skills: string[];
  certifications: ParsedResumeCertification[];
  languages: string[];
  projects: ParsedResumeProject[];
}

// ─────────────────────────────────────────────────────────────
//  ReviewResult — structured output from the AI review step
//  Stored in ai_sessions.output_data (JSONB)
// ─────────────────────────────────────────────────────────────

export interface ReviewAnnotation {
  section: string;       // 'experience' | 'education' | 'skills' | 'summary' etc.
  item_index: number;    // 0-based index within section
  field: string;         // 'description' | 'title' | 'summary' etc.
  rating: 'strong' | 'okay' | 'weak';
  comment: string;
}

export interface ReviewCategory {
  score: number;
  feedback: string;
  suggestions: string[];
  missing_keywords?: string[];
  weak_verbs_found?: string[];
  bullets_without_metrics?: string[];
}

export interface ReviewResult {
  overall_score: number;
  summary: string;
  categories: {
    content_strength: ReviewCategory;
    formatting_structure: ReviewCategory;
    keywords_ats: ReviewCategory;
    grammar_clarity: ReviewCategory;
    impact_action_verbs: ReviewCategory;
    bullet_point_strength: ReviewCategory;
  };
  annotations: ReviewAnnotation[];
  top_strengths: string[];
  top_improvements: string[];
}

// ─────────────────────────────────────────────────────────────
//  Database type  (used to type the Supabase client)
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
//  RewriteResult — structured output from the AI rewrite step
//  Stored in ai_sessions.output_data (JSONB)
// ─────────────────────────────────────────────────────────────

export interface RewriteItem {
  section: string;      // 'summary' | 'experience' | 'education' | 'skills' etc.
  item_index: number;   // 0-based; use 0 for scalar sections like summary
  field: string;        // 'summary' | 'description' | 'title' etc.
  label: string;        // human-readable e.g. "Software Engineer at Acme Corp"
  original: string;
  rewritten: string;
  changes: string[];    // specific improvements made (bullet list)
}

export interface RewriteResult {
  overall_summary: string;
  items: RewriteItem[];
  key_improvements: string[];
}

// ─────────────────────────────────────────────────────────────
//  TailorResult — structured output from the AI tailor step
//  Stored in ai_sessions.output_data (JSONB)
// ─────────────────────────────────────────────────────────────

export interface TailorItem {
  section: string;      // 'summary' | 'experience' | 'education' | 'skills' etc.
  item_index: number;   // 0-based; use 0 for scalar sections like summary
  field: string;        // 'summary' | 'description' | 'title' etc.
  label: string;        // human-readable e.g. "Software Engineer at Acme Corp"
  original: string;
  tailored: string;
  changes: string[];    // specific tailoring changes made
}

export interface TailorResult {
  overall_summary: string;
  job_match_score: number;  // 0-100, estimated match after tailoring
  items: TailorItem[];
  keywords_added: string[]; // keywords from the job description that were woven in
  key_changes: string[];    // top-level summary of what changed
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
        Relationships: [];
      };
      resumes: {
        Row: ResumeRow;
        Insert: ResumeInsert;
        Update: ResumeUpdate;
        Relationships: [];
      };
      ai_sessions: {
        Row: AiSessionRow;
        Insert: AiSessionInsert;
        Update: Partial<AiSessionRow>;
        Relationships: [];
      };
    };
    Views: {};
    Functions: {};
    Enums: {
      ai_session_type: AiSessionType;
    };
  };
}

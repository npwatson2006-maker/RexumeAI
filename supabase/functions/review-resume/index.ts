// Supabase Edge Function — review-resume
// Deno runtime
//
// Receives { resume_id: string } from an authenticated client.
// Fetches parsed_content server-side (service role), validates ownership,
// calls Claude to produce a structured ReviewResult, and returns it.
//
// Required secrets (Supabase Dashboard → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY=sk-ant-...
// Auto-provided by Supabase runtime:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 8192;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SYSTEM_PROMPT = `You are a senior technical recruiter and ATS expert with 15+ years of experience reviewing resumes across all industries. Analyze the structured resume JSON provided and return ONLY valid JSON — no markdown fencing, no explanation, no extra text.

Score each category 0–100 and provide specific, actionable feedback. Be direct and constructive.

Return an object matching this exact schema:

{
  "overall_score": number (0-100, weighted average of all category scores),
  "summary": "string (2-3 sentences: overall assessment, biggest strength, most critical improvement)",
  "categories": {
    "content_strength": {
      "score": number,
      "feedback": "string (how well experience and achievements are described)",
      "suggestions": ["string (specific, actionable improvement)"]
    },
    "formatting_structure": {
      "score": number,
      "feedback": "string (organization, section ordering, consistency)",
      "suggestions": ["string"]
    },
    "keywords_ats": {
      "score": number,
      "feedback": "string (keyword usage, ATS compatibility, industry-relevant terms)",
      "suggestions": ["string"],
      "missing_keywords": ["string (common keywords for this field that are missing)"]
    },
    "grammar_clarity": {
      "score": number,
      "feedback": "string (writing quality, clarity, conciseness)",
      "suggestions": ["string"]
    },
    "impact_action_verbs": {
      "score": number,
      "feedback": "string (use of strong action verbs, quantified achievements)",
      "suggestions": ["string"],
      "weak_verbs_found": ["string (weak verbs that should be replaced)"]
    },
    "bullet_point_strength": {
      "score": number,
      "feedback": "string (bullet quality — specificity, numbers, metrics, results)",
      "suggestions": ["string"],
      "bullets_without_metrics": ["string (bullet points that lack quantifiable results)"]
    }
  },
  "annotations": [
    {
      "section": "string (e.g. experience, education, skills, summary, certifications, projects)",
      "item_index": number (0-based index within that section array; use 0 for scalar sections like summary),
      "field": "string (e.g. description, title, summary, degree)",
      "rating": "strong" or "okay" or "weak",
      "comment": "string (brief note explaining the rating, max 120 chars)"
    }
  ],
  "top_strengths": ["string (top 3 things this resume does well)"],
  "top_improvements": ["string (top 3 most impactful things to fix, ordered by priority)"]
}`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    // ── 1. Verify JWT ──────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Missing or invalid Authorization header' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      console.error('[review-resume] Missing required env vars');
      return jsonResponse({ error: 'Server misconfiguration' }, 500);
    }

    const anonClient = createClient(supabaseUrl, supabaseAnonKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);

    if (authError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    // ── 2. Parse request body ──────────────────────────────────
    let body: { resume_id?: unknown };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    if (!body.resume_id || typeof body.resume_id !== 'string') {
      return jsonResponse({ error: 'Request body must include a "resume_id" string' }, 400);
    }

    const resumeId = body.resume_id.trim();

    // ── 3. Fetch resume with service role (bypasses RLS) ──────
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: resume, error: resumeError } = await adminClient
      .from('resumes')
      .select('parsed_content, user_id')
      .eq('id', resumeId)
      .single();

    if (resumeError || !resume) {
      console.error('[review-resume] Resume fetch error:', resumeError?.message);
      return jsonResponse({ error: 'Resume not found' }, 404);
    }

    // Ownership check — must belong to the authenticated user
    if (resume.user_id !== user.id) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }

    if (!resume.parsed_content) {
      return jsonResponse({ error: 'Resume has no parsed content to review. Please upload and parse a resume first.' }, 422);
    }

    // ── 4. Call Anthropic Claude API ───────────────────────────
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) {
      console.error('[review-resume] ANTHROPIC_API_KEY secret not set');
      return jsonResponse({ error: 'AI service not configured. Please contact support.' }, 503);
    }

    const resumeJson = JSON.stringify(resume.parsed_content, null, 2);

    const anthropicRes = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Review this resume and return JSON only:\n\n${resumeJson}`,
          },
        ],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error('[review-resume] Anthropic API error:', anthropicRes.status, errText);
      return jsonResponse({ error: 'AI review failed. Please try again in a moment.' }, 502);
    }

    const anthropicData = await anthropicRes.json();
    const rawContent: string = anthropicData?.content?.[0]?.text ?? '';

    if (!rawContent) {
      return jsonResponse({ error: 'Empty response from AI. Please retry.' }, 502);
    }

    // ── 5. Parse JSON from Claude's response ───────────────────
    let parsed: unknown;
    const stripped = rawContent
      .replace(/^```json?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    try {
      parsed = JSON.parse(stripped);
    } catch (parseErr) {
      console.error('[review-resume] JSON parse error:', parseErr, '\nRaw:', rawContent.slice(0, 500));
      return jsonResponse({ error: 'Could not parse AI response. Please retry.' }, 502);
    }

    return jsonResponse({ data: parsed });

  } catch (err) {
    console.error('[review-resume] Unhandled error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});

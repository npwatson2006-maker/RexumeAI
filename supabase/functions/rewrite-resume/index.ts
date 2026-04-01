// Supabase Edge Function — rewrite-resume
// Deno runtime
//
// Receives { resume_id: string } from an authenticated client.
// Fetches parsed_content server-side (service role), validates ownership,
// calls Claude to produce a structured RewriteResult, and returns it.
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

const SYSTEM_PROMPT = `You are an expert resume writer with 15+ years of experience helping candidates land top-tier roles. Rewrite the weak and mediocre sections of the given resume to be stronger, more impactful, and ATS-optimized. Return ONLY valid JSON — no markdown fencing, no explanation, no extra text.

Focus on:
- Replacing vague language with specific, quantified achievements
- Strengthening bullet points with powerful action verbs and metrics
- Improving the professional summary to be punchy and role-targeted
- Making skills sections more relevant and keyword-rich

Only include items where the original text is weak, vague, or missing impact. Skip sections that are already strong and well-written.

Return an object matching this exact schema:

{
  "overall_summary": "string (2-3 sentences: what you improved and why it will help the candidate)",
  "items": [
    {
      "section": "string (one of: summary, experience, education, skills, certifications, projects)",
      "item_index": number (0-based index within the section array; use 0 for scalar sections like summary),
      "field": "string (the specific field rewritten, e.g. summary, description, title)",
      "label": "string (human-readable label, e.g. for experience: 'Job Title at Company Name', for summary: 'Professional Summary')",
      "original": "string (verbatim original text from the resume)",
      "rewritten": "string (your improved version — same format as original, e.g. bullet points if original was bullets)",
      "changes": ["string (specific improvement made, e.g. 'Added quantified metric: reduced load time by 40%')"]
    }
  ],
  "key_improvements": ["string (top 3-5 overall improvements made across the entire resume)"]
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
      console.error('[rewrite-resume] Missing required env vars');
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
      console.error('[rewrite-resume] Resume fetch error:', resumeError?.message);
      return jsonResponse({ error: 'Resume not found' }, 404);
    }

    // Ownership check — must belong to the authenticated user
    if (resume.user_id !== user.id) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }

    if (!resume.parsed_content) {
      return jsonResponse({ error: 'Resume has no parsed content to rewrite. Please upload and parse a resume first.' }, 422);
    }

    // ── 4. Call Anthropic Claude API ───────────────────────────
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) {
      console.error('[rewrite-resume] ANTHROPIC_API_KEY secret not set');
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
            content: `Rewrite the weak sections of this resume and return JSON only:\n\n${resumeJson}`,
          },
        ],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error('[rewrite-resume] Anthropic API error:', anthropicRes.status, errText);
      return jsonResponse({ error: 'AI rewrite failed. Please try again in a moment.' }, 502);
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
      console.error('[rewrite-resume] JSON parse error:', parseErr, '\nRaw:', rawContent.slice(0, 500));
      return jsonResponse({ error: 'Could not parse AI response. Please retry.' }, 502);
    }

    return jsonResponse({ data: parsed });

  } catch (err) {
    console.error('[rewrite-resume] Unhandled error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});

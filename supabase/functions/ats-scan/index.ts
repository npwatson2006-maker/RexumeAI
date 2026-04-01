// Supabase Edge Function — ats-scan
// Deno runtime
//
// Receives { resume_id: string } from an authenticated client.
// Fetches parsed_content server-side (service role), validates ownership,
// calls Claude to simulate an ATS scan and return a structured ATSResult.
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

const SYSTEM_PROMPT = `You are an expert ATS (Applicant Tracking System) specialist who deeply understands how enterprise recruitment software like Workday, Greenhouse, Lever, iCIMS, Taleo, and BambooHR parse and score resumes. Your job is to simulate what these systems actually see and score when a resume is submitted.

Analyze the structured resume JSON provided and evaluate it purely from an ATS perspective — not from a human recruiter's viewpoint. Return ONLY valid JSON — no markdown fencing, no explanation, no extra text.

Key ATS concerns to evaluate:
- Can the ATS reliably detect the candidate's contact information?
- Does the resume use standard section headings ATS systems recognize?
- Are dates in consistent, parseable formats?
- Does the content contain industry-relevant keywords that ATS filters look for?
- Are there formatting patterns that would cause parsing failures (e.g., columns, tables, graphics, headers/footers — infer from content structure)?
- Is the work history structured clearly enough for ATS timeline parsing?
- Does the resume have enough keyword density to pass automated filters?

Return an object matching this exact schema:

{
  "overall_score": number (0-100, ATS compatibility score — be realistic, most resumes score 50-80),
  "summary": "string (2-3 sentences: overall ATS compatibility, biggest risk, and most important fix)",
  "parsed_contact": {
    "name_detected": boolean,
    "email_detected": boolean,
    "phone_detected": boolean,
    "location_detected": boolean,
    "linkedin_detected": boolean
  },
  "sections": [
    {
      "section": "string (contact | summary | experience | education | skills | certifications | projects)",
      "detected": boolean (whether an ATS would reliably find this section),
      "confidence": "high" | "medium" | "low",
      "notes": "string (what the ATS sees, any parsing concerns with this section)"
    }
  ],
  "formatting_issues": [
    {
      "issue": "string (specific formatting problem that hurts ATS parsing)",
      "severity": "critical" | "warning" | "info",
      "suggestion": "string (how to fix it)"
    }
  ],
  "keyword_analysis": {
    "found": ["string (keywords and skills present that ATS systems commonly filter for)"],
    "suggested_missing": ["string (common ATS keywords for this candidate's apparent field that are absent)"],
    "density_score": number (0-100, keyword density and relevance score)
  },
  "recommendations": ["string (top 5 most impactful actions to improve ATS score, ordered by impact)"]
}`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

Deno.serve(async (req: Request) => {
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
      console.error('[ats-scan] Missing required env vars');
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
      console.error('[ats-scan] Resume fetch error:', resumeError?.message);
      return jsonResponse({ error: 'Resume not found' }, 404);
    }

    if (resume.user_id !== user.id) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }

    if (!resume.parsed_content) {
      return jsonResponse({ error: 'Resume has no parsed content. Please upload and parse a resume first.' }, 422);
    }

    // ── 4. Call Anthropic Claude API ───────────────────────────
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) {
      console.error('[ats-scan] ANTHROPIC_API_KEY secret not set');
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
            content: `Scan this resume as an ATS system and return JSON only:\n\n${resumeJson}`,
          },
        ],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error('[ats-scan] Anthropic API error:', anthropicRes.status, errText);
      return jsonResponse({ error: 'ATS scan failed. Please try again in a moment.' }, 502);
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
      console.error('[ats-scan] JSON parse error:', parseErr, '\nRaw:', rawContent.slice(0, 500));
      return jsonResponse({ error: 'Could not parse AI response. Please retry.' }, 502);
    }

    return jsonResponse({ data: parsed });

  } catch (err) {
    console.error('[ats-scan] Unhandled error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});

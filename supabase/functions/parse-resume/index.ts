// Supabase Edge Function — parse-resume
// Deno runtime
//
// Receives { text: string } from an authenticated client,
// calls the Anthropic Claude API server-side, and returns
// a structured ParsedResume JSON object.
//
// Required secrets (set in Supabase Dashboard → Project Settings → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY=sk-ant-...

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';
const MAX_TEXT_LENGTH = 50000;

const SYSTEM_PROMPT = `You are a precise resume parser. Extract all information from the provided resume text and return ONLY valid JSON — no markdown fencing, no explanation, no extra text.

Return an object matching this exact schema (use null for missing fields, empty arrays for missing lists):

{
  "full_name": "string",
  "email": "string or null",
  "phone": "string or null",
  "location": "string or null",
  "linkedin": "string or null",
  "website": "string or null",
  "summary": "string or null",
  "experience": [
    {
      "company": "string",
      "title": "string",
      "start_date": "string",
      "end_date": "string (use Present if current)",
      "description": "string",
      "location": "string or null"
    }
  ],
  "education": [
    {
      "institution": "string",
      "degree": "string",
      "field_of_study": "string or null",
      "co_major": "string or null",
      "location": "string or null",
      "start_date": "string or null",
      "end_date": "string or null",
      "gpa": "string or null",
      "description": "string or null (honor/award bullets as newline-separated text, e.g. 'Deans Scholar\\nMayo Clinic Scholar')"
    }
  ],
  "skills": ["string"],
  "certifications": [
    { "name": "string", "issuer": "string or null", "date": "string or null" }
  ],
  "languages": ["string"],
  "projects": [
    { "name": "string", "description": "string", "url": "string or null" }
  ],
  "activities": [
    {
      "organization": "string",
      "role": "string",
      "start_date": "string",
      "end_date": "string (use Present if current)",
      "description": "string"
    }
  ]
}

SECTION MAPPING RULES — read carefully:
- "experience" captures paid work, internships, co-ops, and part-time jobs.
- "activities" captures EVERYTHING else that is not paid work: clubs, Greek life, sports teams, student government, honor societies, fraternities/sororities, volunteer work, community service, and any leadership role outside of employment. Map ANY of the following resume headings (and similar variations) into "activities": Activities, Extracurricular Activities, Campus Involvement, Involvement, Leadership, Leadership &amp; Involvement, Leadership and Involvement, Leadership Experience, Campus Leadership, Organizations, Student Organizations, Community Service, Volunteer Experience, Volunteering, Civic Engagement, Athletics, Sports, Greek Life, Honor Societies, Professional Organizations, Affiliations, Campus Activities, Co-Curricular Activities, Social Impact, Community Involvement, Service, Research (if unpaid/academic). Do NOT leave "activities" empty if any such entries exist in the resume — look carefully for these headings even if they appear under unconventional names.`;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('[parse-resume] Missing SUPABASE_URL or SUPABASE_ANON_KEY');
      return jsonResponse({ error: 'Server misconfiguration' }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    // ── 2. Parse request body ──────────────────────────────────
    let body: { text?: unknown };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    if (!body.text || typeof body.text !== 'string' || body.text.trim().length === 0) {
      return jsonResponse({ error: 'Request body must include a non-empty "text" string' }, 400);
    }

    const text = body.text.trim().slice(0, MAX_TEXT_LENGTH);

    // ── 3. Call Anthropic Claude API ───────────────────────────
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) {
      console.error('[parse-resume] ANTHROPIC_API_KEY secret not set');
      return jsonResponse({ error: 'AI service not configured. Please contact support.' }, 503);
    }

    const anthropicRes = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Parse this resume and return JSON only:\n\n${text}`,
          },
        ],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error('[parse-resume] Anthropic API error:', anthropicRes.status, errText);
      return jsonResponse(
        { error: 'AI parsing failed. Please try again in a moment.' },
        502
      );
    }

    const anthropicData = await anthropicRes.json();
    const rawContent: string = anthropicData?.content?.[0]?.text ?? '';

    if (!rawContent) {
      return jsonResponse({ error: 'Empty response from AI. Please retry.' }, 502);
    }

    // ── 4. Parse JSON from Claude's response ───────────────────
    // Claude occasionally wraps output in markdown fencing despite instructions
    let parsed: unknown;
    const stripped = rawContent
      .replace(/^```json?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    try {
      parsed = JSON.parse(stripped);
    } catch (parseErr) {
      console.error('[parse-resume] JSON parse error:', parseErr, '\nRaw:', rawContent.slice(0, 500));
      return jsonResponse(
        { error: 'Could not parse AI response. Please try a different file format.' },
        502
      );
    }

    return jsonResponse({ data: parsed });

  } catch (err) {
    console.error('[parse-resume] Unhandled error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});

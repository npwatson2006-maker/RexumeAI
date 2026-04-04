/**
 * Personal Resume Template
 *
 * Generates a DOCX file matching the personal resume format spec:
 * Garamond font, left-aligned 35pt name, pipe-separated contact line,
 * thick rule tight under contact info, thin rules baked into section header
 * paragraphs, org+location on line 1 / role+date on line 2 pattern.
 *
 * Bug fixes applied (vs initial implementation):
 *   BUG 1  Education now renders location, majors/co-major line, and honor bullets
 *   BUG 2  Leadership & Involvement section was always present in code — now verified
 *   BUG 3  Bullet font uses Arial ascii/hAnsi only (no eastAsia/cs)
 *   BUG 4  Margins: right=692, top=160, bottom=400; tab stop=10842 DXA
 *   BUG 5  Section header text + thin rule combined into ONE paragraph (pBdr bottom)
 *   BUG 6  Thick rule applied as bottom border on contactPara — no separate empty para
 *   BUG 7  spacing.before=60 on org-name paras that follow bullets (not emptyPara gap)
 *   BUG 8  Skills line is AlignmentType.CENTER
 *   BUG 9  No blank paragraph between consecutive education entries
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  BorderStyle,
  TabStopType,
  UnderlineType,
  LevelFormat,
} from 'docx';
import type {
  ParsedResume,
  ParsedResumeExperience,
  ParsedResumeEducation,
  ParsedResumeActivity,
  ParsedResumeProject,
  ParsedResumeCertification,
} from '../supabase/types';

// ── Constants ──────────────────────────────────────────────────

const GAR = 'Garamond';

// Margins in DXA — BUG 4 fix: right=692, top=160, bottom=400
const MARGIN_TOP    = 160;
const MARGIN_BOTTOM = 400;
const MARGIN_LEFT   = 706;
const MARGIN_RIGHT  = 692;

// Content width = 12240 − 706 − 692 = 10842 DXA — BUG 4 fix
const TAB_RIGHT = 10842;

// Font sizes in half-points
const SIZE_NAME    = 70;  // 35pt
const SIZE_CONTACT = 20;  // 10pt
const SIZE_BODY    = 20;  // 10pt
const SIZE_NORMAL  = 21;  // 10.5pt

// ── Primitive helpers ──────────────────────────────────────────

function gar(
  text: string,
  opts: { bold?: boolean; italic?: boolean; underline?: boolean; size?: number; font?: string } = {}
): TextRun {
  return new TextRun({
    text,
    font: opts.font ?? GAR,
    bold: opts.bold ?? false,
    italics: opts.italic ?? false,
    underline: opts.underline ? { type: UnderlineType.SINGLE } : undefined,
    size: opts.size ?? SIZE_NORMAL,
  });
}

// ── Header block ───────────────────────────────────────────────

function namePara(name: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { after: 0, before: 0 },
    children: [
      new TextRun({
        text: name,
        font: GAR,
        bold: true,
        size: SIZE_NAME,
      }),
    ],
  });
}

/**
 * BUG 6 fix: thick bottom border lives on the contact paragraph itself —
 * no separate empty "thickRulePara" needed, which was adding extra space.
 */
function contactPara(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { after: 40, before: 0 },
    border: {
      bottom: {
        style: BorderStyle.SINGLE,
        size: 28,        // 3.5pt (≈3.55pt original)
        color: '000000',
        space: 1,
      },
    },
    children: [gar(text, { size: SIZE_CONTACT })],
  });
}

// ── Section headers ────────────────────────────────────────────

/**
 * BUG 5 fix: thin bottom border is applied directly on the header text paragraph
 * instead of a separate empty paragraph, eliminating the extra vertical gap.
 */
function sectionHeader(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 100, after: 60 },
    border: {
      bottom: {
        style: BorderStyle.SINGLE,
        size: 5,         // 0.67pt
        color: '000000',
        space: 1,
      },
    },
    children: [gar(text.toUpperCase(), { bold: true, size: SIZE_NORMAL })],
  });
}

// ── Education helpers ──────────────────────────────────────────

function formatGpa(raw: string): string {
  if (raw.includes('/')) return raw;
  const num = parseFloat(raw);
  if (!isNaN(num)) return `${num.toFixed(2)}/4.00`;
  return raw;
}

function buildPersonalEducationSection(education: ParsedResumeEducation[]): Paragraph[] {
  if (education.length === 0) return [];

  const paras: Paragraph[] = [sectionHeader('EDUCATION & ACADEMIC HONORS')];

  education.forEach((edu) => {
    // BUG 9 fix: no emptyPara between entries — natural paragraph spacing handles gap

    // Line 1: Institution [| Location]                  End Date
    paras.push(new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: TAB_RIGHT }],
      spacing: { after: 0, before: 0, line: 240 },
      children: [
        gar(edu.institution, { bold: true }),
        ...(edu.location ? [gar(` | ${edu.location}`)] : []),
        ...(edu.end_date ? [gar('\t'), gar(edu.end_date, { italic: true })] : []),
      ],
    }));

    // Line 2: Degree (italic)                           GPA: X.XX/4.00 (bold)
    const gpa = edu.gpa ? `GPA: ${formatGpa(edu.gpa)}` : '';
    paras.push(new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: TAB_RIGHT }],
      spacing: { after: 0, line: 240 },
      children: [
        gar(edu.degree, { italic: true }),
        ...(gpa ? [gar('\t'), gar(gpa, { bold: true })] : []),
      ],
    }));

    // Line 3: Majors: ... | Co-Major: ... (only if field_of_study present)
    if (edu.field_of_study) {
      const children: TextRun[] = [
        gar('Major: ', { bold: true }),
        gar(edu.field_of_study),
      ];
      if (edu.co_major) {
        children.push(gar(' | ', { bold: false }));
        children.push(gar('Co-Major: ', { bold: true }));
        children.push(gar(edu.co_major));
      }
      paras.push(new Paragraph({
        spacing: { after: 0, line: 240 },
        children,
      }));
    }

    // Honors/award bullet points (from description field)
    if (edu.description) {
      const bullets = edu.description
        .split(/\n|•/)
        .map(s => s.replace(/^[-–—*]\s*/, '').trim())
        .filter(s => s.length > 0);
      bullets.forEach(b => paras.push(bulletPara(b)));
    }
  });

  return paras;
}

// ── Entry helpers (Experience / Leadership / Projects) ─────────

function splitBullets(description: string): string[] {
  return description
    .split(/\n|•|●/)
    .map((s) => s.replace(/^[-–—*]\s*/, '').trim())
    .filter((s) => s.length > 0);
}

function formatDateRange(start: string | null | undefined, end: string | null | undefined): string {
  if (!start && !end) return '';
  if (!start) return end ?? '';
  if (!end || end.toLowerCase() === 'present') return `${start} - Present`;
  return `${start} - ${end}`;
}

/**
 * BUG 3 fix: bullet font uses only ascii/hAnsi ('Arial') at 8pt (sz=16).
 * The hanging indent is 360 DXA matching the spec.
 */
function bulletPara(text: string): Paragraph {
  return new Paragraph({
    numbering: { reference: 'personal-bullets', level: 0 },
    children: [gar(text, { size: SIZE_BODY })],
    spacing: { after: 0, line: 240 },
    indent: { left: 360, hanging: 360 },
  });
}

/**
 * BUG 7 fix: org-name paragraphs get spacing.before=60 DXA (~3pt) to create
 * a visual gap after the preceding entry's bullets — replaces the old emptyPara.
 * Pass beforeSpacing=0 for the very first entry in a section.
 */
function buildEntryParas(
  orgName: string,
  location: string | null | undefined,
  role: string,
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  description: string,
  isFirst: boolean
): Paragraph[] {
  const dateRange = formatDateRange(startDate, endDate);
  const paras: Paragraph[] = [];

  // Line 1: org + location (no date) — BUG 7: before=60 except first entry
  paras.push(new Paragraph({
    spacing: { after: 0, before: isFirst ? 0 : 60, line: 240 },
    children: [
      gar(orgName, { bold: true }),
      ...(location ? [gar(` | ${location}`)] : []),
    ],
  }));

  // Line 2: role (italic left) + date (italic right)
  paras.push(new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: TAB_RIGHT }],
    spacing: { after: 0, line: 240 },
    children: [
      gar(role, { italic: true }),
      ...(dateRange ? [gar('\t'), gar(dateRange, { italic: true })] : []),
    ],
  }));

  // Bullets
  const bullets = splitBullets(description);
  bullets.forEach((b) => paras.push(bulletPara(b)));

  return paras;
}

// ── Section builders ───────────────────────────────────────────

function buildPersonalExperienceSection(experience: ParsedResumeExperience[]): Paragraph[] {
  if (experience.length === 0) return [];
  const paras: Paragraph[] = [sectionHeader('EXPERIENCE')];
  experience.forEach((exp, idx) => {
    paras.push(...buildEntryParas(exp.company, exp.location, exp.title, exp.start_date, exp.end_date, exp.description, idx === 0));
  });
  return paras;
}

function buildPersonalActivitiesSection(activities: ParsedResumeActivity[]): Paragraph[] {
  if (activities.length === 0) return [];
  const paras: Paragraph[] = [sectionHeader('LEADERSHIP & INVOLVEMENT')];
  activities.forEach((act, idx) => {
    paras.push(...buildEntryParas(act.organization, null, act.role, act.start_date, act.end_date, act.description, idx === 0));
  });
  return paras;
}

function buildPersonalProjectsSection(projects: ParsedResumeProject[]): Paragraph[] {
  if (projects.length === 0) return [];
  const paras: Paragraph[] = [sectionHeader('PROJECTS')];
  projects.forEach((proj, idx) => {
    // Line 1: project name (bold) [+ url right-aligned]
    paras.push(new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: TAB_RIGHT }],
      spacing: { after: 0, before: idx === 0 ? 0 : 60, line: 240 },
      children: [
        gar(proj.name, { bold: true }),
        ...(proj.url ? [gar('\t'), gar(proj.url, { italic: true, size: SIZE_BODY })] : []),
      ],
    }));
    // Bullets from description
    splitBullets(proj.description).forEach(b => paras.push(bulletPara(b)));
  });
  return paras;
}

/**
 * BUG 8 fix: skills line is CENTER-aligned.
 */
function buildPersonalSkillsSection(
  skills: string[],
  languages: string[],
  certifications: ParsedResumeCertification[]
): Paragraph[] {
  const allItems = [
    ...skills,
    ...languages,
    ...certifications.map((c) => c.name),
  ].filter(Boolean);

  if (allItems.length === 0) return [];

  return [
    sectionHeader('SKILLS & INTERESTS'),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 0, line: 240 },
      children: [gar(allItems.join(' | '))],
    }),
  ];
}

// ── Main export function ───────────────────────────────────────

export async function generatePersonalDocx(data: ParsedResume, fileName: string): Promise<void> {
  const contactParts = [data.email, data.phone, data.linkedin, data.website].filter(Boolean);
  const contactText = contactParts.join(' | ');

  const children: Paragraph[] = [
    namePara(data.full_name || 'YOUR NAME'),
    // BUG 6: thick rule is the bottom border of contactPara — no separate thickRulePara
    ...(contactText ? [contactPara(contactText)] : []),

    ...buildPersonalEducationSection(data.education ?? []),
    ...buildPersonalExperienceSection(data.experience ?? []),
    ...buildPersonalActivitiesSection(data.activities ?? []),
    ...buildPersonalProjectsSection(data.projects ?? []),
    ...buildPersonalSkillsSection(data.skills ?? [], data.languages ?? [], data.certifications ?? []),
  ];

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'personal-bullets',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '\u2022',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: 360, hanging: 360 },
                  spacing: { after: 0, line: 240 },
                },
                // BUG 3 fix: Arial ascii/hAnsi only, 8pt (sz=16)
                run: {
                  font: { name: 'Arial' } as any,
                  size: 16,
                },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            // BUG 4 fix: right=692, top=160, bottom=400
            margin: {
              top: MARGIN_TOP,
              bottom: MARGIN_BOTTOM,
              left: MARGIN_LEFT,
              right: MARGIN_RIGHT,
            },
            size: {
              width: 12240,
              height: 15840,
            },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName.replace(/[^a-z0-9_\- ]/gi, '_')}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

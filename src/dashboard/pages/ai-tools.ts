/**
 * AI Tools Landing Page
 *
 * Shows three tool cards: Review (active), Rewrite and Tailor (coming soon).
 * Clicking Review navigates to #ai-tools/review.
 */

import type { User } from '@supabase/supabase-js';

export async function renderAiTools(container: HTMLElement, _user: User): Promise<void> {
  container.innerHTML = `
    <div class="ai-tools-page">
      <div class="dash-header">
        <h1 class="dash-greeting">AI Tools</h1>
        <p class="dash-subtitle">Intelligent features to maximize your resume's impact.</p>
      </div>

      <div class="ai-tools-grid">

        <!-- Review — active -->
        <div class="ai-tool-card" id="tool-review" role="button" tabindex="0">
          <div class="ai-tool-card-icon review">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              <line x1="11" y1="8" x2="11" y2="14"/>
              <line x1="8" y1="11" x2="14" y2="11"/>
            </svg>
          </div>
          <div class="ai-tool-card-body">
            <h3 class="ai-tool-card-title">Resume Review</h3>
            <p class="ai-tool-card-desc">Get an AI-powered score and detailed feedback across 6 categories — content, ATS keywords, action verbs, and more.</p>
          </div>
          <div class="ai-tool-card-arrow">
            <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
              <path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/>
            </svg>
          </div>
        </div>

        <!-- Rewrite — active -->
        <div class="ai-tool-card" id="tool-rewrite" role="button" tabindex="0">
          <div class="ai-tool-card-icon rewrite">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </div>
          <div class="ai-tool-card-body">
            <h3 class="ai-tool-card-title">AI Rewrite</h3>
            <p class="ai-tool-card-desc">Let AI rewrite and strengthen your resume sections — better bullet points, stronger language, higher impact.</p>
          </div>
          <div class="ai-tool-card-arrow">
            <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
              <path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/>
            </svg>
          </div>
        </div>

        <!-- Tailor — active -->
        <div class="ai-tool-card" id="tool-tailor" role="button" tabindex="0">
          <div class="ai-tool-card-icon tailor">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </div>
          <div class="ai-tool-card-body">
            <h3 class="ai-tool-card-title">Tailor for Job</h3>
            <p class="ai-tool-card-desc">Paste a job description and let AI customize your resume to match — optimized keywords, reordered sections.</p>
          </div>
          <div class="ai-tool-card-arrow">
            <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
              <path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/>
            </svg>
          </div>
        </div>

      </div>
    </div>
  `;

  const reviewCard = container.querySelector<HTMLElement>('#tool-review')!;
  reviewCard.addEventListener('click', () => { window.location.hash = 'ai-tools/review'; });
  reviewCard.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') window.location.hash = 'ai-tools/review';
  });

  const rewriteCard = container.querySelector<HTMLElement>('#tool-rewrite')!;
  rewriteCard.addEventListener('click', () => { window.location.hash = 'ai-tools/rewrite'; });
  rewriteCard.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') window.location.hash = 'ai-tools/rewrite';
  });

  const tailorCard = container.querySelector<HTMLElement>('#tool-tailor')!;
  tailorCard.addEventListener('click', () => { window.location.hash = 'ai-tools/tailor'; });
  tailorCard.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') window.location.hash = 'ai-tools/tailor';
  });
}

/**
 * Dashboard Entry Point
 *
 * - Auth guard: redirects to / if not logged in
 * - Hash-based router: #home, #resumes, #ai-tools, #ai-tools/review, #settings, #help, #upload
 * - Sub-route support: hash is split on '/' — top-level maps to sidebar PageId, suffix is subRoute
 * - Bootstraps sidebar and loads the initial page
 */

import { getSession, onAuthStateChange } from '../lib/supabase/auth';
import { initSidebar } from './sidebar';
import { renderHome } from './pages/home';
import { renderUpload } from './pages/upload';
import { renderAiTools } from './pages/ai-tools';
import { renderAiReview } from './pages/ai-review';
import { renderAiRewrite } from './pages/ai-rewrite';
import { renderAiTailor } from './pages/ai-tailor';
import { renderPlaceholder } from './pages/placeholders';
import type { User } from '@supabase/supabase-js';

// ── Page map ──────────────────────────────────────────────────
type PageId = 'home' | 'resumes' | 'ai-tools' | 'settings' | 'help' | 'upload';

const PAGE_TITLES: Record<PageId, string> = {
  'home':      'Dashboard',
  'resumes':   'My Resumes',
  'ai-tools':  'AI Tools',
  'settings':  'Settings',
  'help':      'Help & FAQ',
  'upload':    'Upload Resume',
};

// ── Global current user (set after auth check) ────────────────
export let currentUser: User | null = null;

// ── Router ───────────────────────────────────────────────────

function parseHash(): { pageId: PageId; subRoute: string | null } {
  const raw = window.location.hash.replace('#', '');
  const [page, ...rest] = raw.split('/');
  const subRoute = rest.length > 0 ? rest.join('/') : null;
  const pageId = Object.keys(PAGE_TITLES).includes(page) ? page as PageId : 'home';
  return { pageId, subRoute };
}

function getPageTitle(pageId: PageId, subRoute: string | null): string {
  if (pageId === 'ai-tools') {
    if (subRoute === 'review') return 'AI Review';
    if (subRoute === 'rewrite') return 'AI Rewrite';
    if (subRoute === 'tailor') return 'AI Tailor';
    return 'AI Tools';
  }
  return PAGE_TITLES[pageId];
}

async function navigate(pageId: PageId, subRoute: string | null = null): Promise<void> {
  // Update URL hash without triggering a reload
  window.location.hash = subRoute ? `${pageId}/${subRoute}` : pageId;

  // Update sidebar active state (uses top-level pageId only)
  document.querySelectorAll<HTMLElement>('.sidebar-link').forEach((link) => {
    const linkPage = link.dataset.page as PageId;
    link.classList.toggle('active', linkPage === pageId);
  });

  // Update page title
  document.title = `${getPageTitle(pageId, subRoute)} — RexumeAI`;

  // Render the page
  const container = document.getElementById('page-container')!;
  container.innerHTML = '';
  container.style.opacity = '0';

  if (pageId === 'home') {
    await renderHome(container, currentUser!);
  } else if (pageId === 'upload') {
    await renderUpload(container, currentUser!);
  } else if (pageId === 'ai-tools') {
    if (subRoute === 'review') {
      await renderAiReview(container, currentUser!);
    } else if (subRoute === 'rewrite') {
      await renderAiRewrite(container, currentUser!);
    } else if (subRoute === 'tailor') {
      await renderAiTailor(container, currentUser!);
    } else {
      await renderAiTools(container, currentUser!);
    }
  } else {
    renderPlaceholder(container, pageId);
  }

  // Fade in
  requestAnimationFrame(() => {
    container.style.transition = 'opacity 0.2s ease';
    container.style.opacity = '1';
  });

  // Close mobile sidebar if open
  const sidebar = document.getElementById('sidebar')!;
  const overlay = document.getElementById('sidebar-overlay')!;
  sidebar.classList.remove('mobile-open');
  overlay.classList.remove('visible');
}

// ── Init ─────────────────────────────────────────────────────
async function init(): Promise<void> {
  const authLoading = document.getElementById('auth-loading')!;
  const app = document.getElementById('app')!;

  // 1. Check auth
  const { session, error } = await getSession();

  if (error || !session) {
    window.location.href = '/';
    return;
  }

  currentUser = session.user;

  // 2. Hide loading screen, show app
  authLoading.style.display = 'none';
  app.style.display = 'flex';

  // 3. Sidebar — pass navigate wrapped to accept a plain string (sidebar only knows top-level pages)
  initSidebar((page: string) => navigate(page as PageId));

  // 4. Route to current hash
  const { pageId, subRoute } = parseHash();
  await navigate(pageId, subRoute);

  // 5. Listen for hash changes (browser back/forward)
  window.addEventListener('hashchange', async () => {
    const { pageId: pid, subRoute: sub } = parseHash();
    await navigate(pid, sub);
  });

  // 6. React to auth sign-out globally
  onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      window.location.href = '/';
    }
  });
}

// Run
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

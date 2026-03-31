/**
 * Sidebar
 *
 * Handles:
 * - Expand/collapse toggle (desktop)
 * - Mobile open/close via overlay
 * - Navigation link clicks → router
 */

type NavigateFn = (page: string) => void;

export function initSidebar(navigate: NavigateFn): void {
  const sidebar    = document.getElementById('sidebar')!;
  const appShell   = document.querySelector<HTMLElement>('.app-shell')!;
  const toggle     = document.getElementById('sidebar-toggle')!;
  const overlay    = document.getElementById('sidebar-overlay')!;
  const mobileBtn  = document.getElementById('mobile-menu-btn')!;
  const logoutBtn  = document.getElementById('logout-btn')!;

  // ── Restore collapsed state from localStorage ──────────────
  const wasCollapsed = localStorage.getItem('sidebar-collapsed') === 'true';
  if (wasCollapsed) {
    sidebar.classList.add('collapsed');
    appShell.classList.add('sidebar-collapsed');
  }

  // ── Desktop collapse toggle ─────────────────────────────────
  toggle.addEventListener('click', () => {
    const isCollapsed = sidebar.classList.toggle('collapsed');
    appShell.classList.toggle('sidebar-collapsed', isCollapsed);
    localStorage.setItem('sidebar-collapsed', String(isCollapsed));
  });

  // ── Mobile hamburger ────────────────────────────────────────
  mobileBtn.addEventListener('click', () => {
    sidebar.classList.add('mobile-open');
    overlay.classList.add('visible');
  });

  // Close on overlay click
  overlay.addEventListener('click', () => {
    sidebar.classList.remove('mobile-open');
    overlay.classList.remove('visible');
  });

  // ── Nav link clicks ─────────────────────────────────────────
  document.querySelectorAll<HTMLElement>('.sidebar-link').forEach((link) => {
    const page = link.dataset.page;
    if (!page) return;

    // Add tooltip text for collapsed state
    const label = link.querySelector<HTMLElement>('.sidebar-label')?.textContent ?? '';
    link.setAttribute('data-tooltip', label);

    link.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(page);
    });
  });

  // ── Logout ──────────────────────────────────────────────────
  logoutBtn.addEventListener('click', async () => {
    const { signOut } = await import('../lib/supabase/auth');
    logoutBtn.style.opacity = '0.5';
    await signOut();
    // onAuthStateChange in index.ts will redirect to /
  });
}

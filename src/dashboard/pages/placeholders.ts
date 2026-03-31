/**
 * Placeholder pages for sidebar routes that are not yet built.
 * Each page shows a "Coming Soon" state with the right icon and label.
 */

type PageId = 'resumes' | 'ai-tools' | 'settings' | 'help';

interface PageConfig {
  icon: string;
  title: string;
  description: string;
}

const PAGES: Record<PageId, PageConfig> = {
  'resumes': {
    icon: '📄',
    title: 'My Resumes',
    description: 'Upload, manage, and organize all your resumes in one place. Coming soon.',
  },
  'ai-tools': {
    icon: '✨',
    title: 'AI Tools',
    description: 'AI-powered resume review, rewriting, and job tailoring. Coming soon.',
  },
  'settings': {
    icon: '⚙️',
    title: 'Profile & Settings',
    description: 'Manage your account details, preferences, and billing. Coming soon.',
  },
  'help': {
    icon: '❓',
    title: 'Help & FAQ',
    description: 'Guides, frequently asked questions, and support resources. Coming soon.',
  },
};

export function renderPlaceholder(container: HTMLElement, pageId: string): void {
  const config = PAGES[pageId as PageId];

  if (!config) {
    container.innerHTML = `
      <div class="placeholder-page">
        <div class="placeholder-icon">🤔</div>
        <h2>Page Not Found</h2>
        <p>This page doesn't exist.</p>
        <a href="#" class="back-link" data-page="home">← Back to Dashboard</a>
      </div>
    `;
  } else {
    container.innerHTML = `
      <div class="placeholder-page">
        <div class="placeholder-icon">${config.icon}</div>
        <span class="placeholder-badge">Coming Soon</span>
        <h2>${config.title}</h2>
        <p>${config.description}</p>
        <a href="#" class="back-link" data-page="home">← Back to Dashboard</a>
      </div>
    `;
  }

  container.querySelector<HTMLElement>('[data-page="home"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.hash = 'home';
  });
}

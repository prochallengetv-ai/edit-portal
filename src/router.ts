type RouteCallback = (viewId: string) => void;

class AppRouter {
  private routes: Record<string, string> = {
    '/': 'home',
    '/beat-marker': 'app',
    '/audio-studio': 'audio-studio',
    '/quality-boost': 'quality-boost',
    '/slow-mo': 'slow-mo',
    '/ae-converter': 'aep',
    '/expressions': 'expressions',
    '/privacy': 'privacy',
    '/terms': 'terms',
  };

  private listeners: RouteCallback[] = [];

  constructor() {
    window.addEventListener('popstate', () => this.handleRoute());
    document.addEventListener('click', (e) => this.interceptLinks(e));
  }

  public init() {
    this.handleRoute();
  }

  public onNavigate(cb: RouteCallback) {
    this.listeners.push(cb);
  }

  public navigate(path: string, scrollTarget?: string) {
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
    this.handleRoute(scrollTarget);
  }

  private handleRoute(scrollTarget?: string) {
    const rawPath = window.location.pathname.replace(/\/$/, '') || '/';
    let targetView = this.routes[rawPath] || 'notfound';

    // If path is root or has hash
    if (rawPath === '/' || rawPath === '') {
      targetView = 'home';
    }

    this.showView(targetView, scrollTarget);
    this.listeners.forEach((cb) => cb(targetView));
  }

  private showView(viewId: string, scrollTarget?: string) {
    const views = document.querySelectorAll('.spa-view');
    views.forEach((v) => {
      if (v.id === viewId) {
        v.classList.remove('hidden');
      } else {
        v.classList.add('hidden');
      }
    });

    window.scrollTo(0, 0);

    if (viewId === 'home' && scrollTarget) {
      setTimeout(() => {
        const el = document.getElementById(scrollTarget);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    }
  }

  private interceptLinks(e: MouseEvent) {
    const target = (e.target as HTMLElement).closest('a[href], button[data-tool], .back-home') as HTMLElement;
    if (!target) return;

    // Handle .back-home
    if (target.classList.contains('back-home')) {
      e.preventDefault();
      // Stop all playing audio/video
      this.stopMediaPlayback();
      this.navigate('/', 'tools');
      return;
    }

    // Handle data-tool buttons / cards
    const tool = target.getAttribute('data-tool');
    if (tool) {
      e.preventDefault();
      this.stopMediaPlayback();
      this.navigate('/' + tool);
      return;
    }

    // Handle anchor links
    const href = target.getAttribute('href');
    if (href) {
      if (href.startsWith('#')) {
        // internal section scroll
        return;
      }
      if (href.startsWith('/') && !href.startsWith('//')) {
        e.preventDefault();
        this.stopMediaPlayback();
        this.navigate(href);
      }
    }
  }

  private stopMediaPlayback() {
    // Pause any active HTMLMediaElement
    document.querySelectorAll('audio, video').forEach((m) => {
      try {
        (m as HTMLMediaElement).pause();
      } catch (err) {}
    });
  }
}

export const router = new AppRouter();

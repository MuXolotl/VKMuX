/**
 * VKMuX Site
 *
 * Download links: static releases.json (auto-updated by CI).
 * Download count: GitHub API, 1-hour cache.
 * Fallback: buttons point to /releases page if JSON unavailable.
 */

/* =========================================
 * Constants
 * ========================================= */

const GITHUB_REPO = 'MuXolotl/VKMuX';
const DOWNLOADS_CACHE_KEY = 'vkmux_dl_count';
const DOWNLOADS_CACHE_TTL = 60 * 60 * 1000; // 1 hour

/* =========================================
 * Path helpers
 * ========================================= */

/** Absolute base URL of the current page (works from any hosting). */
function siteBase() {
  const u = new URL(document.baseURI);
  u.pathname = u.pathname.replace(/[^/]*$/, ''); // strip filename
  return u.href;
}

/* =========================================
 * Download Links — releases.json
 * ========================================= */

async function loadReleaseData() {
  const releaseUrl = siteBase() + 'releases.json';

  try {
    const res = await fetch(releaseUrl, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Version tags
    if (data.version) {
      document.querySelectorAll('.version-tag').forEach((el) => {
        el.textContent = String(data.version).replace(/^v/i, '');
      });
    }

    // Asset links
    if (data.assets) {
      document.querySelectorAll('[data-download]').forEach((el) => {
        const url = data.assets[el.dataset.download];
        if (url) {
          el.href = url;
          el.setAttribute('data-ready', 'true');
        }
      });
    }
  } catch {
    // file:// or network error — buttons keep fallback href to /releases
  }
}

/* =========================================
 * Download Count — GitHub API
 * ========================================= */

async function loadDownloadCount() {
  const el = document.getElementById('downloadCount');
  if (!el) return;

  // Try cache first
  try {
    const raw = localStorage.getItem(DOWNLOADS_CACHE_KEY);
    if (raw) {
      const { timestamp, count } = JSON.parse(raw);
      if (Date.now() - Number(timestamp) < DOWNLOADS_CACHE_TTL && count != null) {
        el.textContent = count.toLocaleString('ru-RU');
        el.closest('[data-count-wrap]')?.removeAttribute('hidden');
        return;
      }
    }
  } catch { /* ignore */ }

  // Fetch from GitHub API
  try {
    const relRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=100`,
      { headers: { Accept: 'application/vnd.github+json' } }
    );

    if (!relRes.ok) {
      // Rate limited — try stale cache
      const raw = localStorage.getItem(DOWNLOADS_CACHE_KEY);
      if (raw) {
        const { count } = JSON.parse(raw);
        if (count != null) {
          el.textContent = count.toLocaleString('ru-RU');
          el.closest('[data-count-wrap]')?.removeAttribute('hidden');
        }
      }
      return;
    }

    const releases = await relRes.json();
    let total = 0;
    if (Array.isArray(releases)) {
      for (const rel of releases) {
        if (Array.isArray(rel.assets)) {
          for (const asset of rel.assets) {
            total += asset.download_count || 0;
          }
        }
      }
    }

    localStorage.setItem(
      DOWNLOADS_CACHE_KEY,
      JSON.stringify({ timestamp: Date.now(), count: total })
    );

    if (total > 0) {
      el.textContent = total.toLocaleString('ru-RU');
      el.closest('[data-count-wrap]')?.removeAttribute('hidden');
    }
  } catch {
    // Network error — silently ignore
  }
}

/* =========================================
 * OS Detection & Download Tabs
 * ========================================= */

function initOSSelector() {
  const buttons = document.querySelectorAll('.os-btn');
  const panels = document.querySelectorAll('.download-panel');
  if (buttons.length === 0) return;

  function selectOS(os) {
    buttons.forEach((b) => b.classList.remove('active'));
    panels.forEach((p) => p.classList.add('hidden'));

    const activeBtn = document.querySelector(`[data-os="${os}"]`);
    const activePanel = document.getElementById(`download-${os}`);

    if (activeBtn) activeBtn.classList.add('active');
    if (activePanel) activePanel.classList.remove('hidden');
  }

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => selectOS(btn.dataset.os));
  });

  const ua = navigator.userAgent.toLowerCase();
  const platform = navigator.platform?.toLowerCase() || '';

  if (ua.includes('mac') || platform.includes('mac')) {
    selectOS('macos-arm64');
  } else if (ua.includes('linux') || platform.includes('linux')) {
    selectOS('linux');
  } else {
    selectOS('windows');
  }
}

/* =========================================
 * Mobile Menu
 * ========================================= */

function initMobileMenu() {
  const btn = document.getElementById('mobileMenuBtn');
  const menu = document.getElementById('mobileMenu');
  if (!btn || !menu) return;

  btn.addEventListener('click', () => menu.classList.toggle('hidden'));
  menu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => menu.classList.add('hidden'));
  });
}

/* =========================================
 * Smooth Scroll
 * ========================================= */

function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', function (e) {
      const href = this.getAttribute('href');
      if (!href) return;
      const target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth' });
    });
  });
}

/* =========================================
 * Scroll Reveal Animations
 * ========================================= */

function initScrollReveal() {
  const sections = document.querySelectorAll('section');
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add('visible');
      });
    },
    { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
  );

  sections.forEach((section) => {
    section.classList.add('js-reveal');
    observer.observe(section);
  });
}

/* =========================================
 * Navbar Background on Scroll
 * ========================================= */

function initNavbarScroll() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;

  function update() {
    navbar.style.borderBottomColor =
      window.scrollY > 20
        ? 'rgba(255, 255, 255, 0.08)'
        : 'rgba(255, 255, 255, 0.04)';
  }

  window.addEventListener('scroll', update, { passive: true });
  update();
}

/* =========================================
 * Init
 * ========================================= */

document.addEventListener('DOMContentLoaded', () => {
  initMobileMenu();
  initSmoothScroll();
  initScrollReveal();
  initNavbarScroll();
  initOSSelector();
  loadReleaseData();
  loadDownloadCount();
});

/**
 * MuX Site
 *
 * Ссылки на скачивание: статический releases.json (обновляется CI при релизе).
 * Счётчик загрузок и размеры файлов: GitHub API, кэш на 1 час в localStorage.
 * Fallback: кнопки ведут на страницу релизов, если JSON недоступен.
 */

/* =========================================
 * Конфигурация
 * ========================================= */

// Репозиторий. После переименования репозитория достаточно поменять slug здесь
// (старые ссылки GitHub автоматически редиректит).
const GITHUB_REPO = 'MuXolotl/VKMuX';
const GITHUB_RELEASES_URL = 'https://github.com/' + GITHUB_REPO + '/releases';

const STATS_CACHE_KEY = 'mux_dl_stats';
const STATS_CACHE_TTL = 60 * 60 * 1000; // 1 час

const OS_NAMES = {
  'windows': 'Windows',
  'macos-arm64': 'macOS',
  'macos-intel': 'macOS (Intel)',
  'linux': 'Linux',
};

/* =========================================
 * Утилиты
 * ========================================= */

/** Базовый URL текущей страницы (работает с любого хостинга). */
function siteBase() {
  const u = new URL(document.baseURI);
  u.pathname = u.pathname.replace(/[^/]*$/, '');
  return u.href;
}

/** Человекочитаемый размер файла. */
function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes >= 1024 ** 2) {
    return (bytes / 1024 ** 2).toFixed(1).replace('.', ',') + ' МБ';
  }
  return Math.round(bytes / 1024) + ' КБ';
}

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* =========================================
 * releases.json — версии и ссылки
 * ========================================= */

let releaseAssets = null;

async function loadReleaseData() {
  try {
    const res = await fetch(siteBase() + 'releases.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    if (data.version) {
      const version = String(data.version).replace(/^v/i, '');
      document.querySelectorAll('.version-tag').forEach((el) => {
        el.textContent = version;
      });
    }

    if (data.assets) {
      releaseAssets = data.assets;
      document.querySelectorAll('[data-download]').forEach((el) => {
        const url = data.assets[el.dataset.download];
        if (url) {
          el.href = url;
          el.setAttribute('data-ready', 'true');
        }
      });
    }
  } catch {
    // file:// или ошибка сети — кнопки остаются с fallback-ссылкой на /releases
  }
}

/* =========================================
 * GitHub API — счётчик загрузок и размеры
 * ========================================= */

async function fetchStats() {
  // 1. Кэш
  try {
    const raw = localStorage.getItem(STATS_CACHE_KEY);
    if (raw) {
      const { timestamp, count, sizes } = JSON.parse(raw);
      if (Date.now() - Number(timestamp) < STATS_CACHE_TTL) {
        return { count, sizes, fresh: true };
      }
    }
  } catch { /* ignore */ }

  // 2. Запрос к API
  try {
    const res = await fetch(
      'https://api.github.com/repos/' + GITHUB_REPO + '/releases?per_page=100',
      { headers: { Accept: 'application/vnd.github+json' } }
    );
    if (!res.ok) throw new Error('HTTP ' + res.status);

    const releases = await res.json();
    let count = 0;
    const sizes = {};

    if (Array.isArray(releases)) {
      for (const rel of releases) {
        if (!Array.isArray(rel.assets)) continue;
        for (const asset of rel.assets) {
          count += asset.download_count || 0;
          if (asset.browser_download_url && asset.size) {
            sizes[asset.browser_download_url] = asset.size;
          }
        }
      }
    }

    try {
      localStorage.setItem(
        STATS_CACHE_KEY,
        JSON.stringify({ timestamp: Date.now(), count, sizes })
      );
    } catch { /* ignore */ }

    return { count, sizes, fresh: true };
  } catch {
    // Лимит API или ошибка сети — попробуем устаревший кэш
    try {
      const raw = localStorage.getItem(STATS_CACHE_KEY);
      if (raw) {
        const { count, sizes } = JSON.parse(raw);
        return { count, sizes, fresh: false };
      }
    } catch { /* ignore */ }
    return null;
  }
}

async function initStats() {
  const hasCounter = !!document.getElementById('downloadCount');
  const sizeEls = document.querySelectorAll('[data-size-for]');
  const needsReleaseData =
    document.querySelectorAll('.version-tag, [data-download]').length > 0;
  if (!hasCounter && sizeEls.length === 0 && !needsReleaseData) return;

  if (needsReleaseData) {
    await loadReleaseData();
  }
  if (!hasCounter && sizeEls.length === 0) return;

  const stats = await fetchStats();

  if (stats && hasCounter && stats.count > 0) {
    const el = document.getElementById('downloadCount');
    el.textContent = Number(stats.count).toLocaleString('ru-RU');
    el.closest('[data-count-wrap]')?.removeAttribute('hidden');
  }

  if (stats && sizeEls.length) {
    sizeEls.forEach((el) => {
      const key = el.dataset.sizeFor;
      const url = releaseAssets?.[key];
      const size = url ? stats.sizes[url] : null;
      const text = formatSize(size);
      if (text) el.textContent = text;
    });
  }
}

/* =========================================
 * Выбор ОС (табы)
 * ========================================= */

function initOSSelector() {
  const buttons = Array.from(document.querySelectorAll('.os-btn'));
  const hint = document.getElementById('osHint');
  if (buttons.length === 0) return;

  function selectOS(os, manual = false) {
    buttons.forEach((b) => {
      const active = b.dataset.os === os;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
      b.setAttribute('tabindex', active ? '0' : '-1');
    });

    document.querySelectorAll('.download-panel').forEach((p) => {
      p.hidden = p.id !== 'download-' + os;
    });

    if (hint) {
      const name = OS_NAMES[os] || os;
      hint.innerHTML = '';
      hint.append(
        manual ? 'Вы выбрали: ' : 'Похоже, вы используете ',
        Object.assign(document.createElement('b'), { textContent: name })
      );
    }
  }

  buttons.forEach((btn, i) => {
    btn.addEventListener('click', () => selectOS(btn.dataset.os, true));
    btn.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const next = (i + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus();
      buttons[next].click();
    });
  });

  // Автоопределение
  const ua = navigator.userAgent.toLowerCase();
  const platform = (navigator.platform || '').toLowerCase();
  const uaData = navigator.userAgentData?.platform?.toLowerCase() || '';

  if (ua.includes('mac') || platform.includes('mac')) {
    selectOS('macos-arm64');
  } else if (ua.includes('linux') || platform.includes('linux') || uaData.includes('linux')) {
    selectOS('linux');
  } else {
    selectOS('windows');
  }
}

/* =========================================
 * Мобильное меню
 * ========================================= */

function initMobileMenu() {
  const btn = document.getElementById('mobileMenuBtn');
  const menu = document.getElementById('mobileMenu');
  if (!btn || !menu) return;

  function close() {
    menu.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', 'Открыть меню');
  }

  btn.addEventListener('click', () => {
    const open = menu.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
  });

  menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', close));

  document.addEventListener('click', (e) => {
    if (menu.classList.contains('open') && !menu.contains(e.target) && !btn.contains(e.target)) {
      close();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth >= 900) close();
  });
}

/* =========================================
 * Плавный скролл по якорям
 * ========================================= */

function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', function (e) {
      const href = this.getAttribute('href');
      if (!href || href === '#') return;
      const target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });
      history.replaceState(null, '', href);
    });
  });
}

/* =========================================
 * Появление секций при скролле
 * ========================================= */

function initScrollReveal() {
  const items = document.querySelectorAll('.reveal');
  if (items.length === 0) return;

  if (prefersReducedMotion || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('visible'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08, rootMargin: '0px 0px -32px 0px' }
  );

  items.forEach((el) => observer.observe(el));
}

/* =========================================
 * Навигация: фон при скролле
 * ========================================= */

function initNavbarScroll() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;

  let ticking = false;
  function update() {
    navbar.classList.toggle('scrolled', window.scrollY > 16);
    ticking = false;
  }

  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    },
    { passive: true }
  );
  update();
}

/* =========================================
 * Копирование команд
 * ========================================= */

function initCopyButtons() {
  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const block = btn.closest('.code-block');
      const code = block?.querySelector('code');
      if (!code) return;

      const text = code.textContent;
      let ok = false;
      try {
        await navigator.clipboard.writeText(text);
        ok = true;
      } catch {
        // Fallback для старых браузеров / file://
        try {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          ok = document.execCommand('copy');
          ta.remove();
        } catch { /* ignore */ }
      }

      if (ok) {
        const original = btn.textContent;
        btn.textContent = 'Скопировано ✓';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = original;
          btn.classList.remove('copied');
        }, 1800);
      }
    });
  });
}

/* =========================================
 * Год в подвале
 * ========================================= */

function initYear() {
  document.querySelectorAll('.js-year').forEach((el) => {
    el.textContent = String(new Date().getFullYear());
  });
}

/* =========================================
 * Инициализация
 * ========================================= */

document.addEventListener('DOMContentLoaded', () => {
  initMobileMenu();
  initSmoothScroll();
  initScrollReveal();
  initNavbarScroll();
  initOSSelector();
  initCopyButtons();
  initYear();
  initStats();
});

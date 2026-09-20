import {
  fetchRelease,
  formatSize,
  downloadFallback,
  selectDownload,
  type ReleaseInfo,
} from '../lib/release.mjs';

document.documentElement.classList.add('is-enhanced');
const data = JSON.parse(document.getElementById('site-data')!.textContent!) as {
  locale: 'zh' | 'en';
  messages: {
    versionLabel: string;
    checking: string;
    latest: string;
    unavailable: string;
    missing: string;
    published: string;
    releasePage: string;
  };
};
const all = <T extends Element = HTMLElement>(selector: string) => [
  ...document.querySelectorAll<T>(selector),
];

const menu = document.querySelector<HTMLButtonElement>('.menu-toggle');
const nav = document.getElementById('nav-links');
const closeMenu = () => {
  menu?.setAttribute('aria-expanded', 'false');
  nav?.classList.remove('is-open');
};
menu?.addEventListener('click', () => {
  const open = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(open));
  nav?.classList.toggle('is-open', open);
});
nav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menu?.getAttribute('aria-expanded') === 'true') {
    closeMenu();
    menu.focus();
  }
});
document.addEventListener('click', (event) => {
  if (!(event.target as Element).closest('.nav')) closeMenu();
});
const mobileNavQuery = matchMedia('(max-width: 620px)');
mobileNavQuery.addEventListener('change', closeMenu);

const tabs = all<HTMLAnchorElement>('[data-scene]');
function selectScene(tab: HTMLAnchorElement, focus = false) {
  for (const item of tabs) {
    const selected = item === tab;
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
    const panel = document.getElementById(item.getAttribute('aria-controls')!);
    if (panel) panel.hidden = !selected;
  }
  if (focus) tab.focus();
}
for (const [index, tab] of tabs.entries()) {
  tab.addEventListener('click', (event) => {
    event.preventDefault();
    selectScene(tab);
    history.replaceState(null, '', tab.hash);
  });
  tab.addEventListener('keydown', (event) => {
    let target = index;
    if (event.key === 'ArrowRight') target = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') target = (index + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = tabs.length - 1;
    else return;
    event.preventDefault();
    selectScene(tabs[target], true);
  });
}
function applyHash() {
  const current = tabs.find((tab) => tab.hash === location.hash);
  if (current) selectScene(current);
}
selectScene(tabs[0]);
applyHash();
window.addEventListener('hashchange', applyHash);
for (const link of all<HTMLAnchorElement>('[data-language]'))
  link.addEventListener('click', () => {
    link.hash = location.hash;
  });

const dialog = document.querySelector<HTMLDialogElement>('#image-dialog')!;
let lastTrigger: HTMLButtonElement | undefined;
for (const button of all<HTMLButtonElement>('[data-expand]'))
  button.addEventListener('click', () => {
    const img = dialog.querySelector('img')!;
    img.src = button.dataset.expand!;
    img.alt = button.dataset.alt!;
    lastTrigger = button;
    dialog.showModal();
    document.body.classList.add('modal-open');
  });
document.querySelector('[data-close-dialog]')?.addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      dialog.close();
  }
});
dialog.addEventListener('close', () => {
  document.body.classList.remove('modal-open');
  lastTrigger?.focus();
});

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
if (!reducedMotion.matches && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries)
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
    },
    { threshold: 0.06, rootMargin: '0px 0px -18px 0px' },
  );
  for (const element of all('.reveal')) {
    if (element.getBoundingClientRect().top > innerHeight) element.classList.add('will-reveal');
    observer.observe(element);
  }
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) {
      observer.disconnect();
      all('.will-reveal').forEach((el) => el.classList.add('is-visible'));
    }
  });
}

// OS detection recommends a platform, but never guesses Mac CPU architecture.
const platform = navigator.userAgent;
const recommended = /Windows NT/i.test(platform)
  ? 'windows'
  : /Macintosh/i.test(platform) && navigator.maxTouchPoints < 2
    ? 'mac'
    : /Linux (?:x86_64|amd64)/i.test(platform) && !/Android|CrOS/i.test(platform)
      ? 'linux'
      : null;
if (recommended)
  document
    .querySelector(`[data-platform-card="${recommended}"]`)
    ?.setAttribute('data-recommended', 'true');

function applyRelease(release: ReleaseInfo | null) {
  all('[data-version]').forEach(
    (el) => (el.textContent = release ? `v${release.version}` : data.messages.versionLabel),
  );
  all('[data-published]').forEach((el) => {
    el.hidden = !release;
    el.textContent = release
      ? `${data.messages.published} ${release.publishedAt.slice(0, 10)}`
      : '';
  });
  const platformNames = { windows: 'Windows', mac: 'macOS', linux: 'Linux (Ubuntu)' };
  for (const platform of ['windows', 'mac', 'linux'] as const) {
    const asset = release?.assets[platform];
    for (const link of all<HTMLAnchorElement>(`[data-download="${platform}"]`)) {
      link.href = asset?.url ?? downloadFallback(platform);
      link.dataset.available = String(!!asset);
      const label = link.querySelector<HTMLElement>('[data-download-label]');
      if (label) label.textContent = label.dataset.readyLabel!;
      if (!release || asset) link.removeAttribute('aria-label');
      else link.setAttribute('aria-label', `${platformNames[platform]} · ${data.messages.missing}`);
    }
    all(`[data-size="${platform}"]`).forEach(
      (el) => (el.textContent = asset ? formatSize(asset.size) : '—'),
    );
    all(`[data-asset-message="${platform}"]`).forEach((el) => (el.hidden = !release || !!asset));
  }
}
const status = document.querySelector<HTMLElement>('[data-release-status]')!;
const downloadLinks = all<HTMLAnchorElement>('[data-download]');
let pendingRelease: Promise<ReleaseInfo | null> | undefined;

function refreshRelease(): Promise<ReleaseInfo | null> {
  // Share an in-flight lookup, including clicks before the initial lookup finishes.
  if (pendingRelease) return pendingRelease;
  // Never leave a previously resolved installer available after a failed refresh.
  applyRelease(null);
  status.textContent = data.messages.checking;
  status.parentElement!.dataset.state = 'checking';
  downloadLinks.forEach((link) => link.setAttribute('aria-busy', 'true'));
  pendingRelease = fetchRelease()
    .then((release) => {
      applyRelease(release);
      status.textContent = `${data.messages.latest} · v${release.version}`;
      status.parentElement!.dataset.state = 'ready';
      return release;
    })
    .catch(() => {
      status.textContent = data.messages.unavailable;
      status.parentElement!.dataset.state = 'error';
      return null;
    })
    .finally(() => {
      pendingRelease = undefined;
      downloadLinks.forEach((link) => link.removeAttribute('aria-busy'));
    });
  return pendingRelease;
}

let downloadPending = false;
for (const link of downloadLinks)
  link.addEventListener('click', async (event) => {
    // Preserve native open-in-new-tab behavior for modified clicks.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    if (downloadPending) return;
    downloadPending = true;
    try {
      const release = await refreshRelease();
      const platform = link.dataset.download as keyof ReleaseInfo['assets'];
      const asset = release?.assets[platform];
      window.location.assign(asset ? await selectDownload(asset) : downloadFallback(platform));
    } finally {
      downloadPending = false;
    }
  });

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void refreshRelease();
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) void refreshRelease();
});
void refreshRelease();

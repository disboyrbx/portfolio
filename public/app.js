const revealItems = document.querySelectorAll('[data-reveal]');
const toggle = document.querySelector('[data-theme-toggle]');
const subscriberEl = document.querySelector('[data-stat="subscribers"]');
const videosEl = document.querySelector('[data-stat="videos"]');
const viewsEl = document.querySelector('[data-stat="views"]');
const channelIdEl = document.querySelector('[data-stat="channelId"]');
const updatedEl = document.querySelector('[data-stat="updated"]');
const avatarEl = document.querySelector('[data-avatar]');
const tickerEl = document.querySelector('[data-ticker]');

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
      }
    });
  },
  { threshold: 0.2 }
);

revealItems.forEach((item, index) => {
  item.style.transitionDelay = `${index * 90}ms`;
  observer.observe(item);
});

const applyTheme = (mode) => {
  document.body.dataset.theme = mode;
  if (toggle) {
    toggle.setAttribute('aria-pressed', mode === 'dark');
    toggle.textContent = mode === 'dark' ? 'Light' : 'Dark';
  }
};

if (toggle) {
  const stored = localStorage.getItem('theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initial = stored || (prefersDark ? 'dark' : 'light');

  applyTheme(initial);

  toggle.addEventListener('click', () => {
    const next = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', next);
    applyTheme(next);
  });
} else {
  applyTheme('light');
}

const formatCount = (value, fallbackText = null) => {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value.toLocaleString('ja-JP');
  }
  if (fallbackText) {
    const cleaned = fallbackText
      .replace('チャンネル登録者数', '')
      .replace('登録者数', '')
      .replace('回視聴', '')
      .replace('視聴回数', '')
      .trim();
    if (cleaned) {
      return cleaned;
    }
  }
  return '-';
};

const formatUpdated = (timestamp) => {
  if (!timestamp) {
    return '-';
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  const pad = (num) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
};

const applyChannelData = (data) => {
  if (subscriberEl) {
    subscriberEl.textContent = formatCount(data.subscriberCount, data.subscriberText);
  }
  if (videosEl && data.videoCount !== undefined) {
    videosEl.textContent = formatCount(data.videoCount);
  }
  if (viewsEl && data.viewCount !== undefined) {
    viewsEl.textContent = formatCount(data.viewCount, data.viewText);
  }
  if (channelIdEl) {
    channelIdEl.textContent = data.channelId || '-';
  }
  if (updatedEl) {
    updatedEl.textContent = formatUpdated(data.fetchedAt);
  }
  if (avatarEl && data.avatarUrl) {
    avatarEl.style.backgroundImage = `url("${data.avatarUrl}")`;
  }

  if (tickerEl) {
    const parts = [
      data.handle || '@disboyrbx',
      `SUB ${formatCount(data.subscriberCount, data.subscriberText)}`,
      `VID ${formatCount(data.videoCount)}`,
      `VIEWS ${formatCount(data.viewCount, data.viewText)}`,
      `ID ${data.channelId || '-'}`
    ];
    const line = `${parts.join(' · ')} · `;
    tickerEl.textContent = line.repeat(3);
  }
};

const loadChannelData = async () => {
  try {
    const response = await fetch('/api/channel');
    if (!response.ok) {
      return;
    }
    const data = await response.json();
    applyChannelData(data);
  } catch (_err) {
    // Keep placeholders if the request fails.
  }
};

loadChannelData();

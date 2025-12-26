const https = require('https');
const zlib = require('zlib');
const ytch = require('yt-channel-info');

const CHANNEL_HANDLE = process.env.YT_CHANNEL_HANDLE || 'disboyrbx';
const CHANNEL_ID = process.env.YT_CHANNEL_ID || 'UCV0QOJfZgTX1VsGIg8-QNCQ';
const CACHE_TTL_MS = 10 * 60 * 1000;
let cachedChannel = null;
let cachedAt = 0;

const fetchText = (url) =>
  new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0',
            'Accept-Encoding': 'gzip, deflate, br'
          }
        },
        (res) => {
          const chunks = [];
          res.on('data', (chunk) => {
            chunks.push(chunk);
          });
          res.on('end', () => {
            if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
              reject(new Error(`Request failed (${res.statusCode})`));
              return;
            }
            const buffer = Buffer.concat(chunks);
            const encoding = res.headers['content-encoding'];
            try {
              if (encoding === 'gzip') {
                resolve(zlib.gunzipSync(buffer).toString('utf8'));
                return;
              }
              if (encoding === 'br') {
                resolve(zlib.brotliDecompressSync(buffer).toString('utf8'));
                return;
              }
              if (encoding === 'deflate') {
                resolve(zlib.inflateSync(buffer).toString('utf8'));
                return;
              }
            } catch (err) {
              reject(err);
              return;
            }
            resolve(buffer.toString('utf8'));
          });
        }
      )
      .on('error', reject);
  });

const extractJsonObject = (html, marker) => {
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) {
    return null;
  }

  const start = html.indexOf('{', markerIndex);
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < html.length; i += 1) {
    const ch = html[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return html.slice(start, i + 1);
      }
    }
  }

  return null;
};

const findByKey = (obj, key) => {
  if (!obj || typeof obj !== 'object') {
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(obj, key)) {
    return obj[key];
  }
  for (const value of Object.values(obj)) {
    const found = findByKey(value, key);
    if (found !== null && found !== undefined) {
      return found;
    }
  }
  return null;
};

const findAboutMeta = (obj) => {
  if (!obj || typeof obj !== 'object') {
    return null;
  }
  if (
    Object.prototype.hasOwnProperty.call(obj, 'viewCountText') &&
    (Object.prototype.hasOwnProperty.call(obj, 'joinedDateText') ||
      Object.prototype.hasOwnProperty.call(obj, 'country') ||
      Object.prototype.hasOwnProperty.call(obj, 'canonicalChannelUrl'))
  ) {
    return obj;
  }
  for (const value of Object.values(obj)) {
    const found = findAboutMeta(value);
    if (found) {
      return found;
    }
  }
  return null;
};

const extractText = (node) => {
  if (!node) {
    return null;
  }
  if (typeof node === 'string') {
    return node;
  }
  if (node.simpleText) {
    return node.simpleText;
  }
  if (Array.isArray(node.runs)) {
    return node.runs.map((run) => run.text).join('');
  }
  return null;
};

const parseCount = (text) => {
  if (!text) {
    return null;
  }
  const normalized = text.replace(/,/g, '').trim();
  if (normalized.includes('億')) {
    const value = parseFloat(normalized.replace(/億.*/g, ''));
    return Math.round(value * 100000000);
  }
  if (normalized.includes('万')) {
    const value = parseFloat(normalized.replace(/万.*/g, ''));
    return Math.round(value * 10000);
  }
  if (/[Kk]/.test(normalized)) {
    const value = parseFloat(normalized.replace(/[Kk].*/g, ''));
    return Math.round(value * 1000);
  }
  if (/[Mm]/.test(normalized)) {
    const value = parseFloat(normalized.replace(/[Mm].*/g, ''));
    return Math.round(value * 1000000);
  }
  if (/[Bb]/.test(normalized)) {
    const value = parseFloat(normalized.replace(/[Bb].*/g, ''));
    return Math.round(value * 1000000000);
  }
  const digits = normalized.replace(/[^
\d]/g, '').replace(/\s+/g, '');
  return digits ? parseInt(digits, 10) : null;
};

const resolveChannelId = async () => {
  if (CHANNEL_ID) {
    return CHANNEL_ID;
  }

  const html = await fetchText(`https://www.youtube.com/@${CHANNEL_HANDLE}`);
  const match = html.match(/"channelId":"(UC[^"]+)"/);
  if (!match) {
    throw new Error('Channel ID not found for handle');
  }

  return match[1];
};

const fetchChannelHtml = async (channelId, pathSuffix = '') => {
  if (CHANNEL_ID) {
    return fetchText(`https://www.youtube.com/channel/${channelId}${pathSuffix}`);
  }
  return fetchText(`https://www.youtube.com/@${CHANNEL_HANDLE}${pathSuffix}`);
};

const extractFromHtml = (html, options = {}) => {
  const jsonString = extractJsonObject(html, 'ytInitialData');
  if (!jsonString) {
    return {};
  }

  try {
    const data = JSON.parse(jsonString);
    const subscriberNode = findByKey(data, 'subscriberCountText');
    const videosNode =
      findByKey(data, 'videosCountText') || findByKey(data, 'videoCountText');
    const aboutMeta = options.includeViews ? findAboutMeta(data) : null;
    const viewsNode = aboutMeta ? aboutMeta.viewCountText : null;
    const avatarNode = findByKey(data, 'avatar');
    const subscriberText = extractText(subscriberNode);
    const videoText = extractText(videosNode);
    const viewText = extractText(viewsNode);
    const subscriberCount = parseCount(subscriberText);
    const videoCount = parseCount(videoText);
    const viewCount = parseCount(viewText);
    let avatarUrl = null;
    if (avatarNode && Array.isArray(avatarNode.thumbnails) && avatarNode.thumbnails.length) {
      avatarUrl = avatarNode.thumbnails[avatarNode.thumbnails.length - 1].url;
    }

    return {
      subscriberCount,
      subscriberText,
      videoCount,
      viewCount,
      viewText,
      avatarUrl
    };
  } catch (_err) {
    return {};
  }
};

const fetchChannelData = async () => {
  const channelId = await resolveChannelId();
  let info = null;
  let avatarUrl = null;
  let subscriberCount = null;
  let subscriberText = null;
  let videoCount = null;
  let viewCount = null;
  let viewText = null;

  try {
    info = await ytch.getChannelInfo({ channelId, channelIdType: 1 });
    if (info.alertMessage) {
      throw new Error(info.alertMessage);
    }
    const thumbnails = info.authorThumbnails || [];
    avatarUrl = thumbnails.length ? thumbnails[thumbnails.length - 1].url : null;
    subscriberCount = info.subscriberCount;
    subscriberText = info.subscriberText;
  } catch (_err) {
    info = null;
  }

  try {
    const stats = await ytch.getChannelStats({ channelId, channelIdType: 1 });
    if (typeof stats?.viewCount === 'number') {
      viewCount = stats.viewCount;
      viewText = `${stats.viewCount}`;
    }
  } catch (_err) {
    // Fall back to HTML parsing.
  }

  const htmlResults = await Promise.allSettled(
    [
      { key: 'home', promise: fetchChannelHtml(channelId, '') },
      { key: 'about', promise: fetchChannelHtml(channelId, '/about') },
      { key: 'videos', promise: fetchChannelHtml(channelId, '/videos') }
    ].map(async ({ key, promise }) => ({ key, value: await promise }))
  );

  for (const result of htmlResults) {
    if (result.status !== 'fulfilled') {
      continue;
    }
    const extracted = extractFromHtml(result.value.value, {
      includeViews: result.value.key === 'about'
    });
    if (subscriberCount === null && extracted.subscriberCount !== null) {
      subscriberCount = extracted.subscriberCount;
    }
    if (!subscriberText && extracted.subscriberText) {
      subscriberText = extracted.subscriberText;
    }
    if (videoCount === null && extracted.videoCount !== null) {
      videoCount = extracted.videoCount;
    }
    if (!avatarUrl && extracted.avatarUrl) {
      avatarUrl = extracted.avatarUrl;
    }
    if (viewCount === null && extracted.viewCount !== null) {
      viewCount = extracted.viewCount;
    }
    if (!viewText && extracted.viewText) {
      viewText = extracted.viewText;
    }
  }

  return {
    title: info ? info.author : CHANNEL_HANDLE,
    channelId,
    handle: `@${CHANNEL_HANDLE}`,
    subscriberCount,
    subscriberText,
    videoCount,
    viewCount,
    viewText,
    avatarUrl,
    fetchedAt: Date.now()
  };
};

module.exports = async (req, res) => {
  if (req.method && req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  try {
    const now = Date.now();
    if (cachedChannel && now - cachedAt < CACHE_TTL_MS) {
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
      res.json(cachedChannel);
      return;
    }

    const data = await fetchChannelData();
    cachedChannel = data;
    cachedAt = now;
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.json(data);
  } catch (err) {
    console.error('channel_fetch_failed', err && err.message ? err.message : err);
    if (cachedChannel) {
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
      res.json({ ...cachedChannel, stale: true });
      return;
    }
    res.status(500).json({ error: 'channel_fetch_failed' });
  }
};

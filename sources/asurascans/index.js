/**
 * Asura Scans Extension for Dokuha
 * Ported from Keiyoushi's Kotlin extension architecture.
 * Adheres to Dokuha native extension expectations.
 */
const manifest = {
  "id": "asurascans",
  "name": "Asura Scans",
  "version": "1.0.0",
  "lang": "en",
  "baseUrl": "https://asurascans.com",
  "type": "COMIC",
  "iconUrl": "https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/main/javascript/icon/en.asurascans.png",
  "isNsfw": false
};

function unwrapAstro(val) {
  if (Array.isArray(val)) {
    if (val.length === 0) return null;
    if (val.length === 2 && typeof val[0] === 'number') {
      return unwrapAstro(val[1]);
    }
    return val.map(unwrapAstro);
  }
  if (val !== null && typeof val === 'object') {
    const obj = {};
    for (const k of Object.keys(val)) {
      obj[k] = unwrapAstro(val[k]);
    }
    return obj;
  }
  return val;
}

function extractAstroData(html, key) {
  if (!html) return null;
  try {
    if (typeof dokuha !== 'undefined' && typeof dokuha.parseHtml === 'function') {
      const $ = dokuha.parseHtml(html);
      const island = $(`[props*="${key}"]`).first();
      const raw = island.attr("props");
      if (raw) {
        return unwrapAstro(JSON.parse(raw));
      }
    } else if (typeof Document !== 'undefined') {
      const doc = new Document(html);
      const el = doc.selectFirst(`[props*="${key}"]`);
      if (el) {
        const raw = el.attr("props");
        if (raw) return unwrapAstro(JSON.parse(raw));
      }
    }
  } catch (_) {}

  // Fallback regex search
  try {
    const regex = new RegExp(`<astro-island[^>]*props="([^"]*${key}[^"]*)"`, 'i');
    const match = html.match(regex);
    if (match && match[1]) {
      const decoded = match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
      return unwrapAstro(JSON.parse(decoded));
    }
  } catch (_) {}

  return null;
}

function mapStatus(statusStr) {
  if (!statusStr) return "UNKNOWN";
  const s = String(statusStr).toLowerCase();
  if (s.includes("ongoing")) return "ONGOING";
  if (s.includes("complete")) return "COMPLETED";
  if (s.includes("hiatus")) return "ON_HIATUS";
  if (s.includes("dropped") || s.includes("cancel") || s.includes("axed")) return "CANCELLED";
  return "UNKNOWN";
}

const extension = {
  baseUrl: "https://asurascans.com",
  apiUrl: "https://api.asurascans.com/api",

  _headers() {
    return {
      "Referer": "https://asurascans.com/",
      "Origin": "https://asurascans.com",
      "Accept": "application/json, text/plain, */*",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    };
  },

  async _fetch(url) {
    if (typeof dokuha !== 'undefined' && typeof dokuha.fetch === 'function') {
      return await dokuha.fetch(url, { headers: this._headers() });
    }
    // Fallback if running directly under Client shim
    const res = await new Client().get(url, this._headers());
    return {
      ok: res.statusCode >= 200 && res.statusCode < 300,
      status: res.statusCode,
      async json() { return typeof res.body === 'string' ? JSON.parse(res.body) : res.body; },
      async text() { return res.body || ''; }
    };
  },

  async getPopular(page = 1) {
    const limit = 20;
    const offset = Math.max(0, (page - 1) * limit);
    const url = `${this.apiUrl}/series?offset=${offset}&limit=${limit}&order=popular`;

    const res = await this._fetch(url);
    if (!res.ok) return { mangas: [], hasNextPage: false };

    const data = await res.json();
    const items = (data && data.data) || [];
    const meta = (data && data.meta) || {};

    const mangas = items.map(item => ({
      url: item.public_url || `/comics/${item.slug}`,
      title: item.title || "Untitled",
      thumbnailUrl: item.coverUrl || item.cover || "",
      status: "UNKNOWN",
      genres: [],
      isNovel: false
    }));

    const hasNext = Boolean(meta.has_more ?? (items.length >= limit));
    return { mangas, hasNextPage: hasNext };
  },

  async getLatestUpdates(page = 1) {
    const limit = 20;
    const offset = Math.max(0, (page - 1) * limit);
    const url = `${this.apiUrl}/series?offset=${offset}&limit=${limit}&order=latest`;

    const res = await this._fetch(url);
    if (!res.ok) return { mangas: [], hasNextPage: false };

    const data = await res.json();
    const items = (data && data.data) || [];
    const meta = (data && data.meta) || {};

    const mangas = items.map(item => ({
      url: item.public_url || `/comics/${item.slug}`,
      title: item.title || "Untitled",
      thumbnailUrl: item.coverUrl || item.cover || "",
      status: "UNKNOWN",
      genres: [],
      isNovel: false
    }));

    const hasNext = Boolean(meta.has_more ?? (items.length >= limit));
    return { mangas, hasNextPage: hasNext };
  },

  async search(query, page = 1, filters = []) {
    const limit = 20;
    const offset = Math.max(0, (page - 1) * limit);
    const searchParam = query && query.trim().length > 0 ? `&search=${encodeURIComponent(query.trim())}` : "";
    const url = `${this.apiUrl}/series?offset=${offset}&limit=${limit}${searchParam}`;

    const res = await this._fetch(url);
    if (!res.ok) return { mangas: [], hasNextPage: false };

    const data = await res.json();
    const items = (data && data.data) || [];
    const meta = (data && data.meta) || {};

    const mangas = items.map(item => ({
      url: item.public_url || `/comics/${item.slug}`,
      title: item.title || "Untitled",
      thumbnailUrl: item.coverUrl || item.cover || "",
      status: "UNKNOWN",
      genres: [],
      isNovel: false
    }));

    const hasNext = Boolean(meta.has_more ?? (items.length >= limit));
    return { mangas, hasNextPage: hasNext };
  },

  async getDetails(url) {
    const fullUrl = url.startsWith("http") ? url : `${this.baseUrl}${url.startsWith("/") ? "" : "/"}${url}`;
    const res = await this._fetch(fullUrl);
    if (!res.ok) {
      return {
        url: url,
        title: "Unknown",
        thumbnailUrl: "",
        description: "",
        author: "",
        artist: "",
        genres: [],
        status: "UNKNOWN",
        isNovel: false
      };
    }

    const html = await res.text();
    const data = extractAstroData(html, "title");

    if (data) {
      const genres = (data.genres || []).map(g => (typeof g === "object" ? g.name : String(g))).filter(Boolean);
      const cleanDesc = data.description
        ? data.description.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/<[^>]*>/g, "").trim()
        : "";

      return {
        url: url,
        title: data.title || "Untitled",
        thumbnailUrl: data.coverUrl || data.cover || "",
        author: data.author || "",
        artist: data.artist || "",
        description: cleanDesc,
        genres: genres,
        status: mapStatus(data.status),
        isNovel: false
      };
    }

    // Fallback: parse meta tags using Document or dokuha.parseHtml
    let ogTitle = "Unknown", ogImage = "", ogDesc = "";
    if (typeof dokuha !== 'undefined' && typeof dokuha.parseHtml === 'function') {
      const $ = dokuha.parseHtml(html);
      ogTitle = $('meta[property="og:title"]').first().attr("content") || "Unknown";
      ogImage = $('meta[property="og:image"]').first().attr("content") || "";
      ogDesc = $('meta[property="og:description"]').first().attr("content") || "";
    } else if (typeof Document !== 'undefined') {
      const doc = new Document(html);
      ogTitle = doc.selectFirst("meta[property='og:title']")?.attr("content") || "Unknown";
      ogImage = doc.selectFirst("meta[property='og:image']")?.attr("content") || "";
      ogDesc = doc.selectFirst("meta[property='og:description']")?.attr("content") || "";
    }

    return {
      url: url,
      title: ogTitle,
      thumbnailUrl: ogImage,
      description: ogDesc,
      author: "",
      artist: "",
      genres: [],
      status: "UNKNOWN",
      isNovel: false
    };
  },

  async getChapters(url) {
    const fullUrl = url.startsWith("http") ? url : `${this.baseUrl}${url.startsWith("/") ? "" : "/"}${url}`;
    const res = await this._fetch(fullUrl);
    if (!res.ok) return [];

    const html = await res.text();
    const data = extractAstroData(html, "chapters");
    const rawChapters = (data && data.chapters) ? data.chapters : [];
    const slug = url.split("/").filter(Boolean).pop() || "";
    const now = Date.now();

    return rawChapters.map(ch => {
      const isLocked = ch.is_premium || (ch.early_access_until && new Date(ch.early_access_until).getTime() > now);
      const num = parseFloat(ch.number) || 0;
      const chapterSlug = ch.series_slug || slug;
      const chapterUrl = `/comics/${chapterSlug}/chapter/${num}`;
      const chapterName = ch.title ? `Chapter ${num}: ${ch.title}` : `Chapter ${num}`;
      const dateUpload = ch.created_at ? new Date(ch.created_at).getTime() : 0;

      return {
        url: chapterUrl,
        name: chapterName,
        chapterNumber: num,
        dateUpload: dateUpload,
        scanlator: isLocked ? "[Early Access]" : "Asura Scans"
      };
    });
  },

  async getPages(chapterUrl) {
    const fullUrl = chapterUrl.startsWith("http") ? chapterUrl : `${this.baseUrl}${chapterUrl.startsWith("/") ? "" : "/"}${chapterUrl}`;
    const res = await this._fetch(fullUrl);
    if (!res.ok) return [];

    const html = await res.text();
    const data = extractAstroData(html, "pages");
    const pages = (data && data.pages) ? data.pages : [];

    if (pages.length > 0) {
      return pages.map((p, idx) => {
        const img = typeof p === "string" ? p : (p.url || p.imageUrl || "");
        return { index: idx, url: img, imageUrl: img };
      });
    }

    const match = html.match(/"pages":\s*(\[[^\]]+\])/);
    if (match && match[1]) {
      try {
        const fallbackList = JSON.parse(match[1]);
        return fallbackList.map((p, idx) => {
          const img = typeof p === "string" ? p : (p.url || "");
          return { index: idx, url: img, imageUrl: img };
        });
      } catch (_) {}
    }

    return [];
  }
};

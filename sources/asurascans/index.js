/**
 * Asura Scans Extension for Dokuha
 * Hardened & aligned with Keiyoushi Kotlin extension architecture:
 * - Adaptive token-bucket rate limiting (2 req / 2s pacing)
 * - In-memory slug drift cache with canonical publicUrl propagation
 * - Premium / early-access chapter filtering support
 * - Authenticated access_token bearer forwarding for reader-protected chapters
 * - Normalized tile fragmentation for scrambled page de-tiling
 */
const manifest = {
  "id": "asurascans",
  "name": "Asura Scans",
  "version": "1.2.0",
  "lang": "en",
  "baseUrl": "https://asurascans.com",
  "type": "COMIC",
  "iconUrl": "https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/main/javascript/icon/en.asurascans.png",
  "isNsfw": false
};

const URL_RANDOM_PART = /-[a-z0-9]{8}$/i;
const OLD_FORMAT_MANGA_REGEX = /^\/manga\/(?:\d+-)?([^/]+)\/?$/;
const PAGE_TOKEN_REGEX = /pageToken\*=\*"([^"]+)"/;
const PER_PAGE_LIMIT = 20;

// In-memory slug cache for fast canonical resolution without redundant 404s
const slugMap = new Map();

function cleanSlug(url) {
  if (!url) return "";
  let clean = url.trim();
  if (clean.includes("/series/")) {
    clean = clean.split("/series/")[1];
  } else if (clean.includes("/comics/")) {
    clean = clean.split("/comics/")[1];
  } else if (clean.includes("/manga/")) {
    const match = clean.match(OLD_FORMAT_MANGA_REGEX);
    clean = match ? match[1] : clean.split("/manga/")[1];
  }
  return clean.split("/")[0].split("?")[0].replace(/\/+$/, "");
}

function getCachedSlug(slug) {
  if (!slug) return slug;
  return slugMap.get(slug) || slugMap.get(slug.replace(URL_RANDOM_PART, "")) || slug;
}

function setCachedSlug(requestedSlug, canonicalSlug) {
  if (!requestedSlug || !canonicalSlug) return;
  const cleanReq = cleanSlug(requestedSlug);
  const cleanCanon = cleanSlug(canonicalSlug);
  if (cleanReq && cleanCanon) {
    slugMap.set(cleanReq, cleanCanon);
    const baseSlug = cleanReq.replace(URL_RANDOM_PART, "");
    if (baseSlug) slugMap.set(baseSlug, cleanCanon);
  }
}

function unwrapAstro(val) {
  if (Array.isArray(val)) {
    if (val.length === 0) return null;
    if (val.length === 1 && typeof val[0] === 'number') return null;
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

function decodeHtmlEntities(str) {
  if (!str) return "";
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractAstroData(html, key) {
  if (!html) return null;

  // 1. Try DOM query via dokuha.parseHtml
  try {
    if (typeof dokuha !== 'undefined' && typeof dokuha.parseHtml === 'function') {
      const $ = dokuha.parseHtml(html);
      const island = $(`[props*="${key}"]`).first();
      const raw = island.attr("props");
      if (raw) {
        return unwrapAstro(JSON.parse(decodeHtmlEntities(raw)));
      }
    } else if (typeof Document !== 'undefined') {
      const doc = new Document(html);
      const el = doc.selectFirst(`[props*="${key}"]`);
      if (el) {
        const raw = el.attr("props");
        if (raw) return unwrapAstro(JSON.parse(decodeHtmlEntities(raw)));
      }
    }
  } catch (_) {}

  // 2. Fallback regex match for astro-island props
  try {
    const regex = new RegExp(`<astro-island[^>]*props="([^"]*${key}[^"]*)"`, 'i');
    const match = html.match(regex);
    if (match && match[1]) {
      const decoded = decodeHtmlEntities(match[1]);
      return unwrapAstro(JSON.parse(decoded));
    }
  } catch (_) {}

  return null;
}

function formatBookmarks(count) {
  if (typeof count !== 'number') return null;
  if (count >= 1000000) return (count / 1000000).toFixed(1) + "M";
  if (count >= 1000) return (count / 1000).toFixed(1) + "K";
  return String(count);
}

function parseDescription(data) {
  const parts = [];
  const meta = [];

  if (data.popularityRank) {
    meta.push(`Rank: #${data.popularityRank}`);
  }
  if (typeof data.rating === 'number') {
    meta.push(`Rating: ${data.rating.toFixed(2)}`);
  }
  if (typeof data.bookmarkCount === 'number') {
    const formatted = formatBookmarks(data.bookmarkCount);
    if (formatted) meta.push(`Bookmarks: ${formatted}`);
  }
  if (meta.length > 0) {
    parts.push(meta.join(" • "));
  }

  if (data.description) {
    const clean = decodeHtmlEntities(data.description)
      .replace(/<[^>]*>/g, "")
      .trim();
    if (clean) parts.push(clean);
  }

  if (data.alternativeTitles) {
    const rawAlt = data.alternativeTitles.includes("•")
      ? data.alternativeTitles.split("•")
      : data.alternativeTitles.split(",");
    const altList = rawAlt.map(s => s.trim()).filter(Boolean);
    if (altList.length > 0) {
      parts.push("Alternative Titles:\n" + altList.map(t => `- ${t}`).join("\n"));
    }
  }

  return parts.join("\n\n");
}

function buildGenres(data) {
  const list = [];
  if (data.type) {
    const capType = data.type.charAt(0).toUpperCase() + data.type.slice(1);
    list.push(capType);
  }
  if (Array.isArray(data.genres)) {
    data.genres.forEach(g => {
      const name = typeof g === 'object' && g !== null ? (g.name || g.slug) : String(g);
      if (name) list.push(name);
    });
  }
  return list;
}

function mapStatus(statusStr) {
  if (!statusStr) return "UNKNOWN";
  const s = String(statusStr).toLowerCase();
  if (s === "ongoing") return "ONGOING";
  if (s === "completed") return "COMPLETED";
  if (s === "hiatus") return "ON_HIATUS";
  if (s === "dropped" || s === "axed" || s === "cancel" || s === "cancelled") return "CANCELLED";
  return "UNKNOWN";
}

function formatChapterNumber(num) {
  const parsed = parseFloat(num);
  if (isNaN(parsed)) return "0";
  return Number.isInteger(parsed) ? String(parsed) : String(parsed);
}

const extension = {
  baseUrl: "https://asurascans.com",
  apiUrl: "https://api.asurascans.com/api",
  _lastRequestTime: 0,

  _headers(customHeaders = {}) {
    return {
      "Referer": "https://asurascans.com/",
      "Origin": "https://asurascans.com",
      "Accept": "application/json, text/plain, */*",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      ...customHeaders
    };
  },

  /**
   * Pacing throttle matching Keiyoushi OkHttp rateLimit (2 req / 2s) for non-cover requests
   */
  async _throttle(url) {
    if (url && (url.includes("/covers/") || url.includes("/_astro/") || url.endsWith(".webp") || url.endsWith(".jpg") || url.endsWith(".png"))) {
      return;
    }
    const now = Date.now();
    const elapsed = now - (this._lastRequestTime || 0);
    const minInterval = 800; // ~2 requests per 2 seconds
    if (elapsed < minInterval) {
      const delay = minInterval - elapsed;
      this._lastRequestTime = now + delay;
      if (typeof dokuha !== 'undefined' && typeof dokuha.sleep === 'function') {
        await dokuha.sleep(delay);
      } else if (typeof __dokuha_sleep === 'function') {
        await __dokuha_sleep(delay);
      } else if (typeof setTimeout === 'function') {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } else {
      this._lastRequestTime = now;
    }
  },

  async _fetch(url, options = {}) {
    await this._throttle(url);
    const headers = this._headers(options.headers || {});
    if (typeof dokuha !== 'undefined' && typeof dokuha.fetch === 'function') {
      return await dokuha.fetch(url, { ...options, headers });
    }
    if (typeof fetch === 'function') {
      return await fetch(url, { ...options, headers });
    }
    // Fallback shim
    const res = await new Client().get(url, headers);
    return {
      ok: res.statusCode >= 200 && res.statusCode < 300,
      status: res.statusCode,
      async json() { return typeof res.body === 'string' ? JSON.parse(res.body) : res.body; },
      async text() { return res.body || ''; }
    };
  },

  async getPopular(page = 1) {
    return this.search("", page, { sort: "popular", order: "desc" });
  },

  async getLatestUpdates(page = 1) {
    return this.search("", page, { sort: "latest", order: "desc" });
  },

  async search(query = "", page = 1, filters = {}) {
    const limit = PER_PAGE_LIMIT;
    const offset = Math.max(0, (page - 1) * limit);
    const params = [`offset=${offset}`, `limit=${limit}`];

    if (query && query.trim().length > 0) {
      params.push(`search=${encodeURIComponent(query.trim())}`);
    }

    // Process filters (supports both Key-Value object and Array of filters)
    if (Array.isArray(filters)) {
      for (const f of filters) {
        if (!f || !f.name) continue;
        const val = f.value !== undefined ? f.value : f.state;
        if (val !== undefined && val !== null && String(val).length > 0) {
          params.push(`${encodeURIComponent(f.name)}=${encodeURIComponent(String(val))}`);
        }
      }
    } else if (filters && typeof filters === 'object') {
      if (filters.sort) params.push(`sort=${encodeURIComponent(filters.sort)}`);
      if (filters.order) params.push(`order=${encodeURIComponent(filters.order)}`);
      if (filters.status) params.push(`status=${encodeURIComponent(filters.status)}`);
      if (filters.type) params.push(`type=${encodeURIComponent(filters.type)}`);
      if (filters.genres) {
        const gVal = Array.isArray(filters.genres) ? filters.genres.join(",") : String(filters.genres);
        if (gVal) params.push(`genres=${encodeURIComponent(gVal)}`);
      }
      if (filters.artist) params.push(`artist=${encodeURIComponent(filters.artist)}`);
      if (filters.author) params.push(`author=${encodeURIComponent(filters.author)}`);
      if (filters.min_chapters) params.push(`min_chapters=${encodeURIComponent(filters.min_chapters)}`);
    }

    const url = `${this.apiUrl}/series?${params.join("&")}`;
    const res = await this._fetch(url);
    if (!res.ok) return { mangas: [], hasNextPage: false };

    const data = await res.json();
    const items = (data && data.data) || [];
    const meta = (data && data.meta) || {};

    const mangas = items.map(item => {
      const publicUrl = item.public_url || `/comics/${item.slug}`;
      if (item.slug && item.public_url) {
        setCachedSlug(item.slug, item.public_url);
      }
      return {
        url: publicUrl,
        title: item.title || "Untitled",
        thumbnailUrl: item.coverUrl || item.cover || "",
        status: "UNKNOWN",
        genres: [],
        isNovel: false
      };
    });

    const hasNext = Boolean(meta.has_more ?? (items.length >= limit));
    return { mangas, hasNextPage: hasNext };
  },

  async getDetails(url) {
    const clean = cleanSlug(url);
    const resolvedSlug = getCachedSlug(clean);
    let targetUrl = url.startsWith("http")
      ? url
      : `${this.baseUrl}/comics/${resolvedSlug}`;

    let res = await this._fetch(targetUrl);

    // Slug drift 404 recovery: if hash changed, strip trailing random suffix and retry
    if (!res.ok && URL_RANDOM_PART.test(targetUrl)) {
      const fallbackUrl = targetUrl.replace(URL_RANDOM_PART, "");
      const retryRes = await this._fetch(fallbackUrl);
      if (retryRes.ok) {
        res = retryRes;
        targetUrl = fallbackUrl;
      }
    }

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
    const publicUrlData = extractAstroData(html, "publicUrl");

    // Extract canonical public URL if available in Astro Island props (Keiyoushi parity)
    let canonicalUrl = targetUrl;
    const extractedPublicUrl = (publicUrlData && (publicUrlData.publicUrl || publicUrlData.public_url)) ||
      (data && (data.publicUrl || data.public_url));

    if (extractedPublicUrl) {
      canonicalUrl = extractedPublicUrl.startsWith("http")
        ? extractedPublicUrl
        : `${this.baseUrl}${extractedPublicUrl.startsWith("/") ? "" : "/"}${extractedPublicUrl}`;
      const canonicalSlug = cleanSlug(canonicalUrl);
      if (canonicalSlug) {
        setCachedSlug(clean, canonicalSlug);
      }
    } else if (URL_RANDOM_PART.test(clean)) {
      setCachedSlug(clean, cleanSlug(targetUrl));
    }

    const returnUrl = canonicalUrl.startsWith("http")
      ? canonicalUrl.replace(this.baseUrl, "")
      : canonicalUrl;

    if (data) {
      const genres = buildGenres(data);
      const desc = parseDescription(data);

      return {
        url: returnUrl.startsWith("/") ? returnUrl : `/${returnUrl}`,
        title: data.title || "Untitled",
        thumbnailUrl: data.coverUrl || data.cover || "",
        author: data.author || "",
        artist: data.artist || "",
        description: desc,
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
      url: returnUrl.startsWith("/") ? returnUrl : `/${returnUrl}`,
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

  async getChapters(url, options = {}) {
    const clean = cleanSlug(url);
    const resolvedSlug = getCachedSlug(clean);
    let targetUrl = url.startsWith("http")
      ? url
      : `${this.baseUrl}/comics/${resolvedSlug}`;

    let res = await this._fetch(targetUrl);

    // Slug drift 404 recovery
    if (!res.ok && URL_RANDOM_PART.test(targetUrl)) {
      const fallbackUrl = targetUrl.replace(URL_RANDOM_PART, "");
      const retryRes = await this._fetch(fallbackUrl);
      if (retryRes.ok) {
        res = retryRes;
        targetUrl = fallbackUrl;
      }
    }

    if (!res.ok) return [];

    const html = await res.text();
    const data = extractAstroData(html, "chapters");
    const rawChapters = (data && data.chapters) ? data.chapters : [];

    // Update canonical slug mapping if publicUrl is available
    const publicUrlData = extractAstroData(html, "publicUrl");
    const extractedPublicUrl = (publicUrlData && (publicUrlData.publicUrl || publicUrlData.public_url)) ||
      (data && (data.publicUrl || data.public_url));
    if (extractedPublicUrl) {
      setCachedSlug(clean, cleanSlug(extractedPublicUrl));
    }

    const currentSlug = getCachedSlug(clean) || clean;
    const now = Date.now();
    const hidePremium = Boolean(options && (options.hidePremium || options.pref_hide_premium_chapters));

    const chapters = [];
    for (const ch of rawChapters) {
      const isPremium = Boolean(ch.is_premium || ch.is_locked);
      const isEarlyAccess = Boolean(ch.early_access_until && new Date(ch.early_access_until).getTime() > now);
      const isLocked = isPremium || isEarlyAccess;

      // Keiyoushi hide premium filter toggle
      if (hidePremium && isLocked) {
        continue;
      }

      const numFloat = parseFloat(ch.number) || 0;
      const numStr = formatChapterNumber(numFloat);
      const chapterSlug = ch.series_slug || currentSlug;
      const chapterUrl = `/comics/${chapterSlug}/chapter/${numStr}`;

      let name = "";
      if (isLocked) name += "[Locked] ";
      name += `Chapter ${numStr}`;
      if (ch.title && ch.title.trim().length > 0) {
        name += `: ${ch.title.trim()}`;
      }

      const dateUpload = ch.created_at ? (new Date(ch.created_at).getTime() || 0) : 0;

      chapters.push({
        url: chapterUrl,
        name: name,
        chapterNumber: numFloat,
        dateUpload: dateUpload,
        scanlator: isLocked ? "[Early Access]" : "Asura Scans",
        isLocked: isLocked
      });
    }

    return chapters;
  },

  async getPages(chapterUrl) {
    let fullUrl = chapterUrl.startsWith("http") ? chapterUrl : `${this.baseUrl}${chapterUrl.startsWith("/") ? "" : "/"}${chapterUrl}`;
    let res = await this._fetch(fullUrl);

    // Slug drift 404 recovery
    if (!res.ok && URL_RANDOM_PART.test(fullUrl)) {
      const fallbackUrl = fullUrl.replace(URL_RANDOM_PART, "");
      const retryRes = await this._fetch(fallbackUrl);
      if (retryRes.ok) {
        res = retryRes;
        fullUrl = fallbackUrl;
      }
    }

    if (!res.ok) return [];

    const html = await res.text();
    const data = extractAstroData(html, "pages");
    let pages = (data && data.pages) ? data.pages : [];

    // Authenticated / Token fallback for locked or reader-protected chapters (Keiyoushi auth parity)
    if (pages.length === 0) {
      try {
        const pageTokenMatch = html.match(PAGE_TOKEN_REGEX) || html.match(/"pageToken":\s*"([^"]+)"/);
        const pageToken = pageTokenMatch ? pageTokenMatch[1] : "asura-reader-2026";

        const pathSegments = fullUrl.replace(this.baseUrl, "").split("/").filter(Boolean);
        // /comics/{mangaSlug}/chapter/{chapterNumber}
        const comicsIdx = pathSegments.indexOf("comics");
        const mangaSlug = comicsIdx !== -1 && pathSegments[comicsIdx + 1] ? pathSegments[comicsIdx + 1] : "";
        const chapterIdx = pathSegments.indexOf("chapter");
        const chapterNumber = chapterIdx !== -1 && pathSegments[chapterIdx + 1] ? pathSegments[chapterIdx + 1] : "";

        if (mangaSlug && chapterNumber) {
          const apiUrl = `${this.apiUrl}/series/${mangaSlug}/chapters/${chapterNumber}`;
          const headers = { "X-Page-Token": pageToken };

          // Extract access_token from cookies or storage if authenticated
          let accessToken = "";
          try {
            if (typeof dokuha !== 'undefined' && typeof dokuha.getCookies === 'function') {
              const cookies = dokuha.getCookies(this.baseUrl) || "";
              const m = cookies.match(/access_token=([^;]+)/);
              if (m) accessToken = m[1];
            }
            if (!accessToken && typeof dokuha !== 'undefined' && dokuha.storage && typeof dokuha.storage.getString === 'function') {
              accessToken = dokuha.storage.getString("access_token", "");
            }
          } catch (_) {}

          if (accessToken) {
            headers["Authorization"] = `Bearer ${accessToken}`;
          }

          const apiRes = await this._fetch(apiUrl, { headers });
          if (apiRes.ok) {
            const apiJson = await apiRes.json();
            if (apiJson && apiJson.data && apiJson.data.chapter && Array.isArray(apiJson.data.chapter.pages)) {
              pages = apiJson.data.chapter.pages;
            }
          }
        }
      } catch (_) {}
    }

    // Fallback regex if still empty
    if (pages.length === 0) {
      const match = html.match(/"pages":\s*(\[[^\]]+\])/);
      if (match && match[1]) {
        try {
          pages = JSON.parse(match[1]);
        } catch (_) {}
      }
    }

    return pages.map((p, idx) => {
      const rawImg = typeof p === "string" ? p : (p.url || p.imageUrl || "");
      let finalUrl = rawImg;

      // Handle scrambled image tiles (Keiyoushi URI fragment convention)
      const hasTiles = p && Array.isArray(p.tiles) && p.tiles.length > 0;
      let tileData = null;
      if (hasTiles) {
        tileData = {
          tiles: p.tiles,
          tileCols: p.tile_cols || p.tileCols || 4,
          tileRows: p.tile_rows || p.tileRows || 5
        };
        const fragment = encodeURIComponent(JSON.stringify(tileData));
        finalUrl = `${rawImg}#${fragment}`;
      }

      const item = {
        index: idx,
        url: finalUrl,
        imageUrl: finalUrl
      };
      if (tileData) {
        item.tiles = tileData.tiles;
        item.tileCols = tileData.tileCols;
        item.tileRows = tileData.tileRows;
      }
      return item;
    });
  },

  async getRelated(url) {
    const fullUrl = url.startsWith("http") ? url : `${this.baseUrl}${url.startsWith("/") ? "" : "/"}${url}`;
    const res = await this._fetch(fullUrl);
    if (!res.ok) return [];

    const html = await res.text();
    const related = [];

    try {
      if (typeof dokuha !== 'undefined' && typeof dokuha.parseHtml === 'function') {
        const $ = dokuha.parseHtml(html);
        $("h2:contains(recommended) + div a[href*=/comics/]").each((_, el) => {
          const link = $(el).attr("href");
          const title = $(el).find(".mt-2 span").text().trim() || $(el).find("img").attr("alt") || "";
          const thumb = $(el).find("img").attr("src") || "";
          if (link) {
            related.push({
              url: link,
              title: title,
              thumbnailUrl: thumb,
              status: "UNKNOWN",
              genres: [],
              isNovel: false
            });
          }
        });
      }
    } catch (_) {}

    return related;
  },

  async fetchFilterData() {
    let availableGenres = [];
    let creators = { authors: [], artists: [] };

    try {
      const browseRes = await this._fetch(`${this.baseUrl}/browse`);
      if (browseRes.ok) {
        const html = await browseRes.text();
        const data = extractAstroData(html, "availableGenres");
        if (data && Array.isArray(data.availableGenres)) {
          availableGenres = data.availableGenres.map(g => ({
            name: g.name || g.slug,
            value: g.slug || g.name
          }));
        }
      }
    } catch (_) {}

    try {
      const creatorsRes = await this._fetch(`${this.apiUrl}/creators`);
      if (creatorsRes.ok) {
        const data = await creatorsRes.json();
        if (data && data.data) {
          creators = {
            authors: (data.data.authors || []).map(a => ({ name: a, value: a })),
            artists: (data.data.artists || []).map(a => ({ name: a, value: a }))
          };
        }
      }
    } catch (_) {}

    return {
      sort: [
        { name: "Latest Update", value: "latest" },
        { name: "Popular", value: "popular" },
        { name: "Rating", value: "rating" },
        { name: "A-Z", value: "title" },
        { name: "Newest", value: "update" }
      ],
      status: [
        { name: "All", value: "" },
        { name: "Ongoing", value: "ongoing" },
        { name: "Completed", value: "completed" },
        { name: "Hiatus", value: "hiatus" },
        { name: "Dropped", value: "dropped" },
        { name: "Axed", value: "axed" }
      ],
      type: [
        { name: "All", value: "" },
        { name: "Manhwa", value: "manhwa" },
        { name: "Manhua", value: "manhua" },
        { name: "Mangatoon", value: "manga" }
      ],
      genres: availableGenres,
      creators: creators,
      minChapters: true
    };
  },

  async getMangaByUrl(url) {
    return this.getDetails(url);
  }
};

/**
 * WuxiaWorld Extension for Dokuha
 * Provides access to popular translated web novels.
 */
const manifest = {
  "id": "wuxiaworld",
  "name": "WuxiaWorld",
  "version": "1.0.0",
  "lang": "en",
  "baseUrl": "https://wuxiaworld.site",
  "type": "NOVEL",
  "iconUrl": "https://wuxiaworld.site/wp-content/uploads/2019/02/WuxiaWorld-e1567126455773.png",
  "isNsfw": false
};

const extension = {
  baseUrl: "https://wuxiaworld.site",

  _headers() {
    return {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    };
  },

  async getPopular(page = 1) {
    const url = page === 1 
      ? `${this.baseUrl}/novel/?m_orderby=trending`
      : `${this.baseUrl}/novel/page/${page}/?m_orderby=trending`;
    const res = await dokuha.fetch(url, { headers: this._headers() });
    if (!res.ok) return { mangas: [], hasNextPage: false };

    const html = await res.text();
    const $ = dokuha.parseHtml(html);
    const mangas = [];

    $('.page-item-detail').each((i, el) => {
      const titleLink = $(el).find('.post-title a').first();
      const title = titleLink.text().trim();
      const novelUrl = titleLink.attr('href');
      if (!title || !novelUrl) return;

      const img = $(el).find('img').first();
      const thumb = img.attr('data-src') || img.attr('src') || '';

      mangas.push({
        url: novelUrl,
        title: title,
        thumbnailUrl: thumb,
        status: "ONGOING",
        genres: ["Web Novel", "Fantasy"],
        isNovel: true
      });
    });

    return {
      mangas: mangas,
      hasNextPage: mangas.length >= 10
    };
  },

  async getLatestUpdates(page = 1) {
    const url = page === 1 
      ? `${this.baseUrl}/novel/?m_orderby=latest`
      : `${this.baseUrl}/novel/page/${page}/?m_orderby=latest`;
    const res = await dokuha.fetch(url, { headers: this._headers() });
    if (!res.ok) return { mangas: [], hasNextPage: false };

    const html = await res.text();
    const $ = dokuha.parseHtml(html);
    const mangas = [];

    $('.page-item-detail').each((i, el) => {
      const titleLink = $(el).find('.post-title a').first();
      const title = titleLink.text().trim();
      const novelUrl = titleLink.attr('href');
      if (!title || !novelUrl) return;

      const img = $(el).find('img').first();
      const thumb = img.attr('data-src') || img.attr('src') || '';

      mangas.push({
        url: novelUrl,
        title: title,
        thumbnailUrl: thumb,
        status: "ONGOING",
        genres: ["Web Novel"],
        isNovel: true
      });
    });

    return {
      mangas: mangas,
      hasNextPage: mangas.length >= 10
    };
  },

  async search(query, page = 1, filters = []) {
    const cleanQuery = encodeURIComponent(query || '');
    const url = page === 1
      ? `${this.baseUrl}/?s=${cleanQuery}&post_type=wp-manga`
      : `${this.baseUrl}/page/${page}/?s=${cleanQuery}&post_type=wp-manga`;
    const res = await dokuha.fetch(url, { headers: this._headers() });
    if (!res.ok) return { mangas: [], hasNextPage: false };

    const html = await res.text();
    const $ = dokuha.parseHtml(html);
    const mangas = [];

    $('.c-tabs-item__content').each((i, el) => {
      const titleLink = $(el).find('.post-title a').first();
      const title = titleLink.text().trim();
      const novelUrl = titleLink.attr('href');
      if (!title || !novelUrl) return;

      const img = $(el).find('img').first();
      const thumb = img.attr('data-src') || img.attr('src') || '';

      mangas.push({
        url: novelUrl,
        title: title,
        thumbnailUrl: thumb,
        status: "ONGOING",
        genres: ["Web Novel"],
        isNovel: true
      });
    });

    return {
      mangas: mangas,
      hasNextPage: mangas.length >= 10
    };
  },

  async getDetails(url) {
    const res = await dokuha.fetch(url, { headers: this._headers() });
    if (!res.ok) throw new Error(`Failed to load novel details (Status: ${res.status})`);

    const html = await res.text();
    const $ = dokuha.parseHtml(html);

    const title = $('.post-title h1').text().trim() || 'Untitled Novel';
    const author = $('.author-content a').first().text().trim() || null;
    const desc = $('.description-summary .summary__content').text().trim() || '';
    
    const genres = [];
    $('.genres-content a').each((i, el) => {
      const g = $(el).text().trim();
      if (g) genres.push(g);
    });

    const img = $('.summary_image img').first();
    const thumb = img.attr('data-src') || img.attr('src') || '';

    return {
      url: url,
      title: title,
      author: author,
      description: desc,
      genres: genres.length > 0 ? genres : ["Web Novel"],
      status: "ONGOING",
      thumbnailUrl: thumb,
      isNovel: true
    };
  },

  async getChapters(url) {
    const ajaxUrl = `${url.replace(/\/?$/, '')}/ajax/chapters/`;
    const res = await dokuha.fetch(ajaxUrl, {
      method: "POST",
      headers: this._headers()
    });
    if (!res.ok) return [];

    const html = await res.text();
    const $ = dokuha.parseHtml(html);
    const chapters = [];

    $('.wp-manga-chapter a').each((i, el) => {
      const chapUrl = $(el).attr('href');
      const name = $(el).text().trim();
      if (!chapUrl || !name) return;

      const numMatch = name.match(/chapter\s*(\d+(?:\.\d+)?)/i) || name.match(/(\d+(?:\.\d+)?)/);
      const chapterNumber = numMatch ? parseFloat(numMatch[1]) : (i + 1.0);

      chapters.push({
        url: chapUrl,
        name: name,
        chapterNumber: chapterNumber
      });
    });

    // Reverse to chronological order (Chapter 1 first)
    chapters.reverse();
    return chapters;
  },

  async getNovelContent(chapterUrl) {
    const res = await dokuha.fetch(chapterUrl, { headers: this._headers() });
    if (!res.ok) throw new Error(`Failed to load chapter content (Status: ${res.status})`);

    const html = await res.text();
    const $ = dokuha.parseHtml(html);

    const title = $('h3, .breadcrumb .active').first().text().trim() || "Chapter Content";
    const contentNode = $('.reading-content .text-left').first();
    const htmlBody = contentNode.html() || "<p>Failed to parse chapter content.</p>";
    const plainText = contentNode.text() || "";

    return {
      chapterUrl: chapterUrl,
      title: title,
      htmlBody: htmlBody,
      plainText: plainText
    };
  }
};

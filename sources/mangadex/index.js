/**
 * MangaDex Extension for Dokuha
 */
const manifest = {
  "id": "mangadex",
  "name": "MangaDex",
  "version": "1.0.0",
  "lang": "en",
  "baseUrl": "https://mangadex.org",
  "type": "COMIC",
  "iconUrl": "https://mangadex.org/favicon.ico",
  "isNsfw": false
};

const extension = {
  baseUrl: "https://mangadex.org",
  apiUrl: "https://api.mangadex.org",
  coverBaseUrl: "https://uploads.mangadex.org/covers",

  _headers() {
    return {
      "User-Agent": "Dokuha/1.0.0 (https://github.com/dokuha)",
      "Accept": "application/json"
    };
  },

  _extractCover(relationships, mangaId) {
    if (!relationships || !Array.isArray(relationships)) return null;
    const coverRel = relationships.find(r => r.type === "cover_art");
    if (coverRel && coverRel.attributes && coverRel.attributes.fileName) {
      return `${this.coverBaseUrl}/${mangaId}/${coverRel.attributes.fileName}.256.jpg`;
    }
    return null;
  },

  _extractTitle(attributes) {
    if (!attributes || !attributes.title) return "Untitled";
    const titleObj = attributes.title;
    return titleObj.en || titleObj["ja-ro"] || titleObj["ko-ro"] || titleObj["zh-ro"] || Object.values(titleObj)[0] || "Untitled";
  },

  _extractDescription(attributes) {
    if (!attributes || !attributes.description) return "";
    const descObj = attributes.description;
    return descObj.en || Object.values(descObj)[0] || "";
  },

  _extractAuthor(relationships, type) {
    if (!relationships || !Array.isArray(relationships)) return null;
    const rel = relationships.find(r => r.type === type);
    return (rel && rel.attributes && rel.attributes.name) ? rel.attributes.name : null;
  },

  _extractGenres(attributes) {
    if (!attributes || !attributes.tags) return [];
    return attributes.tags
      .filter(t => t.attributes && t.attributes.name)
      .map(t => t.attributes.name.en || Object.values(t.attributes.name)[0]);
  },

  _mapManga(item) {
    const id = item.id;
    const attr = item.attributes || {};
    const coverUrl = this._extractCover(item.relationships, id);
    const title = this._extractTitle(attr);
    const author = this._extractAuthor(item.relationships, "author");
    const artist = this._extractAuthor(item.relationships, "artist");
    const description = this._extractDescription(attr);
    const genres = this._extractGenres(attr);

    let status = "UNKNOWN";
    if (attr.status === "ongoing") status = "ONGOING";
    else if (attr.status === "completed") status = "COMPLETED";
    else if (attr.status === "hiatus") status = "ON_HIATUS";
    else if (attr.status === "cancelled") status = "CANCELLED";

    return {
      url: id,
      title: title,
      thumbnailUrl: coverUrl,
      author: author,
      artist: artist,
      description: description,
      genres: genres,
      status: status,
      isNovel: false
    };
  },

  async getPopular(page) {
    const limit = 20;
    const offset = Math.max(0, (page - 1) * limit);
    const url = `${this.apiUrl}/manga?limit=${limit}&offset=${offset}&includes[]=cover_art&includes[]=author&includes[]=artist&order[followedCount]=desc&contentRating[]=safe&contentRating[]=suggestive`;

    const res = await dokuha.fetch(url, { headers: this._headers() });
    const data = await res.json();
    const mangas = (data.data || []).map(item => this._mapManga(item));
    const total = data.total || 0;
    const hasNext = offset + limit < total;
    return { mangas: mangas, hasNextPage: hasNext };
  },

  async getLatestUpdates(page) {
    const limit = 20;
    const offset = Math.max(0, (page - 1) * limit);
    const url = `${this.apiUrl}/manga?limit=${limit}&offset=${offset}&includes[]=cover_art&includes[]=author&includes[]=artist&order[latestUploadedChapter]=desc&contentRating[]=safe&contentRating[]=suggestive`;

    const res = await dokuha.fetch(url, { headers: this._headers() });
    const data = await res.json();
    const mangas = (data.data || []).map(item => this._mapManga(item));
    const total = data.total || 0;
    const hasNext = offset + limit < total;
    return { mangas: mangas, hasNextPage: hasNext };
  },

  async search(query, page, filters) {
    const limit = 20;
    const offset = Math.max(0, (page - 1) * limit);
    let url = `${this.apiUrl}/manga?limit=${limit}&offset=${offset}&includes[]=cover_art&includes[]=author&includes[]=artist&contentRating[]=safe&contentRating[]=suggestive`;
    if (query && query.trim().length > 0) {
      url += `&title=${encodeURIComponent(query.trim())}`;
    } else {
      url += `&order[followedCount]=desc`;
    }

    const res = await dokuha.fetch(url, { headers: this._headers() });
    const data = await res.json();
    const mangas = (data.data || []).map(item => this._mapManga(item));
    const total = data.total || 0;
    const hasNext = offset + limit < total;
    return { mangas: mangas, hasNextPage: hasNext };
  },

  async getDetails(url) {
    const id = url.replace("https://mangadex.org/title/", "").replace("https://api.mangadex.org/manga/", "").split("/")[0];
    const fetchUrl = `${this.apiUrl}/manga/${id}?includes[]=cover_art&includes[]=author&includes[]=artist`;

    const res = await dokuha.fetch(fetchUrl, { headers: this._headers() });
    const json = await res.json();
    if (json.data) {
      return this._mapManga(json.data);
    }
    return { url: id, title: "Unknown", isNovel: false };
  },

  async getChapters(url) {
    const id = url.replace("https://mangadex.org/title/", "").replace("https://api.mangadex.org/manga/", "").split("/")[0];
    const fetchUrl = `${this.apiUrl}/manga/${id}/feed?limit=100&translatedLanguage[]=en&order[chapter]=desc&includeExternalUrl=0`;

    const res = await dokuha.fetch(fetchUrl, { headers: this._headers() });
    const json = await res.json();
    const chaptersData = json.data || [];

    return chaptersData.map(ch => {
      const attr = ch.attributes || {};
      const chNum = parseFloat(attr.chapter) || 0;
      const title = attr.title ? ` - ${attr.title}` : "";
      const name = attr.chapter ? `Chapter ${attr.chapter}${title}` : (attr.title || "Oneshot");
      const dateUpload = attr.publishAt ? new Date(attr.publishAt).getTime() : 0;

      return {
        url: ch.id,
        name: name,
        chapterNumber: chNum,
        dateUpload: dateUpload,
        scanlator: null
      };
    });
  },

  async getPages(chapterUrl) {
    const id = chapterUrl.split("/").pop();
    const fetchUrl = `${this.apiUrl}/at-home/server/${id}`;

    const res = await dokuha.fetch(fetchUrl, { headers: this._headers() });
    const json = await res.json();

    if (json.result !== "ok" || !json.baseUrl || !json.chapter) {
      return [];
    }

    const baseUrl = json.baseUrl;
    const hash = json.chapter.hash;
    const files = json.chapter.data || [];

    return files.map((file, idx) => ({
      index: idx + 1,
      url: `${baseUrl}/data/${hash}/${file}`,
      imageUrl: `${baseUrl}/data/${hash}/${file}`
    }));
  }
};

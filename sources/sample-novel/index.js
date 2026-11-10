/**
 * Sample Novel Extension for Dokuha
 */
const manifest = {
  "id": "sample-novel",
  "name": "Sample Novel",
  "version": "1.0.0",
  "lang": "en",
  "baseUrl": "https://samplenovel.example.com",
  "type": "NOVEL",
  "iconUrl": "https://samplenovel.example.com/icon.png",
  "isNsfw": false
};

const extension = {
  async getPopular(page) {
    return {
      mangas: [
        {
          url: "https://samplenovel.example.com/novel/supreme-magus",
          title: "Supreme Magus",
          thumbnailUrl: "https://samplenovel.example.com/covers/magus.jpg",
          status: "ONGOING",
          genres: ["Fantasy", "Reincarnation"],
          isNovel: true
        }
      ],
      hasNextPage: false
    };
  },

  async getLatestUpdates(page) {
    return this.getPopular(page);
  },

  async search(query, page, filters) {
    const popular = await this.getPopular(page);
    return popular;
  },

  async getDetails(url) {
    return {
      url: url,
      title: "Supreme Magus",
      author: "Legion20",
      description: "Derek McCoy was a man who spent his life facing adversity and deception...",
      genres: ["Fantasy", "Reincarnation"],
      status: "ONGOING",
      thumbnailUrl: "https://samplenovel.example.com/covers/magus.jpg",
      isNovel: true
    };
  },

  async getChapters(url) {
    return [
      {
        url: url + "/ch-1",
        name: "Chapter 1: The Rebirth",
        chapterNumber: 1.0,
        dateUpload: 1704067200000
      }
    ];
  },

  async getNovelContent(chapterUrl) {
    return {
      chapterUrl: chapterUrl,
      title: "Chapter 1: The Rebirth",
      htmlBody: "<p>The pain subsided as consciousness returned like waves lapping against a rocky shore.</p><p>Opening his eyes, he was greeted not by the blinding hospital lights, but by an expansive wooden ceiling under an unknown sky.</p>",
      plainText: "The pain subsided as consciousness returned like waves lapping against a rocky shore.\n\nOpening his eyes, he was greeted not by the blinding hospital lights, but by an expansive wooden ceiling under an unknown sky."
    };
  }
};

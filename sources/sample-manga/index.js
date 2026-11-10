/**
 * Sample Manga Extension for Dokuha
 */
const manifest = {
  "id": "sample-manga",
  "name": "Sample Manga",
  "version": "1.0.0",
  "lang": "en",
  "baseUrl": "https://samplemanga.example.com",
  "type": "COMIC",
  "iconUrl": "https://samplemanga.example.com/icon.png",
  "isNsfw": false
};

const extension = {
  async getPopular(page) {
    return {
      mangas: [
        {
          url: "https://samplemanga.example.com/manga/shadow-monarch",
          title: "Shadow Monarch",
          thumbnailUrl: "https://samplemanga.example.com/covers/shadow.jpg",
          status: "ONGOING",
          genres: ["Action", "Fantasy"],
          isNovel: false
        },
        {
          url: "https://samplemanga.example.com/manga/celestial-blade",
          title: "Celestial Blade",
          thumbnailUrl: "https://samplemanga.example.com/covers/celestial.jpg",
          status: "COMPLETED",
          genres: ["Martial Arts", "Adventure"],
          isNovel: false
        }
      ],
      hasNextPage: page < 3
    };
  },

  async getLatestUpdates(page) {
    return this.getPopular(page);
  },

  async search(query, page, filters) {
    const popular = await this.getPopular(page);
    const q = (query || "").toLowerCase();
    const filtered = popular.mangas.filter(m => m.title.toLowerCase().includes(q));
    return {
      mangas: filtered,
      hasNextPage: false
    };
  },

  async getDetails(url) {
    return {
      url: url,
      title: "Shadow Monarch",
      author: "Chugong",
      artist: "DUBU",
      description: "When an enigmatic gate connected earth to a realm of monsters, awakeners gained supernatural abilities...",
      genres: ["Action", "Fantasy", "Supernatural"],
      status: "COMPLETED",
      thumbnailUrl: "https://samplemanga.example.com/covers/shadow.jpg",
      isNovel: false
    };
  },

  async getChapters(url) {
    return [
      {
        url: url + "/chapter-1",
        name: "Chapter 1: The Weakest Hunter",
        chapterNumber: 1.0,
        dateUpload: 1704067200000,
        scanlator: "Sample Scans"
      },
      {
        url: url + "/chapter-2",
        name: "Chapter 2: The Double Dungeon",
        chapterNumber: 2.0,
        dateUpload: 1704153600000,
        scanlator: "Sample Scans"
      }
    ];
  },

  async getPages(chapterUrl) {
    return [
      { index: 1, url: chapterUrl + "/page-1", imageUrl: "https://samplemanga.example.com/pages/ch1/1.jpg" },
      { index: 2, url: chapterUrl + "/page-2", imageUrl: "https://samplemanga.example.com/pages/ch1/2.jpg" },
      { index: 3, url: chapterUrl + "/page-3", imageUrl: "https://samplemanga.example.com/pages/ch1/3.jpg" }
    ];
  }
};

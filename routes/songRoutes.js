const express = require("express");

const Song = require("../models/Song");
const { genreNodes, getGenreBySlug } = require("../data/genreNetwork");

const router = express.Router();

let Vibrant;

try {
  const vibrantModule = require("node-vibrant/node");
  Vibrant = vibrantModule.Vibrant || vibrantModule.default || vibrantModule;
} catch (error) {
  const fallbackModule = require("node-vibrant");
  Vibrant = fallbackModule.Vibrant || fallbackModule.default || fallbackModule;
}

const DEFAULT_COLOR = "#111827";
const DEFAULT_DISCOVERY_SLUGS = ["dream-pop", "neo-soul", "uk-garage", "art-pop"];
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "i",
  "im",
  "in",
  "into",
  "it",
  "its",
  "like",
  "looking",
  "me",
  "of",
  "or",
  "something",
  "some",
  "that",
  "the",
  "to",
  "want",
  "with"
]);

function normalizeText(value = "") {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokenize(value = "") {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token && !STOP_WORDS.has(token));
}

function scoreLyricsMatch(result, title, artist) {
  const normalizedTitle = normalizeText(title);
  const normalizedArtist = normalizeText(artist);
  const resultTitle = normalizeText(result.trackName || "");
  const resultArtist = normalizeText(result.artistName || "");

  let score = 0;

  if (resultTitle === normalizedTitle) {
    score += 3;
  } else if (resultTitle.includes(normalizedTitle) || normalizedTitle.includes(resultTitle)) {
    score += 2;
  }

  if (resultArtist === normalizedArtist) {
    score += 3;
  } else if (resultArtist.includes(normalizedArtist) || normalizedArtist.includes(resultArtist)) {
    score += 2;
  }

  return score;
}

function timestampToSeconds(timestamp = "") {
  const [minutesPart, secondsPart] = timestamp.split(":");
  const minutes = Number(minutesPart || 0);
  const seconds = Number(secondsPart || 0);

  return minutes * 60 + seconds;
}

function parseSyncedLyrics(syncedLyrics = "") {
  return syncedLyrics
    .split("\n")
    .flatMap((line) => {
      const matches = [...line.matchAll(/\[(\d{2}:\d{2}(?:\.\d{2,3})?)\]/g)];
      const lyricText = line.replace(/\[(\d{2}:\d{2}(?:\.\d{2,3})?)\]/g, "").trim();

      if (!matches.length || !lyricText) {
        return [];
      }

      return matches.map((match) => ({
        timestamp: match[1],
        seconds: timestampToSeconds(match[1]),
        text: lyricText
      }));
    });
}

function syncedLyricsToPlainText(syncedLyrics = "") {
  return syncedLyrics
    .split("\n")
    .map((line) => line.replace(/\[(\d{2}:\d{2}(?:\.\d{2,3})?)\]/g, "").trim())
    .filter(Boolean)
    .join("\n");
}

function scoreGenreNode(node, rawQuery = "") {
  const normalizedQuery = normalizeText(rawQuery);
  const queryTokens = tokenize(rawQuery);
  const reasonSet = new Set();
  let score = 0;

  if (!normalizedQuery) {
    return { score, reasons: [] };
  }

  const fields = [node.name, ...(node.aliases || []), ...(node.vibes || []), node.cluster, node.blurb];

  for (const field of fields) {
    const normalizedField = normalizeText(field);

    if (normalizedField && normalizedQuery.includes(normalizedField)) {
      score += field === node.name ? 10 : 6;
      reasonSet.add(field);
    }
  }

  for (const token of queryTokens) {
    if (normalizeText(node.name).includes(token)) {
      score += 4;
      reasonSet.add(token);
    }

    if ((node.aliases || []).some((alias) => normalizeText(alias).includes(token))) {
      score += 3;
      reasonSet.add(token);
    }

    if ((node.vibes || []).some((vibe) => normalizeText(vibe).includes(token))) {
      score += 2;
      reasonSet.add(token);
    }

    if (normalizeText(node.blurb || "").includes(token)) {
      score += 1;
      reasonSet.add(token);
    }
  }

  return {
    score,
    reasons: [...reasonSet].slice(0, 3)
  };
}

function getDefaultGenres() {
  return DEFAULT_DISCOVERY_SLUGS.map((slug) => getGenreBySlug(slug)).filter(Boolean);
}

function getMatchedGenres(rawQuery = "", explicitSlug = "") {
  if (explicitSlug) {
    const explicitGenre = getGenreBySlug(explicitSlug);

    if (!explicitGenre) {
      return [];
    }

    const relatedGenres = explicitGenre.related
      .map((relatedSlug) => getGenreBySlug(relatedSlug))
      .filter(Boolean)
      .slice(0, 3);

    return [
      { ...explicitGenre, matchReasons: ["selected genre"], matchScore: 999 },
      ...relatedGenres.map((genre) => ({
        ...genre,
        matchReasons: ["connected node"],
        matchScore: 100
      }))
    ];
  }

  const rankedGenres = genreNodes
    .map((node) => {
      const { score, reasons } = scoreGenreNode(node, rawQuery);

      return {
        ...node,
        matchScore: score,
        matchReasons: reasons
      };
    })
    .filter((node) => node.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 5);

  if (rankedGenres.length) {
    return rankedGenres;
  }

  return getDefaultGenres().map((genre) => ({
    ...genre,
    matchScore: 0,
    matchReasons: ["editorial starter"]
  }));
}

async function fetchLyrics(title, artist) {
  const params = new URLSearchParams({
    track_name: title,
    artist_name: artist
  });

  const response = await fetch(`https://lrclib.net/api/search?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`LRCLIB request failed with status ${response.status}`);
  }

  const results = await response.json();

  if (!Array.isArray(results) || results.length === 0) {
    return {
      syncedLyrics: "",
      plainLyrics: ""
    };
  }

  const bestMatch = [...results].sort(
    (a, b) => scoreLyricsMatch(b, title, artist) - scoreLyricsMatch(a, title, artist)
  )[0];

  return {
    syncedLyrics: bestMatch.syncedLyrics || "",
    plainLyrics: bestMatch.plainLyrics || ""
  };
}

async function extractBackgroundColor(albumCover) {
  if (!albumCover) {
    return DEFAULT_COLOR;
  }

  try {
    const imageResponse = await fetch(albumCover);

    if (!imageResponse.ok) {
      return DEFAULT_COLOR;
    }

    const buffer = Buffer.from(await imageResponse.arrayBuffer());
    const palette = await Vibrant.from(buffer).getPalette();
    const swatch =
      palette.Vibrant ||
      palette.DarkVibrant ||
      palette.Muted ||
      palette.LightVibrant ||
      palette.DarkMuted;

    return swatch?.hex || swatch?.getHex?.() || DEFAULT_COLOR;
  } catch (error) {
    console.error("Color extraction failed:", error.message);
    return DEFAULT_COLOR;
  }
}

async function searchDeezer(term) {
  const response = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(term)}`);

  if (!response.ok) {
    throw new Error(`Deezer request failed with status ${response.status}`);
  }

  const payload = await response.json();
  const songs = Array.isArray(payload.data) ? payload.data : [];
  const artistMatch = term.match(/artist:"([^"]+)"/i);

  if (!artistMatch) {
    return songs;
  }

  const expectedArtist = normalizeText(artistMatch[1]);

  return songs.filter((song) => {
    const artistName = normalizeText(song.artist?.name || "");
    return artistName === expectedArtist || artistName.includes(expectedArtist);
  });
}

async function fetchDiscoveryTracks(matchedGenres, rawQuery = "") {
  const searchPlans = [];

  for (const genre of matchedGenres.slice(0, 4)) {
    for (const seedQuery of genre.seedQueries.slice(0, 2)) {
      searchPlans.push({
        query: seedQuery,
        sourceGenre: genre.slug
      });
    }
  }

  if (!searchPlans.length && rawQuery.trim()) {
    searchPlans.push({
      query: rawQuery.trim(),
      sourceGenre: ""
    });
  }

  const uniquePlans = [];
  const seenQueries = new Set();

  for (const plan of searchPlans) {
    if (seenQueries.has(plan.query)) {
      continue;
    }

    seenQueries.add(plan.query);
    uniquePlans.push(plan);
  }

  const payloads = await Promise.all(
    uniquePlans.slice(0, 6).map(async (plan) => {
      try {
        const songs = await searchDeezer(plan.query);
        return songs.slice(0, 8).map((song) => ({
          ...song,
          discoverySource: plan.sourceGenre
        }));
      } catch (error) {
        console.error("Discovery search failed:", plan.query, error.message);
        return [];
      }
    })
  );

  const uniqueSongs = new Map();

  for (const songs of payloads) {
    for (const song of songs) {
      if (!uniqueSongs.has(song.id)) {
        uniqueSongs.set(song.id, song);
      }
    }
  }

  const songsByArtist = new Map();

  for (const song of uniqueSongs.values()) {
    const artistKey = String(song.artist?.id || normalizeText(song.artist?.name || "unknown"));
    const bucket = songsByArtist.get(artistKey) || [];

    bucket.push(song);
    songsByArtist.set(artistKey, bucket);
  }

  const artistBuckets = [...songsByArtist.values()]
    .sort((left, right) => left[0].artist.name.localeCompare(right[0].artist.name))
    .map((bucket) => bucket.slice(0, 4));

  const interleavedSongs = [];

  while (artistBuckets.some((bucket) => bucket.length)) {
    for (const bucket of artistBuckets) {
      if (!bucket.length) {
        continue;
      }

      interleavedSongs.push(bucket.shift());

      if (interleavedSongs.length === 18) {
        return interleavedSongs;
      }
    }
  }

  return interleavedSongs.slice(0, 18);
}

function buildArtistHighlights(songs = []) {
  const artists = new Map();

  for (const song of songs) {
    if (!song.artist?.id) {
      continue;
    }

    const existing = artists.get(song.artist.id) || {
      id: song.artist.id,
      name: song.artist.name,
      image: song.artist.picture_medium || song.artist.picture || "",
      appearances: 0
    };

    existing.appearances += 1;
    artists.set(song.artist.id, existing);
  }

  return [...artists.values()]
    .sort((a, b) => b.appearances - a.appearances)
    .slice(0, 8);
}

function buildActiveGenreSlugs(matchedGenres = []) {
  return matchedGenres.map((genre) => genre.slug);
}

router.get("/search", async (req, res) => {
  const query = req.query.q?.trim() || "";
  const matchedGenres = getMatchedGenres(query);

  try {
    const songs = await fetchDiscoveryTracks(matchedGenres, query);

    res.render("results", {
      pageTitle: query ? `Vibe results for ${query}` : "Discovery Results",
      query,
      matchedGenres,
      genreNodes,
      activeGenreSlugs: buildActiveGenreSlugs(matchedGenres),
      songs,
      featuredArtists: buildArtistHighlights(songs),
      selectedGenre: null,
      errorMessage: songs.length ? "" : "No preview-ready tracks came back for that search. Try a different mood."
    });
  } catch (error) {
    console.error("Discovery search failed:", error.message);
    res.status(500).render("results", {
      pageTitle: "Discovery Results",
      query,
      matchedGenres,
      genreNodes,
      activeGenreSlugs: buildActiveGenreSlugs(matchedGenres),
      songs: [],
      featuredArtists: [],
      selectedGenre: null,
      errorMessage: "Discovery search is unavailable right now. Please try again."
    });
  }
});

router.get("/genre/:slug", async (req, res) => {
  const selectedGenre = getGenreBySlug(req.params.slug);

  if (!selectedGenre) {
    return res.status(404).render("not-found", {
      pageTitle: "Genre Not Found"
    });
  }

  const matchedGenres = getMatchedGenres("", selectedGenre.slug);

  try {
    const songs = await fetchDiscoveryTracks(matchedGenres, selectedGenre.name);

    res.render("results", {
      pageTitle: `${selectedGenre.name} Discovery`,
      query: "",
      matchedGenres,
      genreNodes,
      activeGenreSlugs: buildActiveGenreSlugs(matchedGenres),
      songs,
      featuredArtists: buildArtistHighlights(songs),
      selectedGenre,
      errorMessage: songs.length ? "" : "No preview-ready tracks came back for this genre right now."
    });
  } catch (error) {
    console.error("Genre discovery failed:", error.message);
    res.status(500).render("results", {
      pageTitle: `${selectedGenre.name} Discovery`,
      query: "",
      matchedGenres,
      genreNodes,
      activeGenreSlugs: buildActiveGenreSlugs(matchedGenres),
      songs: [],
      featuredArtists: [],
      selectedGenre,
      errorMessage: "Genre discovery is unavailable right now. Please try again."
    });
  }
});

router.post("/save", async (req, res) => {
  const {
    title = "",
    artist = "",
    album = "",
    albumCover = "",
    previewUrl = "",
    deezerId = "",
    discoveryGenres = "",
    sourceQuery = ""
  } = req.body;

  if (!title || !artist || !album || !deezerId) {
    return res.status(400).render("error", {
      pageTitle: "Missing Song Data",
      errorMessage: "The selected song was missing required fields."
    });
  }

  try {
    const existingSong = await Song.findOne({ deezerId });

    if (existingSong) {
      return res.redirect(`/songs/${existingSong._id}`);
    }

    let lyrics = {
      syncedLyrics: "",
      plainLyrics: ""
    };

    try {
      lyrics = await fetchLyrics(title, artist);
    } catch (lyricsError) {
      console.error("Lyrics lookup failed:", lyricsError.message);
    }

    const backgroundColor = await extractBackgroundColor(albumCover);
    const normalizedGenres = discoveryGenres
      .split(",")
      .map((genre) => genre.trim())
      .filter(Boolean);

    const savedSong = await Song.create({
      title,
      artist,
      album,
      albumCover,
      previewUrl,
      deezerId,
      plainLyrics: lyrics.plainLyrics,
      syncedLyrics: lyrics.syncedLyrics,
      backgroundColor,
      discoveryGenres: normalizedGenres,
      sourceQuery
    });

    res.redirect(`/songs/${savedSong._id}`);
  } catch (error) {
    console.error("Save failed:", error.message);
    res.status(500).render("error", {
      pageTitle: "Save Failed",
      errorMessage: "The song could not be saved. Please try again."
    });
  }
});

router.get("/saved", async (req, res) => {
  try {
    const songs = await Song.find().sort({ createdAt: -1 });

    res.render("saved", {
      pageTitle: "Saved Songs",
      songs
    });
  } catch (error) {
    console.error("Saved songs lookup failed:", error.message);
    res.status(500).render("error", {
      pageTitle: "Saved Songs",
      errorMessage: "Saved songs could not be loaded."
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const song = await Song.findById(req.params.id);

    if (!song) {
      return res.status(404).render("not-found", {
        pageTitle: "Song Not Found"
      });
    }

    const savedGenres = (song.discoveryGenres || [])
      .map((slug) => getGenreBySlug(slug))
      .filter(Boolean);

    res.render("song", {
      pageTitle: `${song.title} by ${song.artist}`,
      song,
      parsedSyncedLyrics: parseSyncedLyrics(song.syncedLyrics),
      savedGenres,
      displayLyrics: syncedLyricsToPlainText(song.syncedLyrics) || song.plainLyrics || ""
    });
  } catch (error) {
    console.error("Song lookup failed:", error.message);
    res.status(500).render("error", {
      pageTitle: "Song Detail",
      errorMessage: "The song detail page could not be loaded."
    });
  }
});

module.exports = router;

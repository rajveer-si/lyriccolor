const express = require("express");

const Song = require("../models/Song");

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

function syncedLyricsToPlainText(syncedLyrics = "") {
  return syncedLyrics
    .split("\n")
    .map((line) => line.replace(/\[(\d{2}:\d{2}(?:\.\d{2,3})?)\]/g, "").trim())
    .filter(Boolean)
    .join("\n");
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

async function fetchDeezerTrackById(deezerId) {
  const response = await fetch(`https://api.deezer.com/track/${encodeURIComponent(deezerId)}`);

  if (!response.ok) {
    throw new Error(`Deezer track request failed with status ${response.status}`);
  }

  const track = await response.json();

  if (!track || track.error) {
    throw new Error("Deezer track lookup returned an error payload.");
  }

  return track;
}

function buildSearchPlans(rawQuery = "") {
  const trimmedQuery = rawQuery.trim();

  if (!trimmedQuery) {
    return [];
  }

  const queryTokens = tokenize(trimmedQuery);
  const quotedQuery = `"${trimmedQuery}"`;
  const compactTokens = queryTokens.slice(0, 4).join(" ");
  const plans = [trimmedQuery, quotedQuery];

  if (compactTokens && compactTokens !== trimmedQuery) {
    plans.push(compactTokens);
  }

  return [...new Set(plans)];
}

async function fetchDiscoveryTracks(rawQuery = "") {
  const searchPlans = buildSearchPlans(rawQuery);

  if (!searchPlans.length) {
    return [];
  }

  const payloads = await Promise.all(
    searchPlans.slice(0, 3).map(async (query) => {
      try {
        return await searchDeezer(query);
      } catch (error) {
        console.error("Discovery search failed:", query, error.message);
        return [];
      }
    })
  );

  const uniqueSongs = new Map();

  for (const songs of payloads) {
    for (const song of songs) {
      if (!song?.id || uniqueSongs.has(song.id)) {
        continue;
      }

      uniqueSongs.set(song.id, song);
    }
  }

  const songsByArtist = new Map();

  for (const song of uniqueSongs.values()) {
    const artistKey = String(song.artist?.id || normalizeText(song.artist?.name || "unknown"));
    const bucket = songsByArtist.get(artistKey) || [];

    if (bucket.length < 4) {
      bucket.push(song);
      songsByArtist.set(artistKey, bucket);
    }
  }

  const artistBuckets = [...songsByArtist.values()].sort((left, right) =>
    left[0].artist.name.localeCompare(right[0].artist.name)
  );

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

  return interleavedSongs;
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

router.get("/search", async (req, res) => {
  const query = req.query.q?.trim() || "";

  try {
    const songs = await fetchDiscoveryTracks(query);

    res.render("results", {
      pageTitle: query ? `Vibe results for ${query}` : "Discovery Results",
      query,
      songs,
      featuredArtists: buildArtistHighlights(songs),
      errorMessage: songs.length ? "" : "No preview-ready tracks came back for that search. Try a different mood."
    });
  } catch (error) {
    console.error("Discovery search failed:", error.message);
    res.status(500).render("results", {
      pageTitle: "Discovery Results",
      query,
      songs: [],
      featuredArtists: [],
      errorMessage: "Discovery search is unavailable right now. Please try again."
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

    let resolvedPreviewUrl = song.previewUrl || "";

    if (song.deezerId) {
      try {
        const deezerTrack = await fetchDeezerTrackById(song.deezerId);

        if (deezerTrack.preview) {
          resolvedPreviewUrl = deezerTrack.preview;

          if (resolvedPreviewUrl !== song.previewUrl) {
            song.previewUrl = resolvedPreviewUrl;
            await song.save();
          }
        }
      } catch (deezerError) {
        console.error("Deezer preview refresh failed:", deezerError.message);
      }
    }

    res.render("song", {
      pageTitle: `${song.title} by ${song.artist}`,
      song,
      displayLyrics: syncedLyricsToPlainText(song.syncedLyrics) || song.plainLyrics || "",
      resolvedPreviewUrl
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

const mongoose = require("mongoose");

const songSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  artist: {
    type: String,
    required: true,
    trim: true
  },
  album: {
    type: String,
    required: true,
    trim: true
  },
  albumCover: {
    type: String,
    default: ""
  },
  previewUrl: {
    type: String,
    default: ""
  },
  deezerId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  plainLyrics: {
    type: String,
    default: ""
  },
  syncedLyrics: {
    type: String,
    default: ""
  },
  backgroundColor: {
    type: String,
    default: "#1e293b"
  },
  sourceQuery: {
    type: String,
    default: ""
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Song", songSchema);

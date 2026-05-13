# LyricColor

Submitted by: Rajveer Singh (rajveer)
Group Members: Rajveer Singh (rajveer)
App Description: LyricColor is a vibe-first music discovery app where users describe a mood, explore a curated genre network, play Deezer previews, and save tracks with MongoDB-backed detail pages.
YouTube Video Link: https://youtu.be/upltUFED5Rw?si=SWdElKm3s0jPpiR2
APIs: [Deezer API](https://developers.deezer.com/api), [LRCLIB API](https://lrclib.net/docs)
Contact Email: rajveer@terpmail.umd.edu
Deployed App Link: https://lyriccolor.onrender.com
AI Use: 1. ChatGPT, 2. Codex

## Overview

LyricColor is built with Node.js, Express.js, MongoDB, Mongoose, EJS, and custom CSS. Users can search by vibe instead of by exact song title, move through a curated network of micro-genres, preview tracks from Deezer, and save discoveries to MongoDB. Saved track pages also include LRCLIB lyric data and album-inspired color styling.

## Features

- Vibe search form on the home page.
- Curated clickable genre network for discovery.
- Deezer-powered track previews with album art and artist metadata.
- MongoDB storage and retrieval for saved tracks.
- LRCLIB synced/plain lyric data attached to saved track pages.
- Duplicate prevention using `deezerId`.
- Express router-based song/discovery endpoints.

## Tech Stack

- Node.js
- Express.js
- Mongoose
- MongoDB Atlas
- EJS
- CSS with Google Fonts

## Project Structure

```text
server.js
package.json
.env.example
README.md
models/Song.js
routes/songRoutes.js
views/
public/
data/genreNetwork.js
```

## Installation

1. Run `npm install`
2. Copy `.env.example` to `.env`
3. Set the MongoDB connection string in `.env`
4. Start the app with `npm start`
5. For development, use `npm run dev`

## Environment Variables

```env
MONGODB_URI=your_mongodb_connection_string_here
PORT=3000
```

## Render Deployment

- Build command: `npm install`
- Start command: `npm start`
- Environment variable: `MONGODB_URI`

## Submission Notes

- Remove `node_modules` before uploading the zip file.
- Do not include your real `.env` file in the submission.
- Keep `package.json` and `package-lock.json` in the zip so the project can be recreated with `npm install`.

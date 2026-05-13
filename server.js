require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const path = require("path");

const songRoutes = require("./routes/songRoutes");
const { genreNodes } = require("./data/genreNetwork");

const app = express();
const PORT = process.env.PORT || 3000;
const mongoUri = process.env.MONGODB_URI;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/favicon.ico", (req, res) => {
  res.redirect("/favicon.svg");
});

app.get("/", (req, res) => {
  res.render("index", {
    pageTitle: "Home",
    genreNodes,
    activeGenreSlugs: [],
    starterPrompts: [
      "glossy late-night city lights",
      "messy dancefloor after 1am",
      "warm analog soul with groove",
      "soft guitar haze for a rainy night",
      "bright coastal music with elegance",
      "restless underground club energy"
    ]
  });
});

app.use("/songs", songRoutes);

app.use((req, res) => {
  res.status(404).render("not-found", { pageTitle: "Page Not Found" });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render("error", {
    pageTitle: "Something Went Wrong",
    errorMessage: "The app hit an unexpected error. Please try again."
  });
});

async function startServer() {
  if (!mongoUri) {
    throw new Error("MONGODB_URI is missing. Add it to your .env file.");
  }

  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB.");

  app.listen(PORT, () => {
    console.log(`LyricColor is running on http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  });
}

module.exports = { app, startServer };

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) {
    return "0:00";
  }

  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = String(safeSeconds % 60).padStart(2, "0");

  return `${minutes}:${remainingSeconds}`;
}

function showLoading(message = "Loading...") {
  const overlay = document.querySelector("[data-loading-overlay]");
  const text = document.querySelector("[data-loading-text]");

  if (!overlay || !text) {
    return;
  }

  text.textContent = message;
  overlay.hidden = false;
  document.body.classList.add("is-loading");
}

function initLoadingFeedback() {
  document.querySelectorAll(".js-load-form").forEach((form) => {
    form.addEventListener("submit", () => {
      const button = form.querySelector("button[type='submit']");
      const message = form.dataset.loadingMessage || "Loading...";

      if (button) {
        button.disabled = true;
        button.textContent = button.dataset.loadingLabel || "Loading...";
      }

      showLoading(message);
    });
  });

  document.querySelectorAll(".js-load-link").forEach((link) => {
    link.addEventListener("click", () => {
      showLoading(link.dataset.loadingMessage || "Loading...");
    });
  });
}

function initSongPlayer() {
  const stage = document.querySelector("[data-song-player]");

  if (!stage) {
    return;
  }

  const audio = stage.querySelector("[data-preview-audio]");
  const toggle = stage.querySelector("[data-player-toggle]");
  const progress = stage.querySelector("[data-player-progress]");
  const currentTimeLabel = stage.querySelector("[data-player-current]");
  const durationLabel = stage.querySelector("[data-player-duration]");

  if (!audio || !toggle || !progress) {
    return;
  }

  function setProgressStyles() {
    const max = Number(progress.max || 0);
    const value = Number(progress.value || 0);
    const percent = max ? `${(value / max) * 100}%` : "0%";
    progress.style.setProperty("--progress", percent);
  }

  function updatePlayerLabels() {
    const duration = Number.isFinite(audio.duration) ? audio.duration : 30;
    progress.max = String(duration);
    progress.value = String(audio.currentTime || 0);
    currentTimeLabel.textContent = formatTime(audio.currentTime || 0);
    durationLabel.textContent = formatTime(duration);
    setProgressStyles();
  }

  toggle.addEventListener("click", async () => {
    try {
      if (audio.paused) {
        await audio.play();
      } else {
        audio.pause();
      }
    } catch (error) {
      console.error("Preview playback was blocked by the browser.");
    }
  });

  audio.addEventListener("play", () => {
    toggle.textContent = "Pause";
  });

  audio.addEventListener("pause", () => {
    toggle.textContent = "Play";
  });

  audio.addEventListener("loadedmetadata", updatePlayerLabels);
  audio.addEventListener("timeupdate", () => {
    updatePlayerLabels();
  });

  audio.addEventListener("ended", () => {
    toggle.textContent = "Play";
    progress.value = "0";
    setProgressStyles();
    currentTimeLabel.textContent = "0:00";
  });

  progress.addEventListener("input", () => {
    audio.currentTime = Number(progress.value);
    updatePlayerLabels();
  });

  updatePlayerLabels();
}

document.addEventListener("DOMContentLoaded", () => {
  initLoadingFeedback();
  initSongPlayer();
});

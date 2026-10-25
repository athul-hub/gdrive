(() => {
  const params = new URLSearchParams(location.search);
  const folderId = params.get("folder"), folderName = params.get("name") || "Collection";
  const title = document.querySelector("#title"), description = document.querySelector("#description");
  const total = document.querySelector("#total"), grid = document.querySelector("#media");
  const search = document.querySelector("#search"), refresh = document.querySelector("#refresh");
  const notice = document.querySelector("#notice"), empty = document.querySelector("#empty");
  const count = document.querySelector("#count"), viewer = document.querySelector("#viewer");
  const stage = document.querySelector("#stage"), caption = document.querySelector("#caption");
  const drive = document.querySelector("#drive");
  let media = [], shown = [], active = 0;
  const config = () => window.GALLERY_CONFIG;

  title.textContent = folderName; document.title = `${folderName} — Kapture Stories`;
  description.textContent = "Photos and videos in one place.";
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const ready = () => {
    const c = config();
    return !!(c && typeof c.apiKey === "string" && c.apiKey.trim() &&
      !c.apiKey.includes("PASTE_"));
  };
  // Use a stable Drive thumbnail URL. thumbnailLink can be short-lived and
  // may produce broken or low-resolution images in long-lived gallery pages.
  const thumb = f => `https://drive.google.com/thumbnail?id=${encodeURIComponent(f.id)}&sz=w1600`;

  function addImageFallbacks(root) {
    root.querySelectorAll("img[data-drive-id]").forEach(img => {
      img.addEventListener("error", () => {
        const step = Number(img.dataset.fallbackStep || "0");
        const id = img.dataset.driveId;
        if (step === 0) {
          img.dataset.fallbackStep = "1";
          img.src = `https://drive.google.com/uc?export=view&id=${encodeURIComponent(id)}`;
        } else if (step === 1) {
          img.dataset.fallbackStep = "2";
          img.src = `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w800`;
        } else {
          img.classList.add("image-failed");
          img.removeAttribute("src");
        }
      });
    });
  }

  async function listDrive(query, fields) {
    let files = [], token = "";
    do {
      const c = config();
      const p = new URLSearchParams({q:query, pageSize:String(c.pageSize || 100),
        orderBy:"name", fields:`nextPageToken,files(${fields})`, key:c.apiKey});
      if (token) p.set("pageToken", token);
      const r = await fetch(`https://www.googleapis.com/drive/v3/files?${p}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || "Google Drive request failed.");
      files.push(...(d.files || [])); token = d.nextPageToken || "";
    } while (token);
    return files;
  }

  function render() {
    const term = (search.value || "").trim().toLowerCase();
    shown = media.filter(f => f.name.toLowerCase().includes(term));
    grid.innerHTML = shown.map((f, i) => {
      const video = f.mimeType?.startsWith("video/");
      const preview = video
        ? `<img class="video-thumbnail" src="https://drive.google.com/thumbnail?id=${encodeURIComponent(f.id)}&sz=w1600" data-drive-id="${esc(f.id)}" alt="Video thumbnail: ${esc(f.name)}" loading="lazy" decoding="async"><span class="video-play-badge" aria-hidden="true">▶</span>`
        : `<img src="${esc(thumb(f))}" data-drive-id="${esc(f.id)}" alt="${esc(f.name)}" loading="lazy" decoding="async">`;
      return `<article class="media-card" tabindex="0" role="button" aria-label="Open ${esc(f.name)}" data-index="${i}">
        <div class="media-cover">${preview}<span class="media-overlay">${video ? "Play video" : "View photo"} ↗</span></div>
        <div class="media-meta"><h3>${esc(f.name.replace(/\\.[^.]+$/, ""))}</h3><span>${video ? "VIDEO" : "PHOTO"}</span></div>
      </article>`;
    }).join("");
    addImageFallbacks(grid);
    count.textContent = String(shown.length).padStart(2, "0");
    total.textContent = `${media.length} item${media.length === 1 ? "" : "s"} in this collection`;
    empty.hidden = shown.length > 0;
  }

  async function load() {
    notice.hidden = true; refresh.classList.add("spinning"); total.textContent = "Loading media…";
    try {
      if (!folderId) throw new Error("No folder was specified. Return to the homepage and select a collection.");
      if (!ready()) throw new Error("config.js did not load correctly, or apiKey is empty.");
      const files = await listDrive(`'${folderId}' in parents and trashed = false`,
        "id,name,mimeType,thumbnailLink,webViewLink");
      media = files.filter(f => f.mimeType?.startsWith("image/") || f.mimeType?.startsWith("video/"));
      render();
      if (!media.length) {
        notice.textContent = "No photos or videos found. Add media to this folder and refresh.";
        notice.hidden = false;
      }
    } catch (e) {
      media = []; render(); total.textContent = "Unable to load collection";
      notice.textContent = `Could not load media: ${e.message} Check the folder ID, API access, and sharing settings.`;
      notice.hidden = false;
    } finally { refresh.classList.remove("spinning"); }
  }

  function open(index) {
    active = index; const f = shown[active]; if (!f) return;
    stage.replaceChildren();
    if (f.mimeType?.startsWith("video/")) {
      // Google Drive's preview player supports streaming better than a direct
      // download URL, which often fails to play/seek in browser video elements.
      const frame = document.createElement("iframe");
      frame.className = "drive-video-frame";
      frame.src = `https://drive.google.com/file/d/${encodeURIComponent(f.id)}/preview`;
      frame.title = `Video: ${f.name}`;
      frame.allow = "autoplay; fullscreen; picture-in-picture";
      frame.allowFullscreen = true;
      frame.referrerPolicy = "strict-origin-when-cross-origin";
      stage.appendChild(frame);
    } else {
      // Use the original Drive file endpoint in the lightbox, not the small
      // thumbnail used by the grid, so the viewer can display full resolution.
      const img = document.createElement("img");
      img.src = `https://drive.google.com/uc?export=view&id=${encodeURIComponent(f.id)}`;
      img.alt = f.name;
      img.loading = "eager";
      img.decoding = "async";
      img.addEventListener("error", () => {
        img.src = `https://drive.google.com/thumbnail?id=${encodeURIComponent(f.id)}&sz=w4000`;
      }, { once: true });
      stage.appendChild(img);
    }
    caption.textContent = f.name;
    drive.href = f.webViewLink || `https://drive.google.com/file/d/${encodeURIComponent(f.id)}/view`;
    viewer.classList.add("open"); viewer.setAttribute("aria-hidden", "false"); document.body.style.overflow = "hidden";
  }
  function close() {
    viewer.classList.remove("open"); viewer.setAttribute("aria-hidden", "true");
    stage.replaceChildren(); document.body.style.overflow = "";
  }
  function move(delta) { if (shown.length) open((active + delta + shown.length) % shown.length); }

  grid.addEventListener("click", e => { const card = e.target.closest(".media-card"); if (card) open(Number(card.dataset.index)); });
  grid.addEventListener("keydown", e => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches(".media-card")) { e.preventDefault(); open(Number(e.target.dataset.index)); }
  });
  search.addEventListener("input", render); refresh.addEventListener("click", load);
  document.querySelector("#close").addEventListener("click", close);
  document.querySelector("#prev").addEventListener("click", () => move(-1));
  document.querySelector("#next").addEventListener("click", () => move(1));
  viewer.addEventListener("click", e => { if (e.target === viewer) close(); });
  document.addEventListener("keydown", e => {
    if (!viewer.classList.contains("open")) return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowLeft") move(-1);
    if (e.key === "ArrowRight") move(1);
  });

  document.querySelector("#share").addEventListener("click", async () => {
    const url = location.href;
    try {
      if (navigator.share) await navigator.share({title:`${folderName} — Kapture Stories`, text:`View this collection: ${folderName}`, url});
      else if (navigator.clipboard && isSecureContext) {
        await navigator.clipboard.writeText(url);
        notice.textContent = "Collection link copied. You can now share it."; notice.hidden = false;
      } else prompt("Copy this collection link:", url);
    } catch (e) { if (e.name !== "AbortError") prompt("Copy this collection link:", url); }
  });
  load();
})();

(() => {
  const grid = document.querySelector("#cards"), search = document.querySelector("#search");
  const refresh = document.querySelector("#refresh"), notice = document.querySelector("#notice");
  const empty = document.querySelector("#empty"), count = document.querySelector("#count");
  const status = document.querySelector("#status");
  let collections = [];

  const config = () => window.GALLERY_CONFIG;
  const ready = () => {
    const c = config();
    return !!(c && typeof c.parentFolderId === "string" && c.parentFolderId.trim() &&
      typeof c.apiKey === "string" && c.apiKey.trim() &&
      !c.parentFolderId.includes("PASTE_") && !c.apiKey.includes("PASTE_"));
  };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  // Ask Drive for a larger thumbnail. Grid cards are rendered before covers
  // finish loading, so one slow folder won't delay the whole homepage.
  // Prefer Drive's stable thumbnail endpoint over thumbnailLink, which may
  // expire or return a preview that's too small for the card.
  const thumb = (file, size = 1600) =>
    `https://drive.google.com/thumbnail?id=${encodeURIComponent(file.id)}&sz=w${size}`;

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

  async function coverFor(folderId) {
    try {
      const items = await listDrive(
        `'${folderId}' in parents and trashed = false and (mimeType contains 'image/' or mimeType contains 'video/')`,
        "id,name,mimeType,thumbnailLink"
      );
      // Prefer a photo cover, but use a video poster thumbnail if the folder
      // contains no photos. Drive generates thumbnails for supported videos.
      const image = items.find(x => x.mimeType && x.mimeType.startsWith("image/"));
      const video = items.find(x => x.mimeType && x.mimeType.startsWith("video/"));
      const coverFile = image || video;
      return coverFile ? {
        url: coverFile.mimeType.startsWith("video/")
          ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(coverFile.id)}&sz=w1800`
          : thumb(coverFile, 1800),
        id: coverFile.id
      } : null;
    } catch { return ""; }
  }

  function render() {
    const term = (search.value || "").trim().toLowerCase();
    const shown = collections.filter(c => c.name.toLowerCase().includes(term));
    grid.innerHTML = shown.map(c => {
      const href = `collection.html?folder=${encodeURIComponent(c.id)}&name=${encodeURIComponent(c.name)}`;
      const cover = c.cover
        ? `<img src="${esc(c.cover)}" data-drive-id="${esc(c.coverId || "")}" alt="" loading="lazy" decoding="async">`
        : `<div class="cover-placeholder" data-cover-for="${esc(c.id)}"><span>✳</span><small>KAPTURE STORIES</small></div>`;
      return `<a class="collection-card" href="${href}" aria-label="Open collection ${esc(c.name)}">
        <div class="collection-cover">${cover}<span class="card-open">View collection ↗</span></div>
        <div class="collection-meta"><div><h3>${esc(c.name)}</h3><p>Photos &amp; videos</p></div><span class="card-number">↗</span></div>
      </a>`;
    }).join("");
    addImageFallbacks(grid);
    count.textContent = String(shown.length).padStart(2, "0");
    empty.hidden = shown.length > 0;
  }

  async function load() {
    notice.hidden = true; refresh.classList.add("spinning");
    status.textContent = "Discovering collections from Google Drive…";
    try {
      if (!ready()) throw new Error("config.js did not load correctly, or parentFolderId/apiKey is empty.");
      collections = await listDrive(
        `'${config().parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        "id,name,mimeType"
      );
      // Render collection names/cards immediately, then load cover images in
      // parallel and replace each placeholder as soon as its cover is ready.
      collections = collections.map(c => ({...c, cover: "", coverId: ""}));
      status.textContent = `${collections.length} collection${collections.length === 1 ? "" : "s"} connected to Google Drive`;
      render();
      Promise.all(collections.map(async c => {
        const cover = await coverFor(c.id);
        if (!cover) return;
        c.cover = cover.url;
        c.coverId = cover.id;
        const placeholder = grid.querySelector(`[data-cover-for="${CSS.escape(c.id)}"]`);
        if (!placeholder) return;
        const img = document.createElement("img");
        img.src = cover.url;
        img.dataset.driveId = cover.id;
        img.alt = "";
        img.loading = "lazy";
        img.decoding = "async";
        placeholder.replaceWith(img);
        addImageFallbacks(placeholder.parentElement || grid);
      })).catch(() => {});
      if (!collections.length) {
        notice.textContent = "No collection folders found. Create collection folders inside your configured main Google Drive folder.";
        notice.hidden = false;
      }
    } catch (e) {
      collections = []; render(); status.textContent = "Google Drive connection needs attention";
      notice.textContent = `Could not load collections: ${e.message} Check the folder ID, API key, Drive API access, and sharing settings.`;
      notice.hidden = false;
    } finally { refresh.classList.remove("spinning"); }
  }
  search.addEventListener("input", render);
  refresh.addEventListener("click", load);
  load();
})();

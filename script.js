const IMAGE_FORMATS = ["heic", "heif", "tiff", "tif", "nef", "png", "webp", "jpg", "jpeg"];
const VIDEO_FORMATS = ["mov", "avi", "mkv", "webm", "m4v", "mp4"];

let imageFiles = [];
let videoFiles = [];
let lastDownloadBlob = null;
let lastDownloadName = "";

const dropzone = document.getElementById("dropzone");

const inputImages = document.getElementById("inputImages");
const inputVideos = document.getElementById("inputVideos");
const inputFolder = document.getElementById("inputFolder");

const imageList = document.getElementById("imageList");
const videoList = document.getElementById("videoList");

const btnImages = document.getElementById("btnImages");
const btnVideos = document.getElementById("btnVideos");
const btnClear = document.getElementById("btnClear");

const progressModal = document.getElementById("progressModal");
const progressTitle = document.getElementById("progressTitle");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const downloadBtn = document.getElementById("downloadBtn");
const closeProgressBtn = document.getElementById("closeProgressBtn");

const previewModal = document.getElementById("previewModal");
const previewImg = document.getElementById("previewImg");
const closePreviewBtn = document.getElementById("closePreviewBtn");

function getExt(name) {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "";
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(2) + " " + sizes[i];
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function showProgress(title = "Convertendo...") {
  progressTitle.textContent = title;
  progressText.textContent = "Iniciando...";
  progressBar.style.width = "0%";
  progressModal.style.display = "flex";
  downloadBtn.style.display = "none";
  lastDownloadBlob = null;
  lastDownloadName = "";
}

function updateProgress(current, total, fileName = "") {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  progressBar.style.width = `${percent}%`;
  progressText.textContent = `${current} de ${total} (${percent}%)${fileName ? " • " + fileName : ""}`;
}

function openPreview(src) {
  previewImg.src = src;
  previewModal.style.display = "flex";
}

function closePreview() {
  previewModal.style.display = "none";
  previewImg.src = "";
}

function setDownload(blob, filename) {
  lastDownloadBlob = blob;
  lastDownloadName = filename;
  downloadBtn.style.display = "inline-flex";
}

function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function addFileToState(file) {
  const ext = getExt(file.name);

  if (IMAGE_FORMATS.includes(ext)) {
    imageFiles.push(file);
    return;
  }

  if (VIDEO_FORMATS.includes(ext)) {
    videoFiles.push(file);
  }
}

function dedupeFiles(files) {
  const map = new Map();
  for (const file of files) {
    const key = `${file.name}_${file.size}_${file.lastModified}`;
    if (!map.has(key)) map.set(key, file);
  }
  return [...map.values()];
}

function normalizeState() {
  imageFiles = dedupeFiles(imageFiles);
  videoFiles = dedupeFiles(videoFiles);
}

function clearAllLists() {
  imageFiles = [];
  videoFiles = [];
  renderLists();
  downloadBtn.style.display = "none";
  lastDownloadBlob = null;
  lastDownloadName = "";
}

function renderLists() {
  normalizeState();

  imageList.innerHTML = "";
  videoList.innerHTML = "";

  imageFiles.forEach((file) => {
    const item = document.createElement("div");
    item.className = "item";

    const ext = getExt(file.name);

    if (["png", "webp", "jpg", "jpeg"].includes(ext)) {
      const url = URL.createObjectURL(file);
      item.innerHTML = `
        <img src="${url}" class="thumb" alt="${escapeHtml(file.name)}">
        <div class="item-info">
          <strong>${escapeHtml(file.name)}</strong>
          <span>${formatBytes(file.size)}</span>
        </div>
      `;
      item.addEventListener("click", () => openPreview(url));
    } else {
      item.innerHTML = `
        <div class="thumb-placeholder">${ext.toUpperCase()}</div>
        <div class="item-info">
          <strong>${escapeHtml(file.name)}</strong>
          <span>${formatBytes(file.size)}</span>
        </div>
      `;
    }

    imageList.appendChild(item);
  });

  videoFiles.forEach((file) => {
    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `
      <div class="thumb-placeholder">VIDEO</div>
      <div class="item-info">
        <strong>${escapeHtml(file.name)}</strong>
        <span>${formatBytes(file.size)}</span>
      </div>
    `;
    videoList.appendChild(item);
  });
}

function handleInputFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;

  files.forEach((file) => addFileToState(file));
  renderLists();
}

function readEntriesPromise(dirReader) {
  return new Promise((resolve, reject) => {
    dirReader.readEntries(resolve, reject);
  });
}

async function readAllDirectoryEntries(directoryEntry) {
  const dirReader = directoryEntry.createReader();
  let entries = [];
  let batch = [];

  do {
    batch = await readEntriesPromise(dirReader);
    entries = entries.concat(batch);
  } while (batch.length > 0);

  return entries;
}

async function readEntryRecursive(entry) {
  if (entry.isFile) {
    return new Promise((resolve) => {
      entry.file(
        (file) => resolve([file]),
        () => resolve([])
      );
    });
  }

  if (entry.isDirectory) {
    const entries = await readAllDirectoryEntries(entry);
    const nested = await Promise.all(entries.map(readEntryRecursive));
    return nested.flat();
  }

  return [];
}

async function handleDroppedItems(items, filesFallback) {
  let collectedFiles = [];

  if (items && items.length) {
    for (const item of items) {
      if (item.kind !== "file") continue;

      const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;

      if (entry) {
        const files = await readEntryRecursive(entry);
        collectedFiles.push(...files);
      } else {
        const file = item.getAsFile ? item.getAsFile() : null;
        if (file) collectedFiles.push(file);
      }
    }
  } else if (filesFallback && filesFallback.length) {
    collectedFiles = Array.from(filesFallback);
  }

  collectedFiles.forEach((file) => addFileToState(file));
  renderLists();
}

if (dropzone) {
  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("hover");
  });

  dropzone.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dropzone.classList.add("hover");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("hover");
  });

  dropzone.addEventListener("drop", async (e) => {
    e.preventDefault();
    dropzone.classList.remove("hover");

    const items = e.dataTransfer ? e.dataTransfer.items : null;
    const files = e.dataTransfer ? e.dataTransfer.files : null;

    await handleDroppedItems(items, files);
  });
}

if (inputImages) {
  inputImages.addEventListener("change", (e) => {
    handleInputFiles(e.target.files);
    e.target.value = "";
  });
}

if (inputVideos) {
  inputVideos.addEventListener("change", (e) => {
    handleInputFiles(e.target.files);
    e.target.value = "";
  });
}

if (inputFolder) {
  inputFolder.addEventListener("change", (e) => {
    handleInputFiles(e.target.files);
    e.target.value = "";
  });
}

if (btnClear) {
  btnClear.addEventListener("click", clearAllLists);
}

if (closePreviewBtn) {
  closePreviewBtn.addEventListener("click", closePreview);
}

if (previewModal) {
  previewModal.addEventListener("click", (e) => {
    if (e.target === previewModal) {
      closePreview();
    }
  });
}

if (closeProgressBtn) {
  closeProgressBtn.addEventListener("click", () => {
    progressModal.style.display = "none";
  });
}

if (downloadBtn) {
  downloadBtn.addEventListener("click", () => {
    if (lastDownloadBlob && lastDownloadName) {
      downloadBlob(lastDownloadBlob, lastDownloadName);
    }
  });
}

// ================================
// CONVERSÃO DE IMAGENS
// ================================
async function convertImageToJpg(file) {
  const ext = getExt(file.name);

  if (["heic", "heif"].includes(ext)) {
    const result = await heic2any({
      blob: file,
      toType: "image/jpeg",
      quality: 1
    });

    return Array.isArray(result) ? result[0] : result;
  }

  if (["tif", "tiff"].includes(ext)) {
    const buffer = await file.arrayBuffer();
    const ifds = UTIF.decode(buffer);
    UTIF.decodeImages(buffer, ifds);
    const first = ifds[0];
    const rgba = UTIF.toRGBA8(first);

    const canvas = document.createElement("canvas");
    canvas.width = first.width;
    canvas.height = first.height;

    const ctx = canvas.getContext("2d");
    const imageData = new ImageData(new Uint8ClampedArray(rgba), first.width, first.height);
    ctx.putImageData(imageData, 0, 0);

    return new Promise((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 1);
    });
  }

  if (ext === "nef") {
    throw new Error("NEF ainda não está suportado nesta versão.");
  }

  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);

  return new Promise((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", 1);
  });
}

async function convertImages() {
  if (!imageFiles.length) {
    alert("Nenhuma imagem foi adicionada.");
    return;
  }

  showProgress("Convertendo imagens");
  btnImages.disabled = true;
  btnVideos.disabled = true;

  try {
    const results = [];
    const zip = new JSZip();

    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      updateProgress(i + 1, imageFiles.length, file.name);

      try {
        const jpgBlob = await convertImageToJpg(file);
        const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
        results.push({ name: newName, blob: jpgBlob });
      } catch (error) {
        console.error("Erro ao converter imagem:", file.name, error);
      }
    }

    if (!results.length) {
      progressText.textContent = "Nenhuma imagem foi convertida.";
      return;
    }

    if (results.length === 1) {
      setDownload(results[0].blob, results[0].name);
      progressText.textContent = "Conversão concluída. Clique em Baixar.";
      return;
    }

    results.forEach((file) => zip.file(file.name, file.blob));
    const zipBlob = await zip.generateAsync({ type: "blob" });

    setDownload(zipBlob, "imagens_convertidas.zip");
    progressText.textContent = "Conversão concluída. Clique em Baixar.";
  } finally {
    btnImages.disabled = false;
    btnVideos.disabled = false;
  }
}

// ================================
// CONVERSÃO DE VÍDEOS
// ================================
let ffmpegInstance = null;
let ffmpegFetchFile = null;

async function initFFmpeg() {
  if (ffmpegInstance) return;

  const { FFmpeg } = FFmpegWASM;
  ffmpegFetchFile = FFmpegUtil.fetchFile;
  ffmpegInstance = new FFmpeg();

  await ffmpegInstance.load({
    coreURL: "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js",
    wasmURL: "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm"
  });
}

async function convertVideos() {
  if (!videoFiles.length) {
    alert("Nenhum vídeo foi adicionado.");
    return;
  }

  showProgress("Convertendo vídeos");
  btnImages.disabled = true;
  btnVideos.disabled = true;

  try {
    await initFFmpeg();

    const zip = new JSZip();
    const results = [];

    for (let i = 0; i < videoFiles.length; i++) {
      const file = videoFiles[i];
      updateProgress(i + 1, videoFiles.length, file.name);

      const safeInput = `input_${i}_${file.name.replace(/[^\w.-]/g, "_")}`;
      const output = `video_${i}.mp4`;

      try {
        await ffmpegInstance.writeFile(safeInput, await ffmpegFetchFile(file));
        await ffmpegInstance.exec([
          "-i", safeInput,
          "-c:v", "libx264",
          "-preset", "veryslow",
          "-crf", "0",
          "-c:a", "aac",
          "-b:a", "320k",
          output
        ]);

        const data = await ffmpegInstance.readFile(output);
        const blob = new Blob([data.buffer], { type: "video/mp4" });
        const outName = file.name.replace(/\.[^.]+$/, "") + ".mp4";

        results.push({ name: outName, blob });

        try { await ffmpegInstance.deleteFile(safeInput); } catch {}
        try { await ffmpegInstance.deleteFile(output); } catch {}
      } catch (error) {
        console.error("Erro ao converter vídeo:", file.name, error);
      }
    }

    if (!results.length) {
      progressText.textContent = "Nenhum vídeo foi convertido.";
      return;
    }

    if (results.length === 1) {
      setDownload(results[0].blob, results[0].name);
      progressText.textContent = "Conversão concluída. Clique em Baixar.";
      return;
    }

    results.forEach((file) => zip.file(file.name, file.blob));
    const zipBlob = await zip.generateAsync({ type: "blob" });

    setDownload(zipBlob, "videos_convertidos.zip");
    progressText.textContent = "Conversão concluída. Clique em Baixar.";
  } finally {
    btnImages.disabled = false;
    btnVideos.disabled = false;
  }
}

if (btnImages) {
  btnImages.addEventListener("click", convertImages);
}

if (btnVideos) {
  btnVideos.addEventListener("click", convertVideos);
}

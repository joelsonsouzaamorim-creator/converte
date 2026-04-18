// ================================
// CONFIG
// ================================
const IMAGE_FORMATS = ["heic","heif","tiff","tif","nef","png","webp","jpg","jpeg"];
const VIDEO_FORMATS = ["mov","avi","mkv","webm","m4v","mp4"];

// ================================
// STATE
// ================================
let imageFiles = [];
let videoFiles = [];

// ================================
// ELEMENTS
// ================================
const dropzone = document.getElementById("dropzone");
const imageList = document.getElementById("imageList");
const videoList = document.getElementById("videoList");
const progressModal = document.getElementById("progressModal");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const downloadBtn = document.getElementById("downloadBtn");

// ================================
// HELPERS
// ================================
const getExt = (name) => name.split(".").pop().toLowerCase();

const formatBytes = (bytes) => {
  const sizes = ["B","KB","MB","GB"];
  if(bytes === 0) return "0 B";
  const i = Math.floor(Math.log(bytes)/Math.log(1024));
  return (bytes/Math.pow(1024,i)).toFixed(2)+" "+sizes[i];
};

// ================================
// DRAG & DROP (PASTA)
// ================================
dropzone.addEventListener("dragover", e => {
  e.preventDefault();
  dropzone.classList.add("hover");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("hover");
});

dropzone.addEventListener("drop", async (e) => {
  e.preventDefault();
  dropzone.classList.remove("hover");

  const items = e.dataTransfer.items;

  for (let item of items) {
    const entry = item.webkitGetAsEntry();
    if (entry) {
      await traverseFileTree(entry);
    }
  }

  renderLists();
});

async function traverseFileTree(entry, path = "") {
  if (entry.isFile) {
    entry.file(file => {
      processFile(file);
    });
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    reader.readEntries(async entries => {
      for (let ent of entries) {
        await traverseFileTree(ent, path + entry.name + "/");
      }
    });
  }
}

// ================================
// PROCESS FILE
// ================================
function processFile(file) {
  const ext = getExt(file.name);

  if (IMAGE_FORMATS.includes(ext)) {
    imageFiles.push(file);
  } else if (VIDEO_FORMATS.includes(ext)) {
    videoFiles.push(file);
  }
}

// ================================
// RENDER LISTS
// ================================
function renderLists() {
  imageList.innerHTML = "";
  videoList.innerHTML = "";

  imageFiles.forEach(file => {
    const div = document.createElement("div");
    div.className = "item";

    const url = URL.createObjectURL(file);
    div.innerHTML = `
      <img src="${url}" class="thumb"/>
      <div>
        <strong>${file.name}</strong><br>
        ${formatBytes(file.size)}
      </div>
    `;

    div.onclick = () => openPreview(url);

    imageList.appendChild(div);
  });

  videoFiles.forEach(file => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <strong>${file.name}</strong><br>
      ${formatBytes(file.size)}
    `;
    videoList.appendChild(div);
  });
}

// ================================
// PREVIEW MODAL
// ================================
function openPreview(src) {
  const modal = document.getElementById("previewModal");
  const img = document.getElementById("previewImg");

  img.src = src;
  modal.style.display = "flex";
}

function closePreview() {
  document.getElementById("previewModal").style.display = "none";
}

// ================================
// PROGRESS UI
// ================================
function showProgress() {
  progressModal.style.display = "flex";
  progressBar.style.width = "0%";
  progressText.innerText = "Iniciando...";
  downloadBtn.style.display = "none";
}

function updateProgress(current, total) {
  const percent = Math.floor((current / total) * 100);
  progressBar.style.width = percent + "%";
  progressText.innerText = `${current} / ${total} (${percent}%)`;
}

// ================================
// CONVERT IMAGES
// ================================
async function convertImages() {
  if (!imageFiles.length) return alert("Nenhuma imagem!");

  showProgress();

  const results = [];
  const zip = new JSZip();

  for (let i = 0; i < imageFiles.length; i++) {
    const file = imageFiles[i];
    const ext = getExt(file.name);
    let blob;

    try {
      if (["heic","heif"].includes(ext)) {
        blob = await heic2any({ blob: file, toType: "image/jpeg", quality: 1 });
      }

      else if (["tif","tiff"].includes(ext)) {
        const buf = await file.arrayBuffer();
        const ifds = UTIF.decode(buf);
        UTIF.decodeImages(buf, ifds);
        const rgba = UTIF.toRGBA8(ifds[0]);

        const canvas = document.createElement("canvas");
        canvas.width = ifds[0].width;
        canvas.height = ifds[0].height;

        const ctx = canvas.getContext("2d");
        const imgData = ctx.createImageData(canvas.width, canvas.height);
        imgData.data.set(rgba);
        ctx.putImageData(imgData, 0, 0);

        blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", 1));
      }

      else if (ext === "nef") {
        console.warn("NEF não suportado totalmente");
        continue;
      }

      else {
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(bitmap, 0, 0);

        blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", 1));
      }

      const name = file.name.replace(/\.\w+$/, ".jpg");

      if (imageFiles.length === 1) {
        download(blob, name);
      } else {
        zip.file(name, blob);
      }

    } catch (err) {
      console.error(err);
    }

    updateProgress(i + 1, imageFiles.length);
  }

  if (imageFiles.length > 1) {
    const content = await zip.generateAsync({ type: "blob" });
    downloadBtn.onclick = () => download(content, "imagens.zip");
    downloadBtn.style.display = "block";
  }
}

// ================================
// CONVERT VIDEOS
// ================================
let ffmpeg, fetchFile;

async function initFFmpeg() {
  if (ffmpeg) return;

  const { FFmpeg } = FFmpegWASM;
  const util = FFmpegUtil;

  ffmpeg = new FFmpeg();
  fetchFile = util.fetchFile;

  await ffmpeg.load({
    coreURL: "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js",
    wasmURL: "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm"
  });
}

async function convertVideos() {
  if (!videoFiles.length) return alert("Nenhum vídeo!");

  showProgress();
  await initFFmpeg();

  const zip = new JSZip();

  for (let i = 0; i < videoFiles.length; i++) {
    const file = videoFiles[i];

    const input = file.name;
    const output = file.name.replace(/\.\w+$/, ".mp4");

    await ffmpeg.writeFile(input, await fetchFile(file));

    await ffmpeg.exec([
      "-i", input,
      "-c:v", "libx264",
      "-crf", "0",
      "-preset", "veryslow",
      output
    ]);

    const data = await ffmpeg.readFile(output);
    const blob = new Blob([data.buffer], { type: "video/mp4" });

    if (videoFiles.length === 1) {
      download(blob, output);
    } else {
      zip.file(output, blob);
    }

    updateProgress(i + 1, videoFiles.length);
  }

  if (videoFiles.length > 1) {
    const content = await zip.generateAsync({ type: "blob" });
    downloadBtn.onclick = () => download(content, "videos.zip");
    downloadBtn.style.display = "block";
  }
}

// ================================
// DOWNLOAD
// ================================
function download(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

// ================================
// BUTTONS
// ================================
document.getElementById("btnImages").onclick = convertImages;
document.getElementById("btnVideos").onclick = convertVideos;
document.getElementById("btnClear").onclick = () => {
  imageFiles = [];
  videoFiles = [];
  renderLists();
};
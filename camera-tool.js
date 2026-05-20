// ============================================================
// camera-tool.js — CBLU Camera (FAST, 4 photos, LED flash,
// 5 filters, phone-style crop, PDF auto-compress <900 KB)
// ============================================================

// ===== FIREBASE CONFIG — same as main site =====
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyABweYs3QatjdM5zt_BhOHrRMNloBkK6fs",
  authDomain: "cblu-old-question-papers-d742c.firebaseapp.com",
  projectId: "cblu-old-question-papers-d742c",
  storageBucket: "cblu-old-question-papers-d742c.firebasestorage.app",
  messagingSenderId: "678720087674",
  appId: "1:678720087674:web:7500cffa12d809fe107dc3"
};

const SITE_URL = 'https://cblu-old-question-paper.netlify.app/';
const SITE_TEXT = 'cblu-old-question-paper.netlify.app';
const MAX_PHOTOS = 4;
const PDF_TARGET_BYTES = 900 * 1024;   // 900 KB safe zone (Firestore 1MB limit)
const FIRESTORE_HARD_LIMIT = 1000 * 1024; // ~1MB

// ===== STATE =====
let db = null;
let stream = null;
let videoTrack = null;
let facingMode = 'environment';
let torchOn = false;
let torchSupported = false;

let photos = [];   // [{ orig, display, filter }]
let curFilter = 'normal';
let reviewIdx = 0;

// Crop state
let cropImg = null;            // HTMLImageElement of orig
let cropCanvasW = 0, cropCanvasH = 0;
let cropRect = { x: 0, y: 0, w: 0, h: 0 }; // in canvas coords
let cropDragMode = null;       // 'move' | handle name | null
let cropDragStart = null;

// ===== INIT =====
document.addEventListener('DOMContentLoaded', function () {
  initFirebase();

  const params = new URLSearchParams(window.location.search);
  const course = params.get('course');
  const sem = params.get('sem');
  if (course && sem) {
    const t = document.querySelector('.cam-topbar-title');
    if (t) t.textContent = '📷 ' + course.toUpperCase() + ' · Sem ' + sem;
    const ut = document.querySelector('.upload-title');
    if (ut) ut.textContent = course.toUpperCase() + ' — Semester ' + sem;
  }

  // Auto-fill paper name from opener admin form
  try {
    if (window.opener && !window.opener.closed) {
      const openerInput = window.opener.document.getElementById('new-paper-name');
      if (openerInput && openerInput.value.trim()) {
        const myInput = document.getElementById('upload-paper-name');
        if (myInput) myInput.value = openerInput.value.trim();
      }
    }
  } catch (e) { /* ignore */ }

  startCamera();
  bindEvents();
});

function initFirebase() {
  try { firebase.initializeApp(FIREBASE_CONFIG); } catch (e) {}
  db = firebase.firestore();
}

// ===== SCREEN NAV =====
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ===== CAMERA =====
function startCamera() {
  stopCamera();
  navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: facingMode },
      width:  { ideal: 1920 },
      height: { ideal: 1080 }
    },
    audio: false
  })
    .then(s => {
      stream = s;
      videoTrack = s.getVideoTracks()[0];
      const v = document.getElementById('cam-video');
      v.srcObject = s;
      v.play().catch(() => {});

      // Detect torch capability
      torchSupported = false;
      try {
        const caps = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
        torchSupported = !!caps.torch;
      } catch (e) {}
      updateFlashButtonUI();
    })
    .catch(err => {
      alert('Camera access denied. Please allow camera in browser settings.\n' + err.message);
    });
}

function stopCamera() {
  if (stream) {
    try { setTorch(false); } catch (e) {}
    stream.getTracks().forEach(t => t.stop());
    stream = null;
    videoTrack = null;
  }
}

function setTorch(on) {
  if (!videoTrack || !torchSupported) return false;
  try {
    videoTrack.applyConstraints({ advanced: [{ torch: !!on }] });
    torchOn = !!on;
    return true;
  } catch (e) { return false; }
}

function updateFlashButtonUI() {
  const btn = document.getElementById('btn-flash-toggle');
  const lbl = document.getElementById('flash-lbl');
  const icon = document.getElementById('flash-icon');
  if (!btn) return;
  if (!torchSupported) {
    btn.classList.remove('on');
    lbl.textContent = 'Auto';
    icon.textContent = '⚡';
    btn.title = 'LED flash not supported — using screen flash';
    return;
  }
  btn.classList.toggle('on', torchOn);
  lbl.textContent = torchOn ? 'On' : 'Off';
  icon.textContent = torchOn ? '🔦' : '⚡';
}

// ===== CAPTURE =====
function capturePhoto() {
  if (!stream) { alert('Camera not ready!'); return; }
  if (photos.length >= MAX_PHOTOS) {
    flashMsg('Max ' + MAX_PHOTOS + ' photos!', true);
    return;
  }

  const video = document.getElementById('cam-video');
  const w = video.videoWidth || 1280;
  const h = video.videoHeight || 720;

  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(video, 0, 0, w, h);

  // Always keep a HIGH-QUALITY original (0.95 jpeg)
  const orig = c.toDataURL('image/jpeg', 0.95);

  // Visual feedback (screen flash) — short, async
  const flash = document.getElementById('cam-flash');
  flash.style.opacity = '1';
  setTimeout(() => flash.style.opacity = '0', 90);

  // Defer filter to next frame so UI stays snappy
  const fil = curFilter;
  requestAnimationFrame(() => {
    const display = applyFilter(c, fil);
    photos.push({ orig, display, filter: fil });
    updateCameraUI();
  });
}

function flashMsg(msg) {
  const badge = document.getElementById('photo-count-badge');
  const orig = badge.textContent;
  badge.textContent = msg;
  setTimeout(() => { badge.textContent = orig; }, 1200);
}

// ===== FILTERS (5) =====
function applyFilter(srcCanvas, filter) {
  switch (filter) {
    case 'normal': return srcCanvas.toDataURL('image/jpeg', 0.95);
    case 'hd':     return applyHD(srcCanvas);
    case 'bright': return applyBright(srcCanvas);
    case 'bw':     return applyBW(srcCanvas);
    case 'doc':    return applyDocScan(srcCanvas);
    default:       return srcCanvas.toDataURL('image/jpeg', 0.95);
  }
}

function _newCanvasFrom(src) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}

// HD: contrast boost + light unsharp mask (per-pixel, single pass — fast)
function applyHD(srcCanvas) {
  const c = _newCanvasFrom(srcCanvas);
  const ctx = c.getContext('2d');
  const id = ctx.getImageData(0, 0, c.width, c.height);
  const d = id.data;
  // contrast & saturation boost
  const contrast = 1.18;
  const sat = 1.15;
  const intercept = 128 * (1 - contrast);
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    // contrast
    r = r * contrast + intercept;
    g = g * contrast + intercept;
    b = b * contrast + intercept;
    // saturation
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = gray + (r - gray) * sat;
    g = gray + (g - gray) * sat;
    b = gray + (b - gray) * sat;
    d[i]     = r < 0 ? 0 : r > 255 ? 255 : r;
    d[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
    d[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
  }
  ctx.putImageData(id, 0, 0);
  return c.toDataURL('image/jpeg', 0.95);
}

// Bright: gamma + brightness lift
function applyBright(srcCanvas) {
  const c = _newCanvasFrom(srcCanvas);
  const ctx = c.getContext('2d');
  const id = ctx.getImageData(0, 0, c.width, c.height);
  const d = id.data;
  // Build lookup table
  const lut = new Uint8ClampedArray(256);
  const gamma = 0.78; // <1 brightens
  const lift = 18;
  for (let i = 0; i < 256; i++) {
    const v = 255 * Math.pow(i / 255, gamma) + lift;
    lut[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  for (let i = 0; i < d.length; i += 4) {
    d[i]     = lut[d[i]];
    d[i + 1] = lut[d[i + 1]];
    d[i + 2] = lut[d[i + 2]];
  }
  ctx.putImageData(id, 0, 0);
  return c.toDataURL('image/jpeg', 0.95);
}

function applyBW(srcCanvas) {
  const c = _newCanvasFrom(srcCanvas);
  const ctx = c.getContext('2d');
  const id = ctx.getImageData(0, 0, c.width, c.height);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  ctx.putImageData(id, 0, 0);
  return c.toDataURL('image/jpeg', 0.93);
}

// DocScan — FAST adaptive threshold using integral image (O(N))
function applyDocScan(srcCanvas) {
  const w = srcCanvas.width, h = srcCanvas.height;
  const tmp = _newCanvasFrom(srcCanvas);
  const ctx = tmp.getContext('2d');
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;

  // 1. Grayscale array
  const gray = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    gray[j] = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0;
  }

  // 2. Integral image (sat[(y+1)*(w+1)+(x+1)])
  const W1 = w + 1;
  const sat = new Float64Array(W1 * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    const yOff = y * w;
    const satRow = (y + 1) * W1;
    const satPrev = y * W1;
    for (let x = 0; x < w; x++) {
      rowSum += gray[yOff + x];
      sat[satRow + x + 1] = sat[satPrev + x + 1] + rowSum;
    }
  }

  // 3. Adaptive threshold: block radius B, threshold = mean * FAC
  const B = Math.max(12, Math.min(40, Math.round(Math.min(w, h) / 30)));
  const FAC = 0.88;
  for (let y = 0; y < h; y++) {
    const y1 = y - B < 0 ? 0 : y - B;
    const y2 = y + B >= h ? h - 1 : y + B;
    const yOff = y * w;
    for (let x = 0; x < w; x++) {
      const x1 = x - B < 0 ? 0 : x - B;
      const x2 = x + B >= w ? w - 1 : x + B;
      const area = (x2 - x1 + 1) * (y2 - y1 + 1);
      const sum =
        sat[(y2 + 1) * W1 + (x2 + 1)] -
        sat[y1 * W1 + (x2 + 1)] -
        sat[(y2 + 1) * W1 + x1] +
        sat[y1 * W1 + x1];
      const mean = sum / area;
      const v = gray[yOff + x] < mean * FAC ? 0 : 255;
      const idx = (yOff + x) * 4;
      d[idx] = d[idx + 1] = d[idx + 2] = v;
    }
  }
  ctx.putImageData(id, 0, 0);
  return tmp.toDataURL('image/jpeg', 0.92);
}

// ===== UI UPDATE =====
function updateCameraUI() {
  const strip = document.getElementById('thumb-strip');
  const empty = document.getElementById('thumb-empty');
  const badge = document.getElementById('photo-count-badge');
  const doneBtn = document.getElementById('btn-done-cam');
  const shutter = document.getElementById('btn-capture');

  badge.textContent = photos.length + ' / ' + MAX_PHOTOS;
  doneBtn.disabled = photos.length === 0;
  shutter.classList.toggle('disabled', photos.length >= MAX_PHOTOS);

  strip.innerHTML = '';
  if (photos.length === 0) {
    strip.appendChild(empty);
    return;
  }
  for (let i = 0; i < photos.length; i++) {
    const wrap = document.createElement('div');
    wrap.className = 'thumb-item';
    wrap.dataset.testid = 'thumb-' + (i + 1);
    wrap.innerHTML = '<img src="' + photos[i].display + '"><span class="thumb-num">' + (i + 1) + '</span>';
    wrap.onclick = () => openReview(i);
    strip.appendChild(wrap);
  }
}

// ===== REVIEW =====
function openReview(idx) {
  reviewIdx = idx;
  renderReviewScreen();
  showScreen('screen-review');
}

function renderReviewScreen() {
  const bigImg = document.getElementById('review-big-img');
  const numEl = document.getElementById('review-img-num');
  const strip = document.getElementById('review-strip');
  const rfBtns = document.querySelectorAll('.rf-btn');

  bigImg.src = photos[reviewIdx].display;
  numEl.textContent = (reviewIdx + 1) + ' / ' + photos.length;

  rfBtns.forEach(b => {
    const active = b.dataset.rf === (photos[reviewIdx].filter || 'normal') ||
                   (b.dataset.rf === 'keep' && photos[reviewIdx].filter === 'normal');
    b.classList.toggle('active', active);
  });

  strip.innerHTML = '';
  photos.forEach((p, i) => {
    const t = document.createElement('div');
    t.className = 'review-thumb' + (i === reviewIdx ? ' active-thumb' : '');
    t.innerHTML = '<img src="' + p.display + '">';
    t.onclick = () => { reviewIdx = i; renderReviewScreen(); };
    strip.appendChild(t);
  });
}

function applyReviewFilter(filterName) {
  const p = photos[reviewIdx];
  if (!p) return;
  if (filterName === 'keep') {
    p.display = p.orig;
    p.filter = 'normal';
    renderReviewScreen();
    updateCameraUI();
    return;
  }
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    p.display = applyFilter(c, filterName);
    p.filter = filterName;
    renderReviewScreen();
    updateCameraUI();
  };
  img.src = p.orig;
}

function deleteCurrentPhoto() {
  photos.splice(reviewIdx, 1);
  if (photos.length === 0) {
    showScreen('screen-camera');
    updateCameraUI();
    return;
  }
  reviewIdx = Math.min(reviewIdx, photos.length - 1);
  renderReviewScreen();
  updateCameraUI();
}

// ===== CROP (phone-style with 8 handles) =====
function openCrop() {
  if (!photos[reviewIdx]) return;
  // Show screen FIRST so layout is computed correctly
  showScreen('screen-crop');

  const canvas = document.getElementById('crop-canvas');
  const area = document.getElementById('crop-area');
  const img = new Image();
  img.onload = () => {
    cropImg = img;
    // Wait one frame so flex layout settles, then measure
    requestAnimationFrame(() => {
      const maxW = area.clientWidth || window.innerWidth;
      const maxH = area.clientHeight || (window.innerHeight - 120);
      const scale = Math.min(1, maxW / img.width, maxH / img.height);
      cropCanvasW = Math.max(50, Math.round(img.width * scale));
      cropCanvasH = Math.max(50, Math.round(img.height * scale));
      canvas.width = cropCanvasW;
      canvas.height = cropCanvasH;
      canvas.style.width = cropCanvasW + 'px';
      canvas.style.height = cropCanvasH + 'px';
      canvas.getContext('2d').drawImage(img, 0, 0, cropCanvasW, cropCanvasH);

      const inset = Math.round(Math.min(cropCanvasW, cropCanvasH) * 0.05);
      cropRect = {
        x: inset, y: inset,
        w: cropCanvasW - 2 * inset, h: cropCanvasH - 2 * inset
      };
      updateCropUI();
    });
  };
  img.src = photos[reviewIdx].orig;
}

function updateCropUI() {
  const sel = document.getElementById('crop-selection');
  const canvas = document.getElementById('crop-canvas');
  const cRect = canvas.getBoundingClientRect();
  const areaRect = document.getElementById('crop-area').getBoundingClientRect();

  // Canvas offset within area
  const offX = cRect.left - areaRect.left;
  const offY = cRect.top - areaRect.top;

  sel.style.left   = (offX + cropRect.x) + 'px';
  sel.style.top    = (offY + cropRect.y) + 'px';
  sel.style.width  = cropRect.w + 'px';
  sel.style.height = cropRect.h + 'px';
  sel.style.display = 'block';

  // Dim mask pieces
  const tot = document.getElementById('cm-top');
  const bot = document.getElementById('cm-bottom');
  const lef = document.getElementById('cm-left');
  const rig = document.getElementById('cm-right');
  if (tot) {
    tot.style.cssText = 'left:' + offX + 'px;top:' + offY + 'px;width:' + cropCanvasW + 'px;height:' + cropRect.y + 'px;';
    bot.style.cssText = 'left:' + offX + 'px;top:' + (offY + cropRect.y + cropRect.h) + 'px;width:' + cropCanvasW + 'px;height:' + (cropCanvasH - cropRect.y - cropRect.h) + 'px;';
    lef.style.cssText = 'left:' + offX + 'px;top:' + (offY + cropRect.y) + 'px;width:' + cropRect.x + 'px;height:' + cropRect.h + 'px;';
    rig.style.cssText = 'left:' + (offX + cropRect.x + cropRect.w) + 'px;top:' + (offY + cropRect.y) + 'px;width:' + (cropCanvasW - cropRect.x - cropRect.w) + 'px;height:' + cropRect.h + 'px;';
  }
}

function setupCropDrag() {
  const sel = document.getElementById('crop-selection');
  const handles = sel.querySelectorAll('.crop-handle');

  function getXY(e) {
    const canvas = document.getElementById('crop-canvas');
    const rect = canvas.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: cx - rect.left, y: cy - rect.top };
  }

  function startDrag(mode) {
    return function (e) {
      e.preventDefault();
      e.stopPropagation();
      cropDragMode = mode;
      const p = getXY(e);
      cropDragStart = { px: p.x, py: p.y, rect: Object.assign({}, cropRect) };
    };
  }

  // Move (drag inside the selection)
  sel.addEventListener('mousedown', function (e) {
    if (e.target.classList.contains('crop-handle')) return;
    startDrag('move')(e);
  });
  sel.addEventListener('touchstart', function (e) {
    if (e.target.classList.contains('crop-handle')) return;
    startDrag('move')(e);
  }, { passive: false });

  handles.forEach(h => {
    const mode = h.dataset.handle;
    h.addEventListener('mousedown', startDrag(mode));
    h.addEventListener('touchstart', startDrag(mode), { passive: false });
  });

  function onMove(e) {
    if (!cropDragMode) return;
    e.preventDefault();
    const p = getXY(e);
    const dx = p.x - cropDragStart.px;
    const dy = p.y - cropDragStart.py;
    const s = cropDragStart.rect;
    const MIN = 30;
    let nx = s.x, ny = s.y, nw = s.w, nh = s.h;

    if (cropDragMode === 'move') {
      nx = Math.max(0, Math.min(cropCanvasW - s.w, s.x + dx));
      ny = Math.max(0, Math.min(cropCanvasH - s.h, s.y + dy));
    } else {
      // Edges
      if (cropDragMode.includes('l')) {
        const newX = Math.max(0, Math.min(s.x + s.w - MIN, s.x + dx));
        nw = s.w - (newX - s.x); nx = newX;
      }
      if (cropDragMode.includes('r')) {
        nw = Math.max(MIN, Math.min(cropCanvasW - s.x, s.w + dx));
      }
      if (cropDragMode.includes('t')) {
        const newY = Math.max(0, Math.min(s.y + s.h - MIN, s.y + dy));
        nh = s.h - (newY - s.y); ny = newY;
      }
      if (cropDragMode.includes('b')) {
        nh = Math.max(MIN, Math.min(cropCanvasH - s.y, s.h + dy));
      }
    }
    cropRect = { x: nx, y: ny, w: nw, h: nh };
    updateCropUI();
  }
  function onUp() { cropDragMode = null; cropDragStart = null; }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onUp);
  document.addEventListener('touchcancel', onUp);

  document.getElementById('btn-crop-reset').onclick = function () {
    const inset = Math.round(Math.min(cropCanvasW, cropCanvasH) * 0.05);
    cropRect = { x: inset, y: inset, w: cropCanvasW - 2 * inset, h: cropCanvasH - 2 * inset };
    updateCropUI();
  };
}

function applyCrop() {
  if (!cropImg || cropRect.w < 10 || cropRect.h < 10) return;

  // Convert canvas coords -> original image coords
  const scaleX = cropImg.width / cropCanvasW;
  const scaleY = cropImg.height / cropCanvasH;
  const sx = Math.round(cropRect.x * scaleX);
  const sy = Math.round(cropRect.y * scaleY);
  const sw = Math.round(cropRect.w * scaleX);
  const sh = Math.round(cropRect.h * scaleY);

  const cropped = document.createElement('canvas');
  cropped.width = sw; cropped.height = sh;
  cropped.getContext('2d').drawImage(cropImg, sx, sy, sw, sh, 0, 0, sw, sh);

  const newOrig = cropped.toDataURL('image/jpeg', 0.95);
  const fil = photos[reviewIdx].filter || 'normal';
  photos[reviewIdx].orig = newOrig;
  photos[reviewIdx].display = (fil === 'normal') ? newOrig : applyFilter(cropped, fil);

  showScreen('screen-review');
  renderReviewScreen();
  updateCameraUI();
}

// ===== UPLOAD =====
function openUploadScreen() {
  renderPDFPreview();
  setUploadStatus('');
  const btn = document.getElementById('btn-upload-pdf');
  btn.disabled = false;
    btn.textContent = '📤 Upload to Firebase';
  showScreen('screen-upload');
}

function renderPDFPreview() {
  const grid = document.getElementById('pdf-thumb-grid');
  const infoEl = document.getElementById('upload-info');
  grid.innerHTML = '';
  photos.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'pdf-page-thumb';
    div.innerHTML = '<img src="' + p.display + '"><div class="pdf-page-num">Page ' + (i + 1) + '</div>';
    grid.appendChild(div);
  });
  infoEl.textContent = photos.length + ' photo' + (photos.length > 1 ? 's' : '') + ' → PDF ready to upload';
}

// ===== PDF BUILDER with AUTO COMPRESSION until < 900 KB =====
async function buildPDF(maxDim, quality) {
  const jsPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
  if (!jsPDF) throw new Error('jsPDF load nahi hui. Page reload karo.');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210, pageH = 297, margin = 8;
  const imgW = pageW - margin * 2;
  const imgH = pageH - margin * 2;

  for (let i = 0; i < photos.length; i++) {
    if (i > 0) doc.addPage();
    const compressed = await compressImage(photos[i].display, maxDim, quality);
    await new Promise(function (resolve) {
      const img = new Image();
      img.onload = function () {
        try {
          const px2mm = 0.264583;
          const imgWmm = img.width * px2mm;
          const imgHmm = img.height * px2mm;
          const ratio = Math.min(imgW / imgWmm, imgH / imgHmm, 1);
          const dw = imgWmm * ratio;
          const dh = imgHmm * ratio;
          const ox = margin + (imgW - dw) / 2;
          const oy = margin + (imgH - dh) / 2;
          doc.addImage(compressed, 'JPEG', ox, oy, dw, dh, '', 'FAST');
          doc.link(0, 0, pageW, pageH, { url: SITE_URL });
          doc.setFontSize(5.5);
          doc.setTextColor(200, 200, 200);
          doc.textWithLink(SITE_TEXT, pageW / 2, pageH - 2.5, { url: SITE_URL, align: 'center' });
        } catch (e) { console.warn('addImage:', e); }
        resolve();
      };
      img.onerror = function () { resolve(); };
      img.src = compressed;
    });
  }
  return doc.output('datauristring');
}

function dataUriBytes(uri) {
  const comma = uri.indexOf(',');
  const b64Len = uri.length - (comma + 1);
  // approximate raw bytes
  return Math.floor(b64Len * 0.75);
}

async function buildCompressedPDF(progressFn) {
  // Try progressively smaller / lower quality until under target
  const attempts = [
    { dim: 1800, q: 0.88 },
    { dim: 1500, q: 0.82 },
    { dim: 1300, q: 0.75 },
    { dim: 1100, q: 0.68 },
    { dim: 950,  q: 0.62 },
    { dim: 800,  q: 0.55 },
    { dim: 700,  q: 0.50 },
    { dim: 600,  q: 0.45 },
    { dim: 500,  q: 0.40 }
  ];
  // For many photos, start smaller (per-page budget shrinks)
  let startIdx = 0;
  if (photos.length >= 3) startIdx = 1;
  if (photos.length >= 4) startIdx = 2;

  let lastUri = null, lastBytes = 0;
  for (let i = startIdx; i < attempts.length; i++) {
    const { dim, q } = attempts[i];
    if (progressFn) progressFn('⏳ Compressing… (' + dim + 'px, q=' + q.toFixed(2) + ')');
    const uri = await buildPDF(dim, q);
    const bytes = dataUriBytes(uri);
    lastUri = uri; lastBytes = bytes;
    console.log('PDF attempt', dim, q, '->', Math.round(bytes / 1024), 'KB');
    if (bytes <= PDF_TARGET_BYTES) {
      return { uri, bytes };
    }
  }
  return { uri: lastUri, bytes: lastBytes };
}

function compressImage(dataUrl, maxW, q) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// ===== UPLOAD TO FIREBASE =====
async function uploadToFirebase() {
  const nameInput = document.getElementById('upload-paper-name');
  const name = nameInput ? nameInput.value.trim() : '';
  if (!name) {
    if (nameInput) { nameInput.focus(); nameInput.style.borderColor = '#f87171'; }
    setUploadStatus('⚠️ Paper ka naam bharo!', true);
    return;
  }
  if (nameInput) nameInput.style.borderColor = '';

  if (!db) { setUploadStatus('⚠️ Firebase connected nahi! Page reload karo.', true); return; }

  const params = new URLSearchParams(window.location.search);
  const course = params.get('course');
  const sem = params.get('sem');
  if (!course || !sem) { setUploadStatus('⚠️ Course/Sem missing! Admin se dobara open karo.', true); return; }
  if (photos.length === 0) { setUploadStatus('⚠️ Koi photo nahi hai!', true); return; }

  const btn = document.getElementById('btn-upload-pdf');
  btn.disabled = true;

  try {
    btn.textContent = '⏳ PDF ban rahi hai…';
    setUploadStatus('⏳ Photos compress ho rahi hain…');

    const { uri: pdfBase64, bytes } = await buildCompressedPDF(setUploadStatus);
    const sizeKB = Math.round(bytes / 1024);
    console.log('Final PDF size:', sizeKB, 'KB');

    if (bytes > FIRESTORE_HARD_LIMIT) {
      throw new Error('PDF size ' + sizeKB + ' KB — Firestore limit 1 MB se zyada. Kam photos lo ya DocScan filter try karo.');
    }

    btn.textContent = '⏳ Firebase upload (' + sizeKB + ' KB)…';
    setUploadStatus('⏳ Upload ho raha hai (' + sizeKB + ' KB)…');

    await db
      .collection('papers').doc(course)
      .collection('sem' + sem)
      .add({
        name,
        fileBase64: pdfBase64,
        uploadedAt: firebase.firestore.FieldValue.serverTimestamp(),
        course,
        semester: parseInt(sem),
        photoCount: photos.length,
        sizeKB
      });

    btn.textContent = '✅ Upload ho gaya!';
    setUploadStatus('✅ Paper upload ho gaya (' + sizeKB + ' KB)\nWindow band ho rahi hai…');

    try {
      if (window.opener && !window.opener.closed) {
        if (typeof window.opener.onCameraUploadSuccess === 'function') {
          window.opener.onCameraUploadSuccess();
        }
        window.opener.focus();
      }
    } catch (e) {}

    setTimeout(() => { try { window.close(); } catch (e) {} }, 1600);
  } catch (err) {
    console.error('Upload error:', err);
    let msg = err.message || 'Unknown error';
    if (msg.includes('quota')) msg = 'Firebase quota khatam!';
    else if (msg.includes('permission')) msg = 'Permission denied! Firebase rules check karo.';
    else if (msg.includes('network') || msg.includes('fetch')) msg = 'Internet check karo!';
    setUploadStatus('⚠️ Upload fail: ' + msg, true);
    btn.disabled = false;
    btn.textContent = '📤 Upload to Firebase';
  }
}

function setUploadStatus(msg, isErr) {
  const el = document.getElementById('upload-status');
  el.textContent = msg || '';
  el.className = 'upload-status' + (isErr ? ' error' : '');
}

// ===== EVENTS =====
function bindEvents() {
  // Camera
  document.getElementById('btn-close-cam').onclick = function () {
    stopCamera();
    try { if (window.opener && !window.opener.closed) window.opener.focus(); } catch (e) {}
    try { window.close(); } catch (e) { history.back(); }
  };
  document.getElementById('btn-flip-cam').onclick = () => {
    facingMode = (facingMode === 'environment') ? 'user' : 'environment';
    torchOn = false;
    startCamera();
  };
  document.getElementById('btn-capture').onclick = capturePhoto;
  document.getElementById('btn-done-cam').onclick = () => {
    if (photos.length === 0) return;
    openReview(photos.length - 1);
  };

  // Flash toggle
  document.getElementById('btn-flash-toggle').onclick = function () {
    if (!torchSupported) {
      // Fallback: just inform user, screen-flash still occurs on capture
      flashMsg('No LED — screen flash used');
      return;
    }
    const ok = setTorch(!torchOn);
    if (ok) updateFlashButtonUI();
  };

  // Filter bar (camera)
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.onclick = () => {
      curFilter = btn.dataset.filter;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const map = { normal: 'Normal', hd: 'HD', bright: 'Bright', bw: 'B&W', doc: 'DocScan' };
      document.getElementById('filter-badge').textContent = map[curFilter] || 'Normal';
    };
  });

  // Review
  document.getElementById('btn-back-review').onclick = () => {
    showScreen('screen-camera');
    if (!stream) startCamera();
  };
  document.getElementById('btn-make-pdf').onclick = openUploadScreen;
  document.getElementById('btn-crop-open').onclick = openCrop;
  document.getElementById('btn-delete-photo').onclick = () => {
    if (confirm('Delete this photo?')) deleteCurrentPhoto();
  };
  document.querySelectorAll('.rf-btn').forEach(btn => {
    btn.onclick = () => applyReviewFilter(btn.dataset.rf);
  });

  // Swipe review
  let touchStartX = 0;
  const reviewMainEl = document.querySelector('.review-main');
  if (reviewMainEl) {
    reviewMainEl.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
    reviewMainEl.addEventListener('touchend', e => {
      const diff = touchStartX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 50) {
        if (diff > 0 && reviewIdx < photos.length - 1) reviewIdx++;
        else if (diff < 0 && reviewIdx > 0) reviewIdx--;
        renderReviewScreen();
      }
    }, { passive: true });
  }

  // Crop
  setupCropDrag();
  document.getElementById('btn-cancel-crop').onclick = () => showScreen('screen-review');
  document.getElementById('btn-apply-crop').onclick = applyCrop;

  // Upload
  document.getElementById('btn-back-upload').onclick = () => showScreen('screen-review');
  document.getElementById('btn-upload-pdf').onclick = uploadToFirebase;

  // Window resize -> redraw crop UI if open
  window.addEventListener('resize', () => {
    if (document.getElementById('screen-crop').classList.contains('active') && cropImg) {
      updateCropUI();
    }
  });
}



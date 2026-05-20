// ============================================================
//  CBLU OLD QUESTION PAPERS — app.js
//  Firebase Firestore connected — Real-time database
//  Developed by: Mahak
// ============================================================

// ===== FIREBASE CONFIG (Aapka apna config) =====
const firebaseConfig = {
  apiKey: "AIzaSyABweYs3QatjdM5zt_BhOHrRMNloBkK6fs",
  authDomain: "cblu-old-question-papers-d742c.firebaseapp.com",
  projectId: "cblu-old-question-papers-d742c",
  storageBucket: "cblu-old-question-papers-d742c.firebasestorage.app",
  messagingSenderId: "678720087674",
  appId: "1:678720087674:web:7500cffa12d809fe107dc3",
  measurementId: "G-XL6M3X1SY2"
};

// ===== FIREBASE INITIALIZE (defer ke baad firebase ready hota hai) =====
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Offline persistence — pehli baar ke baad sem -> papers BAHUT FAST load hota hai
try {
  db.enablePersistence({ synchronizeTabs: true }).catch(() => {/* ignore */});
} catch(_) {}

// ===== COURSES DATA =====
const COURSES = [
  // UG
  { id: 'ba',      name: 'BA',           full: 'Bachelor of Arts',                   icon: '🎓' },
  { id: 'bam',     name: 'BA Maths',     full: 'BA Mathematics',                     icon: '📊' },
  { id: 'bag',     name: 'BA Geography', full: 'BA Geography',                       icon: '🌍' },
  { id: 'bahi',    name: 'BA Hindi',     full: 'BA Hindi',                           icon: '📖' },
  { id: 'baen',    name: 'BA English',   full: 'BA English',                         icon: '✍️' },
  { id: 'bsc',     name: 'BSc',          full: 'Bachelor of Science',                icon: '🔬' },
  { id: 'bscm',    name: 'BSc Maths',    full: 'BSc Mathematics',                    icon: '📐' },
  { id: 'bcom',    name: 'BCom',         full: 'Bachelor of Commerce',               icon: '💼' },
  { id: 'bba',     name: 'BBA',          full: 'Bachelor of Business Administration',icon: '🏢' },
  { id: 'bca',     name: 'BCA',          full: 'Bachelor of Computer Applications',  icon: '💻' },
  { id: 'bed',     name: 'B.Ed',         full: 'Bachelor of Education',              icon: '🏫' },
  { id: 'bpharma', name: 'B.Pharmacy',   full: 'Bachelor of Pharmacy',               icon: '💊' },
  { id: 'btech',   name: 'B.Tech',       full: 'Bachelor of Technology',             icon: '⚙️' },
  // PG
  { id: 'ma',      name: 'MA',           full: 'Master of Arts',                     icon: '🏛️' },
  { id: 'mscm',    name: 'MSc Maths',    full: 'Master of Science (Mathematics)',    icon: '🧮' },
  { id: 'msc',     name: 'MSc',          full: 'Master of Science',                  icon: '⚗️' },
  { id: 'mcom',    name: 'MCom',         full: 'Master of Commerce',                 icon: '📈' },
  { id: 'mba',     name: 'MBA',          full: 'Master of Business Administration',  icon: '🏦' },
  { id: 'mca',     name: 'MCA',          full: 'Master of Computer Applications',    icon: '🖥️' },
];
const PG_IDS = ['ma','mscm','msc','mcom','mba','mca'];
const COURSE_MAP = Object.fromEntries(COURSES.map(c => [c.id, c]));

// ===== APP STATE =====
let curCourse   = null;
let curSem      = null;
let dlPaper     = null;
let delTarget   = null;
let editTarget  = null;
let adminCourse = null;
let adminSem    = null;
let selectedFile = null;

// ===== THEME =====
function initTheme() {
  const saved = localStorage.getItem('cblu_theme') || 'light';
  applyTheme(saved);
}
function applyTheme(mode) {
  document.body.classList.remove('light-mode', 'dark-mode');
  document.body.classList.add(mode + '-mode');
  const btn   = document.getElementById('theme-toggle');
  const icon  = btn.querySelector('.theme-icon');
  const label = btn.querySelector('.theme-label');
  if (mode === 'dark') { icon.textContent = '☀️'; label.textContent = 'Light Mode'; }
  else                 { icon.textContent = '🌙'; label.textContent = 'Dark Mode';  }
}

// ===== PAGE NAVIGATION =====
function showPage(id, skipHistory) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
  if (!skipHistory) {
    history.pushState({ page: id, course: curCourse ? curCourse.id : null, sem: curSem, adminStep: getAdminStep() }, '', window.location.pathname);
  }
}

function getAdminStep() {
  if (!document.getElementById('admin-s3').classList.contains('hidden')) return 3;
  if (!document.getElementById('admin-s2').classList.contains('hidden')) return 2;
  return 1;
}

function goHome(skipHistory) {
  curCourse = null; curSem = null;
  if (papersUnsubscribe) { papersUnsubscribe(); papersUnsubscribe = null; }
  updateBreadcrumb();
  const si = document.getElementById('search-input');
  si.value = '';
  document.getElementById('search-clear-btn').style.display = 'none';
  renderCourseCards('courses-grid', COURSES, openCourse);
  document.getElementById('course-count').textContent = COURSES.length + ' Courses';
  showPage('page-home', skipHistory);
}

function goSems(skipHistory) {
  if (!curCourse) { goHome(skipHistory); return; }
  curSem = null;
  if (papersUnsubscribe) { papersUnsubscribe(); papersUnsubscribe = null; }
  updateBreadcrumb();
  showPage('page-sems', skipHistory);
}

// ===== BROWSER BACK BUTTON HANDLER =====
// (popstate me ham kabhi pushState NAHI karenge — sirf view switch karenge)
window.addEventListener('popstate', function(e) {
  const state = e.state;

  // Koi bhi modal khula ho to use band karo
  document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show'));

  if (!state || !state.page) {
    // home pe le aao bina pushState ke
    curCourse = null; curSem = null;
    if (papersUnsubscribe) { papersUnsubscribe(); papersUnsubscribe = null; }
    updateBreadcrumb();
    showPage('page-home', true);
    return;
  }

  const page = state.page;

  if (page === 'page-home') {
    curCourse = null; curSem = null;
    if (papersUnsubscribe) { papersUnsubscribe(); papersUnsubscribe = null; }
    updateBreadcrumb();
    showPage('page-home', true);

  } else if (page === 'page-sems') {
    // restore course context if needed
    if (state.course && (!curCourse || curCourse.id !== state.course)) {
      const c = COURSE_MAP[state.course];
      if (c) {
        curCourse = c;
        document.getElementById('sem-course-title').textContent = c.name + ' — ' + c.full;
        loadSemCards();
      }
    }
    curSem = null;
    if (papersUnsubscribe) { papersUnsubscribe(); papersUnsubscribe = null; }
    updateBreadcrumb();
    showPage('page-sems', true);

  } else if (page === 'page-papers') {
    if (state.course && (!curCourse || curCourse.id !== state.course)) {
      const c = COURSE_MAP[state.course];
      if (c) { curCourse = c; loadSemCards(); }
    }
    if (state.sem) {
      curSem = state.sem;
      document.getElementById('papers-title').textContent = curCourse.name + ' — Semester ' + curSem;
      loadPapersFromFirebase();
    }
    updateBreadcrumb();
    showPage('page-papers', true);

  } else if (page === 'page-admin') {
    // admin steps handle karo
    const targetStep = state.adminStep || 1;
    if (localStorage.getItem('cblu_admin_session') !== 'true') {
      showPage('page-home', true);
      return;
    }
    if (targetStep === 1) {
      if (adminPapersUnsubscribe) { adminPapersUnsubscribe(); adminPapersUnsubscribe = null; }
      adminCourse = null; adminSem = null;
      renderCourseCards('admin-courses-grid', COURSES, c => onAdminCourseClick(c));
      setAdminStep(1);
    } else if (targetStep === 2) {
      if (adminPapersUnsubscribe) { adminPapersUnsubscribe(); adminPapersUnsubscribe = null; }
      adminSem = null;
      setAdminStep(2);
      loadAdminSems();
    } else if (targetStep === 3) {
      setAdminStep(3);
    }
    showPage('page-admin', true);

  } else {
    showPage('page-home', true);
  }
});

// ===== BREADCRUMB =====
function updateBreadcrumb() {
  const courseEl  = document.getElementById('bc-course');
  const courseSep = document.getElementById('bc-course-sep');
  const semEl     = document.getElementById('bc-sem');
  const semSep    = document.getElementById('bc-sem-sep');

  if (curCourse) {
    courseEl.textContent    = curCourse.name;
    courseEl.style.display  = 'inline';
    courseSep.style.display = 'inline';
  } else {
    courseEl.style.display  = 'none';
    courseSep.style.display = 'none';
  }
  if (curSem) {
    semEl.textContent    = 'Semester ' + curSem;
    semEl.style.display  = 'inline';
    semSep.style.display = 'inline';
  } else {
    semEl.style.display  = 'none';
    semSep.style.display = 'none';
  }
}

// ===== SEARCH =====
function filterCourses(q) {
  document.getElementById('search-clear-btn').style.display = q ? 'block' : 'none';
  const ql = q.toLowerCase();
  const filtered = COURSES.filter(c =>
    c.name.toLowerCase().includes(ql) ||
    c.full.toLowerCase().includes(ql)
  );
  renderCourseCards('courses-grid', filtered, openCourse);
  document.getElementById('course-count').textContent = filtered.length + ' Courses';
}
window.filterCourses = filterCourses;
function clearSearch() {
  document.getElementById('search-input').value = '';
  document.getElementById('search-clear-btn').style.display = 'none';
  renderCourseCards('courses-grid', COURSES, openCourse);
  document.getElementById('course-count').textContent = COURSES.length + ' Courses';
}

// ===== RENDER COURSE CARDS =====
function renderCourseCards(gridId, list, clickFn) {
  const grid = document.getElementById(gridId);
  grid.innerHTML = '';
  if (list.length === 0) {
    grid.innerHTML = '<div class="no-results">🔍 No course found. Try a different keyword.</div>';
    return;
  }
  const ugList = list.filter(c => !PG_IDS.includes(c.id));
  const pgList = list.filter(c =>  PG_IDS.includes(c.id));

  function addSection(label, items) {
    if (items.length === 0) return;
    const header = document.createElement('div');
    header.className = 'course-section-header';
    header.textContent = label;
    grid.appendChild(header);
    const section = document.createElement('div');
    section.className = 'courses-grid-inner';
    items.forEach(c => {
      const div = document.createElement('div');
      div.className = 'course-card';
      div.dataset.cid = c.id;
      div.innerHTML = `
        <div class="card-icon">${c.icon}</div>
        <div class="card-name">${c.name}</div>
        <div class="card-full">${c.full}</div>
      `;
      div.addEventListener('click', () => clickFn(c));
      section.appendChild(div);
    });
    grid.appendChild(section);
  }
  addSection('🎓 Under Graduate (UG)', ugList);
  addSection('🏛️ Post Graduate (PG)', pgList);
}

// ===== OPEN COURSE =====
function openCourse(c) {
  curCourse = c;
  updateBreadcrumb();
  document.getElementById('sem-course-title').textContent = c.name + ' — ' + c.full;
  loadSemCards();
  showPage('page-sems');
}

function loadSemCards() {
  const grid = document.getElementById('sem-grid');
  grid.innerHTML = '';
  for (let s = 1; s <= 6; s++) {
    const div = document.createElement('div');
    div.className = 'sem-card';
    div.innerHTML = `
      <div class="sem-num">${s}</div>
      <div class="sem-label">Semester ${s}</div>
      <div class="sem-count">Tap to view papers</div>
    `;
    div.addEventListener('click', () => openSem(s));
    grid.appendChild(div);
  }
}

// ===== OPEN SEMESTER =====
function openSem(s) {
  curSem = s;
  updateBreadcrumb();
  document.getElementById('papers-title').textContent = curCourse.name + ' — Semester ' + s;
  showPage('page-papers');         // Page turant switch — no waiting
  loadPapersFromFirebase();        // Firestore data async load (cache se INSTANT aata hai)
}

// ===== LOAD PAPERS FROM FIREBASE (real-time) =====
let papersUnsubscribe = null;

function loadPapersFromFirebase() {
  const container = document.getElementById('papers-list');

  // Cached papers turant dikha do (zero wait) — pehle visit ke baad sab fast
  const cacheKey = 'cblu_papers_' + curCourse.id + '_sem' + curSem;
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
    if (cached && cached.length) {
      renderPapers(cached);
      document.getElementById('papers-count').textContent =
        cached.length + ' paper' + (cached.length !== 1 ? 's' : '') + ' available';
    } else {
      container.innerHTML = '<div class="loading-state"><div class="spinner"></div><div>Loading papers...</div></div>';
    }
  } catch(_) {
    container.innerHTML = '<div class="loading-state"><div class="spinner"></div><div>Loading papers...</div></div>';
  }

  if (papersUnsubscribe) papersUnsubscribe();

  papersUnsubscribe = db
    .collection('papers')
    .doc(curCourse.id)
    .collection('sem' + curSem)
    .orderBy('uploadedAt', 'desc')
    .onSnapshot(snapshot => {
      const papers = [];
      snapshot.forEach(doc => papers.push({ id: doc.id, ...doc.data() }));
      // Update UI
      renderPapers(papers);
      document.getElementById('papers-count').textContent =
        papers.length + ' paper' + (papers.length !== 1 ? 's' : '') + ' available';
      // Cache (without fileBase64 — wo bahut bada ho sakta hai)
      try {
        const slim = papers.map(p => ({ id: p.id, name: p.name, hasFile: !!p.fileBase64 }));
        localStorage.setItem(cacheKey, JSON.stringify(slim));
      } catch(_) {}
    }, err => {
      // Only show error if we have no cached data
      if (!container.querySelector('.paper-card')) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><p>Could not load papers. Check connection.</p></div>';
      }
    });
}

function renderPapers(papers) {
  const container = document.getElementById('papers-list');
  const semCards = document.querySelectorAll('#sem-grid .sem-card');
  if (semCards[curSem - 1]) {
    const countEl = semCards[curSem - 1].querySelector('.sem-count');
    if (papers.length > 0) {
      countEl.textContent = papers.length + ' paper' + (papers.length > 1 ? 's' : '');
      countEl.classList.add('has-papers');
    } else {
      countEl.textContent = 'No papers yet';
      countEl.classList.remove('has-papers');
    }
  }
  if (papers.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <p>No papers uploaded yet for this semester.</p>
      </div>`;
    return;
  }
  container.innerHTML = '';
  papers.forEach(p => {
    const hasFile = !!(p.fileBase64 || p.hasFile);
    const div = document.createElement('div');
    div.className = 'paper-card';
    div.innerHTML = `
      <div class="paper-icon">📄</div>
      <div class="paper-info">
        <div class="paper-name">${escHtml(p.name)}</div>
        <div style="margin-top:5px;display:flex;gap:6px;flex-wrap:wrap">
          <span class="paper-badge">${curCourse.name} • Sem ${curSem}</span>
          ${hasFile ? '<span class="paper-badge green">PDF ✓</span>' : ''}
        </div>
      </div>
      <div class="paper-actions">
        <button class="btn btn-primary" style="font-size:13px;padding:8px 16px"
          onclick="openDownload('${p.id}','${escAttr(p.name)}')">⬇ Download</button>
      </div>
    `;
    container.appendChild(div);
  });
}

// ===== DOWNLOAD =====
function openDownload(id, name) {
  dlPaper = { id, name };
  document.getElementById('dl-paper-name-text').textContent = '"' + name + '"';
  openModal('download-modal');
}
window.openDownload = openDownload;

async function confirmDownload() {
  closeModal('download-modal');
  try {
    const doc = await db
      .collection('papers').doc(curCourse.id)
      .collection('sem' + curSem).doc(dlPaper.id).get();
    const data = doc.data();
    if (data && data.fileBase64) {
      const a = document.createElement('a');
      a.href = data.fileBase64;
      a.download = dlPaper.name + '.pdf';
      a.click();
    } else {
      const content = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Contents 4 0 R/Resources<</Font<</F1<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>>>>>>>endobj
4 0 obj<</Length 150>>stream
BT /F1 18 Tf 72 700 Td (CBLU Old Question Paper) Tj 0 -40 Td /F1 13 Tf (${dlPaper.name}) Tj 0 -30 Td (Chaudhary Bansi Lal University, Bhiwani) Tj 0 -30 Td (Developed by Mahak) Tj ET
endstream endobj
xref 0 5
0000000000 65535 f 0000000015 00000 n 0000000062 00000 n 0000000114 00000 n 0000000299 00000 n
trailer<</Size 5/Root 1 0 R>>startxref 500 %%EOF`;
      const blob = new Blob([content], { type: 'application/pdf' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = dlPaper.name + '.pdf';
      a.click();
    }
    showToast('✓ Download started!');
  } catch(e) {
    showToast('⚠️ Download failed. Try again.', true);
  }
}

// ===== ADMIN LOGIN =====
function showAdminLogin() {
  document.getElementById('admin-user').value = '';
  document.getElementById('admin-pass').value = '';
  document.getElementById('login-err').classList.add('hidden');
  openModal('admin-login-modal');
  setTimeout(() => document.getElementById('admin-user').focus(), 100);
}
function doAdminLogin() {
  const u = document.getElementById('admin-user').value.trim();
  const p = document.getElementById('admin-pass').value;
  if (u === 'Mahak_1234' && p === '@Mahak127021@') {
    closeModal('admin-login-modal');
    localStorage.setItem('cblu_admin_session', 'true');
    loadAdminPanel();
  } else {
    document.getElementById('login-err').classList.remove('hidden');
    document.getElementById('admin-pass').value = '';
    document.getElementById('admin-pass').focus();
  }
}
function adminLogout() {
  localStorage.removeItem('cblu_admin_session');
  goHome();
}

// ===== ADMIN PANEL =====
function onAdminCourseClick(c) {
  adminCourse = c;
  document.getElementById('admin-course-lbl').textContent = c.name + ' — ' + c.full;
  setAdminStep(2);
  loadAdminSems();
  // push history state to allow back-button-to-step-1
  history.pushState({ page: 'page-admin', adminStep: 2 }, '', window.location.pathname);
}

function loadAdminPanel() {
  adminCourse = null; adminSem = null;
  setAdminStep(1);
  renderCourseCards('admin-courses-grid', COURSES, c => onAdminCourseClick(c));
  showPage('page-admin');
}

function loadAdminSems() {
  const grid = document.getElementById('admin-sem-grid');
  grid.innerHTML = '';
  for (let s = 1; s <= 6; s++) {
    const div = document.createElement('div');
    div.className = 'sem-card';
    div.innerHTML = `
      <div class="sem-num">${s}</div>
      <div class="sem-label">Semester ${s}</div>
      <div class="sem-count">Click to manage</div>
    `;
    div.addEventListener('click', () => {
      adminSem = s;
      document.getElementById('admin-sem-info').textContent =
        '📚 ' + adminCourse.name + ' (' + adminCourse.full + ') — Semester ' + s;
      setAdminStep(3);
      loadAdminPapers();
      history.pushState({ page: 'page-admin', adminStep: 3 }, '', window.location.pathname);
    });
    grid.appendChild(div);
  }
}

let adminPapersUnsubscribe = null;
function loadAdminPapers() {
  const container = document.getElementById('admin-papers-list');
  container.innerHTML = '<div class="loading-state"><div class="spinner"></div><div>Loading...</div></div>';
  if (adminPapersUnsubscribe) adminPapersUnsubscribe();
  adminPapersUnsubscribe = db
    .collection('papers').doc(adminCourse.id)
    .collection('sem' + adminSem)
    .orderBy('uploadedAt', 'desc')
    .onSnapshot(snapshot => {
      const papers = [];
      snapshot.forEach(doc => papers.push({ id: doc.id, ...doc.data() }));
      renderAdminPapers(papers);
    }, err => {
      container.innerHTML = '<div style="color:var(--red);font-size:14px;padding:12px">Error loading papers.</div>';
    });
}

function renderAdminPapers(papers) {
  const container = document.getElementById('admin-papers-list');
  if (papers.length === 0) {
    container.innerHTML = '<div style="color:var(--text3);font-size:14px;padding:16px 0;text-align:center">No papers yet — add one below.</div>';
    return;
  }
  container.innerHTML = '';
  papers.forEach(p => {
    const hasFile = !!p.fileBase64;
    const div = document.createElement('div');
    div.className = 'admin-paper-row';
    div.innerHTML = `
      <div style="flex:1;min-width:0">
        <div class="admin-paper-name">📄 ${escHtml(p.name)}</div>
        <div class="admin-paper-meta">${hasFile ? '✅ PDF uploaded — store/' + adminCourse.id + '/sem' + adminSem + '/' + p.id + '.pdf' : '⚠️ No PDF uploaded yet'}</div>
      </div>
      <div class="admin-paper-actions">
        <button class="btn btn-edit" onclick="openEdit('${p.id}','${escAttr(p.name)}')">✏️ Edit</button>
        <button class="btn btn-del" onclick="openDeleteConfirm('${p.id}','${escAttr(p.name)}')">🗑️ Delete</button>
      </div>
    `;
    container.appendChild(div);
  });
}

// ===== ADD PAPER =====
function handleFileSelect(input) {
  selectedFile = input.files[0] || null;
  const label = document.getElementById('file-text');
  if (selectedFile) {
    label.textContent = '✅ ' + selectedFile.name;
    label.classList.add('file-selected');
  } else {
    label.textContent = 'Click to select PDF';
    label.classList.remove('file-selected');
  }
}
async function addPaper() {
  const nameInput = document.getElementById('new-paper-name');
  const name = nameInput.value.trim();
  if (!name) { showToast('⚠️ Please enter paper name!', true); nameInput.focus(); return; }
  const btn = document.getElementById('btn-add-paper');
  btn.textContent = '⏳ Uploading...'; btn.disabled = true;
  try {
    let fileBase64 = null;
    if (window.getCameraPdfBase64 && window.getCameraPdfBase64()) {
      fileBase64 = window.getCameraPdfBase64();
      window.clearCameraPdf && window.clearCameraPdf();
    } else if (selectedFile) {
      fileBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = e => resolve(e.target.result);
        reader.onerror = () => reject(new Error('File read failed'));
        reader.readAsDataURL(selectedFile);
      });
    }
    await db.collection('papers').doc(adminCourse.id)
      .collection('sem' + adminSem)
      .add({
        name,
        fileBase64: fileBase64,
        uploadedAt: firebase.firestore.FieldValue.serverTimestamp(),
        course: adminCourse.id,
        semester: adminSem
      });
    nameInput.value = '';
    document.getElementById('new-paper-file').value = '';
    document.getElementById('file-text').textContent = 'Click to select PDF';
    document.getElementById('file-text').classList.remove('file-selected');
    selectedFile = null;
    showToast('✅ Paper uploaded successfully!');
  } catch(e) {
    showToast('⚠️ Upload failed: ' + e.message, true);
  } finally {
    btn.textContent = '📤 Upload Paper'; btn.disabled = false;
  }
}

// ===== DELETE =====
function openDeleteConfirm(id, name) {
  delTarget = { id, name };
  document.getElementById('del-paper-name-text').textContent =
    '"' + name + '" — this paper will be permanently deleted.';
  openModal('delete-modal');
}
window.openDeleteConfirm = openDeleteConfirm;
async function confirmDelete() {
  if (!delTarget) return;
  try {
    await db.collection('papers').doc(adminCourse.id)
      .collection('sem' + adminSem).doc(delTarget.id).delete();
    closeModal('delete-modal');
    showToast('🗑️ Paper deleted successfully.');
  } catch(e) { showToast('⚠️ Delete failed: ' + e.message, true); }
  delTarget = null;
}

// ===== EDIT =====
function openEdit(id, name) {
  editTarget = { id };
  document.getElementById('edit-paper-input').value = name;
  openModal('edit-modal');
  setTimeout(() => document.getElementById('edit-paper-input').focus(), 100);
}
window.openEdit = openEdit;
async function confirmEdit() {
  if (!editTarget) return;
  const newName = document.getElementById('edit-paper-input').value.trim();
  if (!newName) { showToast('⚠️ Name cannot be empty!', true); return; }
  try {
    await db.collection('papers').doc(adminCourse.id)
      .collection('sem' + adminSem).doc(editTarget.id).update({ name: newName });
    closeModal('edit-modal');
    showToast('✅ Paper name updated successfully!');
  } catch(e) { showToast('⚠️ Update failed: ' + e.message, true); }
  editTarget = null;
}

// ===== ADMIN STEP NAV =====
function setAdminStep(step) {
  document.getElementById('admin-s1').classList.toggle('hidden', step !== 1);
  document.getElementById('admin-s2').classList.toggle('hidden', step !== 2);
  document.getElementById('admin-s3').classList.toggle('hidden', step !== 3);
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById('step-' + i);
    el.classList.remove('active', 'done');
    if (i < step) el.classList.add('done');
    else if (i === step) el.classList.add('active');
  }
}
function adminToStep(step) {
  // Use browser history.back() so popstate handles it — yahi se 2 baar back par site se bahar nahi jaayega
  history.back();
}

// ===== MODAL HELPERS =====
function openModal(id)  { document.getElementById(id).classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

// ===== TOAST =====
let toastTimer = null;
function showToast(msg, isError) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('error');
  if (isError) toast.classList.add('error');
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ===== ESCAPE HELPERS =====
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escAttr(str) { return String(str).replace(/'/g, "\\'"); }

// expose for inline footer link
window.goHome = goHome;

// ===== EVENT LISTENERS =====
function attachEventListeners() {
  // Theme toggle
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const isDark = document.body.classList.contains('dark-mode');
    const next   = isDark ? 'light' : 'dark';
    localStorage.setItem('cblu_theme', next);
    applyTheme(next);
  });
  // Breadcrumb home
  document.getElementById('bc-home-btn').addEventListener('click', () => goHome());
  // UI back buttons → use browser history (taaki popstate handle kare aur 2 back par site se bahar na jaaye)
  document.getElementById('btn-back-home').addEventListener('click', () => history.back());
  document.getElementById('btn-back-sems').addEventListener('click', () => history.back());
  document.getElementById('btn-admin-back-courses').addEventListener('click', () => history.back());
  document.getElementById('btn-admin-back-sems').addEventListener('click', () => history.back());

  // Search
  document.getElementById('search-input').addEventListener('input', function() { filterCourses(this.value); });
  document.getElementById('search-clear-btn').addEventListener('click', clearSearch);

  // Admin
  document.getElementById('btn-show-admin-login').addEventListener('click', showAdminLogin);
  document.getElementById('btn-admin-logout').addEventListener('click', adminLogout);

  // Add paper
  document.getElementById('btn-add-paper').addEventListener('click', addPaper);

  // Camera capture — IDs/URL params bilkul same (camera.html, camera-tool.js work karte rahenge)
  window.openCameraCapture = function() {
    if (!adminCourse || !adminSem) { alert('Pehle Course aur Semester select karo!'); return; }
    const url = 'camera.html?course=' + adminCourse.id + '&sem=' + adminSem;
    const popup = window.open(url, 'cblu_camera', 'width=430,height=820,resizable=yes');
    window.onCameraUploadSuccess = function() {
      showToast('✅ Camera se paper upload ho gaya!');
      if (adminCourse && adminSem) loadAdminPapers();
      window.focus();
    };
    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      alert('Popup block ho gaya! Browser mein popup allow karo:\nAddress bar mein popup blocked icon click karo aur allow karo.');
    }
  };

  // File upload zone click
  document.getElementById('file-drop-zone').addEventListener('click', () => {
    document.getElementById('new-paper-file').click();
  });
  document.getElementById('new-paper-file').addEventListener('change', function() { handleFileSelect(this); });

  // Modal buttons
  document.getElementById('btn-cancel-download').addEventListener('click', () => closeModal('download-modal'));
  document.getElementById('btn-confirm-download').addEventListener('click', confirmDownload);

  document.getElementById('btn-cancel-login').addEventListener('click', () => closeModal('admin-login-modal'));
  document.getElementById('btn-do-login').addEventListener('click', doAdminLogin);
  document.getElementById('admin-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doAdminLogin(); });

  document.getElementById('btn-cancel-delete').addEventListener('click', () => closeModal('delete-modal'));
  document.getElementById('btn-confirm-delete').addEventListener('click', confirmDelete);

  document.getElementById('btn-cancel-edit').addEventListener('click', () => closeModal('edit-modal'));
  document.getElementById('btn-confirm-edit').addEventListener('click', confirmEdit);
  document.getElementById('edit-paper-input').addEventListener('keydown', e => { if (e.key === 'Enter') confirmEdit(); });

  // Close modal on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('show'); });
  });
  // Escape closes modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show'));
    }
  });

  // Pre-rendered course cards me click handler attach karo (taaki turant click work kare)
  document.querySelectorAll('#courses-grid .course-card[data-cid]').forEach(card => {
    card.addEventListener('click', () => {
      const c = COURSE_MAP[card.dataset.cid];
      if (c) openCourse(c);
    });
  });

  // Camera tool — agar camera-tool.js me yeh ID expect ho to enter button work kare
  const cameraBtn = document.querySelector('.cam-open-btn');
  if (cameraBtn) {
    cameraBtn.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCameraCapture(); }
    });
  }
}

// ===== INIT =====
function init() {
  initTheme();
  attachEventListeners();
  // Initial state — taaki pehli bar back dabane pr bhi site ke andar rahe
  history.replaceState({ page: 'page-home' }, '', window.location.pathname);
  // Splash hatao + body ko visible karo
  document.body.classList.remove('app-loading');
  const splash = document.getElementById('app-splash');
  if (splash) {
    splash.classList.add('gone');
    setTimeout(() => splash.remove(), 250);
  }
}

// Run init — defer ensures DOM ready hai
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
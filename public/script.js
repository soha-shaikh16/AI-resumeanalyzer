// script.js — Resume Analyzer frontend logic

// ── Element refs ──────────────────────────────────────────────────────────────
const uploadScreen  = document.getElementById('uploadScreen');
const loadingScreen = document.getElementById('loadingScreen');
const resultsScreen = document.getElementById('resultsScreen');

const dropZone    = document.getElementById('dropZone');
const fileInput   = document.getElementById('fileInput');
const filePill    = document.getElementById('filePill');
const fileName    = document.getElementById('fileName');
const removeFile  = document.getElementById('removeFile');
const analyzeBtn  = document.getElementById('analyzeBtn');
const errorBar    = document.getElementById('errorBar');
const errorMsg    = document.getElementById('errorMsg');
const resetBtn    = document.getElementById('resetBtn');

// Loading steps
const lsteps = [
  document.getElementById('ls1'),
  document.getElementById('ls2'),
  document.getElementById('ls3'),
  document.getElementById('ls4'),
];

// Result elements
const rCandidateName = document.getElementById('rCandidateName');
const ringFill       = document.getElementById('ringFill');
const scoreNumber    = document.getElementById('scoreNumber');
const scoreGrade     = document.getElementById('scoreGrade');
const scoreVerdict   = document.getElementById('scoreVerdict');
const rTargetRole    = document.getElementById('rTargetRole');
const rAtsScore      = document.getElementById('rAtsScore');
const sectionsGrid   = document.getElementById('sectionsGrid');
const detailPanel    = document.getElementById('detailPanel');
const detailName     = document.getElementById('detailName');
const detailBadge    = document.getElementById('detailBadge');
const detailBar      = document.getElementById('detailBar');
const detailScore    = document.getElementById('detailScore');
const detailFeedback = document.getElementById('detailFeedback');
const detailImprovements = document.getElementById('detailImprovements');
const detailClose    = document.getElementById('detailClose');
const strengthsList  = document.getElementById('strengthsList');
const weaknessesList = document.getElementById('weaknessesList');
const actionList     = document.getElementById('actionList');
const kwFound        = document.getElementById('kwFound');
const kwMissing      = document.getElementById('kwMissing');
const kwFoundCount   = document.getElementById('kwFoundCount');
const kwMissCount    = document.getElementById('kwMissCount');
const atsFeedback    = document.getElementById('atsFeedback');
const industryFit    = document.getElementById('industryFit');

// ── State ─────────────────────────────────────────────────────────────────────
let selectedFile  = null;
let stepInterval  = null;
let activeSection = null;

// ── Section metadata ──────────────────────────────────────────────────────────
const SECTION_META = {
  contactInfo:  { label: 'Contact Info' },
  summary:      { label: 'Summary / Objective' },
  experience:   { label: 'Work Experience' },
  education:    { label: 'Education' },
  skills:       { label: 'Skills' },
  achievements: { label: 'Achievements' },
  formatting:   { label: 'Formatting & ATS' },
};

// ── File handling ──────────────────────────────────────────────────────────────
dropZone.addEventListener('click',  () => fileInput.click());
dropZone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });
fileInput.addEventListener('change', e => { if (e.target.files[0]) handleFileSelect(e.target.files[0]); });

dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  if (e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0]);
});

removeFile.addEventListener('click', e => { e.stopPropagation(); clearFile(); });

function handleFileSelect(file) {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return showError('Please upload a PDF file.');
  }
  if (file.size > 5 * 1024 * 1024) {
    return showError('File too large. Maximum size is 5 MB.');
  }
  hideError();
  selectedFile = file;
  fileName.textContent = file.name;
  filePill.classList.remove('hidden');
  analyzeBtn.disabled = false;
}

function clearFile() {
  selectedFile   = null;
  fileInput.value = '';
  filePill.classList.add('hidden');
  analyzeBtn.disabled = true;
  hideError();
}

// ── Analysis ───────────────────────────────────────────────────────────────────
analyzeBtn.addEventListener('click', startAnalysis);

async function startAnalysis() {
  if (!selectedFile) return;
  hideError();
  showScreen('loading');
  startStepAnimation();

  const formData = new FormData();
  formData.append('resume', selectedFile);

  try {
    const res  = await fetch('/analyze', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Server error. Please try again.');
    stopStepAnimation();
    renderResults(data);
    showScreen('results');
  } catch (err) {
    stopStepAnimation();
    showScreen('upload');
    showError(err.message || 'Unexpected error. Please try again.');
  }
}

// ── Screen management ──────────────────────────────────────────────────────────
function showScreen(name) {
  uploadScreen .classList.toggle('hidden', name !== 'upload');
  loadingScreen.classList.toggle('hidden', name !== 'loading');
  resultsScreen.classList.toggle('hidden', name !== 'results');
  if (name !== 'results') {
    detailPanel.classList.add('hidden');
    activeSection = null;
  }
}

resetBtn.addEventListener('click', () => {
  showScreen('upload');
  clearFile();
});

// ── Loading steps ──────────────────────────────────────────────────────────────
function startStepAnimation() {
  let cur = 0;
  lsteps.forEach(s => s.classList.remove('active', 'done'));
  lsteps[0].classList.add('active');
  stepInterval = setInterval(() => {
    if (cur < lsteps.length - 1) {
      lsteps[cur].classList.replace('active', 'done');
      cur++;
      lsteps[cur].classList.add('active');
    }
  }, 7000);
}

function stopStepAnimation() {
  clearInterval(stepInterval);
  lsteps.forEach(s => { s.classList.remove('active'); s.classList.add('done'); });
}

// ── Render results ─────────────────────────────────────────────────────────────
function renderResults(data) {
  // Candidate / meta
  rCandidateName.textContent = data.candidateName || 'Resume Analysis';
  rTargetRole.textContent    = data.targetRole    || 'General';
  rAtsScore.textContent      = data.atsScore      ?? '—';

  // Overall score ring
  const score = Math.min(100, Math.max(0, data.overallScore || 0));
  animateScore(score);
  scoreVerdict.textContent = data.overallVerdict || '';

  // Grade label
  const { grade, color } = getGrade(score);
  scoreGrade.textContent  = grade;
  scoreGrade.style.color  = color;
  ringFill.style.stroke   = color;

  // Sections grid
  sectionsGrid.innerHTML = '';
  Object.entries(SECTION_META).forEach(([key, meta]) => {
    const sec = data.sections?.[key];
    if (!sec) return;
    sectionsGrid.appendChild(buildSectionCard(key, meta.label, sec));
  });

  // Strengths
  strengthsList.innerHTML = '';
  (data.strengths || []).forEach(s => {
    const li = document.createElement('li');
    li.textContent = s;
    strengthsList.appendChild(li);
  });

  // Weaknesses
  weaknessesList.innerHTML = '';
  (data.weaknesses || []).forEach(w => {
    const li = document.createElement('li');
    li.textContent = w;
    weaknessesList.appendChild(li);
  });

  // Action plan
  actionList.innerHTML = '';
  (data.topImprovements || []).forEach(item => {
    actionList.appendChild(buildActionItem(item));
  });

  // Keywords
  const present = data.keywords?.present || [];
  const missing = data.keywords?.missing || [];
  kwFoundCount.textContent = present.length;
  kwMissCount.textContent  = missing.length;

  kwFound.innerHTML = '';
  present.forEach(kw => {
    const span = document.createElement('span');
    span.className   = 'kw-pill';
    span.textContent = kw;
    kwFound.appendChild(span);
  });

  kwMissing.innerHTML = '';
  missing.forEach(kw => {
    const span = document.createElement('span');
    span.className   = 'kw-pill missing';
    span.textContent = kw;
    kwMissing.appendChild(span);
  });

  atsFeedback.textContent = data.atsFeedback || '';

  // Industry fit
  industryFit.textContent = data.industryFit || '';

  // Animate bars after a short delay (allows DOM paint)
  setTimeout(() => animateSectionBars(), 120);
}

// ── Section card ───────────────────────────────────────────────────────────────
function buildSectionCard(key, label, sec) {
  const status = sec.status || (sec.found === false ? 'missing' : 'average');
  const score  = sec.score ?? 0;

  const card = document.createElement('div');
  card.className = `section-card status-${status}`;
  card.dataset.key = key;

  card.innerHTML = `
    <div class="sc-top">
      <span class="sc-name">${escHtml(label)}</span>
      <span class="sc-badge badge-${status}">${status}</span>
    </div>
    <div class="sc-bar-wrap">
      <div class="sc-bar bar-${status}" data-score="${score}" style="width:0%"></div>
    </div>
    <div class="sc-score-row">
      <span class="sc-score">${score}/100</span>
      <span class="sc-click-hint">tap for details →</span>
    </div>
  `;

  card.addEventListener('click', () => toggleDetailPanel(key, label, sec, card));
  return card;
}

function animateSectionBars() {
  document.querySelectorAll('.sc-bar').forEach(bar => {
    const score = parseInt(bar.dataset.score, 10) || 0;
    bar.style.width = score + '%';
  });
}

// ── Detail panel ───────────────────────────────────────────────────────────────
function toggleDetailPanel(key, label, sec, card) {
  // If clicking the same card, close the panel
  if (activeSection === key) {
    detailPanel.classList.add('hidden');
    card.classList.remove('active');
    activeSection = null;
    return;
  }

  // Deactivate previous card
  document.querySelectorAll('.section-card.active').forEach(c => c.classList.remove('active'));
  card.classList.add('active');
  activeSection = key;

  const status = sec.status || 'average';
  const score  = sec.score  ?? 0;

  detailName.textContent    = label;
  detailBadge.className     = `detail-badge sc-badge badge-${status}`;
  detailBadge.textContent   = status;
  detailFeedback.textContent = sec.feedback || 'No feedback available.';
  detailScore.textContent   = `${score}/100`;

  // Bar
  detailBar.className = `detail-score-bar bar-${status}`;
  detailBar.style.width = '0%';
  setTimeout(() => { detailBar.style.width = score + '%'; }, 50);

  // Improvements / missing
  detailImprovements.innerHTML = '';
  const items = sec.improvements || sec.missing || [];
  if (items.length > 0) {
    items.forEach(imp => {
      const div = document.createElement('div');
      div.className   = 'improvement-item';
      div.textContent = imp;
      detailImprovements.appendChild(div);
    });
  }

  detailPanel.classList.remove('hidden');

  // Scroll panel into view smoothly
  setTimeout(() => detailPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
}

detailClose.addEventListener('click', () => {
  detailPanel.classList.add('hidden');
  document.querySelectorAll('.section-card.active').forEach(c => c.classList.remove('active'));
  activeSection = null;
});

// ── Action item ────────────────────────────────────────────────────────────────
function buildActionItem(item) {
  const div = document.createElement('div');
  div.className = 'action-item';
  div.innerHTML = `
    <span class="action-priority priority-${item.priority || 'medium'}">${item.priority || 'medium'}</span>
    <div class="action-content">
      <div class="action-action">${escHtml(item.action || '')}</div>
      <div class="action-impact">${escHtml(item.impact || '')}</div>
    </div>
  `;
  return div;
}

// ── Score animation ────────────────────────────────────────────────────────────
function animateScore(target) {
  // Ring: circumference = 2π×50 ≈ 314.16
  const circumference = 314.16;
  const offset = circumference - (target / 100) * circumference;

  // Animate number
  let current = 0;
  const step  = Math.ceil(target / 60);
  const timer = setInterval(() => {
    current = Math.min(current + step, target);
    scoreNumber.textContent = current;
    if (current >= target) clearInterval(timer);
  }, 20);

  // Animate ring after short delay
  setTimeout(() => { ringFill.style.strokeDashoffset = offset; }, 150);
}

// ── Grade helper ───────────────────────────────────────────────────────────────
function getGrade(score) {
  if (score >= 85) return { grade: 'Excellent',    color: '#22c55e' };
  if (score >= 70) return { grade: 'Good',         color: '#84cc16' };
  if (score >= 55) return { grade: 'Average',      color: '#eab308' };
  if (score >= 40) return { grade: 'Needs Work',   color: '#f97316' };
  return               { grade: 'Poor',          color: '#ef4444' };
}

// ── Error helpers ──────────────────────────────────────────────────────────────
function showError(msg) { errorMsg.textContent = msg; errorBar.classList.remove('hidden'); }
function hideError()    { errorBar.classList.add('hidden'); }

// ── XSS safety ────────────────────────────────────────────────────────────────
function escHtml(text) {
  return String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

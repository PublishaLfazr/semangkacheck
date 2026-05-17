const fileInput   = document.getElementById('fileInput');
const uploadZone  = document.getElementById('uploadZone');
const previewBox  = document.getElementById('previewBox');
const previewImg  = document.getElementById('previewImg');
const btnAnalyze  = document.getElementById('btnAnalyze');
const btnReset    = document.getElementById('btnReset');
const btnShare    = document.getElementById('btnShare');
const loadingBar  = document.getElementById('loadingBar');
const results     = document.getElementById('results');
const errorBox    = document.getElementById('errorBox');
const statusSteps = document.getElementById('statusSteps');
const statusText  = document.getElementById('statusText');

const MAX_FILE_MB    = 10;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
const ALLOWED_TYPES  = ['image/jpeg', 'image/png', 'image/webp'];

let selectedFile     = null;
let currentImageB64  = null;
let lastAnalysisData = null;
let compareIds       = [null, null];

// ─── UTILITAS ───────────────────────────────────────────────────────────────

/** Escape HTML untuk cegah XSS */
function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Buat thumbnail async */
function makeThumb(base64, size) {
  return new Promise((resolve) => {
    try {
      const img    = new Image();
      img.onload   = () => {
        const canvas  = document.createElement('canvas');
        canvas.width  = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const aspect = img.width / img.height;
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (aspect > 1) { sw = img.height; sx = (img.width - sw) / 2; }
        else            { sh = img.width;  sy = (img.height - sh) / 2; }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.onerror  = () => resolve(null);
      img.src      = base64;
    } catch { resolve(null); }
  });
}

// ─── TIPS BANNER ────────────────────────────────────────────────────────────

function toggleTips() {
  const content = document.getElementById('tipsContent');
  const icon    = document.getElementById('tipsIcon');
  const isOpen  = content.style.display !== 'none';
  content.style.display = isOpen ? 'none' : 'block';
  icon.textContent = isOpen ? '▸' : '▾';
}

// ─── SWEETNESS ICON ─────────────────────────────────────────────────────────

function sweetnessIcon(val) {
  const map = {
    'Tidak Manis': '😐',
    'Cukup Manis': '🙂',
    'Manis': '😋',
    'Sangat Manis': '🤩'
  };
  return map[val] || '—';
}

// ─── UPLOAD & PREVIEW ───────────────────────────────────────────────────────

uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f) handleFile(f);
});
fileInput.addEventListener('change', (e) => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
});

function handleFile(file) {
  if (!ALLOWED_TYPES.includes(file.type)) {
    showError('Format file tidak didukung. Gunakan JPG, PNG, atau WEBP.');
    fileInput.value = '';
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    showError(`File terlalu besar (${(file.size / 1024 / 1024).toFixed(1)} MB). Maksimal ${MAX_FILE_MB} MB.`);
    fileInput.value = '';
    return;
  }
  selectedFile = file;
  const reader = new FileReader();
  reader.onload = (ev) => {
    currentImageB64 = ev.target.result;
    previewImg.src  = ev.target.result;
    previewBox.style.display = 'block';
    btnAnalyze.disabled = false;
    results.style.display = 'none';
    errorBox.style.display = 'none';
    lastAnalysisData = null;
  };
  reader.readAsDataURL(file);
}

// ─── STEP INDICATOR ─────────────────────────────────────────────────────────

function setStep(n) {
  ['dot1', 'dot2', 'dot3'].forEach((id, i) => {
    const el = document.getElementById(id);
    el.className = 'step-dot' +
      (i < n ? ' done' : i === n ? ' active' : '');
  });
}

// ─── ANALISIS ───────────────────────────────────────────────────────────────

btnAnalyze.addEventListener('click', async () => {
  if (!selectedFile) return;

  if (lastAnalysisData) {
    if (!confirm('Gambar ini sudah dianalisis. Analisis ulang?')) return;
  }

  btnAnalyze.disabled = true;
  loadingBar.style.display = 'block';
  results.style.display = 'none';
  errorBox.style.display = 'none';
  statusSteps.style.display = 'flex';

  setStep(0);
  statusText.textContent = 'Membaca gambar...';

  try {
    const formData = new FormData();
    formData.append('image', selectedFile);

    setStep(1);
    statusText.textContent = 'Mengirim ke Server...';

    const response = await fetch('/api/analyze', {
      method: 'POST',
      body: formData,
    });

    setStep(2);
    statusText.textContent = 'Memproses hasil...';

    const json = await response.json();

    if (!response.ok || json.error) {
      showError(json.error || 'Terjadi kesalahan pada server.');
      return;
    }

    if (!json.data.adalah_semangka) {
      showError('Gambar ini tampaknya bukan semangka. Silakan upload foto semangka yang jelas.');
      return;
    }

    lastAnalysisData = json.data;
    showResults(json.data);
  } catch (err) {
    console.error(err);
    showError('Tidak dapat terhubung ke server. Periksa koneksi internet dan coba lagi.');
  } finally {
    loadingBar.style.display = 'none';
    statusSteps.style.display = 'none';
    btnAnalyze.disabled = false;
  }
});

function showError(msg) {
  errorBox.textContent = '⚠️ ' + msg;
  errorBox.style.display = 'block';
  loadingBar.style.display = 'none';
  statusSteps.style.display = 'none';
  btnAnalyze.disabled = false;
}

function showResults(r) {
  results.style.display = 'block';

  document.getElementById('ripePct').textContent = r.tingkat_kematangan_persen + '%';
  document.getElementById('rotPct').textContent  = r.tingkat_kebusukan_persen + '%';
  document.getElementById('colorScore').textContent = r.skor_warna + '/100';

  // Kemanisan
  const sweetnessEl = document.getElementById('sweetnessVal');
  sweetnessEl.textContent = sweetnessIcon(r.estimasi_kemanisan) + ' ' + r.estimasi_kemanisan;

  const ripeLabel = document.getElementById('ripeLabel');
  ripeLabel.textContent = r.kategori_kematangan;
  const badgeMap = {
    'Mentah':          'badge-unripe',
    'Setengah Matang': 'badge-ripe',
    'Matang':          'badge-ripe',
    'Terlalu Matang':  'badge-overripe',
  };
  ripeLabel.className = 'ripeness-badge ' + (badgeMap[r.kategori_kematangan] || 'badge-ripe');

  document.getElementById('rotLabel').textContent = r.kondisi_kebusukan;

  setTimeout(() => {
    setMeter('meterRipe',  'meterRipePct',  r.tingkat_kematangan_persen);
    setMeter('meterRot',   'meterRotPct',   r.tingkat_kebusukan_persen);
    setMeter('meterColor', 'meterColorPct', r.skor_warna);
    setMeter('meterAcc',   'meterAccPct',   r.akurasi_persen);
  }, 100);

  document.getElementById('analysisText').textContent = r.analisis;

  const tipBox  = document.getElementById('tipBox');
  const tipText = document.getElementById('tipText');
  if (r.saran) {
    tipText.textContent = '💡 ' + r.saran;
    tipBox.style.display = 'block';
  } else {
    tipBox.style.display = 'none';
  }

  results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  saveHistory(r, currentImageB64);
}

function setMeter(barId, labelId, pct) {
  document.getElementById(barId).style.width   = pct + '%';
  document.getElementById(labelId).textContent = pct + '%';
}

// ─── SHARE ──────────────────────────────────────────────────────────────────

btnShare.addEventListener('click', () => {
  if (!lastAnalysisData) return;
  const r = lastAnalysisData;
  const teks =
    `🍉 *SemangkaCheck AI — Hasil Analisis*\n` +
    `Kematangan: ${r.tingkat_kematangan_persen}% (${r.kategori_kematangan})\n` +
    `Kebusukan: ${r.tingkat_kebusukan_persen}% (${r.kondisi_kebusukan})\n` +
    `Kemanisan: ${r.estimasi_kemanisan}\n` +
    `Skor Warna: ${r.skor_warna}/100\n` +
    `Akurasi AI: ${r.akurasi_persen}%\n\n` +
    `📝 ${r.analisis}\n` +
    `💡 ${r.saran}`;

  if (navigator.share) {
    navigator.share({ title: 'SemangkaCheck AI', text: teks })
      .catch(() => {});
  } else {
    navigator.clipboard.writeText(teks).then(() => {
      const orig = btnShare.innerHTML;
      btnShare.innerHTML = '<i class="ti ti-check"></i> Tersalin!';
      setTimeout(() => { btnShare.innerHTML = orig; }, 2000);
    }).catch(() => { alert(teks); });
  }
});

// ─── RESET ──────────────────────────────────────────────────────────────────

btnReset.addEventListener('click', () => {
  selectedFile     = null;
  currentImageB64  = null;
  lastAnalysisData = null;
  fileInput.value  = '';
  previewBox.style.display = 'none';
  results.style.display    = 'none';
  errorBox.style.display   = 'none';
  btnAnalyze.disabled = true;
  setMeter('meterRipe',  'meterRipePct',  0);
  setMeter('meterRot',   'meterRotPct',   0);
  setMeter('meterColor', 'meterColorPct', 0);
  setMeter('meterAcc',   'meterAccPct',   0);
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ─── RIWAYAT ────────────────────────────────────────────────────────────────

const HISTORY_KEY = 'semangkacheck_history';
const MAX_HISTORY = 20;

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch { return []; }
}

async function saveHistory(data, imageB64) {
  const history = loadHistory();
  const thumb   = await makeThumb(imageB64, 120);
  const now     = new Date();
  const entry   = {
    id: now.getTime(),
    waktu: now.toLocaleString('id-ID'),
    waktu_iso: now.toISOString(),
    thumbnail: thumb,
    kategori_kematangan:       data.kategori_kematangan,
    kondisi_kebusukan:         data.kondisi_kebusukan,
    estimasi_kemanisan:        data.estimasi_kemanisan,
    skor_warna:                data.skor_warna,
    tingkat_kematangan_persen: data.tingkat_kematangan_persen,
    tingkat_kebusukan_persen:  data.tingkat_kebusukan_persen,
    akurasi_persen:            data.akurasi_persen,
    analisis:                  data.analisis,
    saran:                     data.saran
  };
  history.unshift(entry);
  if (history.length > MAX_HISTORY) history.pop();
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    entry.thumbnail = null;
    history[0] = entry;
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); }
    catch { console.warn('localStorage penuh, riwayat tidak tersimpan.'); }
  }
  renderHistory();
}

function deleteHistory(id) {
  if (!confirm('Hapus riwayat ini?')) return;
  const history = loadHistory().filter(e => e.id !== id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  compareIds = compareIds.map(cid => cid === id ? null : cid);
  renderHistory();
  renderCompare();
}

function clearHistory() {
  if (!confirm('Hapus semua riwayat analisis?')) return;
  localStorage.removeItem(HISTORY_KEY);
  compareIds = [null, null];
  renderHistory();
  document.getElementById('compareSection').style.display = 'none';
}

function toggleCard(id) {
  const body = document.getElementById('hbody-' + id);
  const icon = document.getElementById('hicon-' + id);
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  icon.textContent   = isOpen ? '▸' : '▾';
}

function renderHistory() {
  const history   = loadHistory();
  const container = document.getElementById('historyList');
  const section   = document.getElementById('historySection');
  const emptyMsg  = document.getElementById('historyEmpty');
  const countEl   = document.getElementById('historyCount');

  section.style.display = 'block';

  if (history.length === 0) {
    emptyMsg.style.display = 'block';
    countEl.textContent    = '';
    container.innerHTML    = '';
    return;
  }

  emptyMsg.style.display = 'none';
  countEl.textContent = `${history.length} / ${MAX_HISTORY} riwayat tersimpan`;

  container.innerHTML = history.map(e => {
    const badgeClass = {
      'Mentah':          'badge-unripe',
      'Setengah Matang': 'badge-ripe',
      'Matang':          'badge-ripe',
      'Terlalu Matang':  'badge-overripe'
    }[e.kategori_kematangan] || 'badge-ripe';

    const isActive  = compareIds.includes(e.id);
    const thumbHtml = e.thumbnail
      ? `<img class="history-thumb" src="${escHtml(e.thumbnail)}" alt="thumb" />`
      : `<div class="history-thumb-placeholder">🍉</div>`;

    return `
      <div class="history-card">
        <div class="history-header" onclick="toggleCard(${e.id})" style="cursor:pointer;">
          <div class="history-header-left">
            ${thumbHtml}
            <div>
              <span class="ripeness-badge ${badgeClass}">${escHtml(e.kategori_kematangan)}</span>
              <br>
              <span class="history-time">${escHtml(e.waktu)}</span>
            </div>
          </div>
          <div class="history-header-right">
            <button class="history-compare-btn ${isActive ? 'compare-active' : ''}"
              onclick="event.stopPropagation(); selectCompare(${e.id})" title="Bandingkan">⚖️</button>
            <button class="history-delete"
              onclick="event.stopPropagation(); deleteHistory(${e.id})" title="Hapus">✕</button>
            <span class="history-toggle-icon" id="hicon-${e.id}">▸</span>
          </div>
        </div>
        <div class="history-body" id="hbody-${e.id}" style="display:none;">
          <div class="history-badges">
            <span class="history-rot">${escHtml(e.kondisi_kebusukan)}</span>
            <span class="history-sweet">${escHtml(e.estimasi_kemanisan || '—')}</span>
          </div>
          <div class="history-meters">
            <span>🍉 Matang: <b>${escHtml(String(e.tingkat_kematangan_persen))}%</b></span>
            <span>🟤 Busuk: <b>${escHtml(String(e.tingkat_kebusukan_persen))}%</b></span>
            <span>🎨 Warna: <b>${escHtml(String(e.skor_warna ?? '—'))}/100</b></span>
            <span>🎯 Akurasi: <b>${escHtml(String(e.akurasi_persen))}%</b></span>
          </div>
          <p class="history-analisis">${escHtml(e.analisis)}</p>
          ${e.saran ? `<p class="history-saran">💡 ${escHtml(e.saran)}</p>` : ''}
        </div>
      </div>`;
  }).join('');
}

renderHistory();

// ─── EXPORT ─────────────────────────────────────────────────────────────────

function exportJSON() {
  const history = loadHistory();
  if (!history.length) return alert('Belum ada riwayat.');
  const clean = history.map(({ thumbnail, ...rest }) => rest);
  const blob  = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `semangkacheck-riwayat-${dateStamp()}.json`);
}

function exportCSV() {
  const history = loadHistory();
  if (!history.length) return alert('Belum ada riwayat.');
  const cols = ['id','waktu','waktu_iso','kategori_kematangan','kondisi_kebusukan',
                 'estimasi_kemanisan','skor_warna',
                 'tingkat_kematangan_persen','tingkat_kebusukan_persen',
                 'akurasi_persen','analisis','saran'];
  const rows = [cols.join(',')];
  history.forEach(e => {
    rows.push(cols.map(c => `"${String(e[c] ?? '').replace(/"/g, '""')}"`).join(','));
  });
  const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `semangkacheck-riwayat-${dateStamp()}.csv`);
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── COMPARE ────────────────────────────────────────────────────────────────

function selectCompare(id) {
  const history = loadHistory();
  if (!history.find(e => e.id === id)) return;

  const existingSlot = compareIds.indexOf(id);
  if (existingSlot !== -1) {
    compareIds[existingSlot] = null;
    renderHistory();
    renderCompare();
    return;
  }

  if (compareIds[0] === null)      compareIds[0] = id;
  else if (compareIds[1] === null) compareIds[1] = id;
  else { compareIds[0] = compareIds[1]; compareIds[1] = id; }

  renderHistory();
  renderCompare();
}

function renderCompare() {
  const section    = document.getElementById('compareSection');
  const [id1, id2] = compareIds;

  if (!id1 && !id2) { section.style.display = 'none'; return; }

  const history = loadHistory();
  const e1 = history.find(e => e.id === id1);
  const e2 = history.find(e => e.id === id2);

  section.style.display = 'block';
  section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  document.getElementById('compareCol1').innerHTML = e1 ? buildCompareCol(e1) : buildEmptyCol('Pilih semangka 1');
  document.getElementById('compareCol2').innerHTML = e2 ? buildCompareCol(e2) : buildEmptyCol('Pilih semangka 2');

  if (e1 && e2) {
    highlightBetter('cmp-matang',  id1, id2, e1.tingkat_kematangan_persen, e2.tingkat_kematangan_persen, true);
    highlightBetter('cmp-busuk',   id1, id2, e1.tingkat_kebusukan_persen,  e2.tingkat_kebusukan_persen,  false);
    highlightBetter('cmp-warna',   id1, id2, e1.skor_warna ?? 0,           e2.skor_warna ?? 0,           true);
    highlightBetter('cmp-akurasi', id1, id2, e1.akurasi_persen,            e2.akurasi_persen,             true);
  }
}

function buildEmptyCol(label) {
  return `<div class="compare-empty">${escHtml(label)}<br><small>Klik ⚖️ di riwayat</small></div>`;
}

function buildCompareCol(e) {
  const badgeClass = {
    'Mentah':          'badge-unripe',
    'Setengah Matang': 'badge-ripe',
    'Matang':          'badge-ripe',
    'Terlalu Matang':  'badge-overripe'
  }[e.kategori_kematangan] || 'badge-ripe';

  const thumbHtml = e.thumbnail
    ? `<img class="compare-thumb" src="${escHtml(e.thumbnail)}" alt="thumb" />`
    : `<div class="compare-thumb-placeholder">🍉</div>`;

  return `
    ${thumbHtml}
    <span class="ripeness-badge ${badgeClass}" style="margin-bottom:6px;">${escHtml(e.kategori_kematangan)}</span>
    <span class="compare-sub">${escHtml(e.kondisi_kebusukan)}</span>
    <span class="compare-sub">${escHtml(e.estimasi_kemanisan || '—')}</span>
    <div class="compare-stat" id="cmp-matang-${e.id}">
      <span class="compare-label">Kematangan</span>
      <span class="compare-val">${escHtml(String(e.tingkat_kematangan_persen))}%</span>
    </div>
    <div class="compare-stat" id="cmp-busuk-${e.id}">
      <span class="compare-label">Kebusukan</span>
      <span class="compare-val">${escHtml(String(e.tingkat_kebusukan_persen))}%</span>
    </div>
    <div class="compare-stat" id="cmp-warna-${e.id}">
      <span class="compare-label">Skor Warna</span>
      <span class="compare-val">${escHtml(String(e.skor_warna ?? '—'))}/100</span>
    </div>
    <div class="compare-stat" id="cmp-akurasi-${e.id}">
      <span class="compare-label">Akurasi</span>
      <span class="compare-val">${escHtml(String(e.akurasi_persen))}%</span>
    </div>
    <p class="compare-analisis">${escHtml(e.analisis)}</p>
    <span class="compare-time">${escHtml(e.waktu)}</span>`;
}

function highlightBetter(key, id1, id2, val1, val2, higherIsBetter) {
  const el1 = document.getElementById(`${key}-${id1}`);
  const el2 = document.getElementById(`${key}-${id2}`);
  if (!el1 || !el2) return;
  const winner = higherIsBetter
    ? (val1 >= val2 ? el1 : el2)
    : (val1 <= val2 ? el1 : el2);
  winner.classList.add('compare-winner');
}

function closeCompare() {
  compareIds = [null, null];
  document.getElementById('compareSection').style.display = 'none';
  renderHistory();
}

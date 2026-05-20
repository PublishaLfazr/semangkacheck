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

// ─── EMOJI & LABEL MAPS ─────────────────────────────────────────────────────

const JENIS_EMOJI = {
  'buah':         '🍉',
  'daun':         '🌿',
  'akar':         '🌱',
  'batang':       '🪵',
  'bunga':        '🌸',
  'sulur':        '🌀',
  'benih':        '🫘',
  'tanaman_utuh': '🌾',
  'lainnya':      '🔍'
};

const KONDISI_CLASS = {
  'Sangat Baik': 'kondisi-sangat-baik',
  'Baik':        'kondisi-baik',
  'Cukup':       'kondisi-cukup',
  'Buruk':       'kondisi-buruk',
  'Sangat Buruk':'kondisi-sangat-buruk'
};

const KONDISI_TANAMAN_CLASS = {
  'Sehat':        'ktanaman-sehat',
  'Kurang Sehat': 'ktanaman-kurang',
  'Sakit':        'ktanaman-sakit',
  'Kritis':       'ktanaman-kritis'
};

// ─── UTILITAS ───────────────────────────────────────────────────────────────

function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
    'Manis':       '😋',
    'Sangat Manis':'🤩'
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

    if (!json.data.adalah_tanaman_semangka) {
      // Jika AI ragu tapi jenis_objek terdeteksi, tetap lanjutkan dengan peringatan
      if (json.data.jenis_objek && json.data.jenis_objek !== 'lainnya') {
        json.data._peringatan = 'AI kurang yakin ini tanaman semangka, tapi tetap dianalisis.';
      } else {
        showError('Gambar ini tampaknya bukan bagian dari tanaman semangka. Silakan upload foto buah, daun, akar, batang, bunga, atau bagian lain tanaman semangka.');
        return;
      }
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

  // ── PERINGATAN (kalau AI kurang yakin) ────────────────────────────────────
  const warningBox = document.getElementById('warningBox');
  if (r._peringatan && warningBox) {
    warningBox.textContent = '⚠️ ' + r._peringatan;
    warningBox.style.display = 'block';
  } else if (warningBox) {
    warningBox.style.display = 'none';
  }

  const jenis   = r.jenis_objek || 'lainnya';
  const emoji   = JENIS_EMOJI[jenis] || '🔍';
  const isBuah  = jenis === 'buah';

  // ── BADGE JENIS & KONDISI ──────────────────────────────────────────────────
  const typeBadge = document.getElementById('objectTypeBadge');
  typeBadge.textContent  = emoji + ' ' + (r.nama_bagian || jenis);
  typeBadge.className    = 'object-type-badge jenis-' + jenis;

  const condBadge = document.getElementById('conditionBadge');
  condBadge.textContent = r.kondisi_umum || '—';
  condBadge.className   = 'condition-badge ' + (KONDISI_CLASS[r.kondisi_umum] || '');

  // ── SKOR KESEHATAN ─────────────────────────────────────────────────────────
  document.getElementById('healthScoreIcon').textContent = emoji;
  document.getElementById('healthScoreValue').textContent = (r.skor_kesehatan ?? '—') + '/100';
  setTimeout(() => {
    setMeter('meterHealth', 'meterHealthPct', r.skor_kesehatan ?? 0);
  }, 100);

  // ── SECTION BUAH ──────────────────────────────────────────────────────────
  document.getElementById('sectionBuah').style.display    = isBuah ? 'block' : 'none';
  document.getElementById('sectionTanaman').style.display = isBuah ? 'none'  : 'block';

  if (isBuah) {
    document.getElementById('ripePct').textContent  = r.tingkat_kematangan_persen + '%';
    document.getElementById('rotPct').textContent   = r.tingkat_kebusukan_persen + '%';
    document.getElementById('colorScore').textContent = r.skor_warna + '/100';

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
    }, 100);

  } else {
    // ── SECTION TANAMAN ────────────────────────────────────────────────────
    document.getElementById('warnaValue').textContent         = r.warna_bagian || '—';
    document.getElementById('kondisiTanamanValue').textContent = r.kondisi_tanaman || '—';

    const ktEl = document.getElementById('kondisiTanamanValue');
    ktEl.className = 'plant-detail-value ' + (KONDISI_TANAMAN_CLASS[r.kondisi_tanaman] || '');

    // Penyakit
    const penyakitVal = r.tanda_penyakit || '—';
    document.getElementById('penyakitValue').textContent = penyakitVal;
    const pCard = document.getElementById('penyakitCard');
    pCard.classList.toggle('disease-detected', penyakitVal !== 'Tidak Ada' && penyakitVal !== '—');

    // Hama
    const hamaVal = r.serangan_hama || '—';
    document.getElementById('hamaValue').textContent = hamaVal;
    const hCard = document.getElementById('hamaCard');
    hCard.classList.toggle('disease-detected', hamaVal !== 'Tidak Ada' && hamaVal !== '—');

    // Stres air
    const stresAir = r.tingkat_stres_air;
    if (stresAir) {
      document.getElementById('stresAirValue').textContent = stresAir;
      document.getElementById('waterStressRow').style.display = 'block';
      const wCard = document.querySelector('.water-stress-card');
      wCard.classList.toggle('water-stress-abnormal', stresAir !== 'Normal');
    } else {
      document.getElementById('waterStressRow').style.display = 'none';
    }

    // ── AUTO INFO PENYAKIT/HAMA ────────────────────────────────────────────
    const adaPenyakit = penyakitVal !== 'Tidak Ada' && penyakitVal !== '—';
    const adaHama     = hamaVal !== 'Tidak Ada' && hamaVal !== '—';
    if (adaPenyakit || adaHama) {
      const query = adaPenyakit ? penyakitVal : hamaVal;
      tampilInfoBox(query);
    } else {
      document.getElementById('infoBox').style.display = 'none';
    }
  }

  // ── AKURASI ───────────────────────────────────────────────────────────────
  setTimeout(() => {
    setMeter('meterAcc', 'meterAccPct', r.akurasi_persen);
  }, 100);

  // ── ANALISIS & SARAN ──────────────────────────────────────────────────────
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

  // ── TAMPILKAN SECTION DIAGNOSA jika ada ≥2 riwayat ───────────────────────
  const hist = loadHistory();
  if (hist.length >= 2) {
    document.getElementById('diagnosaSection').style.display = 'block';
  }
}

// ─── DATABASE PENYAKIT & HAMA SEMANGKA (LOKAL) ───────────────────────────────

const DB_PENYAKIT = [
  {
    id: 'layu_fusarium',
    nama: 'Layu Fusarium',
    kategori: 'jamur',
    patogen: 'Fusarium oxysporum f.sp. niveum',
    bahaya: 'Tinggi',
    bagian: ['akar', 'batang', 'daun', 'tanaman_utuh'],
    keywords: ['fusarium', 'layu', 'fusarium oxysporum', 'layu fusarium', 'busuk akar fusarium', 'batang membusuk', 'layu permanen'],
    deskripsi: 'Penyakit layu yang disebabkan jamur tanah Fusarium oxysporum. Menyerang sistem pembuluh tanaman sehingga air tidak bisa naik — tanaman layu permanen meski tanah cukup air.',
    gejala: [
      'Daun menguning dari tepi, lalu layu permanen tidak bisa pulih meski disiram',
      'Batang bawah/pangkal membusuk berwarna cokelat/hitam',
      'Bila batang dipotong, terlihat cincin cokelat pada jaringan pembuluh',
      'Akar berwarna cokelat tua, membusuk dan mudah putus',
      'Tanaman mati bertahap mulai dari pucuk ke bawah'
    ],
    penanganan: [
      'Cabut dan bakar tanaman yang sudah terinfeksi berat agar tidak menyebar',
      'Siram tanah dengan fungisida berbahan aktif Benomyl atau Carbendazim',
      'Aplikasikan Trichoderma sp. ke tanah sebagai agen hayati',
      'Gunakan kapur pertanian (dolomit) untuk naikkan pH tanah ke 6.5–7'
    ],
    pencegahan: [
      'Gunakan benih atau bibit dari varietas tahan Fusarium',
      'Rotasi tanaman — jangan tanam semangka di lahan yang sama tiap musim',
      'Pastikan drainase lahan lancar, hindari genangan air',
      'Sterilisasi media tanam sebelum digunakan',
      'Tambahkan bahan organik untuk memperkuat biota tanah yang baik'
    ],
    produk: ['Benlate (Benomyl)', 'Derosal (Carbendazim)', 'Trichoderma sp.']
  },
  {
    id: 'antraknosa',
    nama: 'Antraknosa',
    kategori: 'jamur',
    patogen: 'Colletotrichum orbiculare',
    bahaya: 'Tinggi',
    bagian: ['daun', 'buah', 'batang', 'sulur'],
    keywords: ['antraknosa', 'colletotrichum', 'bercak cokelat', 'bercak hitam', 'bercak daun', 'buah busuk', 'bercak coklat hitam'],
    deskripsi: 'Penyakit jamur yang menyerang daun, buah, dan batang. Sangat merusak saat musim hujan. Bercak berkembang cepat dan bisa menghancurkan seluruh tanaman dalam waktu singkat.',
    gejala: [
      'Bercak bulat kecil berwarna kuning pucat, berkembang menjadi cokelat–hitam',
      'Bercak pada daun sering dikelilingi lingkaran kuning',
      'Pada buah: bercak cekung berwarna cokelat gelap, daging buah membusuk',
      'Batang dan sulur bisa pecah/retak dengan bercak cokelat',
      'Saat lembap, permukaan bercak menghasilkan massa spora berwarna merah jambu/oranye'
    ],
    penanganan: [
      'Semprot fungisida berbahan aktif Mankozeb, Klorotalonil, atau Azoksistrobin',
      'Pangkas dan musnahkan bagian tanaman yang terinfeksi',
      'Kurangi kelembapan dengan jarak tanam yang cukup dan pemangkasan',
      'Semprot di pagi hari agar daun sempat kering sebelum malam'
    ],
    pencegahan: [
      'Gunakan benih bersertifikat bebas penyakit',
      'Hindari menyiram dari atas (overhead irrigation) — gunakan drip',
      'Rotasi tanaman minimal 2 musim',
      'Jaga kebersihan kebun dari sisa tanaman sakit',
      'Semprot fungisida preventif saat cuaca lembap/hujan terus-menerus'
    ],
    produk: ['Dithane M-45 (Mankozeb)', 'Daconil (Klorotalonil)', 'Amistar (Azoksistrobin)']
  },
  {
    id: 'embun_bulu',
    nama: 'Embun Bulu / Kresek (Downy Mildew)',
    kategori: 'jamur',
    patogen: 'Pseudoperonospora cubensis',
    bahaya: 'Tinggi',
    bagian: ['daun'],
    keywords: ['embun bulu', 'downy mildew', 'kresek', 'pseudoperonospora', 'bercak kuning', 'embun tepung', 'bulu putih daun bawah', 'menyebar cepat'],
    deskripsi: 'Penyakit yang menyebar sangat cepat saat cuaca lembap dan dingin. Menyerang daun dari bawah, membentuk lapisan spora seperti bulu halus. Bisa memusnahkan kebun dalam hitungan hari.',
    gejala: [
      'Bercak kuning mosaik pada permukaan atas daun, berbatas tulang daun',
      'Permukaan bawah daun tertutup lapisan bulu/spora berwarna abu-abu keunguan',
      'Bercak kuning makin meluas dan bergabung, daun mengering',
      'Penyebaran sangat cepat antar tanaman terutama saat hujan',
      'Tanaman muda bisa mati total dalam 1–2 minggu'
    ],
    penanganan: [
      'Semprot segera dengan fungisida sistemik: Metalaksil atau Dimetomorf',
      'Tambahkan fungisida kontak Mankozeb sebagai campuran',
      'Semprot seluruh permukaan daun terutama bagian bawah',
      'Ulangi semprot setiap 5–7 hari selama wabah aktif'
    ],
    pencegahan: [
      'Hindari penanaman terlalu rapat — sirkulasi udara harus baik',
      'Gunakan mulsa plastik untuk kurangi percikan tanah ke daun',
      'Semprot fungisida preventif saat awal musim hujan',
      'Pilih varietas yang memiliki toleransi terhadap downy mildew'
    ],
    produk: ['Ridomil Gold (Metalaksil + Mankozeb)', 'Acrobat (Dimetomorf)', 'Previcur (Propamokarb)']
  },
  {
    id: 'embun_tepung',
    nama: 'Embun Tepung (Powdery Mildew)',
    kategori: 'jamur',
    patogen: 'Sphaerotheca fuliginea / Erysiphe cichoracearum',
    bahaya: 'Sedang',
    bagian: ['daun', 'batang', 'sulur'],
    keywords: ['embun tepung', 'powdery mildew', 'tepung putih', 'serbuk putih', 'daun putih', 'sphaerotheca'],
    deskripsi: 'Penyakit jamur yang membentuk lapisan tepung putih pada permukaan daun. Berkembang saat cuaca kering dan panas dengan malam yang lembap. Mengurangi fotosintesis dan melemahkan tanaman.',
    gejala: [
      'Lapisan tepung putih seperti bedak pada permukaan atas daun',
      'Daun tua terserang lebih dulu, lalu menyebar ke daun muda',
      'Daun terserang menjadi kuning dan akhirnya mengering',
      'Batang dan sulur muda bisa ikut tertutup lapisan putih',
      'Pertumbuhan tanaman terhambat, buah kecil dan sedikit'
    ],
    penanganan: [
      'Semprot fungisida: Trifloksistrobin, Miklobutanil, atau belerang (sulfur)',
      'Semprotan baking soda (1 sdm per 1L air) bisa membantu skala kecil',
      'Pangkas daun tua yang sangat terinfeksi dan musnahkan',
      'Tingkatkan sirkulasi udara dengan pemangkasan tanaman'
    ],
    pencegahan: [
      'Hindari pemupukan nitrogen berlebihan yang memacu pertumbuhan lunak',
      'Jarak tanam cukup untuk sirkulasi udara baik',
      'Hindari menyiram terlalu sore agar daun tidak lembap malam hari',
      'Semprot sulfur preventif di awal musim kemarau'
    ],
    produk: ['Flint (Trifloksistrobin)', 'Mancozeb 80%', 'Kumulus (Sulfur)']
  },
  {
    id: 'busuk_buah',
    nama: 'Busuk Buah / Antraknosa Buah',
    kategori: 'jamur',
    patogen: 'Phytophthora capsici / Colletotrichum sp.',
    bahaya: 'Tinggi',
    bagian: ['buah'],
    keywords: ['busuk buah', 'phytophthora', 'buah busuk', 'busuk basah', 'buah berlendir', 'buah membusuk'],
    deskripsi: 'Busuk buah yang menyerang buah semangka di kebun maupun pascapanen. Phytophthora menyebabkan busuk basah yang cepat, sementara Colletotrichum membentuk bercak cekung.',
    gejala: [
      'Bercak cokelat–hitam cekung pada kulit buah',
      'Busuk basah menyebar cepat, buah berlendir dan berbau',
      'Buah yang terkena bisa masih tampak normal di luar tapi busuk di dalam',
      'Pada kondisi lembap, muncul spora putih/abu di permukaan busuk',
      'Buah jatuh sebelum waktunya'
    ],
    penanganan: [
      'Panen segera buah yang hampir matang sebelum busuk menyebar',
      'Semprot Metalaksil atau Propamokarb untuk Phytophthora',
      'Hindari buah bersentuhan langsung dengan tanah — gunakan alas jerami/plastik',
      'Musnahkan buah yang sudah busuk jauh dari kebun'
    ],
    pencegahan: [
      'Gunakan mulsa untuk mencegah percikan tanah ke buah',
      'Pasang alas (jerami/plastik/jaring) di bawah buah',
      'Jaga drainase lahan — genangan air percepat penyebaran',
      'Semprot fungisida preventif saat buah mulai terbentuk'
    ],
    produk: ['Ridomil (Metalaksil)', 'Previcur (Propamokarb)', 'Klorotalonil']
  },
  {
    id: 'busuk_pangkal_batang',
    nama: 'Busuk Pangkal Batang (Gummy Stem Blight)',
    kategori: 'jamur',
    patogen: 'Didymella bryoniae',
    bahaya: 'Tinggi',
    bagian: ['batang', 'akar'],
    keywords: ['busuk batang', 'gummy stem blight', 'didymella', 'batang berair', 'getah batang', 'busuk pangkal', 'batang hitam'],
    deskripsi: 'Penyakit serius yang menyerang pangkal batang dan akar. Batang mengeluarkan eksudat (getah) cokelat kemerahan seperti luka bernanah. Bisa mematikan tanaman dewasa.',
    gejala: [
      'Luka basah berwarna cokelat–hitam di pangkal batang',
      'Eksudat (getah) merah-cokelat keluar dari luka batang',
      'Jaringan batang menjadi lembek dan membusuk',
      'Daun menguning dan layu mulai dari tanaman bagian bawah',
      'Titik-titik hitam kecil (piknida) terlihat pada jaringan terinfeksi'
    ],
    penanganan: [
      'Olesi luka batang dengan pasta fungisida (Benomyl + sedikit air)',
      'Semprot fungisida Prokloraz atau Iprodion ke area batang',
      'Kurangi kelembapan sekitar pangkal dengan pengaturan irigasi',
      'Cabut tanaman yang sudah parah dan bakar'
    ],
    pencegahan: [
      'Hindari pelukaan mekanis saat budidaya (cangkul, dll)',
      'Jaga sirkulasi udara di sekitar pangkal batang',
      'Gunakan benih yang bebas patogen dan rendam dengan fungisida sebelum tanam',
      'Rotasi tanaman rutin'
    ],
    produk: ['Sportak (Prokloraz)', 'Rovral (Iprodion)', 'Benlate (Benomyl)']
  },
  {
    id: 'bercak_daun_alternaria',
    nama: 'Bercak Daun Alternaria',
    kategori: 'jamur',
    patogen: 'Alternaria cucumerina',
    bahaya: 'Sedang',
    bagian: ['daun'],
    keywords: ['alternaria', 'bercak daun', 'bercak coklat kecil', 'bercak lingkaran', 'daun bercak', 'bercak alternaria'],
    deskripsi: 'Penyakit bercak daun yang membentuk lingkaran-lingkaran konsentris seperti target. Menyerang terutama daun tua dan berkembang cepat saat cuaca lembap.',
    gejala: [
      'Bercak bulat kecil berwarna cokelat muda dengan lingkaran-lingkaran konsentris',
      'Bercak biasanya dikelilingi halo kuning',
      'Daun tua terserang lebih parah dari daun muda',
      'Bercak bisa bergabung menjadi area nekrotik besar',
      'Saat lembap, permukaan bercak ditumbuhi spora gelap (olivaceous)'
    ],
    penanganan: [
      'Semprot fungisida Iprodion, Difenokonazol, atau Klorotalonil',
      'Pangkas dan buang daun tua yang sangat terinfeksi',
      'Hindari penyiraman di sore hari'
    ],
    pencegahan: [
      'Jarak tanam cukup untuk aliran udara baik',
      'Perkuat tanaman dengan pupuk K (kalium) yang cukup',
      'Semprot fungisida preventif sebelum musim hujan',
      'Bersihkan sisa tanaman musim lalu dari lahan'
    ],
    produk: ['Rovral (Iprodion)', 'Score (Difenokonazol)', 'Daconil (Klorotalonil)']
  },
  {
    id: 'layu_bakteri',
    nama: 'Layu Bakteri',
    kategori: 'bakteri',
    patogen: 'Erwinia tracheiphila',
    bahaya: 'Tinggi',
    bagian: ['daun', 'batang', 'tanaman_utuh'],
    keywords: ['layu bakteri', 'erwinia', 'layu mendadak', 'layu tiba-tiba', 'lendir batang', 'bakteri layu'],
    deskripsi: 'Penyakit layu yang ditularkan oleh kumbang mentimun (cucumber beetle). Bakteri menyumbat pembuluh xilem sehingga air tidak bisa naik. Tanaman bisa layu total dalam 1–2 hari.',
    gejala: [
      'Layu mendadak pada satu cabang atau seluruh tanaman, biasanya di siang hari',
      'Tanaman muda bisa layu total dalam 1 hari',
      'Bila batang dipotong dan dua ujung didekatkan, tampak benang lendir',
      'Tidak ada busuk pada akar (beda dengan Fusarium)',
      'Sering bersamaan dengan kehadiran kumbang mentimun bergaris/berbintik'
    ],
    penanganan: [
      'Tidak ada obat efektif setelah tanaman terinfeksi — fokus pada pencegahan',
      'Cabut segera tanaman terinfeksi agar tidak jadi sumber bakteri',
      'Kendalikan kumbang mentimun sebagai vektor utama dengan insektisida'
    ],
    pencegahan: [
      'Pasang perangkap kuning (yellow sticky trap) untuk memantau kumbang',
      'Semprot insektisida (Karbofuran/Imidakloprid) untuk kendalikan vektor kumbang',
      'Pasang jaring serangga (row cover) terutama pada bibit muda',
      'Tanam companion plant seperti radish untuk mengusir kumbang'
    ],
    produk: ['Confidor (Imidakloprid)', 'Marshal (Karbosulfan)', 'Regent (Fipronil)']
  },
  {
    id: 'bercak_bakteri',
    nama: 'Bercak Sudut Bakteri (Angular Leaf Spot)',
    kategori: 'bakteri',
    patogen: 'Pseudomonas syringae pv. lachrymans',
    bahaya: 'Sedang',
    bagian: ['daun'],
    keywords: ['bercak bakteri', 'pseudomonas', 'bercak sudut', 'angular leaf spot', 'bercak basah', 'bercak berair'],
    deskripsi: 'Bercak bakteri pada daun yang khas berbentuk sudut (angular) mengikuti batas tulang daun. Menyebar melalui percikan air dan paling parah saat musim hujan.',
    gejala: [
      'Bercak basah kecil yang berkembang menjadi bercak bersudut mengikuti urat daun',
      'Bercak berwarna hijau muda lalu menguning dan mengering',
      'Saat pagi hari, eksudat bakteri (cairan lengket) terlihat di sisi bawah daun',
      'Bercak mengering menjadi cokelat dan daun mudah berlubang',
      'Buah bisa ikut terinfeksi dengan bercak berminyak'
    ],
    penanganan: [
      'Semprot bakterisida berbasis tembaga (Copper Hydroxide/Kocide)',
      'Tambahkan fungisida Mankozeb sebagai campuran untuk perlindungan ganda',
      'Hindari bekerja di kebun saat daun masih basah agar bakteri tidak terbawa'
    ],
    pencegahan: [
      'Rendam benih dengan air panas (50°C, 25 menit) atau bakterisida sebelum tanam',
      'Gunakan irigasi tetes bukan penyiram dari atas',
      'Rotasi tanaman minimal 2 tahun dengan non-cucurbit',
      'Jaga kebersihan alat pertanian — sterilisasi setelah pakai di tanaman sakit'
    ],
    produk: ['Kocide (Copper Hydroxide)', 'Cuprofix (Copper Oxychloride)', 'Agrimycin (Streptomisin)']
  },
  {
    id: 'virus_cmv',
    nama: 'Mosaik Mentimun (CMV)',
    kategori: 'virus',
    patogen: 'Cucumber Mosaic Virus (CMV)',
    bahaya: 'Tinggi',
    bagian: ['daun', 'buah', 'tanaman_utuh'],
    keywords: ['cmv', 'mosaik', 'cucumber mosaic virus', 'daun mosaik', 'daun belang', 'warna belang', 'daun keriting mosaik'],
    deskripsi: 'Virus yang ditularkan kutu daun (aphid). Menyebabkan pola mosaik warna hijau-kuning pada daun dan buah. Tidak ada obatnya — pencegahan adalah satu-satunya cara.',
    gejala: [
      'Pola mosaik hijau tua–hijau muda–kuning pada daun muda',
      'Daun mengkerut, menggulung, dan berukuran lebih kecil dari normal',
      'Tanaman tumbuh kerdil dan tidak produktif',
      'Buah berbentuk tidak normal, bergelombang, dan berpola mosaik',
      'Buah berasa pahit meski sudah matang'
    ],
    penanganan: [
      'Tidak ada pestisida yang bisa menyembuhkan tanaman terinfeksi virus',
      'Cabut dan musnahkan tanaman terinfeksi segera',
      'Kendalikan kutu daun (aphid) sebagai vektor utama dengan insektisida sistemik',
      'Semprot minyak mineral atau sabun insektisida untuk hambat penularan aphid'
    ],
    pencegahan: [
      'Gunakan varietas tahan/toleran CMV',
      'Pasang mulsa perak (silver mulch) untuk mengusir aphid',
      'Pantau populasi aphid dan kendalikan sejak dini',
      'Jangan menanam dekat tanaman cucurbit lain yang sudah terinfeksi',
      'Kendalikan gulma di sekitar lahan yang bisa jadi inang virus'
    ],
    produk: ['Actara (Thiametoksam)', 'Confidor (Imidakloprid)', 'Mulsa perak reflektif']
  },
  {
    id: 'virus_wmv',
    nama: 'Mosaik Semangka (WMV)',
    kategori: 'virus',
    patogen: 'Watermelon Mosaic Virus (WMV)',
    bahaya: 'Tinggi',
    bagian: ['daun', 'buah'],
    keywords: ['wmv', 'watermelon mosaic', 'mosaik semangka', 'daun keriting', 'daun abnormal', 'virus mosaik'],
    deskripsi: 'Virus khusus semangka yang ditularkan aphid. Gejalanya mirip CMV namun lebih spesifik pada semangka. Menyebabkan kerugian hasil panen yang sangat besar.',
    gejala: [
      'Daun muda mengkerut parah dengan pola mosaik kuning-hijau',
      'Daun berbentuk tidak normal: memanjang, menyempit, atau berlekuk dalam',
      'Permukaan daun tampak melepuh (blistering)',
      'Buah kecil, berkerut, dan tidak bernilai jual',
      'Tanaman tumbuh sangat lambat'
    ],
    penanganan: [
      'Sama dengan CMV — fokus pada pengendalian vektor aphid',
      'Cabut tanaman terinfeksi berat',
      'Semprot insektisida sistemik untuk aphid secara rutin'
    ],
    pencegahan: [
      'Mulsa perak sangat efektif mengusir aphid',
      'Tanam serempak dengan petani sekitar untuk mengurangi sumber virus',
      'Hindari penanaman tumpang sari dengan labu, melon, atau mentimun',
      'Sanitasi lahan dari gulma inang virus'
    ],
    produk: ['Actara (Thiametoksam)', 'Pegasus (Spirodiklofen)', 'Mulsa perak']
  },
  {
    id: 'kutu_daun',
    nama: 'Kutu Daun (Aphid)',
    kategori: 'hama',
    patogen: 'Aphis gossypii / Myzus persicae',
    bahaya: 'Sedang',
    bagian: ['daun', 'sulur', 'bunga'],
    keywords: ['aphid', 'kutu daun', 'aphis', 'kutu hijau', 'kutu hitam', 'serangga kecil daun'],
    deskripsi: 'Serangga kecil yang menghisap cairan daun dan menularkan virus (CMV, WMV). Berkembang biak sangat cepat. Serangan berat menyebabkan daun mengerut dan tanaman melemah.',
    gejala: [
      'Koloni serangga kecil (hijau, hitam, atau kuning) di bawah daun dan pucuk',
      'Daun mengerut, menggulung ke bawah atau ke atas',
      'Permukaan daun lengket akibat embun madu (honeydew) yang dikeluarkan aphid',
      'Tumbuh jamur jelaga hitam (sooty mold) di atas embun madu',
      'Pertumbuhan pucuk terhambat dan terdistorsi'
    ],
    penanganan: [
      'Semprot insektisida sistemik: Imidakloprid, Thiametoksam, atau Asetamiprid',
      'Semprotan sabun insektisida (soap spray) atau minyak nimba untuk organik',
      'Arahkan semprotan ke bawah daun tempat aphid berkumpul',
      'Gunakan predator alami: kepik (ladybug) atau parasitoid'
    ],
    pencegahan: [
      'Pasang perangkap kuning (yellow sticky trap) untuk monitoring',
      'Gunakan mulsa perak untuk mengusir aphid',
      'Semprot insektisida preventif pada fase bibit muda',
      'Pasang jaring serangga pada bibit di persemaian'
    ],
    produk: ['Confidor (Imidakloprid)', 'Actara (Thiametoksam)', 'Mospilan (Asetamiprid)', 'Nimba (Minyak Nimba)']
  },
  {
    id: 'lalat_buah',
    nama: 'Lalat Buah',
    kategori: 'hama',
    patogen: 'Bactrocera cucurbitae',
    bahaya: 'Tinggi',
    bagian: ['buah'],
    keywords: ['lalat buah', 'bactrocera', 'buah berlubang', 'larva buah', 'belatung buah', 'buah jatuh muda'],
    deskripsi: 'Hama lalat yang meletakkan telur di dalam buah muda. Larva (belatung) memakan daging buah dari dalam. Buah terinfeksi jatuh prematur dan tidak bisa dikonsumsi.',
    gejala: [
      'Bekas tusukan kecil (oviposisi) pada kulit buah muda',
      'Buah muda jatuh sebelum waktunya',
      'Daging buah busuk berisi larva/belatung putih kecil',
      'Buah matang tampak normal di luar tapi busuk di dalam',
      'Buah berlendir dan berbau saat dibuka'
    ],
    penanganan: [
      'Pasang perangkap feromon (Methyl Eugenol + insektisida) untuk pejantan',
      'Semprot protein bait (umpan protein + insektisida) ke daun',
      'Bungkus buah muda dengan kantong plastik atau kertas',
      'Kumpulkan dan musnahkan buah jatuh setiap hari'
    ],
    pencegahan: [
      'Pasang perangkap feromon sejak awal pembentukan buah',
      'Bungkus buah mulai ukuran sebesar kepalan tangan',
      'Sanitasi lahan — buang semua buah jatuh dan busuk',
      'Semprot insektisida perimeter kebun secara rutin'
    ],
    produk: ['Petrogenol (Methyl Eugenol)', 'Success Bait (Spinosad + Umpan)', 'Decis (Deltametrin)']
  },
  {
    id: 'tungau_merah',
    nama: 'Tungau Merah / Spider Mite',
    kategori: 'hama',
    patogen: 'Tetranychus urticae',
    bahaya: 'Sedang',
    bagian: ['daun'],
    keywords: ['tungau', 'spider mite', 'tetranychus', 'bintik kuning daun', 'jaring halus daun', 'daun pucat berbintik', 'tungau merah'],
    deskripsi: 'Hama tungau sangat kecil (hampir tak terlihat mata) yang menghisap cairan sel daun. Berkembang pesat saat musim kemarau panas. Daun tampak seperti ditaburi pasir kuning.',
    gejala: [
      'Bintik-bintik kuning kecil (stippling) pada permukaan atas daun',
      'Daun tampak pucat keperakan, kusam, dan kehilangan warna hijau',
      'Jaringan halus seperti jaring laba-laba di bawah daun atau pucuk',
      'Tungau sangat kecil terlihat dengan kaca pembesar di bawah daun',
      'Daun mengering dan gugur pada serangan berat'
    ],
    penanganan: [
      'Semprot akarisida: Abamektin, Fenpiroksimate, atau Spirodiklofen',
      'Semprotan air bertekanan tinggi ke bawah daun untuk merontokkan tungau',
      'Minyak nimba atau sabun insektisida untuk pengendalian organik',
      'Ganti akarisida secara bergantian untuk cegah resistensi'
    ],
    pencegahan: [
      'Jaga kelembapan kebun — tungau berkembang di kondisi kering',
      'Hindari stres air pada tanaman',
      'Pantau rutin terutama musim kemarau',
      'Lepaskan predator alami: Phytoseiid mite'
    ],
    produk: ['Agrimec (Abamektin)', 'Ortus (Fenpiroksimate)', 'Nimba (Minyak Nimba)']
  },
  {
    id: 'ulat_grayak',
    nama: 'Ulat Grayak',
    kategori: 'hama',
    patogen: 'Spodoptera litura / S. frugiperda',
    bahaya: 'Sedang',
    bagian: ['daun', 'buah'],
    keywords: ['ulat grayak', 'spodoptera', 'ulat pemakan daun', 'daun habis dimakan', 'lubang daun', 'ulat hijau', 'ulat coklat'],
    deskripsi: 'Ulat yang memakan daun secara massal terutama malam hari. Serangan berat bisa menghabiskan seluruh daun kebun dalam beberapa malam. Populasi meledak saat musim kemarau.',
    gejala: [
      'Daun berlubang-lubang tidak beraturan, kadang hanya tersisa tulang daun',
      'Kotoran ulat (frass) berupa butiran hijau-hitam di permukaan daun',
      'Ulat berwarna hijau-cokelat dengan garis di samping tubuh, aktif malam hari',
      'Kelompok telur berbentuk massa bulu putih di bawah daun',
      'Pada serangan masif, tanaman bisa gundul dalam semalam'
    ],
    penanganan: [
      'Semprot insektisida: Klorpirifos, Lufenuron, atau Emamektin benzoat',
      'Semprot di sore/malam hari saat ulat aktif makan',
      'Kumpulkan dan musnahkan kelompok telur dan ulat secara manual',
      'Semprot SLNPV (virus bioinsektisida) untuk pengendalian hayati'
    ],
    pencegahan: [
      'Pasang perangkap lampu (light trap) untuk menangkap ngengat dewasa',
      'Periksa kebun setiap sore untuk deteksi dini',
      'Semprot Bt (Bacillus thuringiensis) secara preventif',
      'Jaga sanitasi lahan dari gulma yang jadi tempat bertelur'
    ],
    produk: ['Lannate (Metomil)', 'Proclaim (Emamektin Benzoat)', 'Dipel (Bacillus thuringiensis)']
  }
];

// ─── FUNGSI LOOKUP DATABASE ───────────────────────────────────────────────────

function cariDiDatabase(query) {
  if (!query || query === 'Tidak Ada' || query === '—') return null;
  const q = query.toLowerCase();
  // Score setiap entry berdasarkan keyword match
  let bestMatch = null;
  let bestScore = 0;
  for (const p of DB_PENYAKIT) {
    let score = 0;
    // Cek nama langsung
    if (q.includes(p.nama.toLowerCase()) || p.nama.toLowerCase().includes(q)) score += 10;
    // Cek keywords
    for (const kw of p.keywords) {
      if (q.includes(kw) || kw.includes(q)) score += 3;
      // Partial match kata per kata
      const words = kw.split(' ');
      for (const w of words) {
        if (w.length > 3 && q.includes(w)) score += 1;
      }
    }
    if (score > bestScore) { bestScore = score; bestMatch = p; }
  }
  return bestScore >= 3 ? bestMatch : null;
}

// ─── INFO PENYAKIT BOX ───────────────────────────────────────────────────────

function renderInfoDariDB(d) {
  const bahayaColor = { 'Rendah': '#1D9E75', 'Sedang': '#e6aa00', 'Tinggi': '#e03c3c' };
  const warna = bahayaColor[d.bahaya] || 'var(--text-muted)';
  const katEmoji = { 'jamur': '🍄', 'bakteri': '🦠', 'virus': '🔴', 'hama': '🐛' };

  return `
    <div class="info-db-badge">
      <span class="info-db-source">📖 Database Lokal</span>
      <span class="info-bahaya" style="color:${warna}; background:${warna}22; padding:2px 8px; border-radius:20px; font-size:.75rem; font-weight:700;">
        ${d.bahaya === 'Tinggi' ? '🔴' : d.bahaya === 'Sedang' ? '🟡' : '🟢'} Bahaya ${d.bahaya}
      </span>
    </div>
    <div class="info-meta">
      <span class="info-nama">${escHtml(d.nama)}</span>
      <span style="font-size:.75rem; color:var(--text-muted);">${katEmoji[d.kategori] || ''} ${d.kategori.charAt(0).toUpperCase()+d.kategori.slice(1)}</span>
    </div>
    <p style="font-size:.75rem; color:var(--text-muted); font-family:'DM Mono',monospace; margin-bottom:.5rem;">🔬 ${escHtml(d.patogen)}</p>
    <p class="info-deskripsi">${escHtml(d.deskripsi)}</p>
    <div class="info-section"><b>🩺 Gejala:</b><ul>${d.gejala.map(g=>'<li>'+escHtml(g)+'</li>').join('')}</ul></div>
    <div class="info-section"><b>💊 Penanganan:</b><ul>${d.penanganan.map(p=>'<li>'+escHtml(p)+'</li>').join('')}</ul></div>
    <div class="info-section"><b>🛡️ Pencegahan:</b><ul>${d.pencegahan.map(p=>'<li>'+escHtml(p)+'</li>').join('')}</ul></div>
    ${d.produk?.length ? `<div class="info-section info-produk"><b>🧴 Produk yang bisa digunakan:</b>
      <div class="produk-tags">${d.produk.map(p=>`<span class="produk-tag">${escHtml(p)}</span>`).join('')}</div>
    </div>` : ''}
  `;
}

function tampilInfoBox(query) {
  const box     = document.getElementById('infoBox');
  const title   = document.getElementById('infoTitle');
  const content = document.getElementById('infoContent');

  box.style.display = 'block';
  title.textContent = '🔬 ' + query;

  // Cari di database lokal dulu
  const match = cariDiDatabase(query);
  if (match) {
    content.innerHTML = renderInfoDariDB(match);
  } else {
    // Tidak ada di DB — tampil info dari AI result saja
    content.innerHTML = `
      <div class="info-db-badge">
        <span class="info-db-source" style="background:#e6aa0022; color:#a07800;">⚠️ Tidak ada di database</span>
      </div>
      <p style="font-size:.85rem; color:var(--text); margin:.5rem 0;">
        AI mendeteksi: <b>${escHtml(query)}</b>
      </p>
      <p style="font-size:.82rem; color:var(--text-muted); line-height:1.5;">
        Penyakit/hama ini belum ada di database lokal kami. Silakan konsultasikan dengan penyuluh pertanian setempat atau cari referensi di Buku Penyakit Tanaman Semangka dari Kementan RI.
      </p>
    `;
  }
}

function closeInfoBox() {
  document.getElementById('infoBox').style.display = 'none';
}

// ─── DIAGNOSA KESELURUHAN ────────────────────────────────────────────────────

async function jalankanDiagnosa() {
  const history = loadHistory();
  if (history.length < 2) {
    alert('Minimal 2 analisis dibutuhkan untuk diagnosa keseluruhan.');
    return;
  }

  document.getElementById('diagnosaLoading').style.display = 'block';
  document.getElementById('diagnosaResult').style.display  = 'none';
  document.getElementById('btnDiagnosa').disabled = true;

  try {
    const res  = await fetch('/api/diagnosa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ riwayat: history.slice(0, 10) })
    });
    const json = await res.json();

    document.getElementById('diagnosaLoading').style.display = 'none';
    document.getElementById('btnDiagnosa').disabled = false;

    if (!res.ok || json.error) {
      document.getElementById('diagnosaResult').style.display = 'block';
      document.getElementById('diagnosaResult').innerHTML = '<p style="color:var(--error);">⚠️ ' + escHtml(json.error || 'Gagal diagnosa') + '</p>';
      return;
    }

    const d = json.data;
    const keparahanColor = {
      'Sehat':  '#1D9E75',
      'Ringan': '#56c096',
      'Sedang': '#e6aa00',
      'Parah':  '#e07a3c',
      'Kritis': '#e03c3c'
    };
    const prognosisColor = { 'Baik': '#1D9E75', 'Cukup': '#e6aa00', 'Buruk': '#e03c3c' };
    const wKeparahan = keparahanColor[d.tingkat_keparahan] || 'var(--text-muted)';
    const wPrognosis = prognosisColor[d.prognosis] || 'var(--text-muted)';

    const skorBar = Math.min(100, Math.max(0, d.skor_kesehatan_keseluruhan || 0));

    document.getElementById('diagnosaResult').style.display = 'block';
    document.getElementById('diagnosaResult').innerHTML = `
      <div class="diagnosa-meta-row">
        <div class="diagnosa-meta-item">
          <div class="diagnosa-meta-label">Diagnosis</div>
          <div class="diagnosa-meta-val diagnosa-penyakit">${escHtml(d.kesimpulan_penyakit)}</div>
        </div>
        <div class="diagnosa-meta-item">
          <div class="diagnosa-meta-label">Keparahan</div>
          <div class="diagnosa-meta-val" style="color:${wKeparahan};font-weight:700;">${escHtml(d.tingkat_keparahan)}</div>
        </div>
        <div class="diagnosa-meta-item">
          <div class="diagnosa-meta-label">Prognosis</div>
          <div class="diagnosa-meta-val" style="color:${wPrognosis};font-weight:700;">${escHtml(d.prognosis)}</div>
        </div>
      </div>

      <div class="diagnosa-skor-row">
        <span class="diagnosa-skor-label">Skor Kesehatan Keseluruhan</span>
        <span class="diagnosa-skor-val">${skorBar}/100</span>
      </div>
      <div class="meter-bg" style="margin-bottom:1rem;">
        <div class="meter-fill fill-health" style="width:${skorBar}%;"></div>
      </div>

      ${d.bagian_paling_bermasalah && d.bagian_paling_bermasalah !== '-'
        ? `<div class="diagnosa-alert">⚠️ Bagian paling bermasalah: <b>${escHtml(d.bagian_paling_bermasalah)}</b></div>` : ''}

      ${d.penyebab_utama ? `<p class="diagnosa-penyebab">🔎 <b>Penyebab:</b> ${escHtml(d.penyebab_utama)}</p>` : ''}

      ${d.daftar_masalah?.length
        ? `<div class="diagnosa-section"><b>🦠 Masalah Terdeteksi:</b><ul>${d.daftar_masalah.map(m=>'<li>'+escHtml(m)+'</li>').join('')}</ul></div>` : ''}

      ${d.rekomendasi_tindakan?.length
        ? `<div class="diagnosa-section"><b>💊 Rekomendasi Tindakan:</b><ol>${d.rekomendasi_tindakan.map(r=>'<li>'+escHtml(r)+'</li>').join('')}</ol></div>` : ''}

      ${d.rekomendasi_pencegahan
        ? `<div class="diagnosa-section"><b>🛡️ Pencegahan:</b> ${escHtml(d.rekomendasi_pencegahan)}</div>` : ''}

      <div class="diagnosa-ringkasan">
        <div class="ai-label"><div class="ai-dot"></div>Ringkasan AI</div>
        <p>${escHtml(d.ringkasan)}</p>
      </div>
    `;
  } catch (err) {
    document.getElementById('diagnosaLoading').style.display = 'none';
    document.getElementById('btnDiagnosa').disabled = false;
    document.getElementById('diagnosaResult').style.display = 'block';
    document.getElementById('diagnosaResult').innerHTML = '<p style="color:var(--error);">⚠️ Koneksi gagal. Coba lagi.</p>';
  }
}

function setMeter(barId, labelId, pct) {
  document.getElementById(barId).style.width   = pct + '%';
  document.getElementById(labelId).textContent = pct + '%';
}

// ─── SHARE ──────────────────────────────────────────────────────────────────

btnShare.addEventListener('click', () => {
  if (!lastAnalysisData) return;
  const r     = lastAnalysisData;
  const emoji = JENIS_EMOJI[r.jenis_objek] || '🌿';
  const isBuah = r.jenis_objek === 'buah';

  let teks = `${emoji} *SemangkaCheck AI — Hasil Analisis*\n`;
  teks += `Bagian: ${r.nama_bagian || r.jenis_objek}\n`;
  teks += `Kondisi: ${r.kondisi_umum} (Skor: ${r.skor_kesehatan}/100)\n`;

  if (isBuah) {
    teks += `Kematangan: ${r.tingkat_kematangan_persen}% (${r.kategori_kematangan})\n`;
    teks += `Kebusukan: ${r.tingkat_kebusukan_persen}% (${r.kondisi_kebusukan})\n`;
    teks += `Kemanisan: ${r.estimasi_kemanisan}\n`;
    teks += `Skor Warna: ${r.skor_warna}/100\n`;
  } else {
    if (r.warna_bagian) teks += `Warna: ${r.warna_bagian}\n`;
    if (r.kondisi_tanaman) teks += `Status: ${r.kondisi_tanaman}\n`;
    if (r.tanda_penyakit) teks += `Penyakit: ${r.tanda_penyakit}\n`;
    if (r.serangan_hama) teks += `Hama: ${r.serangan_hama}\n`;
  }

  teks += `Akurasi AI: ${r.akurasi_persen}%\n\n`;
  teks += `📝 ${r.analisis}\n`;
  teks += `💡 ${r.saran}`;

  if (navigator.share) {
    navigator.share({ title: 'SemangkaCheck AI', text: teks }).catch(() => {});
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
  setMeter('meterHealth', 'meterHealthPct', 0);
  setMeter('meterAcc',    'meterAccPct',    0);
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
    id:         now.getTime(),
    waktu:      now.toLocaleString('id-ID'),
    waktu_iso:  now.toISOString(),
    thumbnail:  thumb,
    jenis_objek:    data.jenis_objek,
    nama_bagian:    data.nama_bagian,
    kondisi_umum:   data.kondisi_umum,
    skor_kesehatan: data.skor_kesehatan,
    akurasi_persen: data.akurasi_persen,
    analisis:       data.analisis,
    saran:          data.saran,
    // Buah
    kategori_kematangan:       data.kategori_kematangan,
    kondisi_kebusukan:         data.kondisi_kebusukan,
    estimasi_kemanisan:        data.estimasi_kemanisan,
    skor_warna:                data.skor_warna,
    tingkat_kematangan_persen: data.tingkat_kematangan_persen,
    tingkat_kebusukan_persen:  data.tingkat_kebusukan_persen,
    // Tanaman
    kondisi_tanaman: data.kondisi_tanaman,
    warna_bagian:    data.warna_bagian,
    tanda_penyakit:  data.tanda_penyakit,
    serangan_hama:   data.serangan_hama,
    tingkat_stres_air: data.tingkat_stres_air
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
    const emoji    = JENIS_EMOJI[e.jenis_objek] || '🌿';
    const isBuah   = e.jenis_objek === 'buah';
    const isActive = compareIds.includes(e.id);

    const badgeClass = KONDISI_CLASS[e.kondisi_umum] || '';

    const thumbHtml = e.thumbnail
      ? `<img class="history-thumb" src="${escHtml(e.thumbnail)}" alt="thumb" />`
      : `<div class="history-thumb-placeholder">${emoji}</div>`;

    const detailHtml = isBuah
      ? `<div class="history-meters">
          <span>🍉 Matang: <b>${escHtml(String(e.tingkat_kematangan_persen))}%</b></span>
          <span>🟤 Busuk: <b>${escHtml(String(e.tingkat_kebusukan_persen))}%</b></span>
          <span>🎨 Warna: <b>${escHtml(String(e.skor_warna ?? '—'))}/100</b></span>
          <span>🍬 Kemanisan: <b>${escHtml(e.estimasi_kemanisan || '—')}</b></span>
        </div>`
      : `<div class="history-meters">
          ${e.warna_bagian ? `<span>🎨 Warna: <b>${escHtml(e.warna_bagian)}</b></span>` : ''}
          ${e.kondisi_tanaman ? `<span>🩺 Kondisi: <b>${escHtml(e.kondisi_tanaman)}</b></span>` : ''}
          ${e.tanda_penyakit ? `<span>🦠 Penyakit: <b>${escHtml(e.tanda_penyakit)}</b></span>` : ''}
          ${e.serangan_hama ? `<span>🐛 Hama: <b>${escHtml(e.serangan_hama)}</b></span>` : ''}
        </div>`;

    return `
      <div class="history-card">
        <div class="history-header" onclick="toggleCard(${e.id})" style="cursor:pointer;">
          <div class="history-header-left">
            ${thumbHtml}
            <div>
              <span class="condition-badge ${badgeClass}" style="font-size:.75rem;">${emoji} ${escHtml(e.nama_bagian || e.jenis_objek)}</span>
              <br>
              <span style="font-size:.7rem; color:var(--text-muted);">${escHtml(e.kondisi_umum)} · ${escHtml(e.skor_kesehatan)}/100</span>
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
          ${detailHtml}
          <div class="history-meters"><span>🎯 Akurasi: <b>${escHtml(String(e.akurasi_persen))}%</b></span></div>
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
  const cols = [
    'id','waktu','waktu_iso','jenis_objek','nama_bagian','kondisi_umum','skor_kesehatan',
    'kategori_kematangan','kondisi_kebusukan','estimasi_kemanisan','skor_warna',
    'tingkat_kematangan_persen','tingkat_kebusukan_persen',
    'kondisi_tanaman','warna_bagian','tanda_penyakit','serangan_hama','tingkat_stres_air',
    'akurasi_persen','analisis','saran'
  ];
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
  document.getElementById('compareCol1').innerHTML = e1 ? buildCompareCol(e1) : buildEmptyCol('Pilih analisis 1');
  document.getElementById('compareCol2').innerHTML = e2 ? buildCompareCol(e2) : buildEmptyCol('Pilih analisis 2');
  if (e1 && e2) {
    highlightBetter('cmp-sehat',  id1, id2, e1.skor_kesehatan ?? 0,  e2.skor_kesehatan ?? 0, true);
    highlightBetter('cmp-akurasi',id1, id2, e1.akurasi_persen,        e2.akurasi_persen,       true);
  }
}

function buildEmptyCol(label) {
  return `<div class="compare-empty">${escHtml(label)}<br><small>Klik ⚖️ di riwayat</small></div>`;
}

function buildCompareCol(e) {
  const emoji    = JENIS_EMOJI[e.jenis_objek] || '🌿';
  const isBuah   = e.jenis_objek === 'buah';
  const thumbHtml = e.thumbnail
    ? `<img class="compare-thumb" src="${escHtml(e.thumbnail)}" alt="thumb" />`
    : `<div class="compare-thumb-placeholder">${emoji}</div>`;

  const extraStats = isBuah
    ? `<div class="compare-stat"><span class="compare-label">Kematangan</span>
        <span class="compare-val">${escHtml(String(e.tingkat_kematangan_persen))}%</span></div>
       <div class="compare-stat"><span class="compare-label">Kemanisan</span>
        <span class="compare-val">${escHtml(e.estimasi_kemanisan || '—')}</span></div>`
    : `<div class="compare-stat"><span class="compare-label">Kondisi</span>
        <span class="compare-val">${escHtml(e.kondisi_tanaman || '—')}</span></div>
       <div class="compare-stat"><span class="compare-label">Penyakit</span>
        <span class="compare-val">${escHtml(e.tanda_penyakit || '—')}</span></div>`;

  return `
    ${thumbHtml}
    <span class="compare-sub" style="font-weight:700;">${emoji} ${escHtml(e.nama_bagian || e.jenis_objek)}</span>
    <span class="compare-sub">${escHtml(e.kondisi_umum)}</span>
    <div class="compare-stat" id="cmp-sehat-${e.id}">
      <span class="compare-label">Skor Kesehatan</span>
      <span class="compare-val">${escHtml(String(e.skor_kesehatan ?? '—'))}/100</span>
    </div>
    ${extraStats}
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

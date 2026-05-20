require('dotenv').config();
const express = require('express');
const multer  = require('multer');
const path    = require('path');

const app    = express();

// ─── RATE LIMITING ──────────────────────────────────────────────────────────
const rateLimitMap = new Map();
const RATE_LIMIT   = 10;
const RATE_WINDOW  = 60 * 1000;

function rateLimit(req, res, next) {
  const ip  = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const rec = rateLimitMap.get(ip) || { count: 0, start: now };
  if (now - rec.start > RATE_WINDOW) { rec.count = 0; rec.start = now; }
  rec.count++;
  rateLimitMap.set(ip, rec);
  if (rec.count > RATE_LIMIT) {
    return res.status(429).json({ error: 'Terlalu banyak permintaan. Coba lagi dalam 1 menit.' });
  }
  next();
}

setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW;
  for (const [ip, rec] of rateLimitMap.entries()) {
    if (rec.start < cutoff) rateLimitMap.delete(ip);
  }
}, 5 * 60 * 1000);

// ─── VALIDASI FILE ──────────────────────────────────────────────────────────
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      return cb(new Error('Format file tidak didukung. Gunakan JPG, PNG, atau WEBP.'));
    }
    cb(null, true);
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ─── ENDPOINT ANALISIS ──────────────────────────────────────────────────────
app.post('/api/analyze', rateLimit, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Ukuran file terlalu besar. Maksimal 10 MB.' });
      }
      return res.status(400).json({ error: err.message });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Tidak ada gambar yang diunggah.' });

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'API key belum dikonfigurasi di server.' });

    const imageB64 = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;

    const prompt = `Kamu adalah sistem AI ahli pertanian dan hortikultura, spesialis tanaman semangka (Citrullus lanatus).
Analisis gambar ini secara menyeluruh. Gambar mungkin berupa BAGIAN MANAPUN dari tanaman semangka:
buah, daun, akar, batang, bunga, sulur/ranke, benih, atau keseluruhan tanaman.

PENTING: Buah semangka yang busuk, berjamur, berpenyakit parah, atau kondisi sangat buruk TETAP dianggap semangka (adalah_tanaman_semangka: true). Jangan tolak hanya karena kondisinya jelek. Set false HANYA jika gambar benar-benar bukan tanaman semangka sama sekali (misal: foto orang, mobil, hewan, dll).

Berikan hasil HANYA dalam format JSON berikut (tanpa markdown, tanpa kode blok, murni JSON):

{
  "adalah_tanaman_semangka": true atau false,
  "jenis_objek": salah satu dari "buah" | "daun" | "akar" | "batang" | "bunga" | "sulur" | "benih" | "tanaman_utuh" | "lainnya",
  "nama_bagian": nama bagian dalam bahasa Indonesia yang sopan dan deskriptif (contoh: "Buah Semangka", "Daun Muda", "Akar Serabut", "Batang Utama", "Bunga Jantan", "Sulur/Ranke"),
  "kondisi_umum": salah satu dari "Sangat Baik" | "Baik" | "Cukup" | "Buruk" | "Sangat Buruk",
  "skor_kesehatan": angka 0-100 (100 = kondisi sempurna/optimal),
  "akurasi_persen": angka 70-99,
  "analisis": "Deskripsi kondisi dalam 2-3 kalimat bahasa Indonesia. Sebutkan ciri visual yang terlihat, warna, tekstur, dan tanda-tanda kondisi.",
  "saran": "Satu kalimat saran perawatan, penggunaan, atau rekomendasi berdasarkan kondisi yang terdeteksi.",

  "tingkat_kematangan_persen": angka 0-100 JIKA jenis_objek adalah buah, null untuk lainnya,
  "tingkat_kebusukan_persen": angka 0-100 JIKA jenis_objek adalah buah, null untuk lainnya,
  "kategori_kematangan": "Mentah" atau "Setengah Matang" atau "Matang" atau "Terlalu Matang" JIKA jenis_objek adalah buah, null untuk lainnya,
  "kondisi_kebusukan": "Segar" atau "Mulai Busuk" atau "Cukup Busuk" atau "Sangat Busuk" JIKA jenis_objek adalah buah, null untuk lainnya,
  "estimasi_kemanisan": "Tidak Manis" atau "Cukup Manis" atau "Manis" atau "Sangat Manis" JIKA jenis_objek adalah buah, null untuk lainnya,
  "skor_warna": angka 0-100 JIKA jenis_objek adalah buah (100 = warna merah daging sempurna atau kulit hijau cerah sehat), null untuk lainnya,

  "kondisi_tanaman": "Sehat" atau "Kurang Sehat" atau "Sakit" atau "Kritis" JIKA jenis_objek BUKAN buah, null jika buah,
  "warna_bagian": deskripsi singkat warna yang terlihat (contoh: "Hijau tua segar", "Kuning pucat", "Cokelat keabu-abuan") JIKA bukan buah, null jika buah,
  "tanda_penyakit": "Tidak Ada" ATAU salah satu nama penyakit berikut jika terdeteksi (gunakan nama PERSIS ini): "Layu Fusarium" | "Antraknosa" | "Embun Bulu / Kresek (Downy Mildew)" | "Embun Tepung (Powdery Mildew)" | "Busuk Buah / Antraknosa Buah" | "Busuk Pangkal Batang (Gummy Stem Blight)" | "Bercak Daun Alternaria" | "Layu Bakteri" | "Bercak Sudut Bakteri (Angular Leaf Spot)" | "Mosaik Mentimun (CMV)" | "Mosaik Semangka (WMV)" | "Busuk Akar Fusarium". Jika tidak ada di daftar tersebut boleh tulis deskripsi singkat sendiri. JIKA bukan buah, null jika buah,
  "serangan_hama": "Tidak Ada" ATAU salah satu nama hama berikut jika terdeteksi (gunakan nama PERSIS ini): "Kutu Daun (Aphid)" | "Lalat Buah" | "Tungau Merah / Spider Mite" | "Ulat Grayak". Jika tidak ada di daftar tersebut boleh tulis deskripsi singkat sendiri. JIKA bukan buah, null jika buah,
  "tingkat_stres_air": "Normal" atau "Kekurangan Air" atau "Kelebihan Air" JIKA bukan buah dan relevan, null jika buah atau tidak relevan
}`;

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        max_tokens: 1024,
        temperature: 0.2,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageB64}` } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    const groqData = await groqRes.json();
    if (!groqRes.ok) {
      console.error('Groq error:', groqData);
      return res.status(500).json({ error: groqData.error?.message || 'Gagal dari Groq API.' });
    }

    const rawText = groqData.choices?.[0]?.message?.content || '';
    const cleaned = rawText.replace(/```json|```/g, '').trim();

    let result;
    try { result = JSON.parse(cleaned); }
    catch (parseErr) {
      console.error('JSON parse error. Raw:', rawText);
      return res.status(500).json({ error: 'AI mengembalikan format yang tidak valid. Coba ulangi.' });
    }

    const requiredFields = [
      'adalah_tanaman_semangka', 'jenis_objek', 'nama_bagian',
      'kondisi_umum', 'skor_kesehatan', 'akurasi_persen',
      'analisis', 'saran'
    ];
    for (const field of requiredFields) {
      if (result[field] === undefined) {
        return res.status(500).json({ error: 'Respons AI tidak lengkap. Coba ulangi.' });
      }
    }

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({ error: 'Gagal menganalisis gambar. Coba lagi.' });
  }
});

// ─── ENDPOINT DIAGNOSA KESELURUHAN ──────────────────────────────────────────
app.post('/api/diagnosa', rateLimit, async (req, res) => {
  try {
    const { riwayat } = req.body;
    if (!riwayat || !Array.isArray(riwayat) || riwayat.length === 0) {
      return res.status(400).json({ error: 'Data riwayat tidak valid.' });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'API key belum dikonfigurasi di server.' });

    // Build summary from history entries
    const ringkasan = riwayat.map((e, i) => {
      const bagian = e.nama_bagian || e.jenis_objek;
      let detail = `[${i+1}] Bagian: ${bagian}, Kondisi: ${e.kondisi_umum}, Skor: ${e.skor_kesehatan}/100`;
      if (e.tanda_penyakit && e.tanda_penyakit !== 'Tidak Ada') detail += `, Penyakit: ${e.tanda_penyakit}`;
      if (e.serangan_hama && e.serangan_hama !== 'Tidak Ada') detail += `, Hama: ${e.serangan_hama}`;
      if (e.kondisi_tanaman) detail += `, Status Tanaman: ${e.kondisi_tanaman}`;
      if (e.tingkat_stres_air && e.tingkat_stres_air !== 'Normal') detail += `, Stres Air: ${e.tingkat_stres_air}`;
      if (e.kategori_kematangan) detail += `, Kematangan: ${e.kategori_kematangan}`;
      if (e.kondisi_kebusukan && e.kondisi_kebusukan !== 'Segar') detail += `, Kebusukan: ${e.kondisi_kebusukan}`;
      detail += `. Analisis: ${e.analisis}`;
      return detail;
    }).join('\n');

    const prompt = `Kamu adalah dokter tanaman semangka (Citrullus lanatus) yang berpengalaman.

Berikut adalah hasil analisis dari BEBERAPA BAGIAN tanaman semangka yang sama atau dari kebun yang sama:

${ringkasan}

Berdasarkan semua data di atas, berikan diagnosa komprehensif dalam format JSON murni (tanpa markdown, tanpa kode blok):

{
  "kesimpulan_penyakit": "Nama utama penyakit/masalah yang menyerang, atau 'Tanaman Sehat' jika tidak ada masalah serius",
  "tingkat_keparahan": "Ringan" atau "Sedang" atau "Parah" atau "Kritis" atau "Sehat",
  "skor_kesehatan_keseluruhan": angka 0-100,
  "penyebab_utama": "Penjelasan singkat penyebab utama masalah yang ditemukan",
  "bagian_paling_bermasalah": "Nama bagian tanaman yang paling bermasalah, atau '-' jika sehat",
  "daftar_masalah": ["masalah1", "masalah2"] atau array kosong jika sehat,
  "rekomendasi_tindakan": ["langkah1", "langkah2", "langkah3"] minimal 2 rekomendasi konkret,
  "rekomendasi_pencegahan": "Satu kalimat pencegahan untuk ke depannya",
  "prognosis": "Baik" atau "Cukup" atau "Buruk",
  "ringkasan": "Paragraf ringkasan 2-3 kalimat yang menjelaskan kondisi keseluruhan tanaman dan tindakan utama yang perlu diambil"
}`;

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        max_tokens: 1024,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const groqData = await groqRes.json();
    if (!groqRes.ok) {
      return res.status(500).json({ error: groqData.error?.message || 'Gagal dari Groq API.' });
    }

    const rawText = groqData.choices?.[0]?.message?.content || '';
    const cleaned = rawText.replace(/```json|```/g, '').trim();

    let result;
    try { result = JSON.parse(cleaned); }
    catch {
      return res.status(500).json({ error: 'AI mengembalikan format yang tidak valid. Coba ulangi.' });
    }

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('Diagnosa error:', err.message);
    res.status(500).json({ error: 'Gagal membuat diagnosa. Coba lagi.' });
  }
});

// ─── ENDPOINT CARI INFO PENYAKIT (via Groq text) ────────────────────────────
app.post('/api/cari-info', rateLimit, async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Query tidak boleh kosong.' });

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'API key belum dikonfigurasi di server.' });

    const prompt = `Kamu adalah ahli pertanian semangka Indonesia. Berikan informasi lengkap tentang: "${query}" pada tanaman semangka.

Jawab dalam format JSON murni (tanpa markdown):
{
  "nama": "Nama resmi penyakit/hama/kondisi",
  "deskripsi": "Deskripsi singkat 2-3 kalimat",
  "gejala": ["gejala1", "gejala2", "gejala3"],
  "penyebab": "Penyebab utama",
  "penanganan": ["langkah1", "langkah2", "langkah3"],
  "pencegahan": ["cara1", "cara2"],
  "tingkat_bahaya": "Rendah" atau "Sedang" atau "Tinggi",
  "sumber_referensi": "Rekomendasi sumber belajar lebih lanjut"
}`;

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        max_tokens: 800,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const groqData = await groqRes.json();
    if (!groqRes.ok) {
      return res.status(500).json({ error: groqData.error?.message || 'Gagal dari Groq API.' });
    }

    const rawText = groqData.choices?.[0]?.message?.content || '';
    const cleaned = rawText.replace(/```json|```/g, '').trim();

    let result;
    try { result = JSON.parse(cleaned); }
    catch {
      return res.status(500).json({ error: 'Gagal memproses info. Coba ulangi.' });
    }

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mencari info. Coba lagi.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server berjalan di http://localhost:${PORT}`));

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

    const prompt = `Kamu adalah sistem AI khusus analisis kualitas buah semangka.
Analisis gambar ini dan berikan hasil HANYA dalam format JSON berikut
(tanpa markdown, tanpa kode blok, murni JSON):

{
  "adalah_semangka": true atau false,
  "tingkat_kematangan_persen": angka 0-100,
  "tingkat_kebusukan_persen": angka 0-100,
  "akurasi_persen": angka 70-99,
  "kategori_kematangan": "Mentah" atau "Setengah Matang" atau "Matang" atau "Terlalu Matang",
  "kondisi_kebusukan": "Segar" atau "Mulai Busuk" atau "Cukup Busuk" atau "Sangat Busuk",
  "estimasi_kemanisan": "Tidak Manis" atau "Cukup Manis" atau "Manis" atau "Sangat Manis",
  "skor_warna": angka 0-100 (100 = warna merah daging sempurna atau kulit hijau cerah sehat),
  "analisis": "Deskripsi singkat kondisi semangka dalam 2-3 kalimat bahasa Indonesia. Sebutkan ciri warna kulit, tekstur, dan tanda kematangan yang terlihat.",
  "saran": "Satu kalimat saran penggunaan, penyimpanan, atau cara memilih semangka yang baik dalam bahasa Indonesia."
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
      'adalah_semangka', 'tingkat_kematangan_persen', 'tingkat_kebusukan_persen',
      'akurasi_persen', 'kategori_kematangan', 'kondisi_kebusukan',
      'estimasi_kemanisan', 'skor_warna', 'analisis', 'saran'
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server berjalan di http://localhost:${PORT}`));

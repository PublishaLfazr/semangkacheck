# 🍉 SemangkaCheck AI

Deteksi kualitas semangka menggunakan AI — gratis, cepat, dan akurat.

## Fitur
- ✅ Deteksi apakah gambar adalah semangka
- 🍉 Analisis tingkat kematangan (Mentah → Terlalu Matang)
- 🔴 Deteksi tingkat kebusukan
- 🍬 **NEU:** Estimasi tingkat kemanisan (Tidak Manis → Sangat Manis)
- 🎨 **NEU:** Skor warna kulit & daging semangka
- 💡 **NEU:** Tips memilih semangka segar
- 📊 Progress meter visual dengan animasi
- 📋 Riwayat analisis (hingga 20 entri, disimpan lokal)
- ⚖️ Bandingkan 2 semangka side-by-side
- 📥 Export riwayat ke JSON atau CSV
- 📤 Fitur bagikan hasil via Web Share API
- 🌙 Dark mode otomatis
- 🔒 Rate limiting: 10 request/menit per IP
- 📁 Validasi file: JPG, PNG, WEBP, maks 10MB

## Setup

1. **Clone / download** project ini
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy file env dan isi API key:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` dan isi `GROQ_API_KEY` dengan key dari https://console.groq.com (gratis)

4. Jalankan server:
   ```bash
   npm start
   ```
5. Buka browser: `http://localhost:3000`

## Stack
- **Backend**: Node.js + Express + Multer
- **AI**: Groq API (meta-llama/llama-4-scout-17b-16e-instruct) — model multimodal gratis
- **Frontend**: Vanilla JS + CSS (no framework)
- **Font**: Syne + DM Mono
- **Icons**: Tabler Icons

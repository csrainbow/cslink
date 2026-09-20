// Pengirim email verifikasi (SMTP). Tanpa kredensial, kode dicetak ke log (mode dev).
const path = require('path');

let transporter = null;
try {
  if (process.env.MAIL_HOST && process.env.MAIL_USER) {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: parseInt(process.env.MAIL_PORT || '465', 10),
      secure: String(process.env.MAIL_SECURE || 'true') === 'true',
      auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS || '' }
    });
  }
} catch (e) {
  transporter = null;
}

function configured() {
  return !!transporter;
}

async function sendVerifyCode(email, code) {
  if (!transporter) {
    console.log(`[mail-dev] KODE VERIFIKASI ${email}: ${code}`);
    return { ok: true, dev: true };
  }
  const from = process.env.MAIL_FROM || process.env.MAIL_USER;
  try {
    await transporter.sendMail({
      from,
      to: email,
      subject: 'CSLINK — Kode Verifikasi Email',
      text: `Kode verifikasi email Anda: ${code}\n\nMasukkan kode ini di halaman CSLINK untuk menyelesaikan pendaftaran.\nKode berlaku 10 menit.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #dfe7ff;border-radius:14px;background:#f6f8ff">
        <h2 style="margin-top:0;color:#0a0f26">CSLINK — Verifikasi Email</h2>
        <p>Gunakan kode berikut untuk menyelesaikan pendaftaran akun Anda:</p>
        <div style="font-size:32px;font-weight:800;letter-spacing:8px;background:#eef2ff;border-radius:10px;padding:14px;text-align:center;color:#4f46e5">${code}</div>
        <p style="color:#5a6b8c;font-size:13px">Kode berlaku 10 menit. Jika Anda tidak mendaftar di CSLINK, abaikan email ini.</p>
      </div>`
    });
    return { ok: true };
  } catch (e) {
    console.log('[mail] gagal kirim ke ' + email + ':', e && e.message ? e.message : e);
    console.log(`[mail-dev] KODE VERIFIKASI ${email}: ${code}`);
    return { ok: true, dev: true };
  }
}

module.exports = { sendVerifyCode, configured };
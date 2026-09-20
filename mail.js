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

async function sendRenewReminder(email, name, daysLeft, premiumUntil) {
  const until = String(premiumUntil || '').replace('T', ' ').slice(0, 16);
  const line = daysLeft !== null && daysLeft > 0
    ? `Premium Anda akan berakhir dalam ${daysLeft} hari lagi (hingga ${until}).`
    : `Premium Anda sudah berakhir (hingga ${until}).`;
  if (!transporter) {
    console.log(`[mail-dev] RENEW ${email}: ${line}`);
    return { ok: true, dev: true };
  }
  const from = process.env.MAIL_FROM || process.env.MAIL_USER;
  try {
    await transporter.sendMail({
      from,
      to: email,
      subject: 'CSLINK — Premium Hampir Berakhir',
      text: `Halo ${name},\n\n${line}\n\nPerpanjang sekarang agar fitur Premium (link tanpa batas & tanpa iklan) tetap aktif:\nhttps://cslink.web.id/premium\n\nAbaikan email ini jika sudah memperpanjang.\n- CSLINK Percetakan Rainbow`,
      html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #dfe7ff;border-radius:14px;background:#f6f8ff">
        <h2 style="margin-top:0;color:#7c2d12">⏳ CSLINK — Premium Hampir Berakhir</h2>
        <p>Halo <b>${name}</b>,</p>
        <p>${line}</p>
        <p>Perpanjang sekarang agar Premium tetap aktif (link tanpa batas & tanpa iklan).</p>
        <a href="https://cslink.web.id/premium" style="display:inline-block;padding:13px 26px;border-radius:12px;background:linear-gradient(120deg,#22d3ee,#818cf8 50%,#e879f9);color:#fff;text-decoration:none;font-weight:700">Perpanjang Premium</a>
        <p style="color:#5a6b8c;font-size:12px;margin-top:16px">Abaikan jika sudah memperpanjang. — CSLINK Percetakan Rainbow</p>
      </div>`
    });
    return { ok: true };
  } catch (e) {
    console.log('[mail] gagal kirim renew ke ' + email + ':', e && e.message ? e.message : e);
    console.log(`[mail-dev] RENEW ${email}: ${line}`);
    return { ok: true, dev: true };
  }
}

module.exports = { sendVerifyCode, sendRenewReminder, configured };
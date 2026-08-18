const RESEND_API_URL = 'https://api.resend.com/emails';

// HTTP-based email API, not SMTP — Render's outbound network blocks raw SMTP
// connections (confirmed: identical code timed out on both port 465 and 587
// from Render, while working fine from a local network), so sending over a
// normal HTTPS request is what actually gets this delivered from production.
// Sends from Resend's own onboarding@resend.dev address since verifying
// neotericgrp.in as a sending domain isn't needed for this use case.
async function sendMail({ to, subject, text, attachments }) {
  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'VMS Backup <onboarding@resend.dev>',
      to: [to],
      subject,
      text,
      attachments: (attachments || []).map((a) => ({
        filename: a.filename,
        content: Buffer.isBuffer(a.content) ? a.content.toString('base64') : a.content,
      })),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error (${res.status}): ${body}`);
  }
  return res.json();
}

module.exports = { sendMail };

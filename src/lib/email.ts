import nodemailer from 'nodemailer'

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

export async function sendInviteEmail(to: string, inviteLink: string) {
  const transporter = createTransport()
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER

  await transporter.sendMail({
    from,
    to,
    subject: 'Du wurdest zu Jeopardy 2.0 eingeladen',
    text: `Du wurdest eingeladen, Jeopardy 2.0 beizutreten.\n\nRegistriere dich hier:\n${inviteLink}\n\nDer Link ist 7 Tage gültig.`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 16px">
        <h1 style="font-size:24px;font-weight:bold;color:#eab308;margin-bottom:8px">Jeopardy 2.0</h1>
        <p style="color:#a3a3a3;margin-bottom:24px">Du wurdest eingeladen, mitzuspielen!</p>
        <a href="${inviteLink}"
           style="display:inline-block;background:#eab308;color:#000;font-weight:bold;padding:12px 24px;border-radius:8px;text-decoration:none">
          Jetzt registrieren
        </a>
        <p style="color:#737373;font-size:12px;margin-top:24px">
          Oder kopiere diesen Link: <br>
          <span style="color:#eab308;word-break:break-all">${inviteLink}</span>
        </p>
        <p style="color:#525252;font-size:12px;margin-top:16px">Der Link ist 7 Tage gültig.</p>
      </div>
    `,
  })
}

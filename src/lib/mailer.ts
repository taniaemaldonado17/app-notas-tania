import nodemailer from 'nodemailer'

/**
 * Emails go out through a Gmail account using an app password:
 *   GMAIL_USER=tu.cuenta@gmail.com
 *   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
 * Without them, emails are skipped (and logged) instead of failing.
 */
let transport: nodemailer.Transporter | null = null

export function mailerConfigured() {
  return !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD)
}

export async function sendMail(mail: { to: string; subject: string; html: string; text: string; fromName?: string; replyTo?: string }) {
  if (!mailerConfigured()) {
    console.warn('[mailer] GMAIL_USER / GMAIL_APP_PASSWORD not set; email to', mail.to, 'skipped')
    return false
  }
  transport ??= nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD!.replace(/\s+/g, '') },
  })
  const fromName = (mail.fromName ?? 'Notas').replace(/["<>]/g, '')
  await transport.sendMail({
    from: `"${fromName}" <${process.env.GMAIL_USER}>`,
    to: mail.to,
    replyTo: mail.replyTo,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  })
  return true
}

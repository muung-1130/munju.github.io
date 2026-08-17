import nodemailer from 'nodemailer';

declare global {
  // eslint-disable-next-line no-var
  var __mailTransport: ReturnType<typeof nodemailer.createTransport> | undefined;
}

function getTransport() {
  if (!global.__mailTransport) {
    global.__mailTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT ?? 465),
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }
  return global.__mailTransport;
}

export function isMailConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function sendMail(options: { to: string; subject: string; text: string }) {
  if (!isMailConfigured()) {
    throw new Error('SMTP_USER/SMTP_PASS가 설정되지 않아 이메일을 보낼 수 없어요.');
  }
  const transport = getTransport();
  await transport.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to: options.to,
    subject: options.subject,
    text: options.text
  });
}

import nodemailer from 'nodemailer';

// K8s Secret dir-auth-user-ses-smtp(SES SMTP, README_dev.md §1)가 envFrom으로 주입하는
// 키 이름 그대로 읽는다: SMTP_HOST/SMTP_PORT/SMTP_USERNAME/SMTP_PASSWORD.
declare global {
  // eslint-disable-next-line no-var
  var __mailTransport: ReturnType<typeof nodemailer.createTransport> | undefined;
}

// SES IAM 정책이 From 주소를 *@mail.dairun.site로만 허용한다 — 다른 주소로는 발신 자체가
// AWS 쪽에서 거부된다. SMTP_USERNAME(SES SMTP 자격증명, 이메일 주소가 아님)을 From으로 쓰면
// 안 되므로 별도 env로 분리한다.
const MAIL_FROM_ADDRESS = process.env.MAIL_FROM_ADDRESS ?? 'no-reply@mail.dairun.site';

function getTransport() {
  if (!global.__mailTransport) {
    global.__mailTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      // SES SMTP 엔드포인트는 587/STARTTLS다. secure:true(암묵적 TLS, 465용)로 587에 붙으면
      // 핸드셰이크가 바로 실패한다.
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.SMTP_USERNAME,
        pass: process.env.SMTP_PASSWORD
      }
    });
  }
  return global.__mailTransport;
}

export function isMailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USERNAME && process.env.SMTP_PASSWORD);
}

export async function sendMail(options: { to: string; subject: string; text: string }) {
  if (!isMailConfigured()) {
    throw new Error('SMTP_HOST/SMTP_USERNAME/SMTP_PASSWORD가 설정되지 않아 이메일을 보낼 수 없어요.');
  }
  const transport = getTransport();
  await transport.sendMail({
    from: MAIL_FROM_ADDRESS,
    to: options.to,
    subject: options.subject,
    text: options.text
  });
}

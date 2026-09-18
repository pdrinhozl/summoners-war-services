const nodemailer = require('nodemailer');

let transport = null;

function getTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  if (host) {
    transport = nodemailer.createTransport({
      host,
      port,
      secure: String(process.env.SMTP_SECURE) === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transport;
}

async function sendMail(options) {
  const { to, subject, html } = options;
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@localhost';

  if (transport || getTransport()) {
    try {
      await transport.sendMail({ from, to, subject, html });
      return { sent: true };
    } catch (e) {
      console.error('[email] Falha ao enviar:', e.message);
      return { sent: false, error: e.message };
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log('\n[email][DEV] E-mail simulador (SMTP não configurado)');
    console.log(`  Para: ${to}`);
    console.log(`  Assunto: ${subject}`);
    console.log(`  Conteúdo: ${html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 400)}\n`);
  }
  return { sent: false, simulated: true };
}

async function sendPasswordReset(to, resetUrl) {
  return sendMail({
    to,
    subject: 'Redefinição de senha',
    html: `<p>Olá, recebemos um pedido para redefinir sua senha.</p><p><a href="${resetUrl}">Clique aqui para redefinir</a></p><p>Este link expira em 1 hora. Se não foi você, ignore este e-mail.</p>`,
  });
}

async function sendVerifyEmail(to, verifyUrl) {
  return sendMail({
    to,
    subject: 'Confirme seu e-mail',
    html: `<p>Confirme seu e-mail clicando no link abaixo:</p><p><a href="${verifyUrl}">Confirmar e-mail</a></p><p>Este link expira em 24 horas.</p>`,
  });
}

module.exports = { sendMail, sendPasswordReset, sendVerifyEmail };
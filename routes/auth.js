const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { get, run } = require('../db/db');
const { requireLogin } = require('../middleware');
const totp = require('../lib/totp');
const { sendPasswordReset, sendVerifyEmail } = require('../lib/email');
const router = express.Router();

function flash(req, type, text) {
  req.session.flash = req.session.flash || [];
  req.session.flash.push({ type, text });
}

function doLogin(req, userId) {
  req.session.userId = userId;
  delete req.session.pendingUserId;
}

function twofaUser(req) {
  if (!req.session.pendingUserId) return null;
  const user = get('SELECT * FROM users WHERE id = ?', [req.session.pendingUserId]);
  if (!user || !user.twofa_enabled || !user.twofa_secret) {
    delete req.session.pendingUserId;
    return null;
  }
  return user;
}

router.get('/login', (req, res) => {
  if (res.locals.user) return res.redirect('/painel');
  res.render('login', { form: {} });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = get('SELECT * FROM users WHERE email = ?', [String(email || '').trim().toLowerCase()]);
  if (!user || !bcrypt.compareSync(password || '', user.password)) {
    flash(req, 'error', 'E-mail ou senha incorretos.');
    return res.render('login', { form: { email } });
  }
  if (!user.active) {
    flash(req, 'error', 'Sua conta está desativada. Fale com o administrador.');
    return res.render('login', { form: { email } });
  }
  if (user.twofa_enabled && user.twofa_secret) {
    req.session.pendingUserId = user.id;
    return res.redirect('/login/2fa');
  }
  doLogin(req, user.id);
  flash(req, 'success', `Bem-vindo de volta, ${user.name.split(' ')[0]}!`);
  res.redirect('/painel');
});

router.get('/login/2fa', (req, res) => {
  if (res.locals.user) return res.redirect('/painel');
  const user = twofaUser(req);
  if (!user) {
    flash(req, 'error', 'Faça login novamente para continuar.');
    return res.redirect('/login');
  }
  res.render('login-2fa');
});

router.post('/login/2fa', (req, res) => {
  const user = twofaUser(req);
  if (!user) {
    flash(req, 'error', 'Sessão de verificação expirada. Faça login novamente.');
    return res.redirect('/login');
  }
  if (!totp.verify(user.twofa_secret, req.body.code)) {
    flash(req, 'error', 'Código inválido ou expirado.');
    return res.render('login-2fa');
  }
  doLogin(req, user.id);
  flash(req, 'success', `Bem-vindo de volta, ${user.name.split(' ')[0]}!`);
  res.redirect('/painel');
});

router.get('/registro', (req, res) => {
  if (res.locals.user) return res.redirect('/painel');
  res.render('registro', { form: {}, role: 'client' });
});

router.post('/registro', async (req, res) => {
  const { name, email, password, password2, role } = req.body;
  const normEmail = String(email || '').trim().toLowerCase();
  const wantSeller = role === 'seller';

  if (!name || !normEmail || !password) {
    flash(req, 'error', 'Preencha todos os campos obrigatórios.');
    return res.render('registro', { form: { name, email }, role: wantSeller ? 'seller' : 'client' });
  }
  if (password.length < 6) {
    flash(req, 'error', 'A senha precisa ter no mínimo 6 caracteres.');
    return res.render('registro', { form: { name, email }, role: wantSeller ? 'seller' : 'client' });
  }
  if (password !== password2) {
    flash(req, 'error', 'As senhas não coincidem.');
    return res.render('registro', { form: { name, email }, role: wantSeller ? 'seller' : 'client' });
  }
  if (get('SELECT id FROM users WHERE email = ?', [normEmail])) {
    flash(req, 'error', 'Já existe uma conta com este e-mail.');
    return res.render('registro', { form: { name, email }, role: wantSeller ? 'seller' : 'client' });
  }

  const result = run(
    'INSERT INTO users (name, email, password, role, seller_status) VALUES (?, ?, ?, ?, ?)',
    [String(name).trim(), normEmail, bcrypt.hashSync(password, 10), wantSeller ? 'seller' : 'client', wantSeller ? 'pending' : 'none']
  );
  const id = Number(result.lastInsertRowid);

  const token = crypto.randomBytes(32).toString('hex');
  run('INSERT INTO reset_tokens (user_id, token, type, expires_at) VALUES (?, ?, ?, datetime(\'now\', \'+24 hours\'))', [id, token, 'verify']);

  const smtp = process.env.SMTP_HOST;
  if (smtp) {
    const base = process.env.SITE_URL || `http://localhost:${process.env.PORT || 3000}`;
    await sendVerifyEmail(normEmail, `${base}/verificar-email/${token}`);
  } else {
    run('UPDATE users SET email_verified = 1 WHERE id = ?', [id]);
  }

  doLogin(req, id);
  if (wantSeller) {
    flash(req, 'success', 'Conta de vendedor criada! Complete seu perfil para enviar para verificação.');
    res.redirect('/vendedor/perfil');
  } else {
    flash(req, 'success', 'Conta criada com sucesso. Bem-vindo ao Runa Nível 5!');
    res.redirect('/painel');
  }
});

router.get('/verificar-email/:token', requireLogin, (req, res) => {
  const t = get('SELECT * FROM reset_tokens WHERE token = ? AND type = \'verify\' AND used = 0 AND expires_at > datetime(\'now\')', [req.params.token]);
  if (!t || t.user_id !== res.locals.user.id) {
    flash(req, 'error', 'Link de confirmação inválido ou expirado.');
    return res.redirect('/painel');
  }
  run('UPDATE users SET email_verified = 1 WHERE id = ?', [t.user_id]);
  run('UPDATE reset_tokens SET used = 1 WHERE id = ?', [t.id]);
  flash(req, 'success', 'E-mail confirmado com sucesso!');
  res.redirect('/painel');
});

router.get('/esqueci-senha', (req, res) => {
  res.render('esqueci-senha', { sent: false });
});

router.post('/esqueci-senha', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = email ? get('SELECT id, email FROM users WHERE email = ?', [email]) : null;
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    run('INSERT INTO reset_tokens (user_id, token, type, expires_at) VALUES (?, ?, \'password\', datetime(\'now\', \'+1 hour\'))', [user.id, token]);
    const base = process.env.SITE_URL || `http://localhost:${process.env.PORT || 3000}`;
    await sendPasswordReset(user.email, `${base}/resetar-senha/${token}`);
  }
  res.render('esqueci-senha', { sent: true });
});

router.get('/resetar-senha/:token', (req, res) => {
  const t = get('SELECT * FROM reset_tokens WHERE token = ? AND type = \'password\' AND used = 0 AND expires_at > datetime(\'now\')', [req.params.token]);
  if (!t) return res.redirect('/login');
  res.render('resetar-senha', { token: req.params.token, invalid: false });
});

router.post('/resetar-senha/:token', (req, res) => {
  const t = get('SELECT * FROM reset_tokens WHERE token = ? AND type = \'password\' AND used = 0 AND expires_at > datetime(\'now\')', [req.params.token]);
  if (!t) return res.render('resetar-senha', { token: req.params.token, invalid: true });
  const { password, password2 } = req.body;
  if (!password || password.length < 6) {
    flash(req, 'error', 'A senha precisa ter no mínimo 6 caracteres.');
    return res.render('resetar-senha', { token: req.params.token, invalid: false });
  }
  if (password !== password2) {
    flash(req, 'error', 'As senhas não coincidem.');
    return res.render('resetar-senha', { token: req.params.token, invalid: false });
  }
  run('UPDATE users SET password = ? WHERE id = ?', [bcrypt.hashSync(password, 10), t.user_id]);
  run('UPDATE reset_tokens SET used = 1 WHERE id = ?', [t.id]);
  req.session.destroy(() => {});
  flash(req, 'success', 'Senha redefinida! Faça login com a nova senha.');
  res.redirect('/login');
});

router.post('/notificacoes/ler', requireLogin, (req, res) => {
  run('UPDATE notifications SET read = 1 WHERE user_id = ?', [res.locals.user.id]);
  res.redirect('back');
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
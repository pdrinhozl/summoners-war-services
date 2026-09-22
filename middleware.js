const { get, all } = require('./db/db');

function loadUser(req, res, next) {
  res.locals.user = null;
  res.locals.unreadCount = 0;
  res.locals.notifications = [];
  if (req.session && req.session.userId) {
    const user = get('SELECT * FROM users WHERE id = ?', [req.session.userId]);
    if (user && user.active) {
      res.locals.user = user;
      res.locals.unreadCount = get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0', [user.id]).n;
      res.locals.notifications = all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 8', [user.id]);
    } else {
      req.session.destroy(() => {});
    }
  }
  next();
}

function requireLogin(req, res, next) {
  if (!res.locals.user) {
    if (req.method === 'GET' && req.originalUrl.startsWith('/') && !req.originalUrl.startsWith('//')) req.session.returnTo = req.originalUrl;
    req.session.flash = req.session.flash || [];
    req.session.flash.push({ type: 'error', text: 'Você precisa estar logado para acessar esta página.' });
    return res.redirect('/login');
  }
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!res.locals.user) return res.redirect('/login');
    if (res.locals.user.role !== role) {
      return res.status(403).render('erro', { code: 403, title: 'Acesso negado', message: 'Você não tem permissão para acessar esta área.' });
    }
    next();
  };
}

function requireVerifiedSeller(req, res, next) {
  if (!res.locals.user) return res.redirect('/login');
  if (res.locals.user.role !== 'seller') return res.redirect('/painel');
  next();
}

function requireApprovedSeller(req, res, next) {
  if (!res.locals.user) return res.redirect('/login');
  if (res.locals.user.role !== 'seller') return res.redirect('/painel');
  if (res.locals.user.seller_status !== 'verified') {
    req.session.flash = [{ type: 'error', text: 'Sua conta de vendedor ainda não foi verificada pela administração.' }];
    return res.redirect('/vendedor/painel');
  }
  next();
}

module.exports = { loadUser, requireLogin, requireRole, requireVerifiedSeller, requireApprovedSeller };
const session = require('express-session');
const crypto = require('crypto');
const { get, run } = require('../db/db');

class SqliteSessionStore extends session.Store {
  constructor() {
    super();
    this.interval = setInterval(() => this.purge(), 60 * 60 * 1000);
    this.interval.unref();
  }

  purge() {
    try {
      run("DELETE FROM sessions WHERE expires IS NOT NULL AND expires < datetime('now')");
    } catch (_e) { /* noop */ }
  }

  get(sid, cb) {
    try {
      const row = get('SELECT data FROM sessions WHERE sid = ?', [sid]);
      cb(null, row ? JSON.parse(row.data) : null);
    } catch (e) {
      cb(e);
    }
  }

  set(sid, sess, cb) {
    try {
      const expires = sess.cookie && sess.cookie.expires ? new Date(sess.cookie.expires).toISOString() : null;
      run(
        'INSERT INTO sessions (sid, data, expires) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires = excluded.expires',
        [sid, JSON.stringify(sess), expires]
      );
      cb && cb(null);
    } catch (e) {
      cb && cb(e);
    }
  }

  destroy(sid, cb) {
    try {
      run('DELETE FROM sessions WHERE sid = ?', [sid]);
      cb && cb(null);
    } catch (e) {
      cb && cb(e);
    }
  }

  touch(sid, sess, cb) {
    return this.set(sid, sess, cb);
  }

  length(cb) {
    try {
      cb(null, get('SELECT COUNT(*) AS n FROM sessions').n || 0);
    } catch (e) {
      cb(e);
    }
  }

  clear(cb) {
    try {
      run('DELETE FROM sessions');
      cb && cb(null);
    } catch (e) {
      cb && cb(e);
    }
  }
}

function csrfToken(req) {
  if (!req.session.csrf) {
    req.session.csrf = crypto.randomBytes(24).toString('hex');
  }
  return req.session.csrf;
}

function csrfProtect(req, res, next) {
  res.locals.csrfToken = csrfToken(req);
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const sent = (req.body && req.body._csrf) || req.headers['x-csrf-token'];
  if (sent && sent === req.session.csrf) return next();
  req.session.flash = req.session.flash || [];
  req.session.flash.push({ type: 'error', text: 'Sua sessão expirou. Recarregue a página e tente novamente.' });
  return res.redirect(req.get('Referrer') || '/');
}

module.exports = { SqliteSessionStore, csrfProtect, csrfToken };
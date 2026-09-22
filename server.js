const envFile = require('path').join(__dirname, '.env');
if (require('fs').existsSync(envFile)) process.loadEnvFile(envFile);

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const { all, get } = require('./db/db');
const seed = require('./db/seed');
const { loadUser, requireLogin } = require('./middleware');
const { SqliteSessionStore, csrfProtect } = require('./lib/security');
const upload = require('./lib/upload');

const app = express();
const PORT = process.env.PORT || 3050;

if (process.env.NODE_ENV === 'production' && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
  throw new Error('Configure SESSION_SECRET com pelo menos 32 caracteres em produção.');
}

const UPLOAD_DIR = upload.directory;
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function loadSettings() {
  const rows = all('SELECT key, value FROM settings');
  const s = {};
  for (const r of rows) s[r.key] = r.value;
  return s;
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
app.use(compression());

app.get('/health', (_req, res) => {
  try {
    get('SELECT 1 AS ok');
    res.status(200).json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'unavailable' });
  }
});

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' },
});
app.use(limiter);

app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0 }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0 }));

app.use(
  session({
    store: new SqliteSessionStore(),
    secret: process.env.SESSION_SECRET || 'runa-nivel-5-super-secreto-2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
  })
);

app.use(loadUser);
// Parse request images in memory; CSRF and field validation run before saving.
app.post('/orcamento', requireLogin, require('./lib/request-upload').parse);
app.use((req, res, next) => {
  // These four catalog upload routes verify the parsed token in lib/upload.
  if (req.method === 'POST' && req.is('multipart/form-data') && /^\/(admin|vendedor)\/servicos\/(novo|[0-9]+)$/.test(req.path)) return next();
  return csrfProtect(req, res, next);
});

const ICONS = {
  time: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  game: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="3"/><path d="M7 10v4M5 12h4"/><circle cx="16" cy="10" r="1"/><circle cx="18" cy="13" r="1"/></svg>',
  rank: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H3v2a3 3 0 0 0 3 3M17 6h4v2a3 3 0 0 1-3 3"/></svg>',
  date: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 9h18"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l8 3v6.1c0 4.8-3.2 8.4-8 10.9-4.8-2.5-8-6.1-8-10.9V5z"/></svg>',
  shieldCheck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l8 3v6.1c0 4.8-3.2 8.4-8 10.9-4.8-2.5-8-6.1-8-10.9V5z"/><path d="M9 12l2 2 4-4"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  coins: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>',
  cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1.5"/><circle cx="18" cy="21" r="1.5"/><path d="M2 3h3l2.6 12.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 7H6"/></svg>',
  sword: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 17.5L3 6V3h3L17.5 14.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="M19 21l2-2"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>',
  zap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
  gem: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12l4 6-10 13L2 9l4-6z"/><path d="M11 3L8 9l4 12 4-12-3-6"/><path d="M2 9h20"/></svg>',
  crown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11.56 3.27a.5.5 0 0 1 .88 0l3.05 5.6a1 1 0 0 0 1.52.3l4.17-3.2a.5.5 0 0 1 .8.52l-2.84 10.24a1 1 0 0 1-.96.74H5.82a1 1 0 0 1-.96-.74L2.02 6.02a.5.5 0 0 1 .8-.52l4.17 3.2a1 1 0 0 0 1.52-.3z"/><path d="M5 21h14"/></svg>',
  sparkles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z"/></svg>',
  fire: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 6L2 7"/></svg>',
  clipboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h6"/></svg>',
  arrowRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  arrowLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  cog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
};

const appIcons = {
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m21 15-5-5L5 21"/>',
  search: '<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/>',
  logout: '<path d="M9 4H4v16h5M9 12h12m-4-4 4 4-4 4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  headset: '<path d="M4 14v-3a8 8 0 0 1 16 0v6c0 3-3 4-6 4"/><rect x="2" y="11" width="4" height="7" rx="2"/><rect x="18" y="11" width="4" height="7" rx="2"/>',
};
for (const [name, body] of Object.entries(appIcons)) {
  ICONS[name] = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

const EMOJI_ICONS = {
  '⚔️': 'sword', '⚔': 'sword',
  '🏆': 'trophy',
  '⚡': 'zap',
  '💎': 'gem',
  '👑': 'crown',
  '🔮': 'sparkles',
  '🔥': 'fire',
  '⭐': 'star',
  '⏱': 'clock', '⏰': 'clock', '⌚': 'clock',
  '📋': 'clipboard',
  '👤': 'user',
  '💰': 'coins',
  '💬': 'chat',
  '🛡': 'shield', '🛡️': 'shield',
  '✓': 'check', '✅': 'check',
  '📧': 'mail',
};
const EMOJI_BY_NAME = Object.fromEntries(Object.entries(EMOJI_ICONS).map(([e, n]) => [n, e]));

app.use((req, res, next) => {
  res.locals.settings = loadSettings();
  res.locals.categories = all('SELECT * FROM categories ORDER BY sort, name');
  res.locals.flash = req.session.flash || [];
  res.locals.baseUrl = process.env.SITE_URL || res.locals.settings.site_url || `http://localhost:${PORT}`;
  const render = res.render;
  res.render = function (view, options, callback) {
    delete req.session.flash;
    return render.call(this, view, options, callback);
  };
  res.locals.money = (v) => {
    const n = Number(v) || 0;
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };
  res.locals.path = req.path;
  res.locals.date = require('./lib/app-view').date;
  res.locals.query = req.query;
  res.locals.initials = (name) => String(name || 'U').trim().split(/\s+/).slice(0, 2).map(n => n[0]).join('').toUpperCase();
  res.locals.icon = (name) => {
    const raw = name === undefined || name === null ? '' : String(name);
    const svg = ICONS[raw] || ICONS[EMOJI_ICONS[raw] || ''];
    if (svg) return `<span class="mic-ic">${svg}</span>`;
    return `<span class="mic-ic">${raw.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]))}</span>`;
  };
  res.locals.iconLabel = (name) => {
    const raw = name === undefined || name === null ? '' : String(name);
    if (EMOJI_ICONS[raw] || !ICONS[raw]) return raw;
    return EMOJI_BY_NAME[raw] || raw;
  };
  res.locals.stars = (n) => {
    const rating = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
    return '★'.repeat(rating) + '☆'.repeat(5 - rating);
  };
  res.locals.orderStatus = {
    pending_payment: { label: 'Aguardando pagamento', color: '#e3c983' },
    awaiting_confirm: { label: 'Pagamento em confirmação', color: '#8cc6e6' },
    paid: { label: 'Pago · aguardando início', color: '#a4b6c9' },
    in_progress: { label: 'Em andamento', color: '#b6a9e6' },
    delivered: { label: 'Entregue · aguardando confirmação', color: '#d9b65f' },
    completed: { label: 'Concluído', color: '#86d9ac' },
    cancelled: { label: 'Cancelado', color: '#eda2b1' },
    refunded: { label: 'Reembolsado', color: '#eda2b1' },
  };
  res.locals.quoteStatus = {
    pending: { label: 'Aguardando orçamento', color: '#e3c983' },
    reviewed: { label: 'Em análise', color: '#8cc6e6' },
    approved: { label: 'Orçamento recebido', color: '#86d9ac' },
    cancelled: { label: 'Cancelado', color: '#eda2b1' },
    rejected: { label: 'Recusado', color: '#eda2b1' },
    done: { label: 'Concluído', color: '#b6a9e6' },
  };
  next();
});

app.use('/', require('./routes/experience'));
app.use('/', require('./routes/public'));
app.use('/', require('./routes/auth'));
app.use('/', require('./routes/client'));
app.use('/', require('./routes/seller'));
app.use('/', require('./routes/admin'));

app.use((req, res) => {
  res.status(404).render('erro', { code: 404, title: 'Página não encontrada', message: 'O endereço que você procura não existe ou foi movido.' });
});

app.use((err, req, res, _next) => {
  if (err && err.message === 'Formato de imagem inválido.') {
    req.session.flash = [{ type: 'error', text: err.message }];
    return res.redirect(req.path === '/orcamento' ? '/orcamento' : '/painel');
  }
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    req.session.flash = [{ type: 'error', text: 'Imagem muito grande. Máximo de 4MB.' }];
    return res.redirect(req.path === '/orcamento' ? '/orcamento' : '/painel');
  }
  console.error(err);
  res.status(500).render('erro', { code: 500, title: 'Erro interno', message: 'Algo deu errado no servidor. Tente novamente em instantes.' });
});

async function startServer() {
  await seed();
  const server = app.listen(PORT, () => {
    console.log(`${loadSettings().site_name} rodando em http://localhost:${PORT}`);
    console.log('   Mantenha este terminal aberto. Para parar, aperte Ctrl+C.');
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n[ERRO] A porta ${PORT} já está em uso por outro programa.`);
      console.error('Opções:');
      console.error('  1) Feche o outro terminal que está rodando o site;');
      console.error(`  2) Ou rode em outra porta:  $env:PORT=3001; npm start\n`);
      process.exit(1);
    }
    console.error(err);
    process.exit(1);
  });
  return server;
}

if (require.main === module) {
  startServer().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { app, upload, startServer, loadSettings };

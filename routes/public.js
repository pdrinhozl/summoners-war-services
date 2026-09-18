const express = require('express');
const { get, all, run } = require('../db/db');
const router = express.Router();

router.get('/', (req, res) => {
  const base = `SELECT s.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
                FROM services s JOIN categories c ON c.id = s.category_id`;
  const featured = all(`${base} WHERE s.status = 'approved' AND s.featured = 1 ORDER BY s.approved_at DESC LIMIT 6`);
  const latest = all(`${base} WHERE s.status = 'approved' ORDER BY s.approved_at DESC LIMIT 6`);
  const catStats = all(
    `SELECT c.id, c.name, c.slug, c.icon, c.color, COUNT(s.id) AS total
     FROM categories c LEFT JOIN services s ON s.category_id = c.id AND s.status = 'approved'
     GROUP BY c.id ORDER BY c.sort, c.name`
  );
  const sellerCount = get("SELECT COUNT(*) AS n FROM users WHERE role = 'seller' AND seller_status = 'verified'").n;
  const quoteCount = get('SELECT COUNT(*) AS n FROM quotes').n;
  res.render('index', { featured, latest, catStats, sellerCount, quoteCount, _categories: all('SELECT id, name FROM categories') });
});

router.get('/services', (req, res) => {
  const { cat, q, sort } = req.query;
  const params = [];
  let where = "s.status = 'approved'";
  if (cat && cat !== 'all') {
    where += ' AND c.slug = ?';
    params.push(cat);
  }
  if (q) {
    where += ' AND (s.title LIKE ? OR s.short LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }
  const order = sort === 'price_asc' ? 's.price_from ASC' : sort === 'price_desc' ? 's.price_from DESC' : 's.featured DESC, s.approved_at DESC';
  const services = all(
    `SELECT s.*, c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon, c.color AS category_color, u.name AS seller_name
     FROM services s JOIN categories c ON c.id = s.category_id JOIN users u ON u.id = COALESCE(s.seller_id, (SELECT id FROM users WHERE role = 'admin' LIMIT 1))
     WHERE ${where} ORDER BY ${order}`,
    params
  );
  const activeCat = cat || 'all';
  const counts = {};
  for (const c of res.locals.categories) {
    counts[c.slug] = all("SELECT COUNT(*) AS n FROM services s JOIN categories c2 ON c2.id = s.category_id WHERE s.status = 'approved' AND c2.slug = ?", [c.slug])[0].n;
  }
  res.render('services', { services, activeCat, q: q || '', sort: sort || 'newest', counts });
});

router.get('/services/:slug', (req, res) => {
  const service = get(
    `SELECT s.*, c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon, c.color AS category_color,
            u.name AS seller_name, u.seller_status AS seller_status
     FROM services s JOIN categories c ON c.id = s.category_id
     JOIN users u ON u.id = COALESCE(s.seller_id, (SELECT id FROM users WHERE role = 'admin' LIMIT 1))
     WHERE s.slug = ? AND s.status = 'approved'`,
    [req.params.slug]
  );
  if (!service) return res.status(404).render('erro', { code: 404, title: 'Serviço não encontrado', message: 'Este serviço não existe ou não está mais disponível.' });
  let includes = [];
  try { includes = JSON.parse(service.includes || '[]'); } catch (_e) { includes = []; }
  const related = all(
    `SELECT * FROM services WHERE category_id = ? AND id != ? AND status = 'approved' LIMIT 3`,
    [service.category_id, service.id]
  );
  res.render('service', { service, includes, related });
});

router.get('/orcamento', (req, res) => {
  const categories = all('SELECT id, name FROM categories ORDER BY sort, name');
  const services = all("SELECT id, title FROM services WHERE status = 'approved' ORDER BY title");
  const preselect = req.query.service ? Number(req.query.service) : (req.query.slug ? (get('SELECT id FROM services WHERE slug = ?', [req.query.slug]) || {}).id : null);
  res.render('orcamento', { categories, services, preselect: preselect || null, values: {} });
});

router.post('/orcamento', (req, res) => {
  const b = req.body || {};
  const str = (v) => (v === undefined || v === null ? '' : String(v));
  const service_id = b.service_id ? Number(b.service_id) : null;
  const client_name = str(b.client_name).trim();
  const client_whatsapp = str(b.client_whatsapp).trim();
  const user = res.locals.user;

  if (!client_name || !client_whatsapp) {
    req.session.flash = [{ type: 'error', text: 'Preencha pelo menos nome e WhatsApp para receber seu orçamento.' }];
    return res.redirect('/orcamento');
  }
  const result = run(
    `INSERT INTO quotes (client_id, service_id, client_name, client_email, client_whatsapp, game_name, game_level, game_rank, game_boxes, message, account_ready)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [user ? user.id : null, service_id, client_name, str(b.client_email), client_whatsapp, str(b.game_name), str(b.game_level), str(b.game_rank), str(b.game_boxes), str(b.message), b.account_ready ? 1 : 0]
  );
  const id = Number(result.lastInsertRowid);
  req.session.flash = [{ type: 'success', text: 'Orçamento enviado com sucesso! Nossa equipe irá analisar e retornar por e-mail/WhatsApp.' }];
  res.redirect(`/orcamento/sucesso/${id}`);
});

router.get('/orcamento/sucesso/:id', (req, res) => {
  const quote = get('SELECT * FROM quotes WHERE id = ?', [req.params.id]);
  if (!quote) return res.redirect('/orcamento');
  res.render('orcamento-sucesso', { quote });
});

router.get('/como-funciona', (req, res) => {
  res.render('como-funciona');
});

router.get('/seja-um-vendedor', (req, res) => {
  res.render('seja-vendedor');
});

router.get('/termos', (req, res) => {
  res.render('termos');
});

router.get('/privacidade', (req, res) => {
  res.render('privacidade');
});

router.get('/robots.txt', (req, res) => {
  const base = res.locals.baseUrl;
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /vendedor\nDisallow: /cliente\nDisallow: /login\nDisallow: /registro\nSitemap: ${base}/sitemap.xml\n`);
});

router.get('/sitemap.xml', (req, res) => {
  const base = res.locals.baseUrl;
  const now = new Date().toISOString().slice(0, 10);
  const urls = ['', '/services', '/como-funciona', '/seja-um-vendedor', '/orcamento', '/termos', '/privacidade'];
  const services = all("SELECT slug, created_at FROM services WHERE status = 'approved'");
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  for (const u of urls) {
    xml += `  <url><loc>${base}${u}</loc><lastmod>${now}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>\n`;
  }
  for (const sv of services) {
    const lastmod = sv.created_at ? sv.created_at.slice(0, 10) : now;
    xml += `  <url><loc>${base}/services/${sv.slug}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>\n`;
  }
  xml += '</urlset>';
  res.type('application/xml').send(xml);
});

module.exports = router;
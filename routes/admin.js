const express = require('express');
const qrcode = require('qrcode');
const { get, all, run, uniqueSlug, slugify } = require('../db/db');
const { requireRole } = require('../middleware');
const upload = require('../lib/upload');
const orders = require('../lib/orders');
const totp = require('../lib/totp');
const router = express.Router();

function flash(req, type, text) {
  req.session.flash = req.session.flash || [];
  req.session.flash.push({ type, text });
}

router.use(requireRole('admin'));

router.get('/admin', (req, res) => {
  const stats = {
    services: get("SELECT COUNT(*) AS n FROM services WHERE status = 'approved'").n,
    pendingServices: get("SELECT COUNT(*) AS n FROM services WHERE status = 'pending' AND seller_id IS NOT NULL").n,
    quotes: get('SELECT COUNT(*) AS n FROM quotes').n,
    pendingQuotes: get("SELECT COUNT(*) AS n FROM quotes WHERE status = 'pending'").n,
    sellers: get("SELECT COUNT(*) AS n FROM users WHERE role = 'seller'").n,
    pendingSellers: get("SELECT COUNT(*) AS n FROM users WHERE role = 'seller' AND seller_status = 'pending'").n,
    clients: get("SELECT COUNT(*) AS n FROM users WHERE role = 'client'").n,
    revenue: get("SELECT COALESCE(SUM(price), 0) AS n FROM orders WHERE status = 'completed'").n,
    orders: get("SELECT COUNT(*) AS n FROM orders WHERE status IN ('pending_payment','awaiting_confirm','paid','in_progress','delivered')").n,
    payoutsPending: get("SELECT COALESCE(SUM(amount), 0) AS n FROM payouts WHERE status = 'pending'").n,
    commission: get("SELECT COALESCE(SUM(price - seller_amount), 0) AS n FROM orders WHERE status = 'completed'").n,
  };
  const recentQuotes = all('SELECT * FROM quotes ORDER BY created_at DESC LIMIT 8');
  const recentServices = all('SELECT s.*, c.name AS category_name FROM services s JOIN categories c ON c.id = s.category_id ORDER BY s.created_at DESC LIMIT 8');
  const recentSellers = all("SELECT * FROM users WHERE role = 'seller' ORDER BY created_at DESC LIMIT 6");
  const recentOrders = all('SELECT * FROM orders ORDER BY created_at DESC LIMIT 8');
  res.render('admin/dashboard', { stats, recentQuotes, recentServices, recentSellers, recentOrders });
});

// ---------- Services ----------
router.get('/admin/servicos', (req, res) => {
  const filter = req.query.status || 'all';
  const params = [];
  let where = '1=1';
  if (['pending', 'approved', 'rejected'].includes(filter)) {
    where = 's.status = ?';
    params.push(filter);
  }
  const services = all(
    `SELECT s.*, c.name AS category_name, c.icon AS category_icon, u.name AS owner_name
     FROM services s JOIN categories c ON c.id = s.category_id
     LEFT JOIN users u ON u.id = s.seller_id
     WHERE ${where} ORDER BY s.created_at DESC`,
    params
  );
  res.render('admin/servicos', { services, filter });
});

router.get('/admin/servicos/novo', (req, res) => {
  res.render('admin/servico-form', { service: null, formTitle: 'Novo serviço', categories: res.locals.categories });
});

router.post('/admin/servicos/novo', upload.single('image'), (req, res) => {
  const title = (req.body.title || '').trim();
  if (!title || !req.body.category_id) {
    flash(req, 'error', 'Preencha título e categoria.');
    return res.redirect('/admin/servicos/novo');
  }
  const image = req.file ? '/uploads/' + req.file.filename : req.body.image || '/img/default-service.png';
  const result = run(
    `INSERT INTO services
     (seller_id, category_id, title, slug, short, description, price_from, price_to, delivery_min, delivery_max, image, status, featured, includes, requirements, approved_at)
     VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      Number(req.body.category_id), title, uniqueSlug(title),
      req.body.short || '', req.body.description || '',
      Number(req.body.price_from || 0), Number(req.body.price_to || (req.body.price_from || 0)),
      Number(req.body.delivery_min || 1), Number(req.body.delivery_max || 1),
      image, 'approved',
      req.body.featured ? 1 : 0,
      JSON.stringify((req.body.includes || '').split('\n').map((x) => x.trim()).filter(Boolean)),
      req.body.requirements || '',
    ]
  );
  flash(req, 'success', 'Serviço publicado com sucesso!');
  res.redirect('/admin/servicos/' + result.lastInsertRowid);
});

router.get('/admin/servicos/:id', (req, res) => {
  const service = get('SELECT * FROM services WHERE id = ?', [req.params.id]);
  if (!service) return res.redirect('/admin/servicos');
  let includes = '';
  try { includes = (JSON.parse(service.includes || '[]') || []).join('\n'); } catch (_e) { includes = ''; }
  service.editIncludes = includes;
  res.render('admin/servico-form', { service, formTitle: 'Editar serviço', categories: res.locals.categories });
});

router.post('/admin/servicos/:id', upload.single('image'), (req, res) => {
  const service = get('SELECT * FROM services WHERE id = ?', [req.params.id]);
  if (!service) return res.redirect('/admin/servicos');
  const image = req.file ? '/uploads/' + req.file.filename : req.body.image || service.image;
  run(
    `UPDATE services SET category_id = ?, title = ?, short = ?, description = ?, price_from = ?, price_to = ?,
     delivery_min = ?, delivery_max = ?, image = ?, featured = ?, includes = ?, requirements = ?,
     status = ?, approved_at = CASE WHEN ? = 'approved' THEN COALESCE(approved_at, datetime('now')) ELSE approved_at END
     WHERE id = ?`,
    [
      Number(req.body.category_id || service.category_id),
      (req.body.title || service.title).trim(),
      req.body.short !== undefined ? req.body.short : service.short,
      req.body.description !== undefined ? req.body.description : service.description,
      Number(req.body.price_from ?? service.price_from),
      Number(req.body.price_to ?? (req.body.price_from ?? service.price_from)),
      Number(req.body.delivery_min || service.delivery_min),
      Number(req.body.delivery_max || service.delivery_max),
      image,
      req.body.featured ? 1 : 0,
      JSON.stringify((req.body.includes || '').split('\n').map((x) => x.trim()).filter(Boolean)),
      req.body.requirements !== undefined ? req.body.requirements : service.requirements,
      req.body.status || service.status,
      req.body.status || service.status,
      req.params.id,
    ]
  );
  flash(req, 'success', 'Serviço atualizado com sucesso.');
  res.redirect('/admin/servicos/' + service.id);
});

router.post('/admin/servicos/:id/status', (req, res) => {
  const service = get('SELECT * FROM services WHERE id = ?', [req.params.id]);
  if (!service) return res.redirect('/admin/servicos');
  const status = req.body.status;
  if (!['pending', 'approved', 'rejected'].includes(status)) return res.redirect('/admin/servicos');
  run(
    `UPDATE services SET status = ?, approval_note = ?, approved_at = CASE WHEN ? = 'approved' THEN datetime('now') ELSE approved_at END WHERE id = ?`,
    [status, req.body.note || '', status, service.id]
  );
  flash(req, 'success', status === 'approved' ? 'Serviço aprovado e publicado.' : 'Status do serviço atualizado.');
  res.redirect(req.body.return || '/admin/servicos');
});

router.post('/admin/servicos/:id/excluir', (req, res) => {
  run('DELETE FROM services WHERE id = ?', [req.params.id]);
  run('UPDATE quotes SET service_id = NULL WHERE service_id = ?', [req.params.id]);
  flash(req, 'success', 'Serviço excluído.');
  res.redirect('/admin/servicos');
});

// ---------- Submissions (seller services) ----------
router.get('/admin/submissoes', (req, res) => {
  const submissions = all(
    `SELECT s.*, u.name AS owner_name, u.email AS owner_email, c.name AS category_name
     FROM services s JOIN users u ON u.id = s.seller_id JOIN categories c ON c.id = s.category_id
     WHERE s.seller_id IS NOT NULL AND s.status = 'pending'
     ORDER BY s.created_at DESC`
  );
  res.render('admin/submissoes', { submissions });
});

router.post('/admin/submissoes/:id/aprovar', (req, res) => {
  run("UPDATE services SET status = 'approved', approved_at = datetime('now') WHERE id = ? AND seller_id IS NOT NULL", [req.params.id]);
  const s = get('SELECT seller_id FROM services WHERE id = ?', [req.params.id]);
  if (s && s.seller_id) orders.notify(s.seller_id, 'Seu serviço foi aprovado e publicado!', '/vendedor/painel');
  flash(req, 'success', 'Submissão aprovada e publicada.');
  res.redirect('/admin/submissoes');
});

router.post('/admin/submissoes/:id/rejeitar', (req, res) => {
  run("UPDATE services SET status = 'rejected' WHERE id = ? AND seller_id IS NOT NULL", [req.params.id]);
  const s = get('SELECT seller_id FROM services WHERE id = ?', [req.params.id]);
  if (s && s.seller_id) orders.notify(s.seller_id, 'Seu serviço foi recusado. Veja o motivo no painel.', '/vendedor/painel');
  flash(req, 'success', 'Submissão recusada. O vendedor foi notificado no painel.');
  res.redirect('/admin/submissoes');
});

// ---------- Quotes ----------
router.get('/admin/orcamentos', (req, res) => {
  const filter = req.query.status || 'all';
  const params = [];
  let where = '1=1';
  if (['pending', 'reviewed', 'approved', 'rejected', 'done'].includes(filter)) {
    where = 'q.status = ?';
    params.push(filter);
  }
  const quotes = all(
    `SELECT q.*, s.title AS service_title, u.name AS user_name
     FROM quotes q LEFT JOIN services s ON s.id = q.service_id LEFT JOIN users u ON u.id = q.client_id
     WHERE ${where} ORDER BY q.created_at DESC`,
    params
  );
  res.render('admin/orcamentos', { quotes, filter });
});

router.get('/admin/orcamentos/:id', (req, res) => {
  const quote = get(
    `SELECT q.*, s.title AS service_title, u.name AS user_name
     FROM quotes q LEFT JOIN services s ON s.id = q.service_id LEFT JOIN users u ON u.id = q.client_id
     WHERE q.id = ?`,
    [req.params.id]
  );
  if (!quote) return res.redirect('/admin/orcamentos');
  res.render('admin/orcamento-detalhe', { quote });
});

router.post('/admin/orcamentos/:id', (req, res) => {
  const quote = get('SELECT * FROM quotes WHERE id = ?', [req.params.id]);
  if (!quote) return res.redirect('/admin/orcamentos');
  const oldStatus = quote.status;
  const status = ['pending', 'reviewed', 'approved', 'rejected', 'done'].includes(req.body.status) ? req.body.status : quote.status;
  run(
    `UPDATE quotes SET status = ?, admin_note = ?, offer_price = ?, updated_at = datetime('now'), reviewed_by = 'admin' WHERE id = ?`,
    [status, req.body.admin_note || '', req.body.offer_price ? Number(req.body.offer_price) : null, quote.id]
  );
  if (status !== oldStatus && quote.client_id) {
    if (status === 'approved') {
      orders.notify(quote.client_id, 'Seu orçamento foi aprovado! Você já pode gerar o pedido.', '/cliente/painel');
    } else if (status === 'rejected') {
      orders.notify(quote.client_id, 'Seu orçamento foi recusado. Veja o motivo no painel.', '/cliente/painel');
    }
  }
  flash(req, 'success', 'Orçamento atualizado.');
  res.redirect('/admin/orcamentos/' + quote.id);
});

router.post('/admin/orcamentos/:id/excluir', (req, res) => {
  run('DELETE FROM quotes WHERE id = ?', [req.params.id]);
  flash(req, 'success', 'Orçamento excluído.');
  res.redirect('/admin/orcamentos');
});

// ---------- Pedidos ----------
router.get('/admin/pedidos', (req, res) => {
  const filter = req.query.status || 'all';
  const params = [];
  let where = '1=1';
  if (['pending_payment', 'awaiting_confirm', 'paid', 'in_progress', 'delivered', 'completed', 'cancelled', 'refunded'].includes(filter)) {
    where = 'o.status = ?';
    params.push(filter);
  }
  const pedidos = all(
    `SELECT o.*, q.client_name, u.name AS seller_name, s.title AS service_title
     FROM orders o
     LEFT JOIN quotes q ON q.id = o.quote_id
     LEFT JOIN users u ON u.id = o.seller_id
     LEFT JOIN services s ON s.id = o.service_id
     WHERE ${where} ORDER BY o.created_at DESC`,
    params
  );
  res.render('admin/pedidos', { pedidos, filter });
});

function loadAdminOrder(id) {
  return get(
    `SELECT o.*, q.client_name, q.client_email, q.client_whatsapp, q.game_name, q.game_rank, q.game_boxes, q.message,
            u.name AS seller_name, u.email AS seller_email, s.title AS service_title
     FROM orders o
     LEFT JOIN quotes q ON q.id = o.quote_id
     LEFT JOIN users u ON u.id = o.seller_id
     LEFT JOIN services s ON s.id = o.service_id
     WHERE o.id = ?`,
    [id]
  );
}

router.get('/admin/pedidos/:id', (req, res) => {
  const order = loadAdminOrder(req.params.id);
  if (!order) return res.redirect('/admin/pedidos');
  run('UPDATE order_messages SET read_by_admin = 1 WHERE order_id = ?', [order.id]);
  const messages = all('SELECT * FROM order_messages WHERE order_id = ? ORDER BY created_at ASC', [order.id]);
  const review = get('SELECT * FROM reviews WHERE order_id = ?', [order.id]);
  res.render('admin/pedido-detalhe', { order, messages, review });
});

router.post('/admin/pedidos/:id/status', (req, res) => {
  const order = get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  if (!order) return res.redirect('/admin/pedidos');
  const valid = ['pending_payment', 'awaiting_confirm', 'paid', 'in_progress', 'delivered', 'completed', 'cancelled', 'refunded'];
  if (!valid.includes(req.body.status)) {
    flash(req, 'error', 'Status inválido.');
    return res.redirect('/admin/pedidos/' + order.id);
  }
  const newStatus = req.body.status;
  const updates = { status: newStatus };
  if (newStatus === 'paid') updates.paid_at = "datetime('now')";
  if (newStatus === 'cancelled' || newStatus === 'refunded') updates.cancelled_at = "datetime('now')";
  const setter = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
  const values = Object.values(updates).concat([order.id]);
  run(`UPDATE orders SET ${setter} WHERE id = ?`, values);

  if (newStatus === 'paid') {
    if (order.client_id) orders.notify(order.client_id, `Pagamento do pedido #${order.id} confirmado! Vamos começar.`, `/cliente/pedidos/${order.id}`);
    if (order.seller_id) orders.notify(order.seller_id, `Pagamento do pedido #${order.id} confirmado.`, `/vendedor/pedidos/${order.id}`);
  } else if (newStatus === 'completed') {
    if (!order.completed_at) run("UPDATE orders SET completed_at = datetime('now') WHERE id = ?", [order.id]);
    if (order.quote_id) run("UPDATE quotes SET status = 'done' WHERE id = ?", [order.quote_id]);
  } else if (newStatus === 'cancelled' || newStatus === 'refunded') {
    if (order.client_id) orders.notify(order.client_id, `O pedido #${order.id} foi ${newStatus === 'refunded' ? 'reembolsado' : 'cancelado'} pela equipe.`, `/cliente/pedidos/${order.id}`);
    if (order.seller_id) orders.notify(order.seller_id, `O pedido #${order.id} foi ${newStatus === 'refunded' ? 'reembolsado' : 'cancelado'} pela administração.`, `/vendedor/pedidos/${order.id}`);
  }
  flash(req, 'success', 'Status do pedido atualizado.');
  res.redirect('/admin/pedidos/' + order.id);
});

router.post('/admin/pedidos/:id/mensagem', (req, res) => {
  const order = get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  if (!order) return res.redirect('/admin/pedidos');
  const body = String(req.body.message || '').trim().slice(0, 2000);
  if (!body) return res.redirect('/admin/pedidos/' + order.id);
  run("INSERT INTO order_messages (order_id, sender_id, sender_role, body, read_by_admin) VALUES (?, ?, 'admin', ?, 1)", [order.id, res.locals.user.id, body]);
  if (order.client_id) orders.notify(order.client_id, `A equipe respondeu no pedido #${order.id}.`, `/cliente/pedidos/${order.id}`);
  if (order.seller_id) orders.notify(order.seller_id, `A equipe respondeu no pedido #${order.id}.`, `/vendedor/pedidos/${order.id}`);
  flash(req, 'success', 'Mensagem enviada.');
  res.redirect('/admin/pedidos/' + order.id + '#chat');
});

// ---------- Pagamentos e saques ----------
router.get('/admin/pagamentos', (req, res) => {
  const payouts = all('SELECT p.*, u.name AS seller_name FROM payouts p JOIN users u ON u.id = p.seller_id ORDER BY CASE p.status WHEN \'pending\' THEN 0 ELSE 1 END, p.created_at DESC');
  const payments = all("SELECT * FROM orders WHERE status IN ('awaiting_confirm', 'paid') ORDER BY created_at DESC LIMIT 30");
  res.render('admin/pagamentos', { payouts, payments });
});

router.post('/admin/saques/:id/pagar', (req, res) => {
  const p = get('SELECT * FROM payouts WHERE id = ?', [req.params.id]);
  if (!p) return res.redirect('/admin/pagamentos');
  run("UPDATE payouts SET status = 'paid', paid_at = datetime('now') WHERE id = ?", [p.id]);
  orders.notify(p.seller_id, `Seu saque de R$ ${p.amount.toFixed(2).replace('.', ',')} foi processado!`, '/vendedor/ganhos');
  flash(req, 'success', 'Saque marcado como pago.');
  res.redirect('/admin/pagamentos');
});

router.post('/admin/saques/:id/cancelar', (req, res) => {
  const p = get('SELECT * FROM payouts WHERE id = ?', [req.params.id]);
  if (!p) return res.redirect('/admin/pagamentos');
  run("UPDATE payouts SET status = 'cancelled' WHERE id = ?", [p.id]);
  run('UPDATE users SET seller_balance = seller_balance + ? WHERE id = ?', [p.amount, p.seller_id]);
  orders.notify(p.seller_id, `Seu saque de R$ ${p.amount.toFixed(2).replace('.', ',')} foi cancelado e devolvido ao saldo.`, '/vendedor/ganhos');
  flash(req, 'success', 'Saque cancelado e valor devolvido ao saldo.');
  res.redirect('/admin/pagamentos');
});

// ---------- Avaliações ----------
router.get('/admin/avaliacoes', (req, res) => {
  const reviews = all(
    `SELECT r.*, u.name AS client_name, s.name AS seller_name
     FROM reviews r
     JOIN users u ON u.id = r.client_id
     LEFT JOIN users s ON s.id = r.seller_id
     ORDER BY r.created_at DESC`
  );
  res.render('admin/avaliacoes', { reviews });
});

router.post('/admin/avaliacoes/:id/excluir', (req, res) => {
  const review = get('SELECT * FROM reviews WHERE id = ?', [req.params.id]);
  if (!review) return res.redirect('/admin/avaliacoes');
  run('DELETE FROM reviews WHERE id = ?', [review.id]);
  if (review.seller_id) {
    const remaining = all('SELECT rating FROM reviews WHERE seller_id = ?', [review.seller_id]);
    const avg = remaining.length
      ? Math.round(remaining.reduce((a, r) => a + r.rating, 0) / remaining.length * 10) / 10
      : 0;
    run('UPDATE users SET seller_review_count = ?, seller_rating = ? WHERE id = ?', [remaining.length, avg, review.seller_id]);
  }
  flash(req, 'success', 'Avaliação removida.');
  res.redirect('/admin/avaliacoes');
});

// ---------- Sellers ----------
router.get('/admin/vendedores', (req, res) => {
  const sellers = all(
    `SELECT u.*, (SELECT COUNT(*) FROM services s WHERE s.seller_id = u.id) AS service_count
     FROM users u WHERE u.role = 'seller'
     ORDER BY CASE u.seller_status WHEN 'pending' THEN 0 WHEN 'verified' THEN 1 ELSE 2 END, u.created_at DESC`
  );
  const pendingSellers = sellers.filter((s) => s.seller_status === 'pending');
  res.render('admin/vendedores', { sellers, pendingSellers });
});

router.get('/admin/vendedores/:id', (req, res) => {
  const seller = get("SELECT * FROM users WHERE id = ? AND role = 'seller'", [req.params.id]);
  if (!seller) return res.redirect('/admin/vendedores');
  const services = all('SELECT * FROM services WHERE seller_id = ?', [seller.id]);
  const reviews = all('SELECT r.*, u.name AS client_name FROM reviews r JOIN users u ON u.id = r.client_id WHERE r.seller_id = ? ORDER BY r.created_at DESC', [seller.id]);
  const pedidos = all('SELECT * FROM orders WHERE seller_id = ? ORDER BY created_at DESC LIMIT 6', [seller.id]);
  res.render('admin/vendedor-detalhe', { seller, services, reviews, pedidos });
});

router.post('/admin/vendedores/:id/status', (req, res) => {
  const seller = get("SELECT * FROM users WHERE id = ? AND role = 'seller'", [req.params.id]);
  if (!seller) return res.redirect('/admin/vendedores');
  const status = ['pending', 'verified', 'rejected'].includes(req.body.status) ? req.body.status : seller.seller_status;
  run('UPDATE users SET seller_status = ? WHERE id = ?', [status, seller.id]);
  if (status === 'verified') {
    orders.notify(seller.id, 'Parabéns! Sua conta de vendedor foi verificada. Já pode publicar services.', '/vendedor/painel');
  } else if (status === 'rejected') {
    orders.notify(seller.id, 'Sua conta de vendedor foi recusada. Fale com a administração.', '/vendedor/perfil');
  }
  flash(req, 'success', status === 'verified'
    ? `Vendedor ${seller.name} verificado! Ele já pode publicar serviços.`
    : `Status do vendedor atualizado para "${status}".`);
  res.redirect('/admin/vendedores/' + seller.id);
});

// ---------- Categories ----------
router.post('/admin/categorias', (req, res) => {
  const { name, icon, color } = req.body;
  if (!name) { flash(req, 'error', 'Informe o nome da categoria.'); return res.redirect('/admin/servicos'); }
  run('INSERT INTO categories (name, slug, icon, color) VALUES (?, ?, ?, ?)', [name, slugify(name), icon || '🔮', color || '#7b5cff']);
  flash(req, 'success', 'Categoria criada.');
  res.redirect('/admin/servicos');
});

router.post('/admin/categorias/:id', (req, res) => {
  const { name, icon, color } = req.body;
  const c = get('SELECT * FROM categories WHERE id = ?', [req.params.id]);
  if (!c) return res.redirect('/admin/servicos');
  run('UPDATE categories SET name = ?, icon = ?, color = ? WHERE id = ?', [name || c.name, icon || c.icon, color || c.color, c.id]);
  flash(req, 'success', 'Categoria atualizada.');
  res.redirect('/admin/servicos');
});

router.post('/admin/categorias/:id/excluir', (req, res) => {
  const has = get('SELECT id FROM services WHERE category_id = ? LIMIT 1', [req.params.id]);
  if (has) { flash(req, 'error', 'Não é possível excluir categoria com serviços.'); return res.redirect('/admin/servicos'); }
  run('DELETE FROM categories WHERE id = ?', [req.params.id]);
  flash(req, 'success', 'Categoria excluída.');
  res.redirect('/admin/servicos');
});

// ---------- Users / Clients ----------
router.get('/admin/clientes', (req, res) => {
  const q = req.query.q || '';
  let clients;
  if (q) {
    clients = all("SELECT * FROM users WHERE role = 'client' AND (name LIKE ? OR email LIKE ?) ORDER BY created_at DESC", [`%${q}%`, `%${q}%`]);
  } else {
    clients = all("SELECT * FROM users WHERE role = 'client' ORDER BY created_at DESC");
  }
  res.render('admin/clientes', { clients, q });
});

router.post('/admin/usuarios/:id/toggle', (req, res) => {
  const u = get('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!u) return res.redirect('/admin/clientes');
  if (u.role === 'admin') { flash(req, 'error', 'Não é possível desativar administradores.'); return res.redirect('/admin/clientes'); }
  run('UPDATE users SET active = ? WHERE id = ?', [u.active ? 0 : 1, u.id]);
  flash(req, 'success', u.active ? 'Usuário desativado.' : 'Usuário reativado.');
  res.redirect('/admin/clientes');
});

router.post('/admin/usuarios/:id/excluir', (req, res) => {
  const u = get('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!u) return res.redirect('/admin/clientes');
  if (u.role === 'admin') { flash(req, 'error', 'Não é possível excluir administradores.'); return res.redirect('/admin/clientes'); }
  run('UPDATE orders SET status = \'cancelled\' WHERE client_id = ? AND status IN (\'pending_payment\',\'awaiting_confirm\',\'paid\')', [u.id]);
  run('UPDATE quotes SET client_id = NULL WHERE client_id = ?', [u.id]);
  run('DELETE FROM users WHERE id = ?', [u.id]);
  flash(req, 'success', 'Usuário removido.');
  res.redirect('/admin/clientes');
});

// ---------- Settings ----------
router.get('/admin/config', (req, res) => {
  const s = {};
  for (const r of all('SELECT key, value FROM settings')) s[r.key] = r.value;
  res.render('admin/config', { s });
});

router.post('/admin/config', (req, res) => {
  const fields = Object.keys(req.body);
  for (const k of fields) {
    run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [k, String(req.body[k])]);
  }
  flash(req, 'success', 'Configurações salvas.');
  res.redirect('/admin/config');
});

// ---------- Segurança / 2FA ----------
router.get('/admin/seguranca', async (req, res) => {
  const admin = res.locals.user;
  let qr = null;
  let pendingSecret = null;
  if (!admin.twofa_enabled) {
    pendingSecret = req.session.pending2faSecret || totp.generateSecret();
    req.session.pending2faSecret = pendingSecret;
    const uri = totp.otpauthUri(pendingSecret, admin.email);
    try { qr = await qrcode.toDataURL(uri); } catch (_e) { qr = null; }
  }
  res.render('admin/seguranca', { pendingSecret, qr });
});

router.post('/admin/seguranca/habilitar', (req, res) => {
  const admin = res.locals.user;
  const secret = req.session.pending2faSecret;
  if (!secret) {
    flash(req, 'error', 'Gere um novo código QR primeiro.');
    return res.redirect('/admin/seguranca');
  }
  if (!totp.verify(secret, req.body.code)) {
    flash(req, 'error', 'Código inválido. Confira o número exibido no autenticador.');
    return res.redirect('/admin/seguranca');
  }
  run('UPDATE users SET twofa_secret = ?, twofa_enabled = 1 WHERE id = ?', [secret, admin.id]);
  delete req.session.pending2faSecret;
  flash(req, 'success', 'Verificação em duas etapas ativada! Você precisará do código do autenticador no próximo login.');
  res.redirect('/admin/seguranca');
});

router.post('/admin/seguranca/desabilitar', (req, res) => {
  const admin = res.locals.user;
  if (!admin.twofa_enabled || !totp.verify(admin.twofa_secret, req.body.code)) {
    flash(req, 'error', 'Código inválido para desativar.');
    return res.redirect('/admin/seguranca');
  }
  run("UPDATE users SET twofa_secret = '', twofa_enabled = 0 WHERE id = ?", [admin.id]);
  flash(req, 'success', 'Verificação em duas etapas desativada.');
  res.redirect('/admin/seguranca');
});

module.exports = router;
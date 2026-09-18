const express = require('express');
const { get, all, run, uniqueSlug } = require('../db/db');
const { requireVerifiedSeller, requireApprovedSeller } = require('../middleware');
const upload = require('../lib/upload');
const orders = require('../lib/orders');
const router = express.Router();

function flash(req, type, text) {
  req.session.flash = req.session.flash || [];
  req.session.flash.push({ type, text });
}

function canManageService(user, service) {
  if (user.role === 'admin') return true;
  return service.seller_id === user.id;
}

router.get('/vendedor/painel', requireVerifiedSeller, (req, res) => {
  const u = res.locals.user;
  const services = all('SELECT s.*, c.name AS category_name FROM services s LEFT JOIN categories c ON c.id = s.category_id WHERE s.seller_id = ? ORDER BY s.created_at DESC', [u.id]);
  const stats = {
    total: services.length,
    approved: services.filter((s) => s.status === 'approved').length,
    pending: services.filter((s) => s.status === 'pending').length,
    rejected: services.filter((s) => s.status === 'rejected').length,
    orders: get("SELECT COUNT(*) AS n FROM orders WHERE seller_id = ? AND status IN ('pending_payment','awaiting_confirm','paid','in_progress','delivered')", [u.id]).n,
  };
  const pedidos = all('SELECT * FROM orders WHERE seller_id = ? ORDER BY created_at DESC LIMIT 5', [u.id]);
  res.render('seller/painel', { services, stats, pedidos, seller: u });
});

router.get('/vendedor/perfil', requireVerifiedSeller, (req, res) => {
  res.render('seller/perfil', { seller: res.locals.user });
});

router.post('/vendedor/perfil', requireVerifiedSeller, (req, res) => {
  const { name, seller_about, seller_contact, email } = req.body;
  run('UPDATE users SET name = ?, seller_about = ?, seller_contact = ?, email = ? WHERE id = ?', [name, seller_about, seller_contact, email, res.locals.user.id]);
  flash(req, 'success', 'Perfil atualizado com sucesso.');
  res.redirect('/vendedor/perfil');
});

router.get('/vendedor/servicos/novo', requireApprovedSeller, (req, res) => {
  res.render('seller/servico-form', { service: null, formTitle: 'Novo serviço', categories: res.locals.categories });
});

router.post('/vendedor/servicos/novo', requireApprovedSeller, upload.single('image'), (req, res) => {
  const s = res.locals.user;
  const oculto = (r, field, fallback) => {
    const v = r.body[field];
    return v === undefined || v === null || v === '' ? fallback : v;
  };

  const title = (req.body.title || '').trim();
  if (!title || !req.body.category_id) {
    flash(req, 'error', 'Preencha pelo menos o título e a categoria.');
    return res.redirect('/vendedor/servicos/novo');
  }
  const image = req.file ? '/uploads/' + req.file.filename : req.body.image || '/img/default-service.png';
  const slug = 'sel-' + uniqueSlug(title);
  run(
    `INSERT INTO services
     (seller_id, category_id, title, slug, short, description, price_from, price_to, delivery_min, delivery_max, image, status, featured, includes, requirements)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
    [
      s.id, Number(req.body.category_id), title, slug,
      oculto(req, 'short', ''),
      oculto(req, 'description', ''),
      Number(req.body.price_from || 0),
      Number(req.body.price_to || (req.body.price_from || 0)),
      Number(req.body.delivery_min || 1),
      Number(req.body.delivery_max || 1),
      image,
      JSON.stringify((req.body.includes || '').split('\n').map((x) => x.trim()).filter(Boolean)),
      oculto(req, 'requirements', ''),
    ]
  );
  flash(req, 'success', 'Serviço enviado para aprovação! Ele ficará visível depois que a administração aprovar.');
  res.redirect('/vendedor/painel');
});

router.get('/vendedor/servicos/:id/editar', requireApprovedSeller, (req, res) => {
  const service = get('SELECT * FROM services WHERE id = ?', [req.params.id]);
  if (!service || !canManageService(res.locals.user, service)) return res.redirect('/vendedor/painel');
  let includes = '';
  try { includes = (JSON.parse(service.includes || '[]') || []).join('\n'); } catch (_e) { includes = ''; }
  res.render('seller/servico-form', { service, editIncludes: includes, formTitle: 'Editar serviço', categories: res.locals.categories });
});

router.post('/vendedor/servicos/:id', requireApprovedSeller, upload.single('image'), (req, res) => {
  const service = get('SELECT * FROM services WHERE id = ?', [req.params.id]);
  if (!service || !canManageService(res.locals.user, service)) return res.redirect('/vendedor/painel');
  const image = req.file ? '/uploads/' + req.file.filename : req.body.image || service.image;
  run(
    `UPDATE services SET category_id = ?, title = ?, short = ?, description = ?, price_from = ?, price_to = ?,
     delivery_min = ?, delivery_max = ?, image = ?, includes = ?, requirements = ?,
     status = CASE WHEN ? = 1 THEN 'pending' ELSE status END
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
      JSON.stringify((req.body.includes || '').split('\n').map((x) => x.trim()).filter(Boolean)),
      req.body.requirements !== undefined ? req.body.requirements : service.requirements,
      res.locals.user.role === 'seller' && service.status === 'approved' ? 1 : 0,
      req.params.id,
    ]
  );
  flash(req, 'success', 'Serviço atualizado. ' + (res.locals.user.role === 'seller' && service.status === 'approved' ? 'Como já estava ativo, ele voltou para análise.' : ''));
  res.redirect('/vendedor/painel');
});

router.post('/vendedor/servicos/:id/excluir', requireApprovedSeller, (req, res) => {
  const service = get('SELECT * FROM services WHERE id = ?', [req.params.id]);
  if (service && canManageService(res.locals.user, service)) {
    run('DELETE FROM services WHERE id = ?', [service.id]);
    flash(req, 'success', 'Serviço removido.');
  }
  res.redirect('/vendedor/painel');
});

router.get('/vendedor/orcamentos', requireApprovedSeller, (req, res) => {
  const u = res.locals.user;
  const quotes = all(
    `SELECT q.*, s.title AS service_title FROM quotes q LEFT JOIN services s ON s.id = q.service_id
     WHERE s.seller_id = ? ORDER BY q.created_at DESC`,
    [u.id]
  );
  res.render('seller/orcamentos', { quotes });
});

// ---------- Pedidos do vendedor ----------
function loadSellerOrder(user, id) {
  return get(
    `SELECT o.*, q.client_name, q.client_whatsapp, q.game_name, q.game_rank, q.game_boxes, q.message,
            s.title AS service_title
     FROM orders o
     LEFT JOIN quotes q ON q.id = o.quote_id
     LEFT JOIN services s ON s.id = o.service_id
     WHERE o.id = ? AND o.seller_id = ?`,
    [id, user.id]
  );
}

router.get('/vendedor/pedidos', requireApprovedSeller, (req, res) => {
  const u = res.locals.user;
  const pedidos = all('SELECT * FROM orders WHERE seller_id = ? ORDER BY created_at DESC', [u.id]);
  const totals = {
    active: pedidos.filter((o) => ['pending_payment', 'awaiting_confirm', 'paid', 'in_progress', 'delivered'].includes(o.status)).length,
    completed: pedidos.filter((o) => o.status === 'completed').length,
    total: pedidos.length,
  };
  res.render('seller/pedidos', { pedidos, totals });
});

router.get('/vendedor/pedidos/:id', requireApprovedSeller, (req, res) => {
  const u = res.locals.user;
  const order = loadSellerOrder(u, req.params.id);
  if (!order) {
    flash(req, 'error', 'Pedido não encontrado.');
    return res.redirect('/vendedor/pedidos');
  }
  run('UPDATE order_messages SET read_by_seller = 1 WHERE order_id = ?', [order.id]);
  const messages = all('SELECT * FROM order_messages WHERE order_id = ? ORDER BY created_at ASC', [order.id]);
  const review = get('SELECT * FROM reviews WHERE order_id = ?', [order.id]);
  res.render('seller/pedido-detalhe', { order, messages, review });
});

router.post('/vendedor/pedidos/:id/iniciar', requireApprovedSeller, (req, res) => {
  const order = loadSellerOrder(res.locals.user, req.params.id);
  if (!order) return res.redirect('/vendedor/pedidos');
  if (order.status !== 'paid') {
    flash(req, 'error', 'Só é possível iniciar pedidos pagos.');
    return res.redirect(`/vendedor/pedidos/${order.id}`);
  }
  run("UPDATE orders SET status = 'in_progress', started_at = datetime('now') WHERE id = ?", [order.id]);
  orders.notify(order.client_id, `O vendedor iniciou a execução do pedido #${order.id}.`, `/cliente/pedidos/${order.id}`);
  const admin = orders.getAdminId();
  if (admin) orders.notify(admin, `Vendedor iniciou o pedido #${order.id}.`, `/admin/pedidos/${order.id}`);
  flash(req, 'success', 'Pedido em execução.');
  res.redirect(`/vendedor/pedidos/${order.id}`);
});

router.post('/vendedor/pedidos/:id/entregar', requireApprovedSeller, (req, res) => {
  const order = loadSellerOrder(res.locals.user, req.params.id);
  if (!order) return res.redirect('/vendedor/pedidos');
  if (order.status !== 'in_progress' && order.status !== 'paid') {
    flash(req, 'error', 'Este pedido não pode ser entregue agora.');
    return res.redirect(`/vendedor/pedidos/${order.id}`);
  }
  run("UPDATE orders SET status = 'delivered', delivered_at = datetime('now') WHERE id = ?", [order.id]);
  orders.notify(order.client_id, `O pedido #${order.id} foi entregue! Confirme o recebimento no painel.`, `/cliente/pedidos/${order.id}`);
  const admin = orders.getAdminId();
  if (admin) orders.notify(admin, `Vendedor marcou o pedido #${order.id} como entregue.`, `/admin/pedidos/${order.id}`);
  flash(req, 'success', 'Pedido marcado como entregue. Aguardando confirmação do cliente.');
  res.redirect(`/vendedor/pedidos/${order.id}`);
});

router.post('/vendedor/pedidos/:id/mensagem', requireApprovedSeller, (req, res) => {
  const order = loadSellerOrder(res.locals.user, req.params.id);
  if (!order) return res.redirect('/vendedor/pedidos');
  const body = String(req.body.message || '').trim().slice(0, 2000);
  if (!body) return res.redirect(`/vendedor/pedidos/${order.id}`);
  run("INSERT INTO order_messages (order_id, sender_id, sender_role, body, read_by_seller) VALUES (?, ?, 'seller', ?, 1)", [order.id, res.locals.user.id, body]);
  orders.notify(order.client_id, `O vendedor respondeu no pedido #${order.id}.`, `/cliente/pedidos/${order.id}`);
  const admin = orders.getAdminId();
  if (admin) orders.notify(admin, `O vendedor respondeu no pedido #${order.id}.`, `/admin/pedidos/${order.id}`);
  flash(req, 'success', 'Mensagem enviada.');
  res.redirect(`/vendedor/pedidos/${order.id}#chat`);
});

// ---------- Ganhos / wallet ----------
router.get('/vendedor/ganhos', requireApprovedSeller, (req, res) => {
  const u = res.locals.user;
  const payouts = all('SELECT * FROM payouts WHERE seller_id = ? ORDER BY created_at DESC', [u.id]);
  const history = all('SELECT * FROM orders WHERE seller_id = ? AND status = \'completed\' ORDER BY completed_at DESC', [u.id]);
  res.render('seller/ganhos', { payouts, history, seller: u });
});

router.post('/vendedor/ganhos/sacar', requireApprovedSeller, (req, res) => {
  const u = res.locals.user;
  if (u.seller_balance < 20) {
    flash(req, 'error', 'O saque mínimo é de R$ 20,00.');
    return res.redirect('/vendedor/ganhos');
  }
  run('INSERT INTO payouts (seller_id, amount) VALUES (?, ?)', [u.id, u.seller_balance]);
  run('UPDATE users SET seller_balance = 0 WHERE id = ?', [u.id]);
  const admin = orders.getAdminId();
  if (admin) orders.notify(admin, `${u.name} solicitou um saque de ${u.seller_balance.toFixed(2)}... Verifique em Pagamentos.`, '/admin/pagamentos');
  flash(req, 'success', 'Saque solicitado! A equipe vai processar e entrar em contato.');
  res.redirect('/vendedor/ganhos');
});

module.exports = router;
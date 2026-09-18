const express = require('express');
const { get, all, run } = require('../db/db');
const { requireLogin } = require('../middleware');
const orders = require('../lib/orders');
const router = express.Router();

function flash(req, type, text) {
  req.session.flash = req.session.flash || [];
  req.session.flash.push({ type, text });
}

router.get('/painel', requireLogin, (req, res) => {
  const u = res.locals.user;
  if (u.role === 'admin') return res.redirect('/admin');
  if (u.role === 'seller') return res.redirect('/vendedor/painel');
  return res.redirect('/cliente/painel');
});

router.get('/cliente/painel', requireLogin, (req, res) => {
  const u = res.locals.user;
  if (u.role !== 'client' && u.role !== 'admin') return res.redirect('/vendedor/painel');
  const quotes = all('SELECT * FROM quotes WHERE client_id = ? ORDER BY created_at DESC', [u.id]);
  const pedidos = all('SELECT * FROM orders WHERE client_id = ? ORDER BY created_at DESC', [u.id]);
  res.render('client/painel', { quotes, pedidos });
});

router.post('/cliente/orcamentos/:id/aprovar', requireLogin, (req, res) => {
  const u = res.locals.user;
  const quote = get('SELECT * FROM quotes WHERE id = ? AND client_id = ?', [req.params.id, u.id]);
  if (!quote) return res.redirect('/cliente/painel');
  if (quote.status !== 'approved') {
    flash(req, 'error', 'Este orçamento ainda não está aprovado para gerar um pedido.');
    return res.redirect('/cliente/painel');
  }
  if (!quote.offer_price || Number(quote.offer_price) <= 0) {
    flash(req, 'error', 'A equipe ainda não definiu o valor. Aguarde o retorno.');
    return res.redirect('/cliente/painel');
  }
  const order = orders.createOrderFromQuote(quote);
  flash(req, 'success', `Pedido #${order.id} criado! Escolha a forma de pagamento para continuar.`);
  res.redirect(`/cliente/pedidos/${order.id}`);
});

router.get('/cliente/pedidos', requireLogin, (req, res) => {
  const u = res.locals.user;
  const pedidos = all('SELECT * FROM orders WHERE client_id = ? ORDER BY created_at DESC', [u.id]);
  const totals = {
    active: pedidos.filter((o) => ['pending_payment', 'awaiting_confirm', 'paid', 'in_progress', 'delivered'].includes(o.status)).length,
    completed: pedidos.filter((o) => o.status === 'completed').length,
    total: pedidos.length,
  };
  res.render('client/pedidos', { pedidos, totals });
});

function loadClientOrder(user, id) {
  const order = get(
    `SELECT o.*, q.client_name, q.client_whatsapp, q.game_name, q.game_rank, q.game_boxes, q.message,
            s.title AS service_title, u.name AS seller_name
     FROM orders o
     LEFT JOIN quotes q ON q.id = o.quote_id
     LEFT JOIN services s ON s.id = o.service_id
     LEFT JOIN users u ON u.id = o.seller_id
     WHERE o.id = ? AND o.client_id = ?`,
    [id, user.id]
  );
  return order;
}

router.get('/cliente/pedidos/:id', requireLogin, (req, res) => {
  const u = res.locals.user;
  const order = loadClientOrder(u, req.params.id);
  if (!order) {
    flash(req, 'error', 'Pedido não encontrado.');
    return res.redirect('/cliente/pedidos');
  }
  run('UPDATE order_messages SET read_by_client = 1 WHERE order_id = ?', [order.id]);
  const messages = all('SELECT * FROM order_messages WHERE order_id = ? ORDER BY created_at ASC', [order.id]);
  const review = get('SELECT * FROM reviews WHERE order_id = ?', [order.id]);
  res.render('client/pedido-detalhe', { order, messages, review });
});

router.post('/cliente/pedidos/:id/pagamento-confirmado', requireLogin, (req, res) => {
  const u = res.locals.user;
  const order = get('SELECT * FROM orders WHERE id = ? AND client_id = ?', [req.params.id, u.id]);
  if (!order) return res.redirect('/cliente/pedidos');
  if (order.status !== 'pending_payment') {
    flash(req, 'error', 'Este pedido não está aguardando pagamento.');
    return res.redirect(`/cliente/pedidos/${order.id}`);
  }
  run("UPDATE orders SET status = 'awaiting_confirm' WHERE id = ?", [order.id]);
  const admin = get("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (admin) orders.notify(admin.id, `Cliente confirmou pagamento do pedido #${order.id}.`, `/admin/pedidos/${order.id}`);
  flash(req, 'success', 'Recebemos a confirmação! A equipe vai validar o pagamento em instantes.');
  res.redirect(`/cliente/pedidos/${order.id}`);
});

router.post('/cliente/pedidos/:id/confirmar', requireLogin, (req, res) => {
  const u = res.locals.user;
  const order = get('SELECT * FROM orders WHERE id = ? AND client_id = ?', [req.params.id, u.id]);
  if (!order) return res.redirect('/cliente/pedidos');
  if (order.status !== 'delivered') {
    flash(req, 'error', 'Este pedido ainda não foi entregue.');
    return res.redirect(`/cliente/pedidos/${order.id}`);
  }
  run("UPDATE orders SET status = 'completed', completed_at = datetime('now') WHERE id = ?", [order.id]);
  if (order.quote_id) run("UPDATE quotes SET status = 'done', updated_at = datetime('now') WHERE id = ?", [order.quote_id]);
  if (order.seller_id && order.seller_amount > 0) {
    run('UPDATE users SET seller_balance = seller_balance + ? WHERE id = ?', [order.seller_amount, order.seller_id]);
    orders.notify(order.seller_id, `Pedido #${order.id} concluído. R$ ${order.seller_amount.toFixed(2).replace('.', ',')} creditados no seu saldo.`, '/vendedor/ganhos');
  }
  const admin = get("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (admin) orders.notify(admin.id, `Pedido #${order.id} foi concluído pelo cliente.`, `/admin/pedidos/${order.id}`);
  flash(req, 'success', 'Recebimento confirmado! O pedido foi concluído. Não se esqueça de avaliar o vendedor.');
  res.redirect(`/cliente/pedidos/${order.id}#avaliar`);
});

router.post('/cliente/pedidos/:id/avaliar', requireLogin, (req, res) => {
  const u = res.locals.user;
  const order = get('SELECT * FROM orders WHERE id = ? AND client_id = ?', [req.params.id, u.id]);
  if (!order) return res.redirect('/cliente/pedidos');
  if (order.status !== 'completed') {
    flash(req, 'error', 'Só é possível avaliar após a conclusão do pedido.');
    return res.redirect(`/cliente/pedidos/${order.id}`);
  }
  if (get('SELECT id FROM reviews WHERE order_id = ?', [order.id])) {
    flash(req, 'error', 'Você já avaliou este pedido.');
    return res.redirect(`/cliente/pedidos/${order.id}`);
  }
  let rating = Math.round(Number(req.body.rating));
  if (!rating || rating < 1 || rating > 5) {
    flash(req, 'error', 'Escolha uma nota de 1 a 5.');
    return res.redirect(`/cliente/pedidos/${order.id}#avaliar`);
  }
  const comment = String(req.body.comment || '').trim().slice(0, 1000);
  run('INSERT INTO reviews (order_id, client_id, seller_id, service_id, rating, comment) VALUES (?, ?, ?, ?, ?, ?)',
    [order.id, u.id, order.seller_id, order.service_id, rating, comment]);
  if (order.seller_id) {
    const seller = get('SELECT * FROM users WHERE id = ?', [order.seller_id]);
    const newCount = (seller.seller_review_count || 0) + 1;
    const newRating = Math.round(((seller.seller_rating || 0) * (seller.seller_review_count || 0) + rating) / newCount * 10) / 10;
    run('UPDATE users SET seller_review_count = ?, seller_rating = ? WHERE id = ?', [newCount, newRating, order.seller_id]);
    orders.notify(order.seller_id, `Você recebeu uma avaliação de ${rating}★ no pedido #${order.id}.`, `/vendedor/ganhos`);
  }
  flash(req, 'success', 'Obrigado pela avaliação!');
  res.redirect(`/cliente/pedidos/${order.id}#avaliacao`);
});

router.post('/cliente/pedidos/:id/cancelar', requireLogin, (req, res) => {
  const u = res.locals.user;
  const order = get('SELECT * FROM orders WHERE id = ? AND client_id = ?', [req.params.id, u.id]);
  if (!order) return res.redirect('/cliente/pedidos');
  if (!['pending_payment', 'awaiting_confirm'].includes(order.status)) {
    flash(req, 'error', 'Este pedido não pode mais ser cancelado por você. Fale com a equipe.');
    return res.redirect(`/cliente/pedidos/${order.id}`);
  }
  run("UPDATE orders SET status = 'cancelled', cancelled_at = datetime('now') WHERE id = ?", [order.id]);
  if (order.seller_id) orders.notify(order.seller_id, `O cliente cancelou o pedido #${order.id}.`, `/vendedor/pedidos/${order.id}`);
  const admin = get("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (admin) orders.notify(admin.id, `Pedido #${order.id} foi cancelado pelo cliente.`, `/admin/pedidos/${order.id}`);
  flash(req, 'success', 'Pedido cancelado.');
  res.redirect(`/cliente/pedidos/${order.id}`);
});

router.post('/cliente/pedidos/:id/mensagem', requireLogin, (req, res) => {
  const u = res.locals.user;
  const order = get('SELECT * FROM orders WHERE id = ? AND client_id = ?', [req.params.id, u.id]);
  if (!order) return res.redirect('/cliente/pedidos');
  const body = String(req.body.message || '').trim().slice(0, 2000);
  if (!body) return res.redirect(`/cliente/pedidos/${order.id}`);
  run("INSERT INTO order_messages (order_id, sender_id, sender_role, body, read_by_client) VALUES (?, ?, 'client', ?, 1)", [order.id, u.id, body]);
  if (order.seller_id) orders.notify(order.seller_id, `Nova mensagem no pedido #${order.id}.`, `/vendedor/pedidos/${order.id}`);
  const admin = get("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (admin) orders.notify(admin.id, `Nova mensagem do cliente no pedido #${order.id}.`, `/admin/pedidos/${order.id}`);
  flash(req, 'success', 'Mensagem enviada.');
  res.redirect(`/cliente/pedidos/${order.id}#chat`);
});

// LGPD: exclusão de conta pelo próprio usuário
router.post('/cliente/conta/excluir', requireLogin, (req, res) => {
  const u = res.locals.user;
  if (u.role === 'admin') return res.redirect('/admin');
  run('UPDATE orders SET status = \'cancelled\', cancelled_at = datetime(\'now\') WHERE client_id = ? AND status IN (\'pending_payment\', \'awaiting_confirm\', \'paid\')', [u.id]);
  run('DELETE FROM order_messages WHERE sender_id = ?', [u.id]);
  run("UPDATE users SET name = 'Conta excluída', email = ?, password = '', active = 0, seller_status = 'none' WHERE id = ?", ['excluida-' + u.id + '@invalid.local', u.id]);
  const admin = get("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (admin) orders.notify(admin.id, `O usuário ${u.email} solicitou a exclusão da conta (LGPD).`, '/admin/clientes');
  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
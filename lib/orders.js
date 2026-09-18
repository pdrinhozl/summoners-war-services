const { get, all, run } = require('../db/db');
const { buildPayload, generateTxid } = require('./pix');
const { notify } = require('./notify');

function settingsMap() {
  const s = {};
  for (const r of all('SELECT key, value FROM settings')) s[r.key] = r.value;
  return s;
}

function getAdminId() {
  const a = get("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  return a ? a.id : null;
}

function createOrderFromQuote(quote) {
  const existing = get('SELECT * FROM orders WHERE quote_id = ?', [quote.id]);
  if (existing) return existing;

  const service = quote.service_id ? get('SELECT * FROM services WHERE id = ?', [quote.service_id]) : null;
  const sellerId = service && service.seller_id ? service.seller_id : null;
  const title = service ? service.title : 'Service personalizado';
  const settings = settingsMap();
  const pct = Math.max(0, Math.min(100, Number(settings.commission_pct || 15)));
  const price = Number(quote.offer_price) || 0;
  const sellerAmount = Math.round(price * (1 - pct / 100) * 100) / 100;

  const result = run(
    'INSERT INTO orders (quote_id, client_id, seller_id, service_id, title, price, commission_pct, seller_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [quote.id, quote.client_id, sellerId, service ? service.id : null, title, price, pct, sellerAmount]
  );
  const orderId = Number(result.lastInsertRowid);

  if (settings.pix_key) {
    try {
      const payload = buildPayload({
        key: settings.pix_key,
        amount: price,
        name: settings.merchant_name || settings.site_name || 'Runa Nivel 5',
        city: settings.merchant_city || 'Sao Paulo',
        txid: generateTxid(orderId),
      });
      run('UPDATE orders SET payment_code = ? WHERE id = ?', [payload, orderId]);
    } catch (e) {
      console.error('[pix] Falha ao gerar payload:', e.message);
    }
  }

  const order = get('SELECT * FROM orders WHERE id = ?', [orderId]);
  if (sellerId) notify(sellerId, `Novo pedido #${orderId}: ${title}`, `/vendedor/pedidos/${orderId}`);
  const adminId = getAdminId();
  if (adminId) notify(adminId, `Novo pedido #${orderId} de ${quote.client_name}`, `/admin/pedidos/${orderId}`);
  return order;
}

module.exports = { createOrderFromQuote, settingsMap, getAdminId, notify };
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-test-'));
process.env.DB_PATH = path.join(TMP, 'test.db');
process.env.PORT = '3999';
process.env.NODE_ENV = 'test';

const { app } = require('../server');
const { get, run } = require('../db/db');
const seed = require('../db/seed');

const BASE = 'http://127.0.0.1';

function listen(app_) {
  return new Promise((resolve) => {
    const server = app_.listen(0, '127.0.0.1', () => resolve(server));
  });
}

class Session {
  constructor(base, server) {
    this.base = base;
    this.server = server;
    this.cookies = [];
  }

  jarFrom(res) {
    for (const c of res.headers.getSetCookie()) {
      const kv = c.split(';')[0];
      const name = kv.split('=')[0];
      this.cookies = this.cookies.filter((x) => !x.startsWith(name + '='));
      this.cookies.push(kv);
    }
  }

  async req(pathname, opts = {}) {
    const res = await fetch(this.base + pathname, {
      ...opts,
      redirect: 'manual',
      headers: {
        ...(opts.headers || {}),
        cookie: this.cookies.join('; '),
      },
    });
    this.jarFrom(res);
    return res;
  }

  async get(pathname) {
    return this.req(pathname);
  }

  async html(pathname) {
    const res = await this.req(pathname);
    return { res, text: await res.text() };
  }

  async csrf(pathname = '/login') {
    const { text } = await this.html(pathname);
    const m = text.match(/name="_csrf" value="([^"]+)"/);
    assert.ok(m, 'CSRF token not found');
    return m[1];
  }

  async post(pathname, body) {
    const token = await this.csrf(pathname);
    const form = new URLSearchParams({ _csrf: token, ...body });
    return this.req(pathname, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form.toString() });
  }

  async postWithCsrf(pathname, csrfSource, body) {
    const token = await this.csrf(csrfSource || pathname);
    const form = new URLSearchParams({ _csrf: token, ...body });
    return this.req(pathname, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form.toString() });
  }
}

let server;

before(async () => {
  server = await listen(app);
  await seed();
});

after(() => server.close());

test('páginas públicas carregam', async () => {
  for (const p of ['/', '/services', '/orcamento', '/como-funciona', '/seja-um-vendedor', '/termos', '/privacidade', '/login', '/registro']) {
    const res = await fetch(BASE + ':' + server.address().port + p);
    assert.strictEqual(res.status, 200, p);
  }
  const rob = await fetch(BASE + ':' + server.address().port + '/robots.txt');
  assert.strictEqual(rob.status, 200);
  const sitemap = await fetch(BASE + ':' + server.address().port + '/sitemap.xml');
  assert.strictEqual(sitemap.status, 200);
});

test('fluxo completo: orçamento → pedido → pix → admin → vendedor → conclusão → avaliação', async () => {
  const port = server.address().port;
  const base = BASE + ':' + port;

  const client = new Session(base, server);
  const admin = new Session(base, server);
  const seller = new Session(base, server);

  // 1. Cliente se registra
  const regi = await client.html('/registro');
  const token = regi.text.match(/name="_csrf" value="([^"]+)"/)[1];
  await client.req('/registro', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ _csrf: token, role: 'client', name: 'Cliente Teste', email: `cliente-${Date.now()}@test.com`, password: 'abc123', password2: 'abc123' }).toString(),
  });

  // 2. Cliente envia orçamento
  const service = get("SELECT * FROM services WHERE slug = 'boost-arena-c1'");
  assert.ok(service);
  const oq = await client.post('/orcamento', {
    service_id: String(service.id),
    client_name: 'Cliente Teste',
    client_whatsapp: '11999999999',
    game_name: 'TestAccount',
    game_rank: 'Fighter 3',
  });
  assert.strictEqual(oq.status, 302);
  const quote = get("SELECT * FROM quotes WHERE client_whatsapp = '11999999999' ORDER BY id DESC LIMIT 1");
  assert.ok(quote, 'orçamento deve ter sido criado');

  // 3. Admin loga e aprova o orçamento
  const adminLogin = await admin.post('/login', { email: 'admin@swservice.com', password: 'admin123' });
  assert.strictEqual(adminLogin.status, 302);
  const latestQuote = get("SELECT * FROM quotes WHERE client_name = 'Cliente Teste' ORDER BY id DESC LIMIT 1");
  assert.ok(latestQuote);
  const ap = await admin.postWithCsrf('/admin/orcamentos/' + latestQuote.id, '/admin/orcamentos/' + latestQuote.id, {
    status: 'approved',
    offer_price: '150.00',
    admin_note: 'Aprovado, conta apta.',
  });
  assert.strictEqual(ap.status, 302);
  assert.strictEqual(get('SELECT status FROM quotes WHERE id = ?', [latestQuote.id]).status, 'approved');

  // 4. Define chave Pix e cliente gera o pedido
  run("INSERT INTO settings (key, value) VALUES ('pix_key', 'teste@runa5.com') ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  const orderStart = await client.postWithCsrf('/cliente/orcamentos/' + latestQuote.id + '/aprovar', '/cliente/painel', {});
  assert.strictEqual(orderStart.status, 302);
  const order = get('SELECT * FROM orders WHERE quote_id = ?', [latestQuote.id]);
  assert.ok(order);
  assert.strictEqual(order.status, 'pending_payment');
  assert.ok(order.seller_id, 'pedido deve ter vendedor');
  assert.ok(order.payment_code, 'pix copia e cola deve ser gerado');
  assert.ok(order.payment_code.startsWith('000201'), 'payload EMV inválido');

  // 5. Cliente confirma pagamento
  const pc = await client.postWithCsrf(`/cliente/pedidos/${order.id}/pagamento-confirmado`, `/cliente/pedidos/${order.id}`, {});
  assert.strictEqual(pc.status, 302);
  assert.strictEqual(get('SELECT status FROM orders WHERE id = ?', [order.id]).status, 'awaiting_confirm');

  // 6. Admin confirma pagamento
  const setPaid = await admin.postWithCsrf(`/admin/pedidos/${order.id}/status`, `/admin/pedidos/${order.id}`, { status: 'paid' });
  assert.strictEqual(setPaid.status, 302);
  assert.strictEqual(get('SELECT status FROM orders WHERE id = ?', [order.id]).status, 'paid');
  assert.ok(get('SELECT paid_at FROM orders WHERE id = ?', [order.id]).paid_at);
  const adminNotif = get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?', [get("SELECT id FROM users WHERE role = 'admin' LIMIT 1").id]);
  assert.ok(adminNotif.n >= 1);

  // 7. Vendedor inicia e entrega
  const sellerLogin = await seller.post('/login', { email: 'vendedor@swservice.com', password: 'vendedor123' });
  assert.strictEqual(sellerLogin.status, 302);
  const start = await seller.postWithCsrf(`/vendedor/pedidos/${order.id}/iniciar`, `/vendedor/pedidos/${order.id}`, {});
  assert.strictEqual(start.status, 302);
  assert.strictEqual(get('SELECT status FROM orders WHERE id = ?', [order.id]).status, 'in_progress');
  const deliver = await seller.postWithCsrf(`/vendedor/pedidos/${order.id}/entregar`, `/vendedor/pedidos/${order.id}`, {});
  assert.strictEqual(deliver.status, 302);
  assert.strictEqual(get('SELECT status FROM orders WHERE id = ?', [order.id]).status, 'delivered');

  // 8. Cliente confirma recebimento → saldo do vendedor é creditado
  const sellerBefore = get('SELECT seller_balance FROM users WHERE id = ?', [order.seller_id]).seller_balance;
  const confirm = await client.postWithCsrf(`/cliente/pedidos/${order.id}/confirmar`, `/cliente/pedidos/${order.id}`, {});
  assert.strictEqual(confirm.status, 302);
  assert.strictEqual(get('SELECT status FROM orders WHERE id = ?', [order.id]).status, 'completed');
  const sellerAfter = get('SELECT seller_balance FROM users WHERE id = ?', [order.seller_id]).seller_balance;
  assert.ok(sellerAfter > sellerBefore, 'saldo deve ter sido creditado');
  assert.strictEqual(get('SELECT status FROM quotes WHERE id = ?', [latestQuote.id]).status, 'done');

  // 9. Cliente avalia
  const review = await client.postWithCsrf(`/cliente/pedidos/${order.id}/avaliar`, `/cliente/pedidos/${order.id}`, { rating: '5', comment: 'Excelente!' });
  assert.strictEqual(review.status, 302);
  const r = get('SELECT * FROM reviews WHERE order_id = ?', [order.id]);
  assert.ok(r);
  assert.strictEqual(r.rating, 5);
  const sellerBalance = get('SELECT seller_review_count, seller_rating FROM users WHERE id = ?', [order.seller_id]);
  assert.ok(sellerBalance.seller_review_count >= 1);
  assert.strictEqual(sellerBalance.seller_rating, 5);

  // 10. Chat funciona (cliente envia mensagem)
  const msg = await client.postWithCsrf(`/cliente/pedidos/${order.id}/mensagem`, `/cliente/pedidos/${order.id}`, { message: 'Obrigado!' });
  assert.strictEqual(msg.status, 302);
  assert.ok(get('SELECT COUNT(*) AS n FROM order_messages WHERE order_id = ?', [order.id]).n >= 1);

  // 11. Saque
  const saque = await seller.postWithCsrf('/vendedor/ganhos/sacar', '/vendedor/ganhos', {});
  assert.strictEqual(saque.status, 302);
  assert.ok(get('SELECT COUNT(*) AS n FROM payouts WHERE seller_id = ?', [order.seller_id]).n >= 1);
});

test('requisição POST sem CSRF é bloqueada', async () => {
  const s = new Session(BASE + ':' + server.address().port, server);
  const res = await s.req('/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'email=a@b.com' });
  assert.ok([302, 403].includes(res.status));
});

test('login com senha errada retorna erro', async () => {
  const s = new Session(BASE + ':' + server.address().port, server);
  const r = await s.post('/login', { email: 'admin@swservice.com', password: 'errada' });
  assert.strictEqual(r.status, 200);
  const { text } = await s.html('/login');
  assert.ok(text.includes('incorretos'));
});

test('LGPD: cliente exclui a própria conta', async () => {
  const s = new Session(BASE + ':' + server.address().port, server);
  const regi = await s.html('/registro');
  const token = regi.text.match(/name="_csrf" value="([^"]+)"/)[1];
  await s.req('/registro', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ _csrf: token, role: 'client', name: 'Cliente Lgpd', email: `lgpd-${Date.now()}@test.com`, password: 'abc123', password2: 'abc123' }).toString(),
  });
  const del = await s.postWithCsrf('/cliente/conta/excluir', '/cliente/painel', {});
  assert.strictEqual(del.status, 302);
  const u = get("SELECT * FROM users WHERE name = 'Conta excluída' ORDER BY id DESC LIMIT 1");
  assert.ok(u);
  assert.strictEqual(u.active, 0);
});
const bcrypt = require('bcryptjs');
const { get, run } = require('./db');

async function seed() {
  const existing = get('SELECT id FROM users WHERE email = ?', ['admin@swservice.com']);
  if (!existing) {
    run(
      'INSERT INTO users (name, email, password, role, seller_status) VALUES (?, ?, ?, ?, ?)',
      ['Administrador', 'admin@swservice.com', bcrypt.hashSync('admin123', 10), 'admin', 'verified']
    );
  }

  const demoMail = 'vendedor@swservice.com';
  if (!get('SELECT id FROM users WHERE email = ?', [demoMail])) {
    run(
      'INSERT INTO users (name, email, password, role, seller_status, seller_about, seller_contact) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        'SWPro Team',
        demoMail,
        bcrypt.hashSync('vendedor123', 10),
        'seller',
        'verified',
        'Equipe verificada com mais de 3 anos de experiência em booms de Summoners War. Trabalhamos com Campeões seguros e atendimento via Discord.',
        'Discord: SWPro#0001 | WhatsApp: 11 99999-8888'
      ]
    );
  }

  const cats = [
    ['Cavernas & PvE', 'cavernas', 'sword', '#ff6b35'],
    ['Arena & Ranking', 'arena', 'trophy', '#7b5cff'],
    ['RTA', 'rta', 'zap', '#00d4ff'],
    ['Monstros & Runes', 'monstros', 'gem', '#ffd700'],
    ['Contas Premium', 'contas', 'crown', '#ff3d71'],
  ];
  for (const [name, slug, icon, color] of cats) {
    if (!get('SELECT id FROM categories WHERE slug = ?', [slug])) {
      run('INSERT INTO categories (name, slug, icon, color) VALUES (?, ?, ?, ?)', [name, slug, icon, color]);
    }
  }

  const settings = {
    site_name: 'Runa Nível 5',
    tagline: 'Services profissionais de Summoners War: booms, maldições e muito mais.',
    contact_email: 'contato@runanivel5.com',
    contact_whatsapp: '5511999998888',
    contact_discord: 'https://discord.gg/runanivel5',
    hero_title: 'Puxe o melhor do seu Invocador',
    hero_subtitle: 'Desbloqueie todo o potencial da sua conta com services seguros, rápidos e 100% verificados.',
    commission_pct: '15',
    pix_key: '',
    merchant_name: 'Runa Nivel 5 Services',
    merchant_city: 'Sao Paulo',
  };
  for (const [k, v] of Object.entries(settings)) {
    if (!get('SELECT key FROM settings WHERE key = ?', [k])) {
      run('INSERT INTO settings (key, value) VALUES (?, ?)', [k, v]);
    }
  }

  const sellerId = get('SELECT id FROM users WHERE email = ?', [demoMail]).id;
  const adminId = get('SELECT id FROM users WHERE email = ?', ['admin@swservice.com']).id;
  const catId = (slug) => get('SELECT id FROM categories WHERE slug = ?', [slug]).id;

  if (!get('SELECT id FROM services WHERE slug = ?', ['boost-arena-c1']))
    run(
      `INSERT INTO services (seller_id, category_id, title, slug, short, description, price_from, price_to, delivery_min, delivery_max, status, featured, includes, requirements, approved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        sellerId, catId('arena'), 'Boost de Arena até C1',
        'boost-arena-c1',
        'Suba sua Arena para Conquistador 1 com proteção de defesa e garantia total.',
        'Elevamos o seu rank na Arena no modo normal com total segurança. Metodologia com defesa sólida e horários estratégicos, sem risco para a sua conta.\n\nInclui relatório diário de progresso e atendimento prioritário no Discord.',
        120, 180, 3, 7, 'approved', 1, JSON.stringify(['Defesa montada estrategicamente', 'Relatório diário de progresso', 'Garantia de rank por 30 dias', 'Suporte via Discord']), 'Rank mínimo: Fighter 1. Precisa estar logado no servidor GLOBAL.'
      ]
    );

  if (!get('SELECT id FROM services WHERE slug = ?', ['farming-gb12']))
    run(
      `INSERT INTO services (seller_id, category_id, title, slug, short, description, price_from, price_to, delivery_min, delivery_max, status, featured, includes, requirements, approved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        adminId, catId('cavernas'), 'Farming de GB12 (Giants) 100%',
        'farming-gb12',
        'Team speed-run de Giants B12 com 100% de taxa de vitória.',
        'Montamos e rodamos o melhor time de Giants B12 para a sua conta. Farm contínuo de runes violentas e swift, com gerenciamento de espaço do baú e limpeza automática de runes.\n\nIdeal para quem quer acelerar o progresso e encher o inventário de runes de alta velocidade.',
        80, 140, 1, 3, 'approved', 1, JSON.stringify(['Time de speed-run montado', 'Farm de 5 a 10 mil energy', 'Limpa e organiza o baú de runes', 'Não usa account hacking']), 'Sua conta deve ter no mínimo 100 energy de limite e acesso aos downloads de alta qualidade.'
      ]
    );

  if (!get('SELECT id FROM services WHERE slug = ?', ['rta-c2']))
    run(
      `INSERT INTO services (seller_id, category_id, title, slug, short, description, price_from, price_to, delivery_min, delivery_max, status, featured, includes, requirements, approved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        adminId, catId('rta'), 'Boost de RTA até Conquistador 2',
        'rta-c2',
        'Grind de RTA até o Conquistador 2 com estratégias de ponta.',
        'Times de RTA pensados para o seu box. Analisamos suas unidades, runes e velocidade para montar a melhor estratégia e subir seu ranking no modo em tempo real.\n\nGarantia de pontos e acompanhamento em todas as pick/bans.',
        250, 400, 5, 14, 'approved', 1, JSON.stringify(['Estratégia de ban/pick personalizada', 'Análise completa do seu box', 'Acompanhamento de pontos diário', 'Garantia total']), 'Necessário box com no mínimo 15 unidades 6★. Trono disponível nas temporadas 2026.'
      ]
    );

  if (!get('SELECT id FROM services WHERE slug = ?', ['gem-enchants']))
    run(
      `INSERT INTO services (seller_id, category_id, title, slug, short, description, price_from, price_to, delivery_min, delivery_max, status, featured, includes, requirements, approved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        sellerId, catId('monstros'), 'Gem & Enchants otimizados',
        'gem-enchants',
        'Otimização de gemas e encantamentos para maximizar suas runes.',
        'Analisamos seu inventário de gemas e encantamentos e aplicamos nas runes certas para ganhos máximos de speed, precisão e resistência.\n\nFocamos em durabilidade de runas para raciais e PvP.',
        60, 100, 1, 2, 'approved', 0, JSON.stringify(['Análise de upgrades prioritários', 'Aplicação de gemas e enchants', 'Foco em speed e eficiência']), 'Necessário no mínimo 10 gemas e 10 enchants de qualidade no inventário.'
      ]
    );

  if (!get('SELECT id FROM services WHERE slug = ?', ['conta-midfarme']))
    run(
      `INSERT INTO services (seller_id, category_id, title, slug, short, description, price_from, price_to, delivery_min, delivery_max, status, featured, includes, requirements, approved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        adminId, catId('contas'), 'Conta Mid-Farm completa (seed account)',
        'conta-midfarme',
        'Conta nova com progresso mid-game: farm pronta e 30 dias de alívio.',
        'Venda de conta mid-game já farm-pronta, com 30 dias de reposição caso bloqueada pelo suporte (hypothetical).\n\nA conta vem com energia, cristais e progresso sólido de Cavernas para você começar com o pé direito.',
        350, 500, 1, 1, 'approved', 1, JSON.stringify(['Conta exclusiva, nunca vendida antes', 'E-mail e senha alteráveis', 'Trocas de seguradora disponíveis', 'Suporte pós-venda 30 dias']), 'Conta vendida única vez. Precisa de verificação de identidade para fechamento.'
      ]
    );

  const art = {
    'boost-arena-c1': '/img/art-fire.png',
    'farming-gb12': '/img/art-wind.png',
    'rta-c2': '/img/art-water.png',
    'gem-enchants': '/img/art-light.png',
    'conta-midfarme': '/img/art-dark.png',
  };
  for (const [slug, image] of Object.entries(art)) {
    run('UPDATE services SET image = ? WHERE slug = ?', [image, slug]);
  }

  console.log('Banco de dados populado com sucesso!');
  console.log('');
  console.log('Credenciais de acesso:');
  console.log('  Admin     -> admin@swservice.com / admin123');
  console.log('  Vendedor  -> vendedor@swservice.com / vendedor123');
}

if (require.main === module) {
  seed().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = seed;
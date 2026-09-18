# Runa Nível 5 — Services de Summoners War

> **🔗 Site online:** [https://pdrinhozl.github.io/summoners-war-services](https://pdrinhozl.github.io/summoners-war-services)

Plataforma SaaS de services (boosts, runas, leveling) para Summoners War, feita com Node.js, Express, EJS e SQLite.

> **Aviso:** esta instância do GitHub Pages é uma **prévia estática** (apenas as páginas públicas visualizáveis). Login, painel de admin, pedidos e chat exigem o backend e não funcionam aqui — para isso, rode localmente ou hospede o app em um host Node (Render/Glitch).

---

## Rodar localmente

```bash
npm install
npm start
```

Acesse **http://localhost:3000**.

## Contas de demonstração

| Papel    | E-mail                     | Senha      |
| -------- | -------------------------- | ---------- |
| Admin    | `admin@swservice.com`      | `admin123` |
| Vendedor | `vendedor@swservice.com`   | `vendedor123` |

## Testes

```bash
npm test
npm run lint
```

## Deploy

O arquivo [`render.yaml`](./render.yaml) e o blueprint do GitHub Pages (`.github/workflows/pages.yml`) já estão prontos.
# SW Service — Services de Summoners War

Interface refeita a partir da referência enviada: fundo escuro, ações em roxo, navegação inferior no celular e fluxo direto de solicitação, orçamento, pagamento e entrega. A marca e o catálogo existentes foram mantidos. O sistema continua em Node.js, Express, EJS e SQLite.

## Rodar

Use Node.js 22.5 ou superior (validado com Node.js 24).

```bash
npm ci
npm start
```

Abra **http://localhost:3050**. O servidor precisa continuar aberto.

Para configurar, copie `.env.example` para `.env`. O servidor carrega esse arquivo ao iniciar. A variável `PORT` altera a porta. Não é necessário compilar o projeto.

O ZIP inclui a pasta `data` original. Para atualizar uma instalação em uso, faça backup e mantenha o seu `data/app.db`, `data/attachments`, `public/uploads` e `.env`. As novas colunas são adicionadas automaticamente, sem apagar registros. Os testes usam bancos temporários separados.

## Experiência do cliente

- Início compacto, com pedidos abertos, valor dos serviços pagos em andamento, ações rápidas e atividade recente.
- Solicitação com descrição, categoria e prioridade. Imagem opcional de até 4 MB. Os dados adicionais da conta ficam recolhidos.
- É necessário entrar na conta para solicitar; depois do login, o cliente volta ao formulário que tentou abrir.
- Acompanhamento da solicitação com status e linha do tempo.
- Orçamento com valor, prazo e recado da equipe; aprovação, solicitação de ajuste e cancelamento antes de gerar o pedido.
- Meus serviços reúne orçamentos e pedidos, com busca e filtros.
- Pagamento Pix em tela própria, QR Code e código copia e cola.
- Detalhes do pedido, conversa, confirmação de recebimento e avaliação.
- Perfil editável, troca de senha, notificações, ajuda e perfil público do prestador.

## Fluxo de atendimento

1. Cliente solicita em **Solicitar serviço**.
2. Administrador abre **Orçamentos**, define valor, prazo, prestador e mensagem. Seleciona **Enviar orçamento ao cliente** e salva.
3. Cliente abre a solicitação e escolhe **Aprovar e pagar**, ou solicita um ajuste.
4. Cliente faz o Pix e toca em **Já fiz o pagamento**. O pedido passa para **Pagamento em confirmação**.
5. Administrador confere o recebimento fora do sistema e marca o pedido como pago.
6. Prestador abre **Meus serviços**, inicia a execução e depois escolhe **Finalizar serviço**. Pode acrescentar uma observação na entrega.
7. Cliente confere o resultado, confirma o recebimento e avalia. O valor líquido é registrado no saldo interno do prestador.

Pedidos personalizados podem receber um prestador pela administração. Quando o catálogo já tem um prestador, ele é usado se nenhum outro for indicado.

## Pagamentos e configurações reais

O pagamento existente permanece **Pix com conferência manual**. Configure a chave Pix e o recebedor em **Administração → Configurações**. Cartões, confirmação bancária automática e transferência automática ao prestador não foram adicionados. O saldo do prestador é um registro interno; o pagamento de saques é feito pela equipe. Atualizações de status e mensagens aparecem ao abrir/recarregar as telas; não há notificações push.

Configure também contatos de suporte, URL pública, `SESSION_SECRET` e SMTP. Sem SMTP, o projeto mantém o comportamento original de não enviar e-mails reais. A implantação precisa de um servidor Node e armazenamento persistente para banco e anexos; GitHub Pages serve apenas arquivos estáticos e não executa este aplicativo.

A base recebida cria contas locais de demonstração: `admin@swservice.com` / `admin123` e `vendedor@swservice.com` / `vendedor123`. Se já houver contas no seu banco, os acessos existentes são preservados. Antes de disponibilizar uma instalação a clientes, troque essas senhas em `/perfil` e revise o catálogo e os contatos iniciais.

## Publicação na Railway

O `Dockerfile` usa Node.js 24 e o `railway.toml` verifica `/health` antes de liberar o site. Conecte o repositório, monte um volume em `/data` e configure `SESSION_SECRET` (32 ou mais caracteres aleatórios), `INITIAL_ADMIN_PASSWORD` (16 ou mais) e `SITE_URL` com o endereço HTTPS gerado. O contêiner já usa `/data` para banco/anexos e `/data/uploads` para imagens do catálogo. Use uma única réplica com SQLite.

O administrador inicial é `admin@swservice.com`, ou o endereço definido em `INITIAL_ADMIN_EMAIL`. A senha inicial fica na variável `INITIAL_ADMIN_PASSWORD`; troque-a em **Meu perfil** após entrar. Mudanças posteriores nessa variável não substituem uma senha já alterada no perfil. Em produção, contas de demonstração não são criadas e a senha local padrão não é aceita como acesso inicial. O banco recebido no ZIP é preservado localmente; banco, sessões e credenciais não são enviados ao repositório. Uma publicação nova começa com o catálogo inicial, sem pedidos de teste.

## Testes

```bash
npm test
npm run lint
```

A suíte cobre o fluxo completo, validação do formulário, anexos privados e acesso entre contas, ajustes e cancelamento de orçamento, notificações, edição de perfil, idempotência de aprovação e confirmação de entrega, estados de pagamento e publicação de catálogo com multipart/CSRF. A pasta `previas` contém capturas da interface em contas locais de teste; esses dados de teste não foram adicionados ao banco entregue.

## Arquivos centrais da alteração

- `public/css/app.css`: tema, layout responsivo, navegação e componentes.
- `public/js/app.js` e `public/js/main.js`: menu, formulários, cópia do Pix, anexos e acessibilidade.
- `views/`: telas do cliente, prestador e administração.
- `routes/experience.js`: acompanhamento de solicitações, pagamento, perfil, anexos, notificações e prestadores.
- `lib/request-upload.js`: anexos privados, com verificação de tipo e limite de tamanho.
- `db/db.js`: migração aditiva para as novas informações.

Esta entrega é uma adaptação visual e funcional do projeto existente; não é uma auditoria completa de segurança nem uma integração com banco ou adquirente.

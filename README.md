# SW Service — publicação Railway

Esta branch publica a interface atualizada de serviços de Summoners War.

O código completo validado está em `sw-service-app.tar.gz`. O Dockerfile extrai esse pacote e executa o backend Node.js 24. Os arquivos antigos fora do pacote não participam da imagem de produção.

Para editar ou testar a versão publicada:

```bash
mkdir sw-service-app
tar -xzf sw-service-app.tar.gz -C sw-service-app
cd sw-service-app
npm ci
npm test
npm start
```

O README dentro do pacote documenta o fluxo, os testes e a configuração. Em produção, monte um volume em `/data`, defina `SESSION_SECRET`, `INITIAL_ADMIN_PASSWORD` e `SITE_URL`. O administrador inicial é `admin@swservice.com`; a senha fica na variável privada da Railway. Nenhuma senha de produção ou base de usuários está neste repositório.

Para uma atualização nesta branch, substitua o pacote pelo código completo revisado.

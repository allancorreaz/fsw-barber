# Publicação do Barber

## Stack de produção

- Aplicação: Vercel (Next.js).
- Banco: PostgreSQL gerenciado pelo Neon.
- Código e deploy contínuo: GitHub, branch `main`.

A Vercel cria deployments automaticamente a partir dos commits enviados à branch de produção. Commits em outras branches podem gerar previews.

## Variáveis de ambiente

Configure estas variáveis no projeto da Vercel, em **Settings → Environment Variables**:

- `DATABASE_URL`: conexão PostgreSQL pooled do Neon, para as requisições da aplicação.
- `DIRECT_URL`: conexão PostgreSQL direta do Neon, usada pelo Prisma Migrate.

Use os valores do projeto Neon. Não coloque credenciais reais no repositório nem em arquivos versionados. O arquivo `.env.example` contém apenas o formato esperado.

## Importar na Vercel

1. Crie um projeto na Vercel e importe `allancorreaz/fsw-barber` pelo GitHub.
2. Confirme Next.js como framework e `./` como diretório raiz.
3. Cadastre `DATABASE_URL` e `DIRECT_URL` nos ambientes necessários.
4. Use como Build Command: `npx prisma migrate deploy && npx prisma generate && npm run build`.
5. Faça o deploy da branch `main`.

O comando de build aplica as migrations versionadas antes de compilar a aplicação. Para ambientes Preview, prefira uma branch de banco separada no Neon para não aplicar alterações de teste no banco de produção.

## Dados iniciais

O repositório contém um seed de demonstração. Revise os nomes, endereços e telefones fictícios antes de executar o seed em um site público. Não use os dados de exemplo como cadastro de estabelecimentos reais.

## Estado atual

O fluxo de solicitação de agendamento grava registros no PostgreSQL e impede dois agendamentos sobrepostos na mesma barbearia, considerando slots de 30 minutos. A confirmação ao cliente, autenticação e painel administrativo ainda precisam ser implementados antes de tratar o sistema como uma plataforma pronta para operação comercial.

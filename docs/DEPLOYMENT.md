# Publicação do Barber

## Stack de produção

- Aplicação: Vercel (Next.js), com deploy automático da branch `main`.
- Banco: PostgreSQL no Neon (plano grátis).
- Pagamentos: Mercado Pago (cada barbearia conecta a própria conta; a plataforma cobra a mensalidade na sua conta).
- Rotina diária: Vercel Cron chamando `/api/cron/billing` (configurado em `vercel.json`).

## 1. Banco no Neon

1. Crie um projeto em neon.tech, região **AWS São Paulo (sa-east-1)**.
2. Em **Connection Details**, copie duas URLs:
   - com **Pooled connection** ligado → `DATABASE_URL`;
   - com **Pooled connection** desligado → `DIRECT_URL`.

## 2. Projeto na Vercel

1. Em vercel.com, **Add New → Project** e importe `allancorreaz/fsw-barber`.
2. Framework: Next.js. Diretório raiz: `./`.
3. **Build Command**: `npx prisma migrate deploy && npx prisma generate && npm run build`
   (aplica as migrations antes de compilar).
4. Em **Environment Variables**, cadastre todas as variáveis do `.env.example`.
   - `APP_URL`: o endereço final do site (ex.: `https://fsw-barber.vercel.app`). Se ainda não souber, faça o primeiro deploy, copie o domínio e faça um **Redeploy** depois.
   - `APP_SECRET` e `CRON_SECRET`: gere valores aleatórios longos. **Não troque `APP_SECRET` depois**: ele cifra os tokens das barbearias.
   - `PLATFORM_ADMIN_EMAILS`: o seu e-mail de login. Dá acesso a `/admin`.
5. Faça o deploy.

## 3. Mercado Pago

### Criar a aplicação

1. Acesse o painel de desenvolvedores do Mercado Pago → **Suas integrações → Criar aplicação**.
2. Tipo de solução: pagamentos online, com **Checkout Pro** e **Assinaturas**. Marque que é uma plataforma (marketplace), para habilitar o OAuth.
3. Em **Configurações / OAuth**, cadastre a URL de redirecionamento:
   `https://SEU-DOMINIO/api/payments/callback`
4. Copie `Client ID` → `MP_CLIENT_ID` e `Client Secret` → `MP_CLIENT_SECRET`.
5. Copie o **Access Token** da sua conta → `MP_PLATFORM_ACCESS_TOKEN` (é onde cai a mensalidade das barbearias).

### Webhooks

1. Em **Webhooks**, cadastre a URL: `https://SEU-DOMINIO/api/webhooks/payments`
2. Marque os eventos: **Pagamentos**, **Planos e assinaturas** (assinaturas e pagamentos de assinatura).
3. Copie a **assinatura secreta** → `MP_WEBHOOK_SECRET`.

O sistema funciona mesmo se um webhook se perder: na volta do checkout ele confere o status direto no Mercado Pago, e a rotina diária sincroniza as assinaturas que estão vencendo.

### Testes antes de cobrar de verdade

1. Deixe `MP_TEST_MODE="true"` e use as **credenciais de teste**.
2. Crie **contas de teste** no painel (uma "vendedora" para a barbearia e uma "compradora" para o cliente).
3. Na barbearia: **Configurações → Conectar minha conta Mercado Pago** (entre com a conta de teste vendedora).
4. No cliente: assine um plano usando a conta compradora e os cartões de teste do Mercado Pago.
5. Confira em **Assinantes** se a assinatura ficou ativa e em **Financeiro** se o pagamento apareceu.

Para produção: troque para as credenciais de produção, `MP_TEST_MODE="false"`, faça Redeploy e peça para as barbearias reconectarem o Mercado Pago.

## 4. Primeiros clientes

1. Cadastre sua conta no site com o e-mail de `PLATFORM_ADMIN_EMAILS`.
2. Cada barbearia cria a conta e cadastra a barbearia em **Minha conta → Cadastrar barbearia** (começa o teste grátis de `SAAS_TRIAL_DAYS` dias).
3. No painel da barbearia, siga o checklist da visão geral: localização, serviços, profissionais (com jornada), planos e Mercado Pago.
4. Em `/admin` você acompanha todas as barbearias, libera meses manualmente (cortesia ou pagamento por fora) e suspende quem não pagar.

## Regras de cobrança

- **Mensalidade da plataforma**: cartão recorrente (1ª cobrança no fim do teste) ou Pix mês a mês. Vencida, há `SAAS_GRACE_DAYS` dias de tolerância. Depois, a barbearia é **suspensa**: o painel mostra só a tela de pagamento, ela some da busca e da vitrine, e ninguém consegue agendar. Nenhum dado é apagado; ao pagar, tudo volta na hora.
- **Plano do cliente**: cobrado no cartão do cliente, direto na conta Mercado Pago da barbearia. Só quem tem plano ativo agenda. Cancelado, o cliente usa até o fim do período pago.
- **Serviço fora do plano**: pago à parte, online (Pix ou cartão) ou registrado no balcão pela equipe.
- O cartão é digitado sempre na página do Mercado Pago. A plataforma não vê nem guarda dados de cartão.

## Testes

- `npm run lint` e `npm run build` rodam na integração contínua.
- `npm run test:billing` testa a lógica de cobrança (assinatura do webhook, períodos, suspensão e idempotência). Use um banco de **teste**: o script cria e apaga registros.

## Trocar o provedor de pagamento (ex.: Celcoin)

Todo o sistema conversa só com a interface `PaymentProvider` (`app/_lib/payments/types.ts`). Para trocar:

1. Crie `app/_lib/payments/celcoin.ts` implementando a interface.
2. Registre-o em `app/_lib/payments/index.ts`.
3. Configure `PAYMENT_PROVIDER="celcoin"` e as credenciais.

Telas, regras de assinatura, webhooks e financeiro não precisam mudar.

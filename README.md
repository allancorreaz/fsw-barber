# FSW Barber

Plataforma de descoberta e agendamento de serviços de barbearia, em evolução para um SaaS multiempresa.

## Visão do produto

- **Clientes:** veem todas as barbearias num raio de 10 km. As cadastradas mostram detalhes, avaliações e planos; as demais aparecem com aviso de que não têm cadastro. Só quem assina um plano da barbearia consegue ver os barbeiros e horários livres e agendar.
- **Barbearias:** painel com agenda, planos de assinatura, assinantes, equipe com papéis, financeiro (só dono e gerente) e recebimento pelo Mercado Pago direto na conta da barbearia.
- **Barbeiros:** acesso próprio para controlar a jornada, as folgas e os próprios atendimentos.
- **Plataforma:** cobra a mensalidade das barbearias (cartão recorrente ou Pix) e suspende automaticamente quem não paga.

A mensalidade SaaS da barbearia é diferente do plano que a barbearia vende aos clientes. Os fluxos financeiros são separados.

## Stack

- Next.js 16 e React 19
- TypeScript
- Tailwind CSS 4
- Prisma ORM 5
- PostgreSQL (Neon)
- Mercado Pago (OAuth, assinaturas e Checkout Pro), atrás de uma interface que permite trocar de provedor
- Vercel para hospedagem e rotina diária (Cron)

## Desenvolvimento

Requisitos: Node.js 22 ou superior e acesso a um PostgreSQL compatível.

1. Instale as dependências com `npm ci`.
2. Copie `.env.example` para `.env` e preencha as variáveis.
3. Gere o Prisma Client com `npx prisma generate`.
4. Inicie o ambiente com `npm run dev`.

Não execute `prisma/seed.ts` contra o banco de produção. O seed contém dados demonstrativos.

## Documentação

- [Arquitetura SaaS, multi-tenancy e limites financeiros](docs/SAAS-ARCHITECTURE.md)
- [ADR 0001 — Identidade, membros e isolamento por barbearia](docs/adr/0001-identity-membership-and-tenant-isolation.md)
- [Configuração e publicação](docs/DEPLOYMENT.md)

## Estado atual

Implementado e testado ponta a ponta localmente: busca por proximidade, contas e papéis, agenda por barbeiro, planos e assinantes, regra "só assinante agenda", serviços avulsos, avaliações, financeiro, mensalidade da plataforma com suspensão automática e painel `/admin`.

A integração com o Mercado Pago está implementada, mas precisa ser validada com credenciais de teste antes de cobrar clientes reais (ver [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)).

## Qualidade

A integração contínua executa instalação, geração do Prisma Client, lint e build. `npm run test:billing` cobre a lógica de cobrança.

# FSW Barber

Plataforma de descoberta e agendamento de serviços de barbearia, em evolução para um SaaS multiempresa.

## Visão do produto

- **Consumidores:** encontram barbearias, consultam serviços e solicitam horários.
- **Barbearias:** terão ambientes próprios para administrar equipe, catálogo, agenda, clientes e identidade visual.
- **Plataforma:** administra os estabelecimentos clientes, os planos SaaS e a cobrança da assinatura da barbearia.

A mensalidade SaaS da barbearia é diferente de um plano comercial que a própria barbearia possa oferecer aos seus consumidores. Os fluxos financeiros devem permanecer separados.

## Stack

- Next.js 16 e React 19
- TypeScript
- Tailwind CSS 4
- Prisma ORM 5
- PostgreSQL (Neon)
- Vercel para hospedagem da aplicação

## Desenvolvimento

Requisitos: Node.js 22 ou superior e acesso a um PostgreSQL compatível.

1. Instale as dependências com `npm ci`.
2. Configure `DATABASE_URL` (conexão pooled) e `DIRECT_URL` (conexão direta) conforme `.env.example`.
3. Gere o Prisma Client com `npx prisma generate`.
4. Inicie o ambiente com `npm run dev`.

Não execute `prisma/seed.ts` contra o banco de produção. O seed contém dados demonstrativos.

## Documentação

- [Arquitetura SaaS, multi-tenancy e limites financeiros](docs/SAAS-ARCHITECTURE.md)
- [Configuração e publicação](docs/DEPLOYMENT.md)

## Estado atual

O fluxo público inicial contempla página institucional, catálogo de barbearias, detalhes dos serviços e solicitação de agendamento. Autenticação, painel de gestão, isolamento multi-tenant completo e cobrança recorrente ainda estão em implementação e não devem ser considerados disponíveis até serem concluídos e validados.

## Qualidade

A integração contínua executa instalação, geração do Prisma Client, lint e build. A cobertura de testes será ampliada junto com a implementação de autenticação, autorização, regras de agenda e pagamentos.

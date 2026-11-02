# Arquitetura SaaS — FSW Barber

## Objetivo

Evoluir o produto de agendamento para uma plataforma SaaS multiempresa. Cada barbearia é uma organização cliente da plataforma e administra seus próprios dados. O consumidor final agenda serviços sem pagar uma mensalidade à plataforma; ele só poderá ter uma assinatura comercial se a própria barbearia oferecer um plano.

Este documento registra decisões de domínio e limites de responsabilidade. Não representa funcionalidades já implementadas.

## Conceitos e relações

- **Plataforma:** operação SaaS que cadastra barbearias, oferece planos comerciais B2B, controla assinaturas e acompanha a situação das contas.
- **Barbearia (tenant):** estabelecimento cliente da plataforma. É dona de seus profissionais, serviços, horários, reservas, clientes, planos comerciais e configurações de marca.
- **Usuário:** identidade de uma pessoa. Pode ser consumidor, proprietário ou colaborador, inclusive com vínculos a mais de uma barbearia.
- **Assinatura SaaS:** contrato entre a plataforma e a barbearia, com plano, ciclo, valor, status, período vigente e referência no gateway.
- **Plano da barbearia:** produto comercial oferecido pela barbearia ao consumidor (por exemplo, pacote mensal de serviços). Não é o plano SaaS.
- **Assinatura do consumidor:** vínculo do consumidor a um plano de uma barbearia. A elegibilidade deve ser verificada por barbearia, período e serviços incluídos.
- **Reserva:** agendamento de um consumidor para um serviço, profissional e horário de uma barbearia.

## Isolamento multi-tenant

1. Toda entidade pertencente a uma barbearia deve carregar uma chave de tenant (barbershopId) ou estar ligada por uma relação cuja propriedade possa ser validada.
2. Toda operação autenticada de gestão deve derivar os tenants autorizados da sessão e das associações do usuário. Nunca aceitar barbershopId enviado pelo navegador como prova de autorização.
3. Consultas, alterações, exclusões e verificações de conflito devem sempre aplicar o escopo do tenant.
4. IDs isolados não substituem autorização. Rotas de detalhe devem validar simultaneamente o recurso e o tenant autorizado.
5. Consumidores podem ter reservas em barbearias diferentes; isso não concede acesso administrativo a nenhuma delas.
6. A implementação deve incluir testes negativos de acesso cruzado entre duas barbearias.

## Separação financeira

Há três fluxos diferentes e não intercambiáveis:

1. **Mensalidade SaaS:** paga pelo proprietário à plataforma para manter a conta da barbearia.
2. **Plano do consumidor:** pago pelo consumidor à barbearia, quando ela comercializar planos recorrentes.
3. **Serviço avulso:** pagamento de um atendimento, conforme a política comercial da barbearia.

Cada cobrança deve registrar finalidade, pagador, recebedor/tenant quando aplicável, valor e moeda, status interno, gateway, referência externa, datas e eventos de confirmação. A confirmação deve vir de webhook autenticado e idempotente ou consulta server-to-server ao gateway; nunca confiar apenas no redirecionamento do checkout.

A plataforma não deve registrar como receita própria os valores devidos à barbearia. A arquitetura de cobrança do consumidor ainda depende de decisão comercial e técnica sobre conta/gateway conectado de cada estabelecimento.

## Gateway inicial

- **Asaas** será a primeira integração planejada para cobrar a assinatura SaaS da barbearia.
- A integração ficará atrás de uma interface interna de gateway, sem espalhar chamadas específicas do Asaas pelo domínio.
- Chaves e tokens serão somente server-side, em variáveis de ambiente/secret manager. Nunca versionar credenciais.
- Webhooks devem validar autenticidade, tratar repetição de eventos e persistir o identificador do evento para idempotência.
- Não assumir que a conta Asaas da plataforma pode receber e repassar valores de terceiros como marketplace. Cobranças dos consumidores em nome das barbearias ficam fora do primeiro escopo até validação de split, onboarding e responsabilidades financeiras.
- Mercado Pago poderá ser adicionado como outro adaptador no futuro, sem reescrever regras de assinatura.

## Regras de planos e serviços

O preço de catálogo do serviço permanece o preço normal. Se o consumidor possuir uma assinatura ativa da mesma barbearia e o serviço estiver incluído e elegível, a interface pode apresentar **“Incluído no seu plano — R$ 0,00”**. A elegibilidade deve ser verificada no servidor ao criar a reserva ou cobrança; não se deve alterar o preço global do serviço para zero.

## Sequência de implementação proposta

1. Registrar domínio, decisões financeiras e ameaças de isolamento (este documento).
2. Modelar tenants, membros e papéis sem quebrar o fluxo público atual.
3. Implementar autenticação e autorização server-side.
4. Migrar serviços, reservas e demais dados para escopo de tenant, com migrations revisadas e testes.
5. Construir gestão da barbearia e onboarding.
6. Modelar planos SaaS e assinaturas B2B.
7. Implementar adaptador Asaas para a mensalidade SaaS, com webhooks e reconciliação.
8. Modelar separadamente planos do consumidor e pagamentos de serviços, após decisão sobre recebimento por cada barbearia.
9. Validar isolamento, cobrança, falhas e deploy em ambiente de homologação antes de produção.

## Critérios de segurança e operação

- Nenhum segredo em código, logs, respostas HTTP ou repositório.
- Webhooks autenticados, idempotentes e auditáveis.
- Valores monetários armazenados em Decimal/numeric, nunca float.
- Datas persistidas em UTC e apresentadas no fuso configurado da barbearia.
- Migrations aditivas e revisadas; não executar seed de demonstração em banco de produção.
- CI deve validar formatação/lint, tipos, geração do Prisma Client, testes e build conforme a cobertura evoluir.
- Mudanças de schema devem ser revisadas considerando os dados já existentes no Neon. Não aplicar migration em produção sem backup e plano de reversão.

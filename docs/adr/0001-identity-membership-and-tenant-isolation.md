# ADR 0001 — Identidade, membros e isolamento por barbearia

- **Status:** direção arquitetural aprovada; implementação pendente
- **Data:** 2026-11-02
- **Escopo:** autenticação, autorização e multi-tenancy

## Contexto

O sistema atual possui um cadastro global de usuários consumidores e barbearias, mas ainda não possui autenticação nem associação de pessoas autorizadas a administrar um estabelecimento. A evolução para SaaS exige distinguir identidade global, vínculo com cada tenant e papel exercido nesse tenant.

Uma pessoa pode agendar como consumidor em várias barbearias e também trabalhar ou administrar uma ou mais barbearias. Portanto, um papel global no registro User não representa corretamente as permissões.

## Decisão

### 1. Identidade global

- Manter User como identidade global da pessoa, com e-mail normalizado e único.
- A identidade pode ser consumidora, membro de equipe ou ambas.
- A autenticação deve associar a sessão a um User persistido. A sessão não deve aceitar IDs de usuário enviados pelo cliente.
- Não armazenar senhas em texto puro. O mecanismo de autenticação e os provedores serão escolhidos e configurados antes de habilitar rotas administrativas.

### 2. Associação por tenant

Criar uma entidade associativa conceitual chamada BarbershopMember, com:

- userId e barbershopId obrigatórios;
- role obrigatório;
- status (por exemplo, convite pendente, ativo ou suspenso);
- datas de criação/atualização e, se necessário, registro de quem convidou;
- unicidade de (userId, barbershopId) e índices para consultas por tenant e usuário.

Uma mesma pessoa poderá ter vínculos distintos em barbearias diferentes. Não adicionar role global em User.

Papéis iniciais:

| Papel | Escopo |
| --- | --- |
| OWNER | Administração integral do estabelecimento, incluindo equipe, configurações e assinatura SaaS |
| MANAGER | Operação do estabelecimento, equipe, catálogo e agenda; sem transferir propriedade ou administrar a cobrança SaaS |
| RECEPTIONIST | Clientes e agendamentos conforme permissões concedidas; sem acesso à cobrança SaaS |
| STAFF | Acesso operacional restrito, preferencialmente à própria agenda e aos atendimentos atribuídos |

O papel é sempre interpretado junto com barbershopId e status ativo da associação. O OWNER de uma barbearia não recebe acesso a outra automaticamente.

### 3. Profissional e credencial são conceitos diferentes

O cadastro operacional de um profissional (nome público, especialidades, foto, serviços e agenda) não deve depender obrigatoriamente de ele possuir login. Uma futura entidade Professional poderá ser associada opcionalmente a um User e, quando houver credencial, a um membro STAFF. Isso permite cadastrar profissionais que ainda não usam o painel.

### 4. Autorização server-side

- Criar uma função central, por exemplo requireBarbershopAccess(barbershopId, allowedRoles), que obtenha o User da sessão e valide a associação ativa.
- As rotas administrativas devem chamar essa verificação antes de consultar ou alterar dados do tenant.
- Não confiar em barbershopId, userId ou role recebidos no body, query string, headers customizados ou estado do navegador.
- Aplicar filtro de tenant em toda leitura e escrita; validar também o tenant do recurso referenciado.
- Consumidores só podem consultar seus próprios dados privados e reservas após autenticação; o fluxo público de criação de reserva permanece separado.
- Criar testes de autorização para: membro autorizado, usuário sem vínculo, vínculo suspenso, papel insuficiente e tentativa de acesso a outra barbearia.

### 5. Integridade relacional

A associação de um membro deve ter chaves estrangeiras para User e Barbershop e uma restrição única composta. Entidades operacionais pertencentes ao tenant devem ter chave de tenant direta ou uma relação cuja propriedade possa ser validada. Para reservas, o serviço selecionado precisa pertencer à barbearia e essa relação deve ser validada no servidor.

## Estratégia de migração

O schema atual já possui dados e uma migration inicial versionada. Antes de criar a primeira migration de multi-tenancy:

1. Comparar todas as migrations existentes nos ambientes de desenvolvimento e no repositório.
2. Verificar a tabela _prisma_migrations no banco de homologação e confirmar qual baseline foi aplicada.
3. Preservar os registros atuais de User, Barbershop, BarbershopService e Booking.
4. Criar a nova migration de forma aditiva; não recriar tabelas existentes nem executar seed demonstrativo.
5. Testar upgrade em uma cópia de banco e validar rollback operacional antes de produção.

Não executar prisma migrate reset, não apagar migrations e não aplicar migration de desenvolvimento diretamente no Neon de produção.

## Critérios de aceite

- Um usuário pode pertencer a mais de uma barbearia com papéis distintos.
- O acesso de uma barbearia não revela dados de outra.
- Suspender uma associação revoga imediatamente o acesso administrativo daquele tenant.
- A identidade de consumidor existente continua válida e pode ser vinculada a uma associação sem duplicar User.
- Nenhuma rota administrativa fica acessível antes de autenticação e autorização server-side.
- A migration preserva todos os dados existentes e passa por teste de upgrade em homologação.

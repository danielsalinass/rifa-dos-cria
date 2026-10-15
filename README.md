# Rifa Formatura dos Cria

Aplicação web para gerenciar a rifa de formatura: controle de 500 números, registro de vendas e pagamentos e realização do sorteio.

**Produção:** https://rifa.formatura26.workers.dev

## Funcionalidades

**Área pública**
- Grade com os 500 números, indicando quais estão livres e quais foram vendidos
- Filtros (todos, livres, vendidos) e busca por número
- Cópia da lista de números livres, formatada para envio por mensagem
- Exibição do resultado do sorteio

**Área administrativa** (requer autenticação)
- Registro de vendas com nome, telefone, vendedor e status de pagamento
- Registro de vários números de uma vez, por seleção na grade ou por intervalo (`10, 15, 20-29`)
- Painel com totais vendidos, valor recebido, valor pendente e vendas por vendedor
- Lista de compradores
- Liberação de números e sorteio entre os números pagos

## Tecnologias

| Camada | Tecnologia |
| --- | --- |
| Interface | HTML, CSS e JavaScript, sem etapa de build |
| Banco de dados e autenticação | [Supabase](https://supabase.com) (PostgreSQL com Row Level Security) |
| Hospedagem | [Cloudflare Workers](https://developers.cloudflare.com/workers/static-assets/) (arquivos estáticos) |

## Estrutura do projeto

```
.
├── public/                  # Arquivos publicados
│   ├── index.html
│   └── assets/
│       ├── css/styles.css
│       ├── js/config.js     # URL e chave pública do Supabase, parâmetros da rifa
│       ├── js/app.js        # Lógica da aplicação
│       └── img/
├── supabase/
│   └── schema.sql           # Tabelas, view pública e políticas de acesso
└── wrangler.jsonc           # Configuração de deploy do Cloudflare
```

## Configuração

### 1. Banco de dados

1. Crie um projeto no Supabase.
2. Execute `supabase/schema.sql` no **SQL Editor**.
3. Em **Authentication → Users**, crie os usuários administradores com a opção *Auto Confirm User*.
4. Em **Authentication → Sign In / Providers**, desative **Allow new users to sign up**.

### 2. Aplicação

Preencha `public/assets/js/config.js` com a **Project URL** e a **chave publicável** (*anon* / *publishable*) do projeto, disponíveis em **Project Settings → API**.

### 3. Execução local

Sirva a pasta `public/` com qualquer servidor estático:

```bash
npx serve public
```

## Deploy

O repositório está conectado ao Cloudflare Workers. Cada commit na branch `main` publica a pasta `public/` automaticamente, conforme definido em `wrangler.jsonc`.

## Segurança

- A chave em `config.js` é a chave **publicável** do Supabase, projetada para uso no navegador. A chave `service_role` nunca deve ser incluída no repositório.
- O acesso aos dados é controlado por Row Level Security:
  - visitantes leem apenas a view `numeros_publicos`, que expõe somente os números vendidos, sem dados dos compradores;
  - somente usuários autenticados leem e alteram a tabela `numeros` e registram o sorteio.
- O cadastro público de usuários deve permanecer desativado, para que apenas os administradores criados manualmente tenham acesso.
- Os dados pessoais dos compradores (nome e telefone) devem ser excluídos ao final da rifa.

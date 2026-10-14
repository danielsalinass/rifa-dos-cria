# Rifa Formatura dos Cria

Site da rifa de formatura do Pauman e do Piteco: 500 números a R$5. O prêmio é R$500 no Pix ou 1 leitão gordo.

- **Público:** vê quais números estão livres ou vendidos.
- **Admin** (botão "Entrar (admin)"): registra vendas, inclusive vários números de uma vez, marca quem pagou, vê o caixa e faz o sorteio.

## Como funciona

- `public/index.html` — o site inteiro: visual, lógica e conexão com o Supabase.
- `public/leitao.png`, `public/crias.jpg` — imagens do cartaz.
- `supabase-setup.sql` — script que cria as tabelas e as regras de acesso no Supabase.

Os dados das vendas ficam no Supabase, e não neste repositório. Por isso, atualizar o site não apaga nenhuma venda.

## Publicação

Hospedado no Cloudflare. Quando o Cloudflare está ligado a este repositório, cada commit na branch `main` publica o site automaticamente.

Configuração usada pelo Cloudflare: `wrangler.jsonc`, que publica a pasta `public/` no Worker `rifa`.

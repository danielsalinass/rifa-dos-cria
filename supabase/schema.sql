-- =============================================================
-- Rifa Formatura dos Cria — esquema do banco de dados (Supabase)
--
-- Cria as tabelas, a view pública e as políticas de Row Level
-- Security. Execute no SQL Editor do projeto. O script é
-- idempotente: pode ser executado novamente sem perda de dados.
-- =============================================================

-- Números vendidos. Leitura e escrita restritas a usuários autenticados.
create table if not exists public.numeros (
  numero     int primary key check (numero between 1 and 500),
  nome       text not null,
  telefone   text,
  vendedor   text,
  pago       boolean not null default false,
  atualizado timestamptz not null default now()
);

alter table public.numeros enable row level security;

drop policy if exists "admin le numeros" on public.numeros;
drop policy if exists "admin grava numeros" on public.numeros;
create policy "admin le numeros"    on public.numeros for select to authenticated using (true);
create policy "admin grava numeros" on public.numeros for all    to authenticated using (true) with check (true);

-- View pública: expõe apenas os números vendidos, sem dados dos compradores.
create or replace view public.numeros_publicos as
  select numero from public.numeros;

grant select on public.numeros_publicos to anon, authenticated;

-- Resultado do sorteio. Leitura pública; escrita restrita a usuários autenticados.
create table if not exists public.sorteio (
  id     int primary key default 1 check (id = 1),
  numero int not null,
  nome   text,
  quando timestamptz not null default now()
);

alter table public.sorteio enable row level security;

drop policy if exists "todos veem sorteio" on public.sorteio;
drop policy if exists "admin grava sorteio" on public.sorteio;
create policy "todos veem sorteio"  on public.sorteio for select to anon, authenticated using (true);
create policy "admin grava sorteio" on public.sorteio for all    to authenticated using (true) with check (true);

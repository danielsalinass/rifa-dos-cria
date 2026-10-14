-- RIFA FORMATURA DOS CRIA — configuração do banco (Supabase)
-- Cole tudo isto no SQL Editor do Supabase e clique em "Run".

-- 1) Números vendidos (só o admin lê os dados completos)
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

-- 2) Visão pública: mostra só QUAIS números já foram vendidos
--    (sem nome nem telefone dos compradores)
create or replace view public.numeros_publicos as
  select numero from public.numeros;

grant select on public.numeros_publicos to anon, authenticated;

-- 3) Resultado do sorteio (todo mundo vê, só o admin grava)
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

/**
 * Configuração pública da aplicação.
 *
 * `supabaseKey` é a chave publicável (anon) do Supabase: ela é feita para ser
 * exposta no navegador. O acesso aos dados é controlado pelas políticas de
 * Row Level Security definidas em `supabase/schema.sql`.
 * Nunca coloque aqui a chave `service_role` / secreta.
 */
window.RIFA_CONFIG = Object.freeze({
  supabaseUrl: "https://trcepyjmlxqlqcuohnbl.supabase.co",
  supabaseKey: "sb_publishable_WC_Ym950wjJeCWfbyi9LIg_ir3vkeD7",
  totalNumeros: 500,
  precoNumero: 5,
  intervaloAtualizacaoMs: 15000,
});

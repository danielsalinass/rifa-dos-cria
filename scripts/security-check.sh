#!/usr/bin/env bash
# =============================================================
# Diagnóstico de segurança da Rifa Formatura dos Cria
#
# Verificações estáticas (código do repositório) e verificações
# na aplicação publicada (site e Supabase), sem credenciais:
# tudo é testado como um visitante anônimo.
#
# Uso:  scripts/security-check.sh [--static-only]
# Variáveis opcionais:
#   SITE_URL        URL publicada (padrão: https://rifa.formatura26.workers.dev)
#   DEPLOY_WAIT_S   tempo máximo para aguardar o deploy da versão atual (padrão: 300)
#
# Saída: relatório em Markdown (também em $GITHUB_STEP_SUMMARY, se definido).
# Código de saída 1 se alguma verificação crítica falhar.
# =============================================================
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PUBLIC="$ROOT/public"
SITE_URL="${SITE_URL:-https://rifa.formatura26.workers.dev}"
SITE_URL="${SITE_URL%/}"
DEPLOY_WAIT_S="${DEPLOY_WAIT_S:-300}"
STATIC_ONLY=0
[[ "${1:-}" == "--static-only" ]] && STATIC_ONLY=1

PASS=0; WARN=0; FAIL=0
REPORT=""
section() { REPORT+=$'\n'"### $1"$'\n\n'"| | Verificação | Detalhe |"$'\n'"|---|---|---|"$'\n'; }
row() { # status, título, detalhe
  local icon
  case "$1" in ok) icon="✅"; PASS=$((PASS+1));; warn) icon="⚠️"; WARN=$((WARN+1));; fail) icon="❌"; FAIL=$((FAIL+1));; esac
  local detail="${3//|/\\|}"
  REPORT+="| $icon | $2 | ${detail} |"$'\n'
  # Anotações do GitHub Actions: aparecem na página da execução
  if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
    case "$1" in warn) echo "::warning title=$2::$3";; fail) echo "::error title=$2::$3";; esac
  fi
}

need() { command -v "$1" >/dev/null 2>&1 || { echo "Dependência ausente: $1" >&2; exit 2; }; }
need curl; need jq; need openssl; need grep

# ---------- Leitura da configuração ----------
CONFIG="$PUBLIC/assets/js/config.js"
cfg() { grep -oE "$1: *\"[^\"]+\"" "$CONFIG" | head -1 | sed -E 's/.*"([^"]+)"/\1/'; }
SB_URL="${SUPABASE_URL:-$(cfg supabaseUrl)}"; SB_URL="${SB_URL%/}"
SB_KEY="$(cfg supabaseKey)"

b64url_decode() { local s="${1//-/+}"; s="${s//_//}"; while (( ${#s} % 4 )); do s+="="; done; printf '%s' "$s" | openssl base64 -d -A 2>/dev/null; }
jwt_role() { local p; p="$(printf '%s' "$1" | cut -d. -f2)"; b64url_decode "$p" | jq -r '.role // empty' 2>/dev/null; }

# =============================================================
section "Código do repositório"

# 1. Segredos versionados
FILES=$(cd "$ROOT" && git ls-files 2>/dev/null || find . -type f -not -path './.git/*')
SECRET_HITS=""
while IFS= read -r f; do
  [[ -z "$f" || "$f" == "scripts/security-check.sh" ]] && continue
  file -b --mime "$ROOT/$f" 2>/dev/null | grep -q 'charset=binary' && continue
  if grep -nE 'sb_secret_[A-Za-z0-9_-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}' "$ROOT/$f" >/dev/null 2>&1; then
    SECRET_HITS+="$f "
  fi
  for tok in $(grep -oE 'eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+' "$ROOT/$f" 2>/dev/null); do
    [[ "$(jwt_role "$tok")" == "service_role" ]] && SECRET_HITS+="$f(service_role) "
  done
done <<< "$FILES"
if [[ -z "$SECRET_HITS" ]]; then row ok "Nenhuma chave secreta no repositório" "Procurei chaves service_role, sb_secret, tokens do GitHub e da AWS e chaves privadas"
else row fail "Chave secreta encontrada no repositório" "Arquivos: $SECRET_HITS. Revogue a chave imediatamente no painel do serviço"; fi

# 2. Chave do Supabase é a pública
if [[ -z "$SB_URL" || -z "$SB_KEY" ]]; then row fail "Configuração do Supabase" "config.js sem supabaseUrl ou supabaseKey"
elif [[ "$SB_KEY" == sb_publishable_* ]] || [[ "$(jwt_role "$SB_KEY")" == "anon" ]]; then row ok "Chave do Supabase no site é a pública" "Prefixo ${SB_KEY:0:15}…"
else row fail "Chave do Supabase no site não é a pública" "Use a chave anon/publishable em config.js"; fi

# 3. Scripts externos: versão fixa e integridade (SRI)
EXT_SCRIPTS=$(grep -oE '<script[^>]+src="https?://[^"]+"[^>]*>' "$PUBLIC/index.html" || true)
if [[ -z "$EXT_SCRIPTS" ]]; then row ok "Scripts externos" "Nenhum"
else
  while IFS= read -r tag; do
    src=$(sed -E 's/.*src="([^"]+)".*/\1/' <<< "$tag")
    if ! grep -qE '@[0-9]+\.[0-9]+\.[0-9]+' <<< "$src"; then row fail "Script externo sem versão fixa" "$src"; continue; fi
    integ=$(grep -oE 'integrity="[^"]+"' <<< "$tag" | sed -E 's/integrity="([^"]+)"/\1/')
    if [[ $STATIC_ONLY -eq 1 ]]; then
      [[ -n "$integ" ]] && row ok "Script externo com versão fixa e integridade" "$src" || row warn "Script externo sem verificação de integridade (SRI)" "$src"
      continue
    fi
    body_file=$(mktemp)
    if ! curl -fsSL --max-time 30 "$src" -o "$body_file" 2>/dev/null; then
      rm -f "$body_file"; row warn "Não foi possível baixar o script externo para conferir" "$src"; continue
    fi
    actual="sha384-$(openssl dgst -sha384 -binary "$body_file" | openssl base64 -A)"; rm -f "$body_file"
    if [[ -z "$integ" ]]; then row warn "Script externo sem verificação de integridade (SRI)" "Adicione integrity=\"$actual\" crossorigin=\"anonymous\" em $src"
    elif [[ "$integ" == "$actual" ]]; then row ok "Script externo com versão fixa e integridade conferida" "$src"
    else row fail "Integridade do script externo não confere" "$src: esperado $integ, recebido $actual. O site não vai carregar"; fi
  done <<< "$EXT_SCRIPTS"
fi

# 4. Sem scripts inline nem handlers em atributos HTML
if grep -nE '<script>|<script [^>]*>[^<]+</script>| on[a-z]+="' "$PUBLIC/index.html" >/dev/null; then
  row warn "JavaScript embutido no HTML" "Mantenha o código em assets/js para permitir uma política de conteúdo (CSP) estrita"
else row ok "Sem JavaScript embutido no HTML" "Todo o código está em assets/js"; fi

# 5. Dados de usuários inseridos como texto, não como HTML
UNSAFE=$(grep -nE '(inner|outer)HTML\s*\+?=|insertAdjacentHTML|document\.write' "$PUBLIC/assets/js/app.js" | grep -vE 'innerHTML\s*=\s*"[^"]*";' || true)
if [[ -z "$UNSAFE" ]]; then row ok "Nomes e telefones exibidos como texto" "innerHTML usado apenas com conteúdo fixo"
else row warn "innerHTML com conteúdo dinâmico" "Revise: $(head -c 300 <<< "$UNSAFE")"; fi

# 6. Cabeçalhos de segurança configurados
HDR="$PUBLIC/_headers"
MISSING=""
for h in X-Content-Type-Options X-Frame-Options Referrer-Policy Permissions-Policy; do grep -qi "^\s*$h:" "$HDR" 2>/dev/null || MISSING+="$h "; done
if [[ -z "$MISSING" ]]; then row ok "Cabeçalhos de segurança configurados" "public/_headers"
else row warn "Cabeçalhos de segurança ausentes na configuração" "$MISSING"; fi

# 7. Políticas RLS presentes no esquema
SCHEMA="$ROOT/supabase/schema.sql"
if grep -qi 'alter table public.numeros enable row level security' "$SCHEMA" && grep -qi 'alter table public.sorteio enable row level security' "$SCHEMA"; then
  row ok "Row Level Security ativado no esquema" "numeros e sorteio"
else row fail "Row Level Security ausente no esquema" "supabase/schema.sql"; fi

# =============================================================
if [[ $STATIC_ONLY -eq 0 ]]; then
section "Aplicação publicada"

# 8. Site no ar com a versão deste commit
LOCAL_SUM=$(openssl dgst -sha256 "$PUBLIC/assets/js/app.js" | awk '{print $NF}')
deadline=$(( $(date +%s) + DEPLOY_WAIT_S )); LIVE_SUM=""
while :; do
  LIVE_SUM=$(curl -fsSL --max-time 20 "$SITE_URL/assets/js/app.js?nocache=$(date +%s)" 2>/dev/null | openssl dgst -sha256 | awk '{print $NF}')
  [[ "$LIVE_SUM" == "$LOCAL_SUM" ]] && break
  (( $(date +%s) >= deadline )) && break
  sleep 20
done
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$SITE_URL/")
if [[ "$CODE" != "200" ]]; then row fail "Site fora do ar" "$SITE_URL respondeu HTTP $CODE"
elif [[ "$LIVE_SUM" == "$LOCAL_SUM" ]]; then row ok "Site no ar com a versão deste commit" "$SITE_URL"
else row warn "Site no ar, mas com outra versão" "O deploy desta versão não apareceu em ${DEPLOY_WAIT_S}s. Confira o build no Cloudflare"; fi

# 9. HTTPS obrigatório
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 20 "${SITE_URL/https:/http:}/")
if [[ "$HTTP_CODE" =~ ^30[178]\ https:// ]]; then row ok "HTTP redireciona para HTTPS" "$HTTP_CODE"
else row warn "HTTP não redireciona para HTTPS" "Resposta: $HTTP_CODE"; fi

# 10. Cabeçalhos de segurança na resposta real
LIVE_HDRS=$(curl -sSI --max-time 20 "$SITE_URL/" | tr -d '\r')
MISSING=""
for h in X-Content-Type-Options X-Frame-Options Referrer-Policy; do grep -qi "^$h:" <<< "$LIVE_HDRS" || MISSING+="$h "; done
if [[ -z "$MISSING" ]]; then row ok "Cabeçalhos de segurança aplicados no site" "nosniff, proteção contra iframe e Referrer-Policy"
else row warn "Cabeçalhos de segurança não aplicados no site" "Ausentes: $MISSING"; fi

# 11. Arquivos internos não publicados
LEAK=""
for p in /.git/config /supabase/schema.sql /wrangler.jsonc /README.md /scripts/security-check.sh; do
  c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$SITE_URL$p"); [[ "$c" == "200" ]] && LEAK+="$p "
done
# O roteamento de SPA pode responder 200 com o index.html; confere o conteúdo
for p in $LEAK; do curl -s --max-time 15 "$SITE_URL$p" | grep -q '<title>Rifa dos Cria</title>' && LEAK="${LEAK/$p /}"; done
if [[ -z "$LEAK" ]]; then row ok "Arquivos internos não estão publicados" "Só a pasta public/ vai para o ar"
else row fail "Arquivos internos acessíveis no site" "$LEAK"; fi

# ---------- Supabase, como visitante anônimo ----------
AUTH=(-H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY")
REST="$SB_URL/rest/v1"

# 12. Cadastro público desativado
SET=$(curl -fsS --max-time 20 "${AUTH[@]}" "$SB_URL/auth/v1/settings" 2>/dev/null)
if [[ -z "$SET" ]]; then row fail "Configurações de autenticação" "Supabase não respondeu. O projeto pode estar pausado"
else
  if [[ "$(jq -r '.disable_signup' <<< "$SET")" == "true" ]]; then row ok "Cadastro de novos usuários desativado" "Só os admins criados manualmente conseguem entrar"
  else row fail "Cadastro de novos usuários ATIVADO" "Qualquer pessoa pode criar conta e editar a rifa. Desative em Authentication → Sign In / Providers"; fi
  PROVIDERS=$(jq -r '.external | to_entries | map(select(.value==true and .key!="email")) | map(.key) | join(", ")' <<< "$SET")
  if [[ -z "$PROVIDERS" ]]; then row ok "Login apenas por e-mail e senha" "Nenhum login social ativado"
  else row warn "Logins externos ativados" "$PROVIDERS"; fi
fi

# 13. Dados dos compradores não são lidos por visitantes
R=$(curl -s --max-time 20 "${AUTH[@]}" "$REST/numeros?select=*&limit=5")
if [[ "$R" == "[]" ]]; then row ok "Nomes e telefones protegidos" "Visitante recebe a tabela numeros vazia"
elif jq -e 'type=="object" and (.code? // "")!=""' <<< "$R" >/dev/null 2>&1; then row ok "Nomes e telefones protegidos" "Acesso negado ($(jq -r .code <<< "$R"))"
else row fail "Dados dos compradores expostos" "Visitante consegue ler a tabela numeros"; fi

# 14. View pública expõe só o número
R=$(curl -s --max-time 20 "${AUTH[@]}" "$REST/numeros_publicos?select=*&limit=5")
if jq -e 'type=="array"' <<< "$R" >/dev/null 2>&1; then
  EXTRA=$(jq -r '[.[] | keys[]] | unique | map(select(.!="numero")) | join(", ")' <<< "$R")
  if [[ -z "$EXTRA" ]]; then row ok "Lista pública mostra só os números" "$(jq length <<< "$R") registro(s) na amostra"
  else row fail "Lista pública expõe campos extras" "$EXTRA"; fi
else row fail "Lista pública indisponível" "$(head -c 200 <<< "$R")"; fi

# 15/16. Visitante não consegue gravar. A linha de teste é inválida de propósito
# (nome nulo / numero nulo): se a proteção falhar, o banco recusa mesmo assim e nada é gravado.
write_probe() { # tabela, corpo
  curl -s --max-time 20 "${AUTH[@]}" -H "Content-Type: application/json" -H "Prefer: return=minimal" \
       -X POST "$REST/$1" -d "$2" -w $'\n%{http_code}'
}
check_write() { # tabela, corpo, título
  local out code body
  out=$(write_probe "$1" "$2"); code="${out##*$'\n'}"; body="${out%$'\n'*}"
  local pgcode; pgcode=$(jq -r '.code // empty' <<< "$body" 2>/dev/null)
  if [[ "$pgcode" == "42501" || "$code" == "401" || "$code" == "403" ]]; then row ok "$3" "Bloqueado (HTTP $code${pgcode:+, $pgcode})"
  elif [[ "$code" =~ ^2 ]]; then row fail "$3" "Visitante GRAVOU na tabela $1. Revise as políticas RLS"
  else row fail "$3" "A proteção não bloqueou; a gravação só falhou por dado inválido (HTTP $code${pgcode:+, $pgcode})"; fi
}
check_write numeros '{"numero":1,"nome":null}' "Visitante não consegue registrar vendas"
check_write sorteio '{"id":1,"numero":null}' "Visitante não consegue alterar o sorteio"
fi

# =============================================================
STATUS="✅ Nenhum problema crítico"
(( WARN > 0 )) && STATUS="⚠️ Sem problemas críticos, com $WARN alerta(s)"
(( FAIL > 0 )) && STATUS="❌ $FAIL problema(s) crítico(s)"
OUT="## Diagnóstico de segurança"$'\n\n'"**$STATUS** · $PASS ok · $WARN alerta(s) · $FAIL crítico(s)"$'\n'"$REPORT"
printf '%s\n' "$OUT"
[[ -n "${GITHUB_STEP_SUMMARY:-}" ]] && printf '%s\n' "$OUT" >> "$GITHUB_STEP_SUMMARY"
(( FAIL > 0 )) && exit 1
exit 0

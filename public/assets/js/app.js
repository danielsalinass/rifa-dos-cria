/**
 * Rifa Formatura dos Cria — lógica da aplicação.
 *
 * Visitantes veem apenas quais números estão vendidos (view `numeros_publicos`).
 * Administradores autenticados no Supabase gerenciam vendas, pagamentos e sorteio.
 * Configuração em `config.js`.
 */
(() => {
  const CFG = window.RIFA_CONFIG || {};
  const SUPABASE_URL = CFG.supabaseUrl || "", SUPABASE_KEY = CFG.supabaseKey || "";
  const TOTAL = CFG.totalNumeros || 500, PRECO = CFG.precoNumero || 5, ATUALIZA_MS = CFG.intervaloAtualizacaoMs || 15000;
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(3, "0");
  const brl = (v) => "R$ " + v.toLocaleString("pt-BR");

  const vendidosPub = new Set();   // visão pública: só números
  const vendas = new Map();        // visão admin: dados completos
  let sorteio = null, admin = null, sb = null;
  let filtro = "todos", termo = "", carregado = false;
  let atual = null, fVendedor = "Pauman", fPago = false;

  const configurado = !!SUPABASE_URL && !!SUPABASE_KEY;

  // ---------- Grade ----------
  const grade = $("grade"), botoes = [];
  for (let i = 1; i <= TOTAL; i++) {
    const b = document.createElement("button");
    b.className = "n"; b.type = "button"; b.textContent = pad(i);
    b.addEventListener("click", () => tocar(i));
    botoes.push(b); grade.appendChild(b);
  }
  const vazio = document.createElement("div");
  vazio.className = "vazio"; vazio.textContent = "Nenhum número encontrado.";

  function toast(msg) {
    const t = $("toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2600);
  }
  function aviso(msg, erro) { const a = $("aviso"); a.hidden = !msg; a.textContent = msg || ""; a.classList.toggle("erro", !!erro); }
  const vendido = (i) => admin ? vendas.has(i) : vendidosPub.has(i);

  function render() {
    const q = termo.trim().toLowerCase();
    let visiveis = 0, pagos = 0, reserv = 0; const porV = {};
    for (let i = 1; i <= TOTAL; i++) {
      const b = botoes[i - 1], v = admin ? vendas.get(i) : null, sold = vendido(i);
      b.classList.toggle("p", !!(v && v.pago));
      b.classList.toggle("r", !!(v && !v.pago));
      b.classList.toggle("v", !admin && sold);
      b.classList.toggle("win", !!(sorteio && sorteio.numero === i));
      b.setAttribute("aria-label", pad(i) + (sold ? (v ? (v.pago ? " pago, " : " falta pagar, ") + v.nome : " vendido") : " livre"));
      b.title = v ? v.nome + (v.pago ? " · pago" : " · falta pagar") : (sold ? "Vendido" : "Livre");
      if (v) { v.pago ? pagos++ : reserv++; const k = v.vendedor || "—"; porV[k] = porV[k] || { q: 0, p: 0 }; porV[k].q++; if (v.pago) porV[k].p++; }
      let show = true;
      if (filtro === "livres") show = !sold; else if (filtro === "vendidos") show = sold; else if (filtro === "pendentes") show = !!(v && !v.pago);
      if (show && q) show = pad(i).includes(q) || String(i) === q || !!(v && ((v.nome || "").toLowerCase().includes(q) || (v.telefone || "").includes(q)));
      b.hidden = !show; if (show) visiveis++;
    }
    if (visiveis === 0) grade.appendChild(vazio); else vazio.remove();

    const totalVend = admin ? vendas.size : vendidosPub.size;
    $("pVend").textContent = totalVend + "/500";
    $("pLivres").textContent = TOTAL - totalVend;
    $("pBarra").style.width = (totalVend / TOTAL * 100) + "%";

    if (admin) {
      $("sVend").textContent = totalVend + "/500";
      $("sPagos").textContent = pagos;
      $("sFalta").textContent = brl(reserv * PRECO);
      $("sCaixa").textContent = brl(pagos * PRECO);
      $("bP").style.width = (pagos / TOTAL * 100) + "%";
      $("bR").style.width = (reserv / TOTAL * 100) + "%";
      const pv = $("porVendedor"); pv.textContent = "";
      ["Pauman", "Piteco"].forEach((nome) => {
        const d = porV[nome] || { q: 0, p: 0 }, s = document.createElement("span");
        s.innerHTML = "<strong></strong> vendeu <b></b> · <b></b> no caixa";
        s.children[0].textContent = nome; s.children[1].textContent = d.q; s.children[2].textContent = brl(d.p * PRECO);
        pv.appendChild(s);
      });
      const r = document.createElement("span"); r.innerHTML = "<b></b> livres"; r.children[0].textContent = TOTAL - totalVend; pv.appendChild(r);

      const tb = $("tbody"); tb.textContent = "";
      const linhas = [...vendas.entries()].sort((a, b) => a[0] - b[0]);
      if (!linhas.length) {
        const tr = document.createElement("tr"), td = document.createElement("td");
        td.colSpan = 5; td.textContent = carregado ? "Nenhum número vendido ainda. Toque num número para registrar a primeira venda." : "Carregando…";
        tr.appendChild(td); tb.appendChild(tr);
      }
      for (const [n, v] of linhas) {
        const tr = document.createElement("tr");
        const c = (t, cls) => { const td = document.createElement("td"); td.textContent = t; if (cls) td.className = cls; tr.appendChild(td); return td; };
        c(pad(n), "num"); c(v.nome || ""); c(v.telefone || "—"); c(v.vendedor || "—");
        const p = document.createElement("span"); p.className = "pill " + (v.pago ? "p" : "r"); p.textContent = v.pago ? "Pago" : "Falta pagar"; c("").appendChild(p);
        tr.style.cursor = "pointer"; tr.addEventListener("click", () => tocar(n));
        tb.appendChild(tr);
      }
    }
    renderSorteio();
  }

  function renderSorteio() {
    const box = $("sorteioBox");
    if (!sorteio) { box.hidden = true; return; }
    box.hidden = false; box.textContent = "";
    const t = document.createElement("span"); t.className = "t"; t.textContent = "Número sorteado";
    const r = document.createElement("span"); r.className = "res"; r.textContent = pad(sorteio.numero);
    const q = document.createElement("span"); q.className = "quem";
    q.textContent = (sorteio.nome ? sorteio.nome + " · " : "") + new Date(sorteio.quando).toLocaleString("pt-BR");
    box.append(t, r, q);
    if (admin) {
      const x = document.createElement("button"); x.className = "btn ghost"; x.textContent = "Apagar resultado";
      x.addEventListener("click", async () => {
        const { error } = await sb.from("sorteio").delete().eq("id", 1);
        if (error) toast("Não deu para apagar"); else { sorteio = null; render(); toast("Resultado apagado"); }
      });
      box.appendChild(x);
    }
  }

  function modoAdmin() {
    const on = !!admin;
    $("placarPub").hidden = on; $("placarAdm").hidden = !on;
    $("legPub").hidden = on; $("legAdm").hidden = !on;
    $("lista").hidden = !on; $("btnSortear").hidden = !on; $("btnVarios").hidden = !on;
    if (!on && typeof sairSelecao === "function" && selecionando) sairSelecao();
    document.querySelectorAll(".chip.adm").forEach((c) => (c.hidden = !on));
    $("btnLogin").hidden = on; $("btnSair").hidden = !on;
    $("quem").hidden = !on; $("quem").textContent = on ? "Admin: " + (admin.email || "") : "";
    $("busca").placeholder = on ? "Buscar número, nome ou telefone" : "Buscar número";
    if (!on && filtro === "pendentes") { filtro = "todos"; document.querySelectorAll(".chip").forEach((o) => o.setAttribute("aria-pressed", String(o.dataset.f === "todos"))); }
  }

  // ---------- Dados ----------
  async function carregar() {
    if (!sb) return;
    try {
      if (admin) {
        const { data, error } = await sb.from("numeros").select("*").order("numero");
        if (error) throw error;
        vendas.clear(); data.forEach((v) => vendas.set(v.numero, v));
      } else {
        const { data, error } = await sb.from("numeros_publicos").select("numero");
        if (error) throw error;
        vendidosPub.clear(); data.forEach((v) => vendidosPub.add(v.numero));
      }
      const s = await sb.from("sorteio").select("*").eq("id", 1).maybeSingle();
      sorteio = s.data || null;
      carregado = true;
      if ($("aviso").classList.contains("erro")) aviso("");
      render();
    } catch (e) {
      console.error(e);
      aviso("Não consegui carregar os números. Confere a internet ou a configuração do Supabase.", true);
    }
  }

  // ---------- Interações ----------
  document.querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => {
    filtro = c.dataset.f;
    document.querySelectorAll(".chip").forEach((o) => o.setAttribute("aria-pressed", String(o === c)));
    render();
  }));
  $("busca").addEventListener("input", (e) => { termo = e.target.value; render(); });

  $("copiarLivres").addEventListener("click", async () => {
    const livres = []; for (let i = 1; i <= TOTAL; i++) if (!vendido(i)) livres.push(pad(i));
    const texto = "🐷 RIFA FORMATURA DOS CRIA — R$5\nPrêmio: R$500 no Pix ou 1 leitão gordo\n" + location.href.split("#")[0] + "\n\nNúmeros livres (" + livres.length + "):\n" + livres.join(" ");
    try { await navigator.clipboard.writeText(texto); toast("Copiado! Cola no WhatsApp"); }
    catch (e) {
      const ta = document.createElement("textarea"); ta.value = texto; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); toast("Copiado! Cola no WhatsApp"); } catch (_) { toast("Não deu para copiar"); }
      ta.remove();
    }
  });

  function abrirFolha(id) { $("veu").hidden = false; $(id).hidden = false; }
  function fecharTudo() { ["veu", "folha", "folhaLogin", "folhaSorteio"].forEach((id) => ($(id).hidden = true)); atual = null; }
  document.querySelectorAll("[data-fechar]").forEach((b) => b.addEventListener("click", fecharTudo));
  $("veu").addEventListener("click", fecharTudo);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharTudo(); });

  function setSeg(id, val) { document.querySelectorAll("#" + id + " button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === val))); }
  document.querySelectorAll("#fVend button").forEach((b) => b.addEventListener("click", () => { fVendedor = b.dataset.v; setSeg("fVend", fVendedor); }));
  document.querySelectorAll("#fPago button").forEach((b) => b.addEventListener("click", () => { fPago = b.dataset.v === "sim"; setSeg("fPago", fPago ? "sim" : "nao"); }));

  // ---------- Seleção de vários ----------
  let selecionando = false, multi = null; // multi = lista de números quando o formulário é de vários
  const sel = new Set();
  function atualizarSel() {
    botoes.forEach((b, i) => b.classList.toggle("sel", sel.has(i + 1)));
    const n = sel.size;
    $("selInfo").textContent = n ? n + (n === 1 ? " número" : " números") + " · " + brl(n * PRECO) : "Toque nos números para selecionar";
    $("selRegistrar").disabled = !n;
  }
  function entrarSelecao() {
    selecionando = true; sel.clear(); atualizarSel();
    $("barraSel").hidden = false; document.body.classList.add("selecionando");
    $("btnVarios").textContent = "Selecionando…";
    toast("Toque nos números que a pessoa comprou");
  }
  function sairSelecao() {
    selecionando = false; sel.clear(); atualizarSel();
    $("barraSel").hidden = true; document.body.classList.remove("selecionando");
    $("btnVarios").textContent = "Marcar vários";
  }
  $("btnVarios").addEventListener("click", () => { selecionando ? sairSelecao() : entrarSelecao(); });
  $("selCancelar").addEventListener("click", sairSelecao);
  $("selRegistrar").addEventListener("click", () => { if (sel.size) abrirVenda([...sel].sort((a, b) => a - b)); });

  // "10, 15, 20-29" -> [10,15,20..29]
  function lerNumeros(txt) {
    const nums = new Set(), ruins = [];
    String(txt).split(/[\s,;]+/).filter(Boolean).forEach((p) => {
      const m = p.match(/^(\d{1,3})(?:-(\d{1,3}))?$/);
      if (!m) { ruins.push(p); return; }
      let a = +m[1], b = m[2] ? +m[2] : a;
      if (a > b) [a, b] = [b, a];
      if (a < 1 || b > TOTAL) { ruins.push(p); return; }
      for (let i = a; i <= b; i++) nums.add(i);
    });
    return { nums: [...nums].sort((a, b) => a - b), ruins };
  }
  function resumoMulti() {
    const { nums, ruins } = lerNumeros($("fNums").value);
    const jaVend = nums.filter((n) => vendas.has(n));
    $("fNum").textContent = nums.length + (nums.length === 1 ? " NÚMERO" : " NÚMEROS");
    let t = nums.length + " números · total " + brl(nums.length * PRECO) + ".";
    if (jaVend.length) t += " Atenção: " + jaVend.map(pad).join(", ") + (jaVend.length === 1 ? " já está vendido e vai" : " já estão vendidos e vão") + " passar para este comprador.";
    if (ruins.length) t += " Não entendi: " + ruins.join(", ") + ".";
    $("fMeta").textContent = t;
    $("fLiberar").hidden = !jaVend.length;
    $("fLiberar").textContent = "Liberar números vendidos";
    return { nums, ruins };
  }
  $("fNums").addEventListener("input", resumoMulti);

  function abrirVenda(lista) {
    multi = lista; atual = null;
    $("fNum").classList.add("t");
    $("fNumsWrap").hidden = false;
    $("fNums").value = lista.map(pad).join(", ");
    // se todos já são do mesmo comprador, preenche com os dados dele (útil para marcar como pago)
    const dados = lista.map((n) => vendas.get(n)).filter(Boolean);
    const mesmo = dados.length === lista.length && dados.every((d) => d.nome === dados[0].nome) ? dados[0] : null;
    $("fNome").value = mesmo ? mesmo.nome : "";
    $("fTel").value = mesmo ? mesmo.telefone || "" : "";
    if (mesmo && mesmo.vendedor) fVendedor = mesmo.vendedor;
    setSeg("fVend", fVendedor);
    fPago = mesmo ? !!mesmo.pago : false; setSeg("fPago", fPago ? "sim" : "nao");
    $("fConfirma").hidden = true; $("fErro").hidden = true;
    $("fSalvar").textContent = "Salvar todos";
    resumoMulti();
    abrirFolha("folha");
    setTimeout(() => $("fNome").focus(), 50);
  }

  function tocar(n) {
    if (!admin) {
      toast(vendido(n) ? pad(n) + " já foi vendido" : pad(n) + " está livre! Chama o Pauman ou o Piteco");
      return;
    }
    if (selecionando) { sel.has(n) ? sel.delete(n) : sel.add(n); atualizarSel(); return; }
    multi = null;
    $("fNum").classList.remove("t"); $("fNumsWrap").hidden = true;
    $("fSalvar").textContent = "Salvar"; $("fLiberar").textContent = "Liberar número";
    const v = vendas.get(n); atual = n;
    $("fNum").textContent = pad(n);
    $("fNome").value = v ? v.nome || "" : "";
    $("fTel").value = v ? v.telefone || "" : "";
    fVendedor = (v && v.vendedor) || fVendedor; setSeg("fVend", fVendedor);
    fPago = v ? !!v.pago : false; setSeg("fPago", fPago ? "sim" : "nao");
    $("fLiberar").hidden = !v; $("fConfirma").hidden = true; $("fErro").hidden = true;
    $("fMeta").textContent = v ? "Última alteração: " + new Date(v.atualizado).toLocaleString("pt-BR") : "Número livre.";
    abrirFolha("folha");
    setTimeout(() => $("fNome").focus(), 50);
  }

  function erroForm(t) { $("fErro").textContent = t; $("fErro").hidden = false; }

  $("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nome = $("fNome").value.trim();
    if (!nome) return erroForm("Coloca o nome de quem comprou.");
    let nums;
    if (multi) {
      const r = resumoMulti();
      if (r.ruins.length) return erroForm("Confere os números: não entendi " + r.ruins.join(", ") + ".");
      if (!r.nums.length) return erroForm("Coloca pelo menos um número.");
      nums = r.nums;
    } else if (atual) nums = [atual]; else return;
    const btn = $("fSalvar"); btn.disabled = true;
    const agora = new Date().toISOString(), tel = $("fTel").value.trim();
    const linhas = nums.map((n) => ({ numero: n, nome, telefone: tel, vendedor: fVendedor, pago: fPago, atualizado: agora }));
    const { error } = await sb.from("numeros").upsert(linhas);
    btn.disabled = false;
    if (error) return erroForm("Não salvou: " + error.message);
    linhas.forEach((l) => vendas.set(l.numero, l));
    const eraMulti = !!multi;
    fecharTudo(); if (eraMulti) sairSelecao(); render();
    toast(nums.length === 1 ? pad(nums[0]) + " salvo" + (fPago ? " · pago" : "") : nums.length + " números salvos para " + nome + (fPago ? " · pagos" : ""));
  });
  $("fLiberar").addEventListener("click", () => {
    $("fConfirma").querySelector("span").textContent = multi
      ? "Liberar os números já vendidos desta lista? Os nomes dos compradores serão apagados."
      : "Liberar este número? O nome do comprador será apagado.";
    $("fConfirma").hidden = false;
  });
  $("fNao").addEventListener("click", () => { $("fConfirma").hidden = true; });
  $("fSim").addEventListener("click", async () => {
    const nums = multi ? lerNumeros($("fNums").value).nums.filter((n) => vendas.has(n)) : (atual ? [atual] : []);
    if (!nums.length) return;
    const { error } = await sb.from("numeros").delete().in("numero", nums);
    if (error) return erroForm("Não deu para liberar: " + error.message);
    nums.forEach((n) => vendas.delete(n));
    const eraMulti = !!multi;
    fecharTudo(); if (eraMulti) sairSelecao(); render();
    toast(nums.length === 1 ? pad(nums[0]) + " liberado" : nums.length + " números liberados");
  });

  // Sorteio
  $("btnSortear").addEventListener("click", () => {
    const pagos = [...vendas.values()].filter((v) => v.pago).length;
    $("sTexto").textContent = pagos
      ? "O sorteio escolhe ao acaso um entre os " + pagos + " números pagos. O resultado aparece para todo mundo no site."
      : "Ainda não tem nenhum número pago para sortear.";
    $("sConfirmar").hidden = !pagos;
    abrirFolha("folhaSorteio");
  });
  $("sConfirmar").addEventListener("click", async () => {
    const pagos = [...vendas.values()].filter((v) => v.pago);
    if (!pagos.length) return;
    const arr = new Uint32Array(1); crypto.getRandomValues(arr);
    const v = pagos[arr[0] % pagos.length];
    const res = { id: 1, numero: v.numero, nome: v.nome, quando: new Date().toISOString() };
    const { error } = await sb.from("sorteio").upsert(res);
    if (error) { toast("Não deu para salvar o sorteio"); return; }
    sorteio = res; fecharTudo(); render(); toast("Sorteado: " + pad(v.numero) + " · " + v.nome);
  });

  // Login
  $("btnLogin").addEventListener("click", () => { $("lErro").hidden = true; abrirFolha("folhaLogin"); setTimeout(() => $("lEmail").focus(), 50); });
  $("formLogin").addEventListener("submit", async (e) => {
    e.preventDefault(); if (!sb) return;
    const btn = $("lEntrar"); btn.disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email: $("lEmail").value.trim(), password: $("lSenha").value });
    btn.disabled = false;
    if (error) {
      const m = (error.message || "").toLowerCase();
      let txt;
      if (m.includes("invalid login") || error.code === "invalid_credentials") txt = "E-mail ou senha incorretos. Confira se é o mesmo usuário criado em Authentication > Users.";
      else if (m.includes("not confirmed") || error.code === "email_not_confirmed") txt = "Esse e-mail ainda não foi confirmado. No Supabase, abra o usuário e confirme, ou crie de novo marcando Auto Confirm User.";
      else txt = "Erro do Supabase: " + (error.message || "desconhecido") + (error.status ? " (" + error.status + ")" : "");
      $("lErro").textContent = txt; $("lErro").hidden = false; return;
    }
    $("lSenha").value = ""; fecharTudo(); toast("Bem-vindo, admin!");
  });
  $("btnSair").addEventListener("click", async () => { await sb.auth.signOut(); toast("Você saiu"); });

  // ---------- Início ----------
  render();
  if (!configurado) { aviso("Site ainda não configurado: preencha assets/js/config.js com a URL e a chave pública do Supabase.", true); return; }
  if (!window.supabase) { aviso("Não consegui carregar o Supabase. Confere a internet e recarrega a página.", true); return; }
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  sb.auth.onAuthStateChange((_evt, session) => {
    const novo = session ? session.user : null;
    if ((novo && novo.id) === (admin && admin.id)) return;
    admin = novo; vendas.clear(); modoAdmin(); render(); carregar();
  });
  sb.auth.getSession().then(({ data }) => { admin = data.session ? data.session.user : null; modoAdmin(); carregar(); });

  setInterval(() => { if (!document.hidden && $("folha").hidden) carregar(); }, ATUALIZA_MS);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) carregar(); });
})();

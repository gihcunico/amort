/* =======================================================================
   AMORTIZA · Controle de financiamento (Tabela Price · reduz prazo)
   =======================================================================
   MODELO DE DADOS (localStorage 'amortiza-data'):
   {
     settings: {
       parcela: 2820,
       saldoOriginal: 1177390,    // opcional — baseline do gráfico
       prazoOriginal: 419         // opcional
     },
     registros: [
       {
         id: "2025-12",            // YYYY-MM
         mes: "2025-12",
         saldo: 1177390,           // saldo devedor no início do mês
         prazo: 419,               // meses restantes
         simulacoes: [
           {
             id: "uuid",
             valor: 10000,         // amortizado
             novoPrazo: 340,
             executada: false
           }
         ]
       }
     ]
   }

   LÓGICA DE CÁLCULO (validada com dados reais da planilha):
     mesesGanhos     = prazo_mes − novoPrazo
     economiaBruta   = mesesGanhos × parcela
     economiaLiquida = economiaBruta − valorAmortizado

   ECONOMIA TOTAL (KPI) — soma SOMENTE simulações marcadas como "executada".
   ======================================================================= */

const STORAGE_KEY = 'amortiza-data';

/* ---------- Estado ---------- */
let state = loadState();
let editingRegistroId = null;    // se estiver editando
let chart = null;

/* ---------- Utilitários ---------- */
const fmtBRL = v => (v === null || v === undefined || isNaN(v))
  ? '—'
  : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

const fmtBRLcents = v => (v === null || v === undefined || isNaN(v))
  ? '—'
  : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const fmtMes = ym => {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  const nomes = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  return `${nomes[+m - 1]}/${y.slice(2)}`;
};

const fmtMesLongo = ym => {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  const nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return `${nomes[+m - 1]} / ${y}`;
};

const uuid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ---------- Persistência ---------- */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    // merge com defaults (em caso de versão antiga)
    return {
      settings: { ...defaultState().settings, ...(parsed.settings || {}) },
      registros: parsed.registros || []
    };
  } catch (e) {
    console.error('Falha ao carregar estado, usando padrão:', e);
    return defaultState();
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('[amortiza] Falha ao salvar no localStorage:', e);
    alert('Não foi possível salvar os dados. Se você abriu este arquivo diretamente (file://), o navegador pode estar bloqueando o armazenamento. Publique no GitHub Pages ou rode um servidor local.');
  }
}

function defaultState() {
  return {
    settings: { parcela: 2820, saldoOriginal: null, prazoOriginal: null },
    registros: []
  };
}

/* =======================================================================
   RENDER
   ======================================================================= */

function render() {
  state.registros.sort((a, b) => a.mes.localeCompare(b.mes));
  renderKPIs();
  renderChart();
  renderSelectMesSim();
  renderSimList();
  renderHistorico();
}

/* ---------- KPIs ---------- */
function renderKPIs() {
  const ultimo = state.registros[state.registros.length - 1];
  const parcela = state.settings.parcela || 0;

  // Saldo e prazo
  document.getElementById('kpi-saldo').textContent = ultimo ? fmtBRL(ultimo.saldo) : '—';
  document.getElementById('kpi-saldo-foot').textContent = ultimo ? `em ${fmtMesLongo(ultimo.mes)}` : 'sem registros';

  document.getElementById('kpi-prazo').textContent = ultimo ? `${ultimo.prazo} meses` : '—';
  document.getElementById('kpi-prazo-foot').textContent = ultimo ? `${(ultimo.prazo / 12).toFixed(1)} anos` : '';

  // Economia total (apenas executadas)
  let economiaBruta = 0;
  let economiaLiquida = 0;
  let totalAmortizado = 0;
  let execCount = 0;

  state.registros.forEach(reg => {
    reg.simulacoes.forEach(sim => {
      if (sim.executada) {
        const ganhos = reg.prazo - sim.novoPrazo;
        const bruta = ganhos * parcela;
        economiaBruta += bruta;
        economiaLiquida += bruta - sim.valor;
        totalAmortizado += sim.valor;
        execCount++;
      }
    });
  });

  document.getElementById('kpi-economia').textContent = fmtBRL(economiaBruta);
  document.getElementById('kpi-economia-foot').textContent = `líquida: ${fmtBRL(economiaLiquida)}`;

  document.getElementById('kpi-amortizado').textContent = fmtBRL(totalAmortizado);
  document.getElementById('kpi-amortizado-foot').textContent = `${execCount} amortização${execCount !== 1 ? 'ões' : ''}`;
}

/* ---------- Gráfico ---------- */
function renderChart() {
  const ctx = document.getElementById('chart-saldo');
  if (!ctx) return;

  // Se Chart.js não carregou (rede, bloqueador, etc.), pula sem quebrar o resto
  if (typeof Chart === 'undefined') {
    console.warn('[amortiza] Chart.js não foi carregado — gráfico desativado, app continua funcionando.');
    const wrap = ctx.parentElement;
    if (wrap && !wrap.querySelector('.chart-fallback')) {
      const msg = document.createElement('p');
      msg.className = 'chart-fallback empty';
      msg.textContent = 'Gráfico indisponível (Chart.js não carregou). Verifique a conexão ou bloqueadores.';
      wrap.appendChild(msg);
    }
    return;
  }

  if (chart) chart.destroy();

  if (state.registros.length === 0) {
    // Mostra canvas vazio
    chart = new Chart(ctx, {
      type: 'line',
      data: { labels: [], datasets: [] },
      options: { responsive: true, maintainAspectRatio: false }
    });
    return;
  }

  const labels = state.registros.map(r => fmtMes(r.mes));

  // Linha A: trajetória real (saldo registrado em cada mês)
  const saldosReais = state.registros.map(r => r.saldo);

  // Linha B: projeção SEM amortizações
  // Reconstrói assumindo que a cada mês se pagou só a parcela, sem amortizar.
  // Usa o PRIMEIRO registro como baseline.
  const parcela = state.settings.parcela || 0;
  const primeiro = state.registros[0];
  const semAmortizacao = [primeiro.saldo];

  for (let i = 1; i < state.registros.length; i++) {
    // Calcula quantos meses se passaram entre registro i-1 e i
    const mesesEntre = mesesEntreAno(state.registros[i - 1].mes, state.registros[i].mes);
    // Na Price, sem amortização, o saldo cai aproximadamente `mesesEntre × parcela`
    // (aproximação — ignora a separação juros/principal, mas funciona como referência visual
    // já que assume que o saldo total é quitado em `prazo × parcela` meses a partir do baseline)
    const ant = semAmortizacao[i - 1];
    semAmortizacao.push(Math.max(0, ant - mesesEntre * parcela));
  }

  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Trajetória real',
          data: saldosReais,
          borderColor: '#c88a2b',
          backgroundColor: 'rgba(200,138,43,0.12)',
          borderWidth: 2.5,
          fill: true,
          tension: 0.25,
          pointBackgroundColor: '#c88a2b',
          pointBorderColor: '#fbf8f1',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7
        },
        {
          label: 'Sem amortizações (referência)',
          data: semAmortizacao,
          borderColor: '#4a6b5d',
          borderWidth: 1.5,
          borderDash: [4, 4],
          fill: false,
          tension: 0,
          pointRadius: 0,
          pointHoverRadius: 5
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1a2420',
          titleFont: { family: "'Inter', sans-serif", size: 12, weight: '600' },
          bodyFont: { family: "'JetBrains Mono', monospace", size: 12 },
          padding: 12,
          borderColor: '#c88a2b',
          borderWidth: 1,
          callbacks: {
            label: c => `${c.dataset.label}: ${fmtBRL(c.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { family: "'JetBrains Mono', monospace", size: 11 }, color: '#7a8580' }
        },
        y: {
          grid: { color: '#ece5d4' },
          ticks: {
            font: { family: "'JetBrains Mono', monospace", size: 11 },
            color: '#7a8580',
            callback: v => fmtBRL(v)
          }
        }
      }
    }
  });
}

// diferença em meses entre dois YYYY-MM
function mesesEntreAno(a, b) {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

/* ---------- Select de mês para simulações ---------- */
function renderSelectMesSim() {
  const sel = document.getElementById('select-mes-sim');
  const atual = sel.value;
  sel.innerHTML = '';
  if (state.registros.length === 0) {
    const opt = document.createElement('option');
    opt.textContent = '— crie um registro primeiro —';
    opt.disabled = true;
    sel.appendChild(opt);
    return;
  }
  state.registros.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.id;
    opt.textContent = fmtMesLongo(r.mes);
    sel.appendChild(opt);
  });
  // mantém seleção ou pega o último
  if (atual && state.registros.find(r => r.id === atual)) {
    sel.value = atual;
  } else {
    sel.value = state.registros[state.registros.length - 1].id;
  }
}

/* ---------- Lista de simulações do mês selecionado ---------- */
function renderSimList() {
  const container = document.getElementById('sim-list');
  const selId = document.getElementById('select-mes-sim').value;
  const reg = state.registros.find(r => r.id === selId);
  container.innerHTML = '';

  if (!reg) {
    container.innerHTML = '<p class="empty">Nenhum registro mensal selecionado.</p>';
    return;
  }

  // Linha baseline (sem amortizar)
  const base = document.createElement('div');
  base.className = 'sim-item';
  base.style.opacity = '0.7';
  base.innerHTML = `
    <div><span class="sim-label">Cenário</span><span class="sim-val">Sem amortizar</span></div>
    <div><span class="sim-label">Prazo</span><span class="sim-val">${reg.prazo} meses</span></div>
    <div><span class="sim-label">Anos</span><span class="sim-val">${(reg.prazo / 12).toFixed(1)}</span></div>
    <div></div>
  `;
  container.appendChild(base);

  if (reg.simulacoes.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Nenhuma simulação registrada para este mês.';
    container.appendChild(empty);
    return;
  }

  // Ordena: executada primeiro, depois por valor
  const sorted = [...reg.simulacoes].sort((a, b) => {
    if (a.executada !== b.executada) return a.executada ? -1 : 1;
    return a.valor - b.valor;
  });

  const parcela = state.settings.parcela || 0;

  sorted.forEach(sim => {
    const ganhos = reg.prazo - sim.novoPrazo;
    const bruta = ganhos * parcela;
    const liquida = bruta - sim.valor;

    const div = document.createElement('div');
    div.className = 'sim-item' + (sim.executada ? ' executed' : '');
    div.innerHTML = `
      <div>
        <span class="sim-label">Amortizar</span>
        <span class="sim-val">${fmtBRL(sim.valor)}</span>
      </div>
      <div>
        <span class="sim-label">Novo prazo</span>
        <span class="sim-val">${sim.novoPrazo}m · ${(sim.novoPrazo / 12).toFixed(1)}a</span>
      </div>
      <div>
        <span class="sim-label">Economia líquida</span>
        <span class="sim-val economia">${fmtBRL(liquida)}</span>
        <span class="sim-label" style="margin-top:2px">bruta ${fmtBRL(bruta)} · ${ganhos}m</span>
      </div>
      <div class="sim-actions">
        <button class="icon-btn" title="${sim.executada ? 'Desmarcar' : 'Marcar como executada'}"
                data-action="toggle-exec" data-reg="${reg.id}" data-sim="${sim.id}">
          ${sim.executada ? '☆' : '★'}
        </button>
        <button class="icon-btn danger" title="Remover"
                data-action="del-sim" data-reg="${reg.id}" data-sim="${sim.id}">✕</button>
      </div>
    `;
    container.appendChild(div);
  });
}

/* ---------- Tabela histórico ---------- */
function renderHistorico() {
  const tbody = document.querySelector('#table-historico tbody');
  tbody.innerHTML = '';

  if (state.registros.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="9" class="empty">Nenhum registro ainda. Adicione o primeiro mês acima.</td>`;
    tbody.appendChild(tr);
    return;
  }

  const parcela = state.settings.parcela || 0;

  state.registros.forEach(reg => {
    const exec = reg.simulacoes.find(s => s.executada);

    if (exec) {
      const ganhos = reg.prazo - exec.novoPrazo;
      const bruta = ganhos * parcela;
      const liquida = bruta - exec.valor;

      const tr = document.createElement('tr');
      tr.className = 'has-exec';
      tr.innerHTML = `
        <td>${fmtMesLongo(reg.mes)}</td>
        <td class="num">${fmtBRL(reg.saldo)}</td>
        <td class="num">${reg.prazo}</td>
        <td class="num">${(reg.prazo / 12).toFixed(1)}</td>
        <td class="num">${fmtBRL(exec.valor)}</td>
        <td class="num">${ganhos}</td>
        <td class="num">${fmtBRL(bruta)}</td>
        <td class="num">${fmtBRL(liquida)}</td>
        <td><button class="icon-btn danger" data-action="del-reg" data-reg="${reg.id}" title="Excluir mês">✕</button></td>
      `;
      tbody.appendChild(tr);
    } else {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${fmtMesLongo(reg.mes)}</td>
        <td class="num">${fmtBRL(reg.saldo)}</td>
        <td class="num">${reg.prazo}</td>
        <td class="num">${(reg.prazo / 12).toFixed(1)}</td>
        <td class="num" style="color:var(--ink-mute)">—</td>
        <td class="num" style="color:var(--ink-mute)">—</td>
        <td class="num" style="color:var(--ink-mute)">—</td>
        <td class="num" style="color:var(--ink-mute)">—</td>
        <td><button class="icon-btn danger" data-action="del-reg" data-reg="${reg.id}" title="Excluir mês">✕</button></td>
      `;
      tbody.appendChild(tr);
    }
  });
}

/* =======================================================================
   INICIALIZAÇÃO — separa anexação de listeners da execução de render,
   para que mesmo se render() falhar os botões continuem funcionando.
   ======================================================================= */

function attachListeners() {
  console.log('[amortiza] anexando listeners...');

  // Form novo registro mensal
  document.getElementById('form-registro').addEventListener('submit', handleSubmitRegistro);

  // Form nova simulação
  document.getElementById('form-sim').addEventListener('submit', handleSubmitSim);

  // Delegação global: toggle executada, delete sim, delete registro
  document.body.addEventListener('click', handleDelegatedClick);

  // Troca de mês no select de simulações
  document.getElementById('select-mes-sim').addEventListener('change', () => {
    try { renderSimList(); } catch(e) { console.error('[amortiza] erro em renderSimList:', e); }
  });

  // Exportar JSON
  document.getElementById('btn-export').addEventListener('click', handleExport);

  // Importar JSON
  document.getElementById('btn-import').addEventListener('click', () => {
    document.getElementById('file-import').click();
  });
  document.getElementById('file-import').addEventListener('change', handleImport);

  // Modal de configurações
  const modal = document.getElementById('modal-settings');
  document.getElementById('btn-settings').addEventListener('click', () => {
    console.log('[amortiza] abrindo modal de configurações');
    renderSettingsInputs();
    modal.hidden = false;
  });
  document.getElementById('btn-cfg-cancel').addEventListener('click', (e) => {
    console.log('[amortiza] botão Cancelar do modal clicado');
    e.preventDefault();
    modal.hidden = true;
  });
  document.getElementById('btn-cfg-save').addEventListener('click', handleSaveSettings);
  modal.addEventListener('click', e => { if (e.target === modal) modal.hidden = true; });

  console.log('[amortiza] listeners anexados com sucesso');
}

/* ---------- Handlers separados ---------- */

function handleSubmitRegistro(e) {
  e.preventDefault();
  try {
    const mes = document.getElementById('reg-mes').value;
    const saldo = parseFloat(document.getElementById('reg-saldo').value);
    const prazo = parseInt(document.getElementById('reg-prazo').value, 10);

    if (!mes || isNaN(saldo) || isNaN(prazo)) {
      alert('Preencha todos os campos corretamente.');
      return;
    }

    const existe = state.registros.find(r => r.id === mes);
    if (existe) {
      if (!confirm(`Já existe um registro para ${fmtMesLongo(mes)}. Sobrescrever? (as simulações serão preservadas)`)) return;
      existe.saldo = saldo;
      existe.prazo = prazo;
    } else {
      state.registros.push({ id: mes, mes, saldo, prazo, simulacoes: [] });
    }

    saveState();
    safeRender();
    e.target.reset();
    initMesInput();
    document.getElementById('select-mes-sim').value = mes;
    renderSimList();
  } catch (err) {
    console.error('[amortiza] erro ao salvar registro:', err);
    alert('Erro: ' + err.message);
  }
}

function handleSubmitSim(e) {
  e.preventDefault();
  try {
    const regId = document.getElementById('select-mes-sim').value;
    const reg = state.registros.find(r => r.id === regId);
    if (!reg) { alert('Selecione um mês primeiro.'); return; }

    const valor = parseFloat(document.getElementById('sim-valor').value);
    const novoPrazo = parseInt(document.getElementById('sim-prazo').value, 10);
    const executada = document.getElementById('sim-executada').checked;

    if (isNaN(valor) || isNaN(novoPrazo)) {
      alert('Preencha valor e novo prazo.');
      return;
    }

    if (novoPrazo >= reg.prazo) {
      if (!confirm(`O novo prazo (${novoPrazo}) não é menor que o prazo atual (${reg.prazo}). Salvar mesmo assim?`)) return;
    }

    if (executada) {
      reg.simulacoes.forEach(s => s.executada = false);
    }

    reg.simulacoes.push({ id: uuid(), valor, novoPrazo, executada });

    saveState();
    safeRender();
    e.target.reset();
    document.getElementById('select-mes-sim').value = regId;
    renderSimList();
  } catch (err) {
    console.error('[amortiza] erro ao salvar simulação:', err);
    alert('Erro: ' + err.message);
  }
}

function handleDelegatedClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  try {
    const action = btn.dataset.action;
    const regId = btn.dataset.reg;
    const simId = btn.dataset.sim;
    const reg = state.registros.find(r => r.id === regId);
    if (!reg) return;

    if (action === 'toggle-exec') {
      const sim = reg.simulacoes.find(s => s.id === simId);
      if (!sim) return;
      const novoEstado = !sim.executada;
      if (novoEstado) reg.simulacoes.forEach(s => s.executada = false);
      sim.executada = novoEstado;
      saveState();
      safeRender();
    }
    else if (action === 'del-sim') {
      if (!confirm('Remover esta simulação?')) return;
      reg.simulacoes = reg.simulacoes.filter(s => s.id !== simId);
      saveState();
      safeRender();
    }
    else if (action === 'del-reg') {
      if (!confirm(`Excluir o mês ${fmtMesLongo(reg.mes)} e todas as suas simulações?`)) return;
      state.registros = state.registros.filter(r => r.id !== regId);
      saveState();
      safeRender();
    }
  } catch (err) {
    console.error('[amortiza] erro em ação delegada:', err);
  }
}

function handleExport() {
  try {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const today = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `amortiza-${today}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('[amortiza] erro ao exportar:', err);
    alert('Erro ao exportar: ' + err.message);
  }
}

async function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!parsed.registros || !Array.isArray(parsed.registros)) {
      throw new Error('Formato inválido: falta array "registros".');
    }
    if (!confirm(`Importar ${parsed.registros.length} registro(s)? Isto SUBSTITUI os dados atuais.`)) return;
    state = {
      settings: { ...defaultState().settings, ...(parsed.settings || {}) },
      registros: parsed.registros
    };
    saveState();
    safeRender();
    renderSettingsInputs();
    alert('Dados importados com sucesso.');
  } catch (err) {
    alert('Erro ao importar: ' + err.message);
  }
  e.target.value = '';
}

function handleSaveSettings(e) {
  console.log('[amortiza] botão Salvar configurações clicado');
  e.preventDefault();
  try {
    const parcelaRaw = document.getElementById('cfg-parcela').value;
    const saldoRaw   = document.getElementById('cfg-saldo-original').value;
    const prazoRaw   = document.getElementById('cfg-prazo-original').value;
    console.log('[amortiza] valores crus:', { parcelaRaw, saldoRaw, prazoRaw });

    const parcela   = parseFloat(parcelaRaw);
    const saldoOrig = saldoRaw === '' ? null : parseFloat(saldoRaw);
    const prazoOrig = prazoRaw === '' ? null : parseInt(prazoRaw, 10);

    if (isNaN(parcela) || parcela <= 0) {
      alert('Informe uma parcela válida (maior que zero).');
      return;
    }

    state.settings.parcela = parcela;
    state.settings.saldoOriginal = (saldoOrig === null || isNaN(saldoOrig)) ? null : saldoOrig;
    state.settings.prazoOriginal = (prazoOrig === null || isNaN(prazoOrig)) ? null : prazoOrig;
    console.log('[amortiza] settings novo:', state.settings);

    saveState();
    safeRender();
    document.getElementById('modal-settings').hidden = true;
    console.log('[amortiza] configurações salvas com sucesso');
  } catch (err) {
    console.error('[amortiza] ERRO ao salvar configurações:', err);
    alert('Erro ao salvar: ' + err.message + '\nAbra o console do navegador (F12) para detalhes.');
  }
}

/* ---------- Render seguro ---------- */
function safeRender() {
  try {
    render();
  } catch (err) {
    console.error('[amortiza] erro em render:', err);
  }
}

function initMesInput() {
  const hoje = new Date();
  const y = hoje.getFullYear();
  const m = String(hoje.getMonth() + 1).padStart(2, '0');
  document.getElementById('reg-mes').value = `${y}-${m}`;
}

/* ---------- BOOT ---------- */
function boot() {
  console.log('[amortiza] inicializando...');
  try {
    attachListeners();    // 1º: listeners (mesmo se render falhar, botões funcionam)
  } catch (err) {
    console.error('[amortiza] ERRO FATAL ao anexar listeners:', err);
    alert('Erro fatal ao inicializar o app. Abra o console (F12) para ver detalhes.');
    return;
  }
  try {
    initMesInput();
    safeRender();
    console.log('[amortiza] pronto.');
  } catch (err) {
    console.error('[amortiza] erro na inicialização não-crítica:', err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

function renderSettingsInputs() {
  document.getElementById('cfg-parcela').value = state.settings.parcela ?? '';
  document.getElementById('cfg-saldo-original').value = state.settings.saldoOriginal ?? '';
  document.getElementById('cfg-prazo-original').value = state.settings.prazoOriginal ?? '';
}

/* =======================================================================
   INICIALIZAÇÃO
   ======================================================================= */

// Pré-preenche o campo "mês" com o mês atual
(function initMesInput() {
  const hoje = new Date();
  const y = hoje.getFullYear();
  const m = String(hoje.getMonth() + 1).padStart(2, '0');
  document.getElementById('reg-mes').value = `${y}-${m}`;
})();

render();

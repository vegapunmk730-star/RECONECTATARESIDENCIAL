// ═══════════════════════════════════════════════════
// RECONECTA RESIDENCIAL — main.js
// ═══════════════════════════════════════════════════

// ── Ligação ao Supabase ───────────────────────────
const SUPABASE_URL = 'https://oxxjlmakvprrlqpbsxdq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_crhEx9mSifD13pkZH1yNMA_tiHIuLIy';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── QUARTOS ──────────────────────────────────────
const QUARTOS = [
  { id:'standard', nome:'Quarto Standard', preco:20000, total:2,
    foto:'fotos/quarto-20mil.webp',
    desc:'Quarto confortável com cama de casal, ar condicionado e todas as comodidades essenciais para uma estadia tranquila.',
    piscina:false, tipo:'Quarto Standard' },
  { id:'superior', nome:'Quarto Superior', preco:25000, total:10,
    foto:'fotos/quarto-25mil.webp',
    desc:'Quarto espaçoso com ambiente moderno, iluminação especial e todas as comodidades para uma estadia confortável.',
    piscina:true, tipo:'Quarto Superior' },
  { id:'confort', nome:'Quarto Confort', preco:30000, total:3,
    foto:'fotos/quarto-30mil.webp',
    desc:'Quarto amplo com decoração cuidada, sofá e mesa de trabalho. Ideal para estadias prolongadas ou de negócios.',
    piscina:true, tipo:'Quarto Confort' },
  { id:'deluxe', nome:'Quarto Deluxe', preco:35000, total:2,
    foto:'fotos/quarto-35mil.webp',
    desc:'Quarto e sala separados com decoração premium. A experiência mais completa e elegante do Reconecta Residencial.',
    piscina:true, tipo:'Quarto Deluxe' }
];

const disp = {};
QUARTOS.forEach(q => disp[q.id] = q.total);
let RESERVAS_CACHE = [];
let ULTIMA_RESERVA = null;

// Converte string de data (YYYY-MM-DD ou DD/MM/YYYY) para objecto Date (meia-noite local)
function parseDataLocal(str) {
  if (!str || str === '—') return null;
  // Formato ISO: YYYY-MM-DD
  let m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  // Formato pt-PT: DD/MM/YYYY
  m = String(str).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  const d = new Date(str);
  return isNaN(d) ? null : d;
}

async function carregarDisponibilidade(checkinFiltro, checkoutFiltro) {
  const grid = document.getElementById('quartosGrid');
  if (grid && !grid.querySelector('.q-card')) {
    grid.innerHTML = '<div class="q-loading"><div class="q-spinner"></div>A verificar disponibilidade...</div>';
  }
  try {
    // Lê apenas as 5 colunas que o visitante tem permissão para ver
    // (tipo, checkin, checkout, estado, quartos) — nunca dados pessoais de outros clientes.
    const { data, error } = await sb.from('reservas').select('tipo,checkin,checkout,estado,quartos');
    if (error) throw error;
    RESERVAS_CACHE = data || [];
    QUARTOS.forEach(q => disp[q.id] = q.total);
    const agora = Date.now(), tresH = 3 * 60 * 60 * 1000;

    // Data de hoje à meia-noite (hora local) — quartos com checkout <= hoje já estão livres
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

    (RESERVAS_CACHE || []).forEach(r => {
      const estado = (r.estado || '').toLowerCase();

      // BUG 4 FIX: Reservas CONFIRMADAS e PENDENTES bloqueiam quartos.
      // As Pendentes foram subtraídas optimisticamente no cliente; incluí-las aqui
      // garante que ao recarregar a página continuam a bloquear o quarto,
      // evitando double-booking enquanto aguardam confirmação.
      // FASE 2 FIX: Check-in também bloqueia (hóspede já está no quarto).
      if (estado !== 'confirmado' && estado !== 'pendente' && estado !== 'check-in') return;

      // Se não tem datas válidas, ignorar
      if (!r.checkin || r.checkin === '—' || !r.checkout || r.checkout === '—') return;

      const ciDate = parseDataLocal(r.checkin);
      const coDate = parseDataLocal(r.checkout);
      if (!ciDate || !coDate) return;

      // Checkout já passou → quarto livre
      if (coDate <= hoje) return;

      // BUG 1 FIX: Sem datas de filtro (carregamento inicial), não bloquear nenhum quarto.
      // Só subtrair disponibilidade quando o utilizador escolheu datas concretas.
      if (!checkinFiltro || !checkoutFiltro) return;

      // Verificar sobreposição com as datas escolhidas pelo utilizador
      const fIn  = parseDataLocal(checkinFiltro);
      const fOut = parseDataLocal(checkoutFiltro);
      if (!fIn || !fOut) return;
      if (coDate <= fIn || ciDate >= fOut) return;

      const t  = (r.tipo || '').toLowerCase();
      const nqRaw = (r.quartos || '1'); const nq = nqRaw.includes('3 ou mais') ? 3 : (parseInt(nqRaw.replace(/\D/g, '')) || 1);
      if (t.includes('standard'))      disp.standard = Math.max(0, disp.standard - nq);
      else if (t.includes('superior')) disp.superior = Math.max(0, disp.superior - nq);
      else if (t.includes('confort'))  disp.confort  = Math.max(0, disp.confort  - nq);
      else if (t.includes('deluxe'))   disp.deluxe   = Math.max(0, disp.deluxe   - nq);
    });
    atualizarSelectDisp();
    const tipoActual = document.getElementById('ftp');
    if (tipoActual && tipoActual.value) onTipoChange();
    if (typeof renderCalendario === 'function') renderCalendario();
  } catch(e) { console.warn('Servidor indisponível.'); }
  renderQuartos();
}

// Store original option labels once
const _origLabels = {};
function atualizarSelectDisp() {
  const sel = document.getElementById('ftp');
  if (!sel) return;
  Array.from(sel.options).forEach(opt => {
    const v = opt.value;
    if (!_origLabels[v]) _origLabels[v] = opt.text.replace(/\s*\(.*\)\s*$/, '').trim();
    const t = v.toLowerCase();
    const key = t.includes('standard') ? 'standard' : t.includes('superior') ? 'superior' : t.includes('confort') ? 'confort' : t.includes('deluxe') ? 'deluxe' : null;
    if (key) {
      const d = disp[key];
      if (d <= 0)      opt.text = _origLabels[v] + ' (Esgotado)';
      else if (d <= 2) opt.text = _origLabels[v] + ' (Últimos disponíveis)';
      else             opt.text = _origLabels[v] + ` (${d} disponíveis)`;
    }
  });
}

function renderQuartos() {
  const grid = document.getElementById('quartosGrid');
  let html = '';
  QUARTOS.forEach(q => {
    const d   = disp[q.id];
    const esg = d <= 0;
    const bc  = esg ? 'esg' : d <= 2 ? 'last' : 'disp';
    const bt  = esg ? 'Esgotado' : d <= 2 ? 'Últimos disponíveis' : 'Disponível';
    const info = q.piscina
      ? `<div class="q-info pool">☕ Pequeno-almoço incluído<br>🏊 Acesso à piscina incluído<br><span style="font-size:.66rem;color:#4a7a5a">* Casais: apenas 1 pessoa acede</span></div>`
      : `<div class="q-info no-pool">☕ Pequeno-almoço incluído<br>🚫 Sem acesso à piscina</div>`;
    const btn = esg
      ? `<button class="q-btn off">Sem disponibilidade</button>`
      : `<button class="q-btn" onclick="reservarQuarto('${q.id}')">Reservar este quarto →</button>`;
    html += `<div class="q-card${esg ? ' esgotado' : ''}">
      <div class="q-img"><img src="${q.foto}" alt="${q.nome}" loading="lazy" onerror="this.src='fotos/logo.webp'">
        <span class="q-badge ${bc}">${bt}</span>
      </div>
      <div class="q-body">
        <div class="q-name">${q.nome}</div>
        <p class="q-p">${q.desc}</p>
        ${info}${btn}
      </div></div>`;
  });
  grid.innerHTML = html;
}

function reservarQuarto(id) {
  const q = QUARTOS.find(x => x.id === id);
  if (!q) return;
  openModal();
  setTimeout(() => {
    document.getElementById('ftp').value = q.tipo;
    onTipoChange();
    const h = document.getElementById('formHint');
    h.textContent = '✓ ' + q.nome + ' selecionado — complete os dados abaixo.';
    h.className = 'form-hint-modal selected';
  }, 50);
}

// ── MODAL ────────────────────────────────────────
function openModal() {
  document.getElementById('modalRes').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  document.getElementById('modalRes').classList.remove('open');
  document.body.style.overflow = '';
  const ok = document.getElementById('fOk');
  if (ok.style.display === 'block') {
    ok.style.display = 'none';
    document.getElementById('formWrap').style.display = '';
    document.getElementById('fBtn').disabled = false;
    document.getElementById('fBtn').textContent = 'Enviar Pedido de Reserva';
    document.getElementById('formHint').textContent = 'Preencha os dados abaixo. Respondemos em menos de 2 horas.';
    document.getElementById('formHint').className = 'form-hint-modal';
  }
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (document.getElementById('lightbox').classList.contains('open')) closeLightbox();
    else closeModal();
  }
});

// ── FORMULÁRIO ───────────────────────────────────
function onTipoChange() {
  const tipo      = document.getElementById('ftp').value;
  const isPiscina = tipo.toLowerCase().includes('piscina');
  const isOutro   = tipo.includes('Restaurante') || tipo.includes('Grupo') || tipo.includes('Evento');
  document.getElementById('datesWrap').style.display = (isPiscina || isOutro) ? 'none' : '';
  document.getElementById('qWrap').style.display  = (isPiscina || isOutro) ? 'none' : '';
  const peWrap = document.getElementById('fpe') ? document.getElementById('fpe').closest('.fi') : null;
  if (peWrap) peWrap.style.display = isOutro ? 'none' : '';
  if (!isPiscina && !isOutro) {
    const idQ  = tipo.toLowerCase().includes('standard') ? 'standard' : tipo.toLowerCase().includes('superior') ? 'superior' : tipo.toLowerCase().includes('confort') ? 'confort' : tipo.toLowerCase().includes('deluxe') ? 'deluxe' : null;
    const maxQ = idQ ? disp[idQ] : 3;
    const sel  = document.getElementById('fq');
    const opts = [['1 quarto', 1], ['2 quartos', 2], ['3 ou mais', 3]];
    sel.innerHTML = '';
    // BUG 2 FIX: usar maxQ directamente (sem Math.max(1,…)).
    // Se maxQ=0 (esgotado), nenhuma opção é adicionada e o select fica vazio,
    // impedindo a reserva de um quarto sem disponibilidade.
    opts.forEach(([label, val]) => {
      if (val <= maxQ) {
        const o = document.createElement('option');
        o.value = label; o.textContent = label;
        sel.appendChild(o);
      }
    });
  }
  if (typeof renderCalendario === 'function') renderCalendario();
}

async function submitForm() {
  const nome  = document.getElementById('fn').value.trim();
  const email = document.getElementById('fe').value.trim();
  const tel   = document.getElementById('ft').value.trim();
  const err   = document.getElementById('fErr');
  err.style.display = 'none';
  const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const telRx   = /^[\d\s\+\-]{7,15}$/;
  if (nome.length < 2)          { err.textContent = 'Por favor insira o seu nome completo.';       err.style.display = 'block'; return; }
  if (!email || !emailRx.test(email)) { err.textContent = 'Por favor insira um email válido.';          err.style.display = 'block'; return; }
  if (!tel   || !telRx.test(tel))     { err.textContent = 'Por favor insira um número de telefone válido.'; err.style.display = 'block'; return; }
  const tipo = document.getElementById('ftp').value;
  if (!tipo) { err.textContent = 'Por favor seleccione o tipo de reserva.'; err.style.display = 'block'; return; }
  const ci = document.getElementById('fci').value || '—';
  const co = document.getElementById('fco').value || '—';
  if (ci !== '—' && co !== '—' && co <= ci) { err.textContent = 'A data de saída deve ser posterior à de entrada.'; err.style.display = 'block'; return; }
  const btn = document.getElementById('fBtn');
  btn.disabled = true; btn.textContent = 'A enviar...';
  const dados = { nome, email, telefone: tel || '—', tipo: tipo || '—',
    checkin: ci !== '—' ? ci : null, checkout: co !== '—' ? co : null,
    pessoas: document.getElementById('fpe').value, quartos: document.getElementById('fq') ? document.getElementById('fq').value : '—',
    observacoes: document.getElementById('fo').value.trim() || '—' };
  try {
    const { data, error } = await sb.from('reservas').insert(dados).select('codigo').single();
    if (error) throw error;
    const codigo = data && data.codigo ? data.codigo : '';
    const codigoLinha = codigo ? `🔖 *Código:* ${codigo}\n` : '';
    ULTIMA_RESERVA = { ...dados, checkin: ci, checkout: co, codigo };
    const msg = `🏨 *Nova Reserva — Reconecta Residencial*\n\n${codigoLinha}👤 *Nome:* ${dados.nome}\n📧 *Email:* ${dados.email}\n📞 *Telefone:* ${dados.telefone}\n🛎️ *Tipo:* ${dados.tipo}\n📅 *Check-in:* ${ci}\n📅 *Check-out:* ${co}\n👥 *Pessoas:* ${dados.pessoas}\n🛏️ *Quartos:* ${dados.quartos}\n📝 *Observações:* ${dados.observacoes}\n\n_Aceda ao painel ADM para confirmar._`;
    window.open('https://wa.me/244939798979?text=' + encodeURIComponent(msg), '_blank');
    document.getElementById('formWrap').style.display = 'none';
    document.getElementById('fOk').style.display = 'block';
    const codeEl = document.getElementById('resCode');
    if (codeEl) codeEl.textContent = codigo ? ('Código da reserva: ' + codigo) : '';
    ['fn','ft','fe','fo'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    document.getElementById('ftp').value = ''; onTipoChange();
    document.getElementById('fci').value = '';
    document.getElementById('fco').value = '';
    selCI = null; selCO = null; calMonthOffset = 0;
    if (typeof renderCalendario === 'function') renderCalendario();
    const selPe = document.getElementById('fpe'); if (selPe) selPe.selectedIndex = 1;
    const idQ      = tipo.toLowerCase().includes('standard') ? 'standard' : tipo.toLowerCase().includes('superior') ? 'superior' : tipo.toLowerCase().includes('confort') ? 'confort' : tipo.toLowerCase().includes('deluxe') ? 'deluxe' : null;
    const isPiscina = tipo.toLowerCase().includes('piscina');
    const nq = parseInt((dados.quartos || '1').replace(/\D/g, '')) || 1;
    if (idQ && !isPiscina) { disp[idQ] = Math.max(0, disp[idQ] - nq); renderQuartos(); atualizarSelectDisp(); }
    let secs = 3 * 60 * 60;
    const cdEl = document.getElementById('countdown');
    if (window._cdTimer) clearTimeout(window._cdTimer);
    (function tick() {
      if (secs <= 0) { cdEl.textContent = 'Expirado'; cdEl.style.color = '#C0392B'; if (idQ && !isPiscina) { disp[idQ] = Math.min(disp[idQ]+nq, QUARTOS.find(x=>x.id===idQ).total); renderQuartos(); atualizarSelectDisp(); } return; }
      const h = Math.floor(secs/3600), m = Math.floor((secs%3600)/60), s = secs%60;
      cdEl.textContent = String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
      if (secs <= 1800) cdEl.style.color = '#C0392B';
      secs--; window._cdTimer = setTimeout(tick, 1000);
    })();
  } catch(e) {
    err.textContent = 'Erro ao enviar. Tente pelo WhatsApp.'; err.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Enviar Pedido de Reserva';
  }
}

// ── GALERIA TABS ─────────────────────────────────
function switchTab(name, el) {
  document.querySelectorAll('.gal-tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  document.querySelectorAll('.gal-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('gal-' + name).classList.add('active');
}

// ── LIGHTBOX ─────────────────────────────────────
let lbImages = [], lbIndex = 0;

function openLightbox(src, alt, images, index) {
  lbImages = images;
  lbIndex  = index;
  const lb  = document.getElementById('lightbox');
  const img = document.getElementById('lbImg');
  const cap = document.getElementById('lbCaption');
  img.src = src;
  img.alt = alt;
  cap.textContent = alt;
  lb.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
  document.body.style.overflow = '';
}
function lbMove(dir) {
  lbIndex = (lbIndex + dir + lbImages.length) % lbImages.length;
  const img = document.getElementById('lbImg');
  const cap = document.getElementById('lbCaption');
  img.src = lbImages[lbIndex].src;
  img.alt = lbImages[lbIndex].alt;
  cap.textContent = lbImages[lbIndex].alt;
}
document.addEventListener('keydown', e => {
  const lb = document.getElementById('lightbox');
  if (!lb.classList.contains('open')) return;
  if (e.key === 'ArrowLeft')  lbMove(-1);
  if (e.key === 'ArrowRight') lbMove(1);
});

// Inicializar lightbox nos itens da galeria
function initLightbox() {
  document.querySelectorAll('.gal-panel').forEach(panel => {
    const items = panel.querySelectorAll('.gal-item');
    const images = Array.from(items).map(item => {
      const img = item.querySelector('img');
      return { src: img ? img.src : '', alt: img ? img.alt : '' };
    });
    items.forEach((item, i) => {
      item.addEventListener('click', () => {
        const img = item.querySelector('img');
        openLightbox(img.src, img.alt, images, i);
      });
    });
  });
}

// ── MENU RESTAURANTE ─────────────────────────────
function toggleMenu() {
  const btn  = document.getElementById('menuToggle');
  const menu = document.getElementById('menuS');
  btn.classList.toggle('open');
  menu.classList.toggle('open');
  btn.setAttribute('aria-expanded', menu.classList.contains('open'));
}

// ── LOCALIZAÇÃO → GOOGLE MAPS ────────────────────
function abrirMaps() {
  window.open('https://maps.app.goo.gl/11UD7gtXf7C4rV6e6', '_blank', 'noopener noreferrer');
}

// ── SPLASH ───────────────────────────────────────
window.addEventListener('load', () => setTimeout(() => document.getElementById('splash').classList.add('hide'), 2200));

// ── NAV ──────────────────────────────────────────
window.addEventListener('scroll', () => document.getElementById('nav').classList.toggle('scrolled', window.scrollY > 50));
function toggleMob() { document.getElementById('mobMenu').classList.toggle('open'); }
window.addEventListener('resize', () => {
  if (window.innerWidth > 900) document.getElementById('mobMenu').classList.remove('open');
});
document.addEventListener('click', e => {
  if (!e.target.closest('#mobMenu') && !e.target.closest('.hamburger'))
    document.getElementById('mobMenu').classList.remove('open');
});

// ── SLIDESHOW ────────────────────────────────────
let slide = 0;
const slides = document.querySelectorAll('.hero-slide');
const dots   = document.querySelectorAll('.dot');
let slideInterval = setInterval(() => goSlide((slide + 1) % slides.length), 5000);
function goSlide(n) {
  slides[slide].classList.remove('active'); dots[slide].classList.remove('active');
  slide = n; slides[slide].classList.add('active'); dots[slide].classList.add('active');
  clearInterval(slideInterval); slideInterval = setInterval(() => goSlide((slide + 1) % slides.length), 5000);
}

// ── REVEAL ───────────────────────────────────────
const obs = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); }), { threshold: .1 });
document.querySelectorAll('.rev').forEach(r => obs.observe(r));

// ── DATAS ────────────────────────────────────────
const today = new Date().toISOString().split('T')[0];
document.getElementById('fci').min = today;
document.getElementById('fco').min = today;
document.getElementById('fci').addEventListener('change', function() {
  const co = document.getElementById('fco');
  co.min = this.value;
  if (co.value && co.value < this.value) co.value = this.value;
  if (co.value) carregarDisponibilidade(this.value, co.value);
});
document.getElementById('fco').addEventListener('change', function() {
  const ci = document.getElementById('fci').value;
  if (ci && this.value) carregarDisponibilidade(ci, this.value);
});

// ── Imprimir comprovativo de reserva (cliente) ────
function imprimirComprovativo() {
  if (!ULTIMA_RESERVA) return;
  const r = ULTIMA_RESERVA;
  const area = document.getElementById('printArea');
  if (!area) return;
  area.innerHTML = `
    <div class="print-card">
      <h1>Reconecta Residencial</h1>
      <p class="print-sub">N'dalatando · Cuanza Norte, Angola · +244 939 798 979</p>
      <h2>Comprovativo de Reserva</h2>
      <p class="print-codigo">Código: <strong>${r.codigo || '—'}</strong></p>
      <table>
        <tr><td>Nome</td><td>${r.nome || '—'}</td></tr>
        <tr><td>Email</td><td>${r.email || '—'}</td></tr>
        <tr><td>Telefone</td><td>${r.telefone || '—'}</td></tr>
        <tr><td>Tipo</td><td>${r.tipo || '—'}</td></tr>
        <tr><td>Check-in</td><td>${r.checkin || '—'}</td></tr>
        <tr><td>Check-out</td><td>${r.checkout || '—'}</td></tr>
        <tr><td>Pessoas</td><td>${r.pessoas || '—'}</td></tr>
        <tr><td>Quartos</td><td>${r.quartos || '—'}</td></tr>
        <tr><td>Observações</td><td>${r.observacoes || '—'}</td></tr>
      </table>
      <p class="print-nota">Pagamento por verificação manual (transferência, Multicaixa Express ou numerário no check-in). Reserva sujeita a confirmação.</p>
    </div>`;
  window.print();
}

// ── CALENDÁRIO VISUAL (Fase 2) ────────────────────
const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DIAS_PT  = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
const TOTAL_QUARTOS = QUARTOS.reduce((s,q) => s + q.total, 0);

let calMonthOffset = 0;
let selCI = null, selCO = null; // Date objects (meia-noite local)

function getTipoIdSelecionado() {
  const tipo = (document.getElementById('ftp') || {}).value || '';
  const t = tipo.toLowerCase();
  return t.includes('standard') ? 'standard' : t.includes('superior') ? 'superior' : t.includes('confort') ? 'confort' : t.includes('deluxe') ? 'deluxe' : null;
}

// Quantos quartos (do tipo indicado, ou de todo o hotel se tipoId=null) estão
// ocupados num dia específico, com base nas reservas Pendentes/Confirmadas/Check-in.
function ocupadosNoDia(tipoId, dia) {
  let ocupados = 0;
  RESERVAS_CACHE.forEach(r => {
    const estado = (r.estado || '').toLowerCase();
    if (estado !== 'confirmado' && estado !== 'pendente' && estado !== 'check-in') return;
    if (!r.checkin || r.checkin === '—' || !r.checkout || r.checkout === '—') return;
    const ci = parseDataLocal(r.checkin), co = parseDataLocal(r.checkout);
    if (!ci || !co) return;
    if (dia < ci || dia >= co) return; // dia fora do intervalo desta reserva
    const t = (r.tipo || '').toLowerCase();
    if (tipoId) {
      if (!t.includes(tipoId)) return;
    }
    const nqRaw = (r.quartos || '1'); const nq = nqRaw.includes('3 ou mais') ? 3 : (parseInt(nqRaw.replace(/\D/g,'')) || 1);
    ocupados += nq;
  });
  return ocupados;
}

function livresNoDia(tipoId, dia) {
  const total = tipoId ? QUARTOS.find(q => q.id === tipoId).total : TOTAL_QUARTOS;
  return Math.max(0, total - ocupadosNoDia(tipoId, dia));
}

function calNav(delta) {
  calMonthOffset = Math.max(0, Math.min(11, calMonthOffset + delta));
  renderCalendario();
}

function fmtISO(d) { return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }

function calClickDia(iso, estadoDia) {
  if (estadoDia === 'passado' || estadoDia === 'esgotado') return;
  const d = parseDataLocal(iso);
  if (!selCI || (selCI && selCO)) {
    selCI = d; selCO = null;
  } else if (d.getTime() > selCI.getTime()) {
    selCO = d;
  } else {
    selCI = d; selCO = null;
  }
  document.getElementById('fci').value = selCI ? fmtISO(selCI) : '';
  document.getElementById('fco').value = selCO ? fmtISO(selCO) : '';
  if (selCI) document.getElementById('fci').dispatchEvent(new Event('change'));
  if (selCO) document.getElementById('fco').dispatchEvent(new Event('change'));
  renderCalendario();
}

function renderMes(ano, mes) {
  const tipoId = getTipoIdSelecionado();
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const primeiroDia = new Date(ano, mes, 1);
  // Segunda=0 ... Domingo=6
  const offset = (primeiroDia.getDay() + 6) % 7;
  const nDias = new Date(ano, mes + 1, 0).getDate();

  let celulas = '';
  for (let i = 0; i < offset; i++) celulas += '<div class="cal-day out"></div>';
  for (let dia = 1; dia <= nDias; dia++) {
    const d = new Date(ano, mes, dia);
    const iso = fmtISO(d);
    let estado;
    if (d < hoje) estado = 'passado';
    else {
      const livres = livresNoDia(tipoId, d);
      const total = tipoId ? QUARTOS.find(q => q.id === tipoId).total : TOTAL_QUARTOS;
      estado = livres <= 0 ? 'esgotado' : (livres <= Math.max(1, Math.round(total * 0.2)) ? 'pouco' : 'livre');
    }
    let sel = '';
    if (selCI && d.getTime() === selCI.getTime()) sel = ' sel-ini';
    else if (selCO && d.getTime() === selCO.getTime()) sel = ' sel-fim';
    else if (selCI && selCO && d.getTime() > selCI.getTime() && d.getTime() < selCO.getTime()) sel = ' in-range';
    const clickable = (estado !== 'passado' && estado !== 'esgotado');
    celulas += `<div class="cal-day ${estado}${sel}" ${clickable ? `onclick="calClickDia('${iso}','${estado}')"` : ''} title="${clickable ? (estado==='pouco'?'Poucas vagas':'Disponível') : (estado==='esgotado'?'Esgotado':'Data passada')}">${dia}</div>`;
  }
  const totalCel = offset + nDias;
  const restos = (7 - (totalCel % 7)) % 7;
  for (let i = 0; i < restos; i++) celulas += '<div class="cal-day out"></div>';

  return `<div class="cal-month">
    <div class="cal-month-title">${MESES_PT[mes]} ${ano}</div>
    <div class="cal-grid cal-grid-head">${DIAS_PT.map(d => `<div class="cal-dh">${d}</div>`).join('')}</div>
    <div class="cal-grid">${celulas}</div>
  </div>`;
}

function renderCalendario() {
  const wrap = document.getElementById('calWrap');
  if (!wrap) return;
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + calMonthOffset);
  const mes1 = renderMes(base.getFullYear(), base.getMonth());
  const prox = new Date(base); prox.setMonth(prox.getMonth() + 1);
  const mes2 = renderMes(prox.getFullYear(), prox.getMonth());

  let resumo = '<span class="cal-hint">Seleccione a data de entrada e depois a de saída.</span>';
  if (selCI && selCO) {
    const noitesN = Math.round((selCO - selCI) / (1000*60*60*24));
    resumo = `<strong>${noitesN} noite${noitesN !== 1 ? 's' : ''}</strong> · ${selCI.toLocaleDateString('pt-PT')} → ${selCO.toLocaleDateString('pt-PT')}`;
  } else if (selCI) {
    resumo = `Entrada: <strong>${selCI.toLocaleDateString('pt-PT')}</strong> — agora seleccione a saída.`;
  }

  wrap.innerHTML = `
    <div class="cal-legend"><span class="lg livre">Livre</span><span class="lg pouco">Poucas vagas</span><span class="lg esgotado">Esgotado</span></div>
    <div class="cal-nav">
      <button type="button" class="cal-arrow" onclick="calNav(-1)" ${calMonthOffset<=0?'disabled':''}>‹</button>
      <div class="cal-months">${mes1}${mes2}</div>
      <button type="button" class="cal-arrow" onclick="calNav(1)">›</button>
    </div>
    <div class="cal-summary">${resumo}</div>`;
}

// ── FOOTER ANO ───────────────────────────────────
document.getElementById('fyear').textContent = new Date().getFullYear();

// ── VALIDAÇÃO EM TEMPO REAL ──────────────────────
function addInputFeedback(id, validator, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('blur', () => {
    if (el.value && !validator(el.value.trim())) {
      el.style.borderColor = '#C0392B';
      let hint = el.parentNode.querySelector('.input-hint');
      if (!hint) { hint = document.createElement('span'); hint.className = 'input-hint'; hint.style.cssText = 'font-size:.6rem;color:#C0392B;margin-top:2px;display:block'; el.parentNode.appendChild(hint); }
      hint.textContent = msg;
    } else {
      el.style.borderColor = '';
      const hint = el.parentNode.querySelector('.input-hint'); if (hint) hint.remove();
    }
  });
  el.addEventListener('input', () => {
    if (el.style.borderColor === 'rgb(192, 57, 43)') { el.style.borderColor = ''; const hint = el.parentNode.querySelector('.input-hint'); if (hint) hint.remove(); }
  });
}

// ── NOVIDADES / AVISOS (conteúdo dinâmico gerido pelo admin) ─────
function fmtDataCurta(str){
  const d=parseDataLocal(str);
  if(!d) return '';
  return d.toLocaleDateString('pt-PT',{day:'2-digit',month:'short'});
}
function fecharAvisoBanner(){
  const banner=document.getElementById('avisoBanner');
  if(!banner) return;
  banner.style.display='none';
  const id=banner.dataset.avisoId;
  if(id) sessionStorage.setItem('aviso_fechado_'+id,'1');
}
async function carregarAvisos(){
  try{
    const { data, error } = await sb.from('avisos').select('*').order('criado_em',{ascending:false});
    if(error) throw error;
    const avisos = data || [];

    // Banner — primeiro aviso marcado como "destaque" que não tenha sido fechado nesta sessão
    const destaque = avisos.find(a => a.destaque && sessionStorage.getItem('aviso_fechado_'+a.id) !== '1');
    const banner = document.getElementById('avisoBanner');
    if(banner){
      if(destaque){
        banner.dataset.avisoId = destaque.id;
        const img=document.getElementById('avisoBannerImg');
        if(destaque.imagem_url){ img.src=destaque.imagem_url; img.style.display=''; } else { img.style.display='none'; }
        document.getElementById('avisoBannerTitulo').textContent = destaque.titulo || '';
        document.getElementById('avisoBannerDesc').textContent = destaque.descricao || '';
        banner.style.display='flex';
      } else {
        banner.style.display='none';
      }
    }

    // Secção Novidades — todos os avisos activos (a RLS já só devolve os válidos)
    const grid=document.getElementById('novidadesGrid');
    const section=document.getElementById('novidades');
    if(grid && section){
      if(avisos.length){
        grid.innerHTML = avisos.map(a=>{
          const periodo = (a.data_inicio||a.data_fim)
            ? `${a.data_inicio?fmtDataCurta(a.data_inicio):'—'} a ${a.data_fim?fmtDataCurta(a.data_fim):'—'}`
            : '';
          return `<div class="nov-card">
            ${a.imagem_url?`<img class="nov-card-img" src="${a.imagem_url}" alt="${(a.titulo||'').replace(/"/g,'')}" loading="lazy">`:''}
            <div class="nov-card-body">
              <div class="nov-card-title">${a.titulo||''}</div>
              <div class="nov-card-desc">${a.descricao||''}</div>
              ${periodo?`<div class="nov-card-period">${periodo}</div>`:''}
            </div>
          </div>`;
        }).join('');
        section.style.display='';
      } else {
        section.style.display='none';
      }
    }
  }catch(e){ console.error('Erro ao carregar avisos:', e.message||e); }
}

// ── INIT ─────────────────────────────────────────
// Cada chamada isolada em try/catch: um erro numa função nunca deve
// impedir as restantes de correr (ex: um problema no calendário não pode
// bloquear as Novidades de carregar).
carregarAvisos();
try{ carregarDisponibilidade(); }catch(e){ console.warn('Erro disponibilidade:',e); }
try{ renderCalendario(); }catch(e){ console.warn('Erro calendário:',e); }
try{ initLightbox(); }catch(e){ console.warn('Erro lightbox:',e); }
try{ addInputFeedback('fe', v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), 'Email inválido'); }catch(e){}
try{ addInputFeedback('ft', v => /^[\d\s\+\-]{7,15}$/.test(v), 'Telefone inválido'); }catch(e){}

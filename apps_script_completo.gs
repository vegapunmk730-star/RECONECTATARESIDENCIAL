// ═══════════════════════════════════════════════════════════════════
// RECONECTA RESIDENCIAL — Google Apps Script COMPLETO v6.0
// Colar TODO este conteúdo no editor e re-publicar como nova versão
// Acesso: Qualquer pessoa (mesmo anónima)
//
// TRIGGERS A CONFIGURAR (Gatilhos → Adicionar gatilho):
//   • autoCancelarPendentes   → Accionado por tempo → A cada hora
//   • arquivarReservasExpiradas → Accionado por tempo → A cada hora
// ═══════════════════════════════════════════════════════════════════

const SHEET_NAME   = 'Reservas';
const ARCHIVE_NAME = 'Arquivo';

// ── CORS — cabeçalhos para todas as respostas ───────────────────────
function criarResposta(dados) {
  return ContentService
    .createTextOutput(JSON.stringify(dados))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Obter (ou criar) a aba Arquivo ─────────────────────────────────
function obterOuCriarAbaArquivo(ss, headers) {
  let arquivo = ss.getSheetByName(ARCHIVE_NAME);
  if (!arquivo) {
    arquivo = ss.insertSheet(ARCHIVE_NAME);
    // Cabeçalhos = mesmos da aba Reservas + coluna extra data_arquivo
    const cabArq = headers.concat(['data_arquivo']);
    arquivo.appendRow(cabArq);
    const cab = arquivo.getRange(1, 1, 1, cabArq.length);
    cab.setFontWeight('bold');
    cab.setBackground('#1a3a2a');
    cab.setFontColor('#ffffff');
    arquivo.setFrozenRows(1);
    Logger.log('Aba Arquivo criada.');
  }
  return arquivo;
}

// ── GET — devolver reservas ─────────────────────────────────────────
function doGet(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) return criarResposta({ reservas: [] });
    const dados = sheet.getDataRange().getValues();
    if (dados.length <= 1) return criarResposta({ reservas: [] });
    const headers = dados[0];
    const reservas = [];
    for (let i = 1; i < dados.length; i++) {
      const row = {};
      headers.forEach((h, j) => {
        row[h] = dados[i][j] !== undefined && dados[i][j] !== null ? String(dados[i][j]) : '';
      });
      reservas.push(row);
    }
    return criarResposta({ ok: true, reservas });
  } catch (err) {
    return criarResposta({ ok: false, erro: err.message, reservas: [] });
  }
}

// ── POST — receber acções ───────────────────────────────────────────
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    if (payload.action === 'updateStatus')    return actualizarEstado(payload.id, payload.estado);
    if (payload.action === 'updatePagamento') return actualizarPagamento(payload.id, payload.pagamento_estado, payload.pagamento_valor, payload.pagamento_notas);
    if (payload.action === 'deleteReserva')   return apagarReserva(payload.id);
    if (payload.action === 'clearAll')        return apagarTodasReservas();
    return guardarReserva(payload);
  } catch (err) {
    return criarResposta({ ok: false, erro: err.message });
  }
}

// ── Guardar nova reserva ────────────────────────────────────────────
function guardarReserva(dados) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);

  if (!dados.nome || String(dados.nome).trim().length < 2) {
    return criarResposta({ ok: false, erro: 'Nome obrigatório.' });
  }
  if (!dados.telefone && !dados.email) {
    return criarResposta({ ok: false, erro: 'Telefone ou email obrigatório.' });
  }

  // Criar cabeçalhos se folha vazia
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['id','nome','email','telefone','tipo','checkin','checkout',
                     'pessoas','quartos','observacoes','data_submissao','estado',
                     'pagamento_estado','pagamento_valor','pagamento_notas']);
    const cab = sheet.getRange(1,1,1,15);
    cab.setFontWeight('bold');
    cab.setBackground('#2b2b2b');
    cab.setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }

  const headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
  // BUG 3 FIX: O ID anterior usava getLastRow() antes de appendRow(), causando IDs
  // duplicados em pedidos simultâneos. Agora usa timestamp de milissegundos + sufixo
  // aleatório de 3 dígitos, tornando colisões praticamente impossíveis.
  const tsId = new Date().getFullYear() + '-' + Date.now() + '-' + String(Math.floor(Math.random() * 1000)).padStart(3,'0');
  const id = 'RES-' + tsId;

  const linha = headers.map(h => {
    if (h === 'id')               return id;
    if (h === 'estado')           return dados.estado || 'Pendente';
    if (h === 'data_submissao')   return dados.data_submissao || new Date().toLocaleString('pt-PT');
    if (h === 'pagamento_estado') return dados.pagamento_estado || 'Não pago';
    if (h === 'pagamento_valor')  return dados.pagamento_valor  || '0';
    if (h === 'pagamento_notas')  return dados.pagamento_notas  || '—';
    return dados[h] !== undefined ? dados[h] : '—';
  });

  sheet.appendRow(linha);
  Logger.log('Nova reserva: ' + id);
  return criarResposta({ ok: true, id });
}

// ── Apagar reserva individual ───────────────────────────────────────
function apagarReserva(id) {
  if (!id) return criarResposta({ ok: false, erro: 'ID em falta.' });

  const sheet   = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet)   return criarResposta({ ok: false, erro: 'Folha não encontrada.' });

  const dados   = sheet.getDataRange().getValues();
  if (dados.length <= 1) return criarResposta({ ok: false, erro: 'Folha vazia.' });

  const headers = dados[0];
  const iId     = headers.indexOf('id');

  if (iId < 0) return criarResposta({ ok: false, erro: 'Coluna id não encontrada.' });

  const idProcurar = String(id).trim();

  // Percorrer de baixo para cima — evita saltar linhas durante a eliminação
  for (let i = dados.length - 1; i >= 1; i--) {
    const idLinha = String(dados[i][iId] || '').trim();
    if (idLinha === idProcurar) {
      sheet.deleteRow(i + 1);
      Logger.log('Apagada reserva: ' + idProcurar + ' (linha ' + (i+1) + ')');
      return criarResposta({ ok: true, apagada: idProcurar });
    }
  }

  Logger.log('Reserva não encontrada: ' + idProcurar);
  return criarResposta({ ok: false, erro: 'Reserva não encontrada: ' + idProcurar });
}

// ── Apagar TODAS as reservas (manter cabeçalhos) ────────────────────
function apagarTodasReservas() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) return criarResposta({ ok: false, erro: 'Folha não encontrada.' });

  const total = sheet.getLastRow();
  if (total <= 1) return criarResposta({ ok: true, apagadas: 0 });

  sheet.deleteRows(2, total - 1);
  Logger.log('clearAll: ' + (total - 1) + ' reservas apagadas.');
  return criarResposta({ ok: true, apagadas: total - 1 });
}

// ── Actualizar pagamento ────────────────────────────────────────────
function actualizarPagamento(id, pagEstado, pagValor, pagNotas) {
  if (!id) return criarResposta({ ok: false, erro: 'ID em falta.' });
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) return criarResposta({ ok: false, erro: 'Folha não encontrada.' });
  const dados = sheet.getDataRange().getValues();
  const headers = dados[0];
  const iId    = headers.indexOf('id');
  const iPagE  = headers.indexOf('pagamento_estado');
  const iPagV  = headers.indexOf('pagamento_valor');
  const iPagN  = headers.indexOf('pagamento_notas');
  if (iId < 0) return criarResposta({ ok: false, erro: 'Coluna id não encontrada.' });
  const idP = String(id).trim();
  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][iId] || '').trim() === idP) {
      if (iPagE >= 0) sheet.getRange(i+1, iPagE+1).setValue(pagEstado || 'Não pago');
      if (iPagV >= 0) sheet.getRange(i+1, iPagV+1).setValue(pagValor  || '0');
      if (iPagN >= 0) sheet.getRange(i+1, iPagN+1).setValue(pagNotas  || '—');
      Logger.log('Pagamento actualizado: ' + idP);
      return criarResposta({ ok: true });
    }
  }
  return criarResposta({ ok: false, erro: 'Reserva não encontrada.' });
}

// ── Actualizar estado ───────────────────────────────────────────────
function actualizarEstado(id, novoEstado) {
  if (!id || !novoEstado) return criarResposta({ ok: false, erro: 'ID ou estado em falta.' });

  const sheet   = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet)   return criarResposta({ ok: false, erro: 'Folha não encontrada.' });

  const dados   = sheet.getDataRange().getValues();
  const headers = dados[0];
  const iId     = headers.indexOf('id');
  const iEstado = headers.indexOf('estado');

  if (iId < 0 || iEstado < 0) return criarResposta({ ok: false, erro: 'Colunas não encontradas.' });

  const idProcurar = String(id).trim();
  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][iId] || '').trim() === idProcurar) {
      sheet.getRange(i + 1, iEstado + 1).setValue(novoEstado);
      Logger.log('Estado actualizado: ' + idProcurar + ' → ' + novoEstado);
      return criarResposta({ ok: true });
    }
  }
  return criarResposta({ ok: false, erro: 'Reserva não encontrada.' });
}

// ── TRIGGER HORÁRIA — auto-cancelar pendentes após 3h ───────────────
// Configurar: Gatilhos → autoCancelarPendentes → A cada hora
function autoCancelarPendentes() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) return;
  const dados   = sheet.getDataRange().getValues();
  const headers = dados[0];
  const iEstado = headers.indexOf('estado');
  const iData   = headers.indexOf('data_submissao');
  if (iEstado < 0 || iData < 0) return;
  const agora = new Date(), tresH = 3 * 60 * 60 * 1000;
  let cancelados = 0;
  for (let i = 1; i < dados.length; i++) {
    const estado = (dados[i][iEstado] || '').toLowerCase().trim();
    // BUG 5 FIX: A condição anterior incluía estado==='' (linha com estado vazio),
    // o que cancelava linhas editadas manualmente sem querer. Agora só cancela 'pendente'.
    if (estado !== 'pendente') continue;
    const dataStr = dados[i][iData];
    if (!dataStr) continue;
    let d;
    try {
      d = new Date(dataStr);
      if (isNaN(d)) {
        const p = String(dataStr).match(/(\d{2})\/(\d{2})\/(\d{4}),?\s+(\d{2}):(\d{2})/);
        if (p) d = new Date(p[3], p[2]-1, p[1], p[4], p[5]);
      }
    } catch(e) { continue; }
    if (!d || isNaN(d)) continue;
    if (agora - d > tresH) {
      sheet.getRange(i + 1, iEstado + 1).setValue('Cancelado');
      cancelados++;
    }
  }
  Logger.log('autoCancelarPendentes: ' + cancelados + ' cancelada(s).');
}

// ── TRIGGER HORÁRIA — arquivar reservas expiradas ──────────────────
// Move para a aba "Arquivo":
//   • Reservas CONFIRMADAS cujo checkout já passou (hóspede já saiu)
//   • Reservas CANCELADAS com mais de 7 dias (limpeza de histórico)
// Configurar: Gatilhos → arquivarReservasExpiradas → A cada hora
function arquivarReservasExpiradas() {
  const ss      = SpreadsheetApp.getActiveSpreadsheet();
  const sheet   = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return;

  const dados   = sheet.getDataRange().getValues();
  if (dados.length <= 1) { Logger.log('arquivar: folha vazia.'); return; }

  const headers  = dados[0];
  const iEstado  = headers.indexOf('estado');
  const iCo      = headers.indexOf('checkout');
  const iData    = headers.indexOf('data_submissao');

  if (iEstado < 0 || iCo < 0) {
    Logger.log('arquivar: colunas estado/checkout não encontradas.');
    return;
  }

  const arquivo     = obterOuCriarAbaArquivo(ss, headers);
  const agora       = new Date();
  const hoje        = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const seteDias    = 7 * 24 * 60 * 60 * 1000;
  const dataArquivo = agora.toLocaleString('pt-PT');

  // Percorrer de baixo para cima para poder apagar linhas sem saltar índices
  let arquivadas = 0;
  for (let i = dados.length - 1; i >= 1; i--) {
    const estado = (dados[i][iEstado] || '').toLowerCase().trim();
    const coStr  = dados[i][iCo];
    let   mover  = false;

    if (estado === 'confirmado') {
      // Arquivar quando o checkout já passou (hóspede saiu)
      const coDate = parseDataLocalGS(coStr);
      if (coDate && coDate < hoje) mover = true;

    } else if (estado === 'cancelado') {
      // Arquivar cancelamentos com mais de 7 dias
      if (iData >= 0) {
        const dSub = parseDataLocalGS(dados[i][iData]);
        if (dSub && (agora - dSub) > seteDias) mover = true;
      }
    }

    if (mover) {
      // Copiar linha para Arquivo (+ data_arquivo no fim)
      const linhaArq = dados[i].concat([dataArquivo]);
      arquivo.appendRow(linhaArq);
      sheet.deleteRow(i + 1);
      arquivadas++;
    }
  }

  Logger.log('arquivarReservasExpiradas: ' + arquivadas + ' movida(s) para Arquivo.');
}

// Auxiliar local (semelhante ao parseDataLocal do main.js, mas em GAS)
function parseDataLocalGS(str) {
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

// ── CONFIGURAÇÃO INICIAL — executar UMA vez manualmente ─────────────
function criarCabecalhosSeNecessario() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let   sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) { sheet = ss.insertSheet(SHEET_NAME); }
  const primeira = sheet.getRange(1,1).getValue();
  if (!primeira || primeira === '') {
    sheet.appendRow(['id','nome','email','telefone','tipo','checkin','checkout',
                     'pessoas','quartos','observacoes','data_submissao','estado',
                     'pagamento_estado','pagamento_valor','pagamento_notas']);
    const cab = sheet.getRange(1,1,1,15);
    cab.setFontWeight('bold');
    cab.setBackground('#2b2b2b');
    cab.setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    Logger.log('Cabeçalhos criados.');
  } else {
    Logger.log('Cabeçalhos já existem: ' + primeira);
  }
  // Garantir que a aba Arquivo também existe
  const headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
  obterOuCriarAbaArquivo(ss, headers);
  Logger.log('Configuração inicial concluída.');
}

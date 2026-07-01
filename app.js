/* ======================================================================
   CONFIGURAZIONE — incolla qui l'URL della tua Apps Script Web App
   ====================================================================== */
const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbymMSfv3ejTrcmluk7u20at8ltGxqjTuQF4f-TYhiqMbJRzOQXClrZ_dDhUz9J5f_HL/exec' 
};

/* ======================================================================
   STATO APPLICAZIONE
   ====================================================================== */
let SESSION = null;       // { username, password, ruolo }
let MOVIMENTI = [];
let CFG = {};
let chartRef = null;

const $ = (id) => document.getElementById(id);

function toast(msg){
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2400);
}

function copyFallback(text){
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try{
    document.execCommand('copy');
    toast('TRN copiato!');
  }catch(e){
    toast('Copia manuale: ' + text);
  }
  document.body.removeChild(ta);
}

function eur(n){
  return '€ ' + (Number(n)||0).toLocaleString('it-IT');
}

const MESI_IT = ['GEN','FEB','MAR','APR','MAG','GIU','LUG','AGO','SET','OTT','NOV','DIC'];

function fmtMese(dateStr){
  const [y,m] = dateStr.split('-');
  return MESI_IT[parseInt(m,10)-1] + ' ' + y;
}

function addMonths(dateStr, n){
  const [y,m] = dateStr.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return MESI_IT[d.getMonth()] + ' ' + d.getFullYear();
}

/* ======================================================================
   LOGIN / SESSIONE
   ====================================================================== */
function loadSession(){
  const raw = localStorage.getItem('rd_session');
  if(raw){
    try{ SESSION = JSON.parse(raw); return true; }catch(e){}
  }
  return false;
}
function saveSession(){ localStorage.setItem('rd_session', JSON.stringify(SESSION)); }
function clearSession(){ localStorage.removeItem('rd_session'); SESSION = null; }

async function apiGet(params){
  const url = CONFIG.API_URL + '?' + new URLSearchParams(params).toString();
  const res = await fetch(url);
  return res.json();
}
async function apiPost(body){
  const res = await fetch(CONFIG.API_URL, {
    method: 'POST',
    body: JSON.stringify({ ...body, username: SESSION.username, password: SESSION.password })
  });
  return res.json();
}

async function doLogin(username, password){
  const r = await apiGet({ action:'login', username, password });
  if(r.ok){
    SESSION = { username, password, ruolo: r.ruolo };
    saveSession();
    return true;
  }
  return false;
}

$('login-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  $('login-error').textContent = '';
  const u = $('login-user').value.trim();
  const p = $('login-pass').value;
  try{
    const ok = await doLogin(u, p);
    if(ok){ enterApp(); } else { $('login-error').textContent = 'Credenziali non valide.'; }
  }catch(err){
    $('login-error').textContent = 'Errore di connessione. Controlla API_URL.';
  }
});

$('logout-btn').addEventListener('click', ()=>{
  clearSession();
  $('app').hidden = true;
  $('login-screen').hidden = false;
});

/* ======================================================================
   AVVIO APP
   ====================================================================== */
async function enterApp(){
  $('login-screen').hidden = true;
  $('app').hidden = false;
  $('who-user').textContent = SESSION.username + ' · ' + (SESSION.ruolo === 'write' ? 'scrittura' : 'lettura');
  $('add-btn').hidden = SESSION.ruolo !== 'write';
  await refreshData();
}

async function refreshData(){
  const r = await apiGet({ action:'getData' });
  if(!r.ok){ toast('Errore caricamento dati'); return; }
  MOVIMENTI = r.movimenti;
  CFG = r.config;
  render();
}

(function init(){
  if(loadSession()){ enterApp(); }
})();

/* ======================================================================
   CALCOLI
   ====================================================================== */
function computeStats(){
  const pagati = MOVIMENTI.filter(m => m.stato === 'Pagato' && m.importo);
  const versato = pagati.reduce((s,m)=> s + Number(m.importo), 0);
  const totale = Number(CFG.TotaleDebito) || 0;
  const residuo = Math.max(totale - versato, 0);
  const rataMensile = Number(CFG.ImportoMensile) || 208;
  const rateRimanenti = rataMensile ? Math.ceil(residuo / rataMensile) : 0;
  const pct = totale ? Math.min(versato / totale * 100, 100) : 0;

  // proiezione fine pagamento: dall'ultima rata pagata + rateRimanenti mesi
  let projFine = null;
  if(rateRimanenti > 0 && pagati.length > 0){
    const lastDate = [...pagati].sort((a,b)=>b.data.localeCompare(a.data))[0].data;
    projFine = addMonths(lastDate, rateRimanenti);
  }

  return { versato, totale, residuo, rateRimanenti, pct, numRatePagate: pagati.length, projFine };
}

/* ======================================================================
   RENDER
   ====================================================================== */
function render(){
  const s = computeStats();
  $('stat-totale').textContent = eur(s.totale);
  $('stat-versato').textContent = eur(s.versato);
  $('stat-residuo').textContent = eur(s.residuo);
  $('stat-rate').textContent = s.projFine
    ? `${s.rateRimanenti} (${s.projFine})`
    : s.rateRimanenti;
  $('pct-value').textContent = Math.round(s.pct) + '%';
  $('rate-caption').textContent = s.numRatePagate + ' rate pagate';

  const circumference = 2 * Math.PI * 52;
  const arc = $('stamp-arc');
  arc.setAttribute('stroke-dasharray', `${circumference * s.pct/100} ${circumference}`);

  renderTable();
  renderChart();
}

function renderTable(){
  const body = $('ledger-body');
  body.innerHTML = '';
  const sorted = [...MOVIMENTI].sort((a,b)=> b.data.localeCompare(a.data));
  $('ledger-empty').hidden = sorted.length > 0;

  sorted.forEach(m=>{
    const tr = document.createElement('tr');
    const badgeClass = m.stato === 'Pagato' ? 'badge-pagato' : 'badge-saltato';
    tr.innerHTML = `
      <td class="mono">${fmtMese(m.data)}</td>
      <td class="mono trn-cell">
        <span class="trn-short">${(m.trn||'—').slice(0,9)}${m.trn && m.trn.length > 9 ? '…' : ''}</span>
        ${m.trn ? `<span class="trn-copy" data-trn="${m.trn}">copia</span>` : ''}
      </td>
      <td class="mono">${m.importo ? eur(m.importo) : '—'}</td>
      <td><span class="badge ${badgeClass}">${m.stato || '—'}</span></td>
      <td class="note-cell">${m.note || ''}</td>
      <td class="row-actions">${SESSION.ruolo === 'write' ? `<button data-edit="${m.rowIndex}">Modifica</button><button data-del="${m.rowIndex}">Elimina</button>` : ''}</td>
    `;
    body.appendChild(tr);
  });

  body.querySelectorAll('[data-edit]').forEach(btn=>{
    btn.addEventListener('click', ()=> openMovimentoModal(Number(btn.dataset.edit)));
  });
  body.querySelectorAll('[data-del]').forEach(btn=>{
    btn.addEventListener('click', ()=> deleteMovimento(Number(btn.dataset.del)));
  });
  body.querySelectorAll('.trn-copy').forEach(span=>{
    span.addEventListener('click', ()=>{
      const testo = span.dataset.trn;
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(testo)
          .then(()=> toast('TRN copiato!'))
          .catch(()=> copyFallback(testo));
      } else {
        copyFallback(testo);
      }
    });
  });
}

function renderChart(){
  const totale = Number(CFG.TotaleDebito) || 0;
  const rataMensile = Number(CFG.ImportoMensile) || 208;

  // costruisci mappa mese→importo per i mesi pagati
  const byMonth = {};
  MOVIMENTI.filter(m=>m.stato==='Pagato' && m.importo).forEach(m=>{
    const key = m.data.slice(0,7);
    byMonth[key] = (byMonth[key]||0) + Number(m.importo);
  });
  const histLabels = Object.keys(byMonth).sort();
  if(!histLabels.length){ return; }

  // cumulativo storico
  let running = 0;
  const histCumulative = histLabels.map(l => (running += byMonth[l]));
  const lastHistValue = histCumulative[histCumulative.length - 1];
  const lastHistMonth = histLabels[histLabels.length - 1];

  // mesi di proiezione: da lastHistMonth+1 fino al pareggio
  const residuo = Math.max(totale - lastHistValue, 0);
  const rateRimanenti = rataMensile ? Math.ceil(residuo / rataMensile) : 0;
  const projMonths = [];
  for(let i = 1; i <= rateRimanenti; i++){
    const [y,m] = lastHistMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + i, 1);
    projMonths.push(d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0'));
  }

  const allLabels = [...histLabels, ...projMonths];

  // labels asse X: mostra solo GEN e GIU di ogni anno, il resto stringa vuota
  const xLabels = allLabels.map(l => {
    const m = parseInt(l.split('-')[1], 10);
    return (m === 1 || m === 6) ? fmtMese(l + '-01') : '';
  });

  // dataset storico: valori reali, null nel futuro
  const dataHist = allLabels.map((l,i) => i < histLabels.length ? histCumulative[i] : null);

  // dataset proiezione: null per tutto lo storico tranne l'ultimo punto (ponte), poi salita lineare
  const dataProj = allLabels.map((l,i) => {
    if(i < histLabels.length - 1) return null;
    if(i === histLabels.length - 1) return lastHistValue; // punto di raccordo
    const step = i - histLabels.length + 1;
    return Math.min(lastHistValue + step * rataMensile, totale);
  });

  if(chartRef) chartRef.destroy();
  chartRef = new Chart($('monthlyChart'), {
    type: 'line',
    data: {
      labels: xLabels,
      datasets: [
        {
          label: 'Versato',
          data: dataHist,
          borderColor: '#B23A2E',
          backgroundColor: 'rgba(178,58,46,.10)',
          fill: 'origin',
          tension: 0.2,
          pointRadius: 0,
          borderWidth: 2,
          spanGaps: false
        },
        {
          label: 'Proiezione',
          data: dataProj,
          borderColor: '#B8915A',
          backgroundColor: 'rgba(184,145,90,.06)',
          fill: 'origin',
          tension: 0,
          pointRadius: 0,
          borderWidth: 2,
          borderDash: [6,4],
          spanGaps: false
        },
        {
          label: 'Totale debito',
          data: allLabels.map(() => totale),
          borderColor: '#1B2A4A',
          borderDash: [3,3],
          borderWidth: 1,
          pointRadius: 0,
          fill: false
        }
      ]
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, labels: { font: { family: 'Inter', size: 11 }, boxWidth: 14, usePointStyle: true } },
        tooltip: { callbacks: { label: ctx => ctx.parsed.y != null ? `${ctx.dataset.label}: ${eur(ctx.parsed.y)}` : null } }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { family: 'IBM Plex Mono', size: 9 }, maxRotation: 0, autoSkip: false }
        },
        y: {
          grid: { color: '#D8CFC0' },
          min: 0,
          max: totale,
          ticks: { callback: v => '€' + v.toLocaleString('it-IT') }
        }
      }
    }
  });
}

/* ======================================================================
   CRUD MOVIMENTI (solo ruolo write)
   ====================================================================== */
function openMovimentoModal(rowIndex){
  $('movimento-form').reset();
  $('mov-rowindex').value = '';
  $('movimento-title').textContent = 'Nuovo versamento';
  if(rowIndex){
    const m = MOVIMENTI.find(x=>x.rowIndex===rowIndex);
    if(m){
      $('movimento-title').textContent = 'Modifica versamento';
      $('mov-rowindex').value = m.rowIndex;
      $('mov-data').value = m.data;
      $('mov-trn').value = m.trn;
      $('mov-importo').value = m.importo || '';
      $('mov-stato').value = m.stato || 'Pagato';
      $('mov-note').value = m.note || '';
    }
  } else {
    $('mov-stato').value = 'Pagato';
    $('mov-importo').value = CFG.ImportoMensile || 208;
  }
  $('movimento-backdrop').classList.add('open');
}
$('add-btn').addEventListener('click', ()=> openMovimentoModal(null));
$('movimento-cancel').addEventListener('click', ()=> $('movimento-backdrop').classList.remove('open'));

$('movimento-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const rowIndex = $('mov-rowindex').value;
  const payload = {
    data: $('mov-data').value,
    trn: $('mov-trn').value,
    importo: $('mov-importo').value ? Number($('mov-importo').value) : '',
    stato: $('mov-stato').value,
    note: $('mov-note').value
  };
  const action = rowIndex ? 'updateMovimento' : 'addMovimento';
  if(rowIndex) payload.rowIndex = Number(rowIndex);
  const r = await apiPost({ action, ...payload });
  if(r.ok){
    toast('Versamento salvato');
    $('movimento-backdrop').classList.remove('open');
    await refreshData();
  } else {
    toast('Errore: ' + (r.error||'sconosciuto'));
  }
});

async function deleteMovimento(rowIndex){
  if(!confirm('Eliminare questo versamento?')) return;
  const r = await apiPost({ action:'deleteMovimento', rowIndex });
  if(r.ok){ toast('Eliminato'); await refreshData(); }
  else toast('Errore eliminazione');
}

/* ======================================================================
   EXPORT PDF
   ====================================================================== */
$('pdf-btn').addEventListener('click', ()=> $('pdf-backdrop').classList.add('open'));
$('pdf-cancel').addEventListener('click', ()=> $('pdf-backdrop').classList.remove('open'));
$('pdf-mode').addEventListener('change', (e)=>{
  $('pdf-range-fields').hidden = e.target.value !== 'range';
});

$('pdf-generate').addEventListener('click', ()=>{
  const mode = $('pdf-mode').value;
  let filtered = [...MOVIMENTI];
  let label = 'Storico completo';
  if(mode === 'range'){
    const from = $('pdf-from').value, to = $('pdf-to').value;
    filtered = filtered.filter(m => (!from || m.data >= from) && (!to || m.data <= to));
    label = `Periodo: ${from || '...'} → ${to || '...'}`;
  }
  filtered.sort((a,b)=> a.data.localeCompare(b.data));

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const s = computeStats();
  const periodVersato = filtered.filter(m=>m.stato==='Pagato' && m.importo).reduce((sum,m)=>sum+Number(m.importo),0);

  doc.setFont('helvetica','bold'); doc.setFontSize(16);
  doc.text('Ricognizione di debito — Report', 14, 18);
  doc.setFont('helvetica','normal'); doc.setFontSize(10);
  doc.text(label, 14, 25);
  doc.text('Generato il ' + new Date().toLocaleDateString('it-IT'), 14, 30);

  let y = 42;
  doc.setFontSize(9);
  doc.setFont('helvetica','bold');
  doc.text('Data', 14, y); doc.text('TRN', 42, y); doc.text('Importo', 130, y); doc.text('Stato', 155, y); doc.text('Note', 175, y);
  y += 4;
  doc.setLineWidth(0.2); doc.line(14, y, 196, y); y += 5;
  doc.setFont('helvetica','normal');

  filtered.forEach(m=>{
    if(y > 280){ doc.addPage(); y = 18; }
    doc.text(m.data, 14, y);
    doc.text(String(m.trn||'—').slice(0,40), 42, y);
    doc.text(m.importo ? '€ '+m.importo : '—', 130, y);
    doc.text(m.stato||'—', 155, y);
    doc.text(String(m.note||'').slice(0,18), 175, y);
    y += 6;
  });

  y += 6;
  if(y > 270){ doc.addPage(); y = 18; }
  doc.setLineWidth(0.3); doc.line(14, y, 196, y); y += 8;
  doc.setFont('helvetica','bold'); doc.setFontSize(11);
  doc.text('Riepilogo periodo', 14, y); y += 7;
  doc.setFont('helvetica','normal'); doc.setFontSize(10);
  doc.text(`Versato nel periodo: € ${periodVersato.toLocaleString('it-IT')}`, 14, y); y += 6;
  doc.text(`Totale debito: € ${s.totale.toLocaleString('it-IT')}`, 14, y); y += 6;
  doc.text(`Totale versato ad oggi: € ${s.versato.toLocaleString('it-IT')}`, 14, y); y += 6;
  doc.text(`Residuo da pagare: € ${s.residuo.toLocaleString('it-IT')}`, 14, y); y += 6;
  doc.text(`Rate pagate: ${s.numRatePagate}  ·  Rate rimanenti: ${s.rateRimanenti}`, 14, y); y += 6;
  doc.text(`Percentuale versata: ${Math.round(s.pct)}%`, 14, y);

  doc.save(`ricognizione-debito_${new Date().toISOString().slice(0,10)}.pdf`);
  $('pdf-backdrop').classList.remove('open');
});

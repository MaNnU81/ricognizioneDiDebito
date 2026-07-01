/* ======================================================================
   CONFIGURAZIONE
   ====================================================================== */
const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbymMSfv3ejTrcmluk7u20at8ltGxqjTuQF4f-TYhiqMbJRzOQXClrZ_dDhUz9J5f_HL/exec'
};

let SESSION = null;
let MOVIMENTI = [];
let CFG = {};
let chartRef = null;

const $ = (id) => document.getElementById(id);

function toast(msg){
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=> t.classList.remove('show'), 2400);
}

function eur(n){ return '€ ' + (Number(n)||0).toLocaleString('it-IT'); }

const MESI_IT = ['GEN','FEB','MAR','APR','MAG','GIU','LUG','AGO','SET','OTT','NOV','DIC'];

function fmtMese(yyyymm){
  const p = yyyymm.split('-');
  return MESI_IT[parseInt(p[1],10)-1] + ' ' + p[0];
}

function addMonths(yyyymm, n){
  const p = yyyymm.split('-').map(Number);
  const d = new Date(p[0], p[1]-1+n, 1);
  return MESI_IT[d.getMonth()] + ' ' + d.getFullYear();
}

/* ======================================================================
   SESSIONE
   ====================================================================== */
function loadSession(){
  try{ const r = localStorage.getItem('rd_session'); if(r){ SESSION=JSON.parse(r); return true; } }catch(e){}
  return false;
}
function saveSession(){ localStorage.setItem('rd_session', JSON.stringify(SESSION)); }
function clearSession(){ localStorage.removeItem('rd_session'); SESSION=null; }

/* ======================================================================
   API
   ====================================================================== */
async function apiGet(params){
  const res = await fetch(CONFIG.API_URL + '?' + new URLSearchParams(params).toString());
  return res.json();
}
async function apiPost(body){
  const res = await fetch(CONFIG.API_URL, {
    method:'POST',
    body: JSON.stringify({...body, username:SESSION.username, password:SESSION.password})
  });
  return res.json();
}

/* ======================================================================
   LOGIN
   ====================================================================== */
$('login-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  $('login-error').textContent = '';
  const u = $('login-user').value.trim();
  const p = $('login-pass').value;
  try{
    const r = await apiGet({action:'login', username:u, password:p});
    if(r.ok){
      SESSION = {username:u, password:p, ruolo:r.ruolo};
      saveSession();
      enterApp();
    } else {
      $('login-error').textContent = 'Credenziali non valide.';
    }
  }catch(err){
    $('login-error').textContent = 'Errore di connessione.';
  }
});

$('logout-btn').addEventListener('click', ()=>{
  clearSession();
  $('app').hidden = true;
  $('login-screen').hidden = false;
});

/* ======================================================================
   AVVIO
   ====================================================================== */
async function enterApp(){
  $('login-screen').hidden = true;
  $('app').hidden = false;
  $('who-user').textContent = SESSION.username + ' · ' + (SESSION.ruolo==='write' ? 'scrittura' : 'lettura');
  $('add-btn').hidden = SESSION.ruolo !== 'write';
  const r = await apiGet({action:'getData'});
  if(!r.ok){ toast('Errore caricamento dati'); return; }
  MOVIMENTI = r.movimenti;
  CFG = r.config;
  render();
}

(function init(){ if(loadSession()) enterApp(); })();

/* ======================================================================
   CALCOLI
   ====================================================================== */
function computeStats(){
  const pagati = MOVIMENTI.filter(m=> m.stato==='Pagato' && m.importo);
  const versato = pagati.reduce((s,m)=> s+Number(m.importo), 0);
  const totale = Number(CFG.TotaleDebito)||0;
  const residuo = Math.max(totale-versato, 0);
  const rata = Number(CFG.ImportoMensile)||208;
  const rateRim = rata ? Math.ceil(residuo/rata) : 0;
  const pct = totale ? Math.min(versato/totale*100,100) : 0;
  let projFine = null;
  if(rateRim>0 && pagati.length>0){
    const last = [...pagati].sort((a,b)=>b.data.localeCompare(a.data))[0].data.slice(0,7);
    projFine = addMonths(last, rateRim);
  }
  return {versato, totale, residuo, rateRim, pct, nPagate:pagati.length, projFine};
}

/* ======================================================================
   RENDER
   ====================================================================== */
function render(){
  const s = computeStats();
  $('stat-totale').textContent = eur(s.totale);
  $('stat-versato').textContent = eur(s.versato);
  $('stat-residuo').textContent = eur(s.residuo);
  $('stat-rate').textContent = s.projFine ? s.rateRim+' ('+s.projFine+')' : s.rateRim;
  $('pct-value').textContent = Math.round(s.pct)+'%';
  $('rate-caption').textContent = s.nPagate+' rate pagate';
  const circ = 2*Math.PI*52;
  $('stamp-arc').setAttribute('stroke-dasharray', (circ*s.pct/100)+' '+circ);
  renderTable();
  renderChart();
}

/* ======================================================================
   TABELLA
   ====================================================================== */
function renderTable(){
  const body = $('ledger-body');
  body.innerHTML = '';
  const sorted = [...MOVIMENTI].sort((a,b)=> b.data.localeCompare(a.data));
  $('ledger-empty').hidden = sorted.length>0;

  sorted.forEach(function(m){
    const tr = document.createElement('tr');
    const badge = m.stato==='Pagato' ? 'badge-pagato' : 'badge-saltato';
    const trn = m.trn || '';
    const trnDisplay = trn.length>9 ? trn.slice(0,9)+'…' : (trn||'—');
    const actions = SESSION.ruolo==='write'
      ? '<button class="btn-edit">Modifica</button><button class="btn-del">Elimina</button>'
      : '';
    tr.innerHTML =
      '<td class="mono">'+fmtMese(m.data.slice(0,7))+'</td>'+
      '<td class="mono trn-cell"><span class="trn-short">'+trnDisplay+'</span>'+
        (trn ? '<span class="trn-copy">copia</span>' : '')+
      '</td>'+
      '<td class="mono">'+(m.importo ? eur(m.importo) : '—')+'</td>'+
      '<td><span class="badge '+badge+'">'+(m.stato||'—')+'</span></td>'+
      '<td class="note-cell">'+(m.note||'')+'</td>'+
      '<td class="row-actions">'+actions+'</td>';
    body.appendChild(tr);

    var editBtn = tr.querySelector('.btn-edit');
    var delBtn  = tr.querySelector('.btn-del');
    var copyBtn = tr.querySelector('.trn-copy');
    var rowIndex = m.rowIndex;
    var trnFull  = trn;

    if(editBtn) editBtn.addEventListener('click', function(){ openMovimentoModal(rowIndex); });
    if(delBtn)  delBtn.addEventListener('click',  function(){ deleteMovimento(rowIndex); });
    if(copyBtn) copyBtn.addEventListener('click',  function(){
      try{
        if(navigator.clipboard && window.isSecureContext){
          navigator.clipboard.writeText(trnFull).then(function(){ toast('TRN copiato!'); }).catch(function(){ fallbackCopy(trnFull); });
        } else { fallbackCopy(trnFull); }
      }catch(e){ fallbackCopy(trnFull); }
    });
  });
}

function fallbackCopy(text){
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
  document.body.appendChild(ta);
  ta.focus(); ta.select();
  try{ document.execCommand('copy'); toast('TRN copiato!'); }
  catch(e){ toast('TRN: '+text); }
  document.body.removeChild(ta);
}

/* ======================================================================
   GRAFICO — cumulativo storico + linea debito (versione che funzionava,
   con asse X diradato: solo GEN e GIU di ogni anno)
   ====================================================================== */
function renderChart(){
  var byMonth = {};
  MOVIMENTI.filter(function(m){ return m.stato==='Pagato' && m.importo; }).forEach(function(m){
    var k = m.data.slice(0,7);
    byMonth[k] = (byMonth[k]||0) + Number(m.importo);
  });
  var labels = Object.keys(byMonth).sort();
  if(!labels.length) return;

  var running = 0;
  var cumulative = labels.map(function(l){ return running += byMonth[l]; });
  var totale = Number(CFG.TotaleDebito)||0;

  // asse X: solo 3 etichette — primo mese storico, ultimo pagato, fine proiezione
  var idxLast = labels.length - 1;
  var xLabels = labels.map(function(l, i){
    if(i === 0 || i === idxLast) return fmtMese(l);
    return '';
  });

  if(chartRef) chartRef.destroy();
  chartRef = new Chart($('monthlyChart'), {
    type: 'line',
    data: {
      labels: xLabels,
      datasets: [
        {
          label: 'Versato',
          data: cumulative,
          borderColor: '#B23A2E',
          backgroundColor: 'rgba(178,58,46,.12)',
          fill: true,
          tension: 0.15,
          pointRadius: cumulative.map(function(_,i){ return i===idxLast ? 5 : 0; }),
          pointBackgroundColor: '#B23A2E',
          borderWidth: 2
        },
        {
          label: 'Totale debito',
          data: labels.map(function(){ return totale; }),
          borderColor: 'rgba(27,42,74,0.4)',
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
          borderDash: [4,4]
        }
      ]
    },
    options: {
      interaction: { mode:'index', intersect:false },
      plugins: {
        legend: { display:true, labels:{ font:{family:'Inter',size:11}, boxWidth:14 } },
        tooltip: { callbacks: { label: function(ctx){ return ctx.dataset.label+': '+eur(ctx.parsed.y); } } }
      },
      scales: {
        x: { grid:{display:false}, ticks:{ font:{family:'IBM Plex Mono',size:9}, maxRotation:0, autoSkip:false } },
        y: { grid:{color:'#D8CFC0'}, min:0, ticks:{ callback: function(v){ return '€'+v.toLocaleString('it-IT'); } } }
      }
    }
  });
}

/* ======================================================================
   CRUD
   ====================================================================== */
function openMovimentoModal(rowIndex){
  $('movimento-form').reset();
  $('mov-rowindex').value = '';
  $('movimento-title').textContent = 'Nuovo versamento';
  if(rowIndex){
    var m = MOVIMENTI.find(function(x){ return x.rowIndex===rowIndex; });
    if(m){
      $('movimento-title').textContent = 'Modifica versamento';
      $('mov-rowindex').value = m.rowIndex;
      $('mov-data').value = m.data;
      $('mov-trn').value = m.trn;
      $('mov-importo').value = m.importo||'';
      $('mov-stato').value = m.stato||'Pagato';
      $('mov-note').value = m.note||'';
    }
  } else {
    $('mov-stato').value = 'Pagato';
    $('mov-importo').value = CFG.ImportoMensile||208;
  }
  $('movimento-backdrop').classList.add('open');
}

$('add-btn').addEventListener('click', function(){ openMovimentoModal(null); });
$('movimento-cancel').addEventListener('click', function(){ $('movimento-backdrop').classList.remove('open'); });

$('movimento-form').addEventListener('submit', async function(e){
  e.preventDefault();
  var rowIndex = $('mov-rowindex').value;
  var payload = {
    data: $('mov-data').value,
    trn:  $('mov-trn').value,
    importo: $('mov-importo').value ? Number($('mov-importo').value) : '',
    stato: $('mov-stato').value,
    note:  $('mov-note').value
  };
  var action = rowIndex ? 'updateMovimento' : 'addMovimento';
  if(rowIndex) payload.rowIndex = Number(rowIndex);
  var r = await apiPost({action:action, ...payload});
  if(r.ok){
    toast('Versamento salvato');
    $('movimento-backdrop').classList.remove('open');
    var rd = await apiGet({action:'getData'});
    if(rd.ok){ MOVIMENTI=rd.movimenti; CFG=rd.config; render(); }
  } else { toast('Errore: '+(r.error||'sconosciuto')); }
});

async function deleteMovimento(rowIndex){
  if(!confirm('Eliminare questo versamento?')) return;
  var r = await apiPost({action:'deleteMovimento', rowIndex:rowIndex});
  if(r.ok){
    toast('Eliminato');
    var rd = await apiGet({action:'getData'});
    if(rd.ok){ MOVIMENTI=rd.movimenti; CFG=rd.config; render(); }
  } else { toast('Errore eliminazione'); }
}

/* ======================================================================
   PDF
   ====================================================================== */
$('pdf-btn').addEventListener('click', function(){ $('pdf-backdrop').classList.add('open'); });
$('pdf-cancel').addEventListener('click', function(){ $('pdf-backdrop').classList.remove('open'); });
$('pdf-mode').addEventListener('change', function(e){ $('pdf-range-fields').hidden = e.target.value!=='range'; });

$('pdf-generate').addEventListener('click', function(){
  var mode = $('pdf-mode').value;
  var filtered = MOVIMENTI.slice();
  var label = 'Storico completo';
  if(mode==='range'){
    var from=$('pdf-from').value, to=$('pdf-to').value;
    filtered = filtered.filter(function(m){ return (!from||m.data>=from)&&(!to||m.data<=to); });
    label = 'Periodo: '+(from||'...')+' → '+(to||'...');
  }
  filtered.sort(function(a,b){ return a.data.localeCompare(b.data); });

  var doc = new window.jspdf.jsPDF();
  var s = computeStats();
  var pv = filtered.filter(function(m){ return m.stato==='Pagato'&&m.importo; }).reduce(function(sum,m){ return sum+Number(m.importo); },0);

  doc.setFont('helvetica','bold'); doc.setFontSize(16);
  doc.text('Ricognizione di debito — Report', 14, 18);
  doc.setFont('helvetica','normal'); doc.setFontSize(10);
  doc.text(label, 14, 25);
  doc.text('Generato il '+new Date().toLocaleDateString('it-IT'), 14, 30);

  var y=42;
  doc.setFontSize(9); doc.setFont('helvetica','bold');
  doc.text('Data',14,y); doc.text('TRN',42,y); doc.text('Importo',130,y); doc.text('Stato',155,y); doc.text('Note',175,y);
  y+=4; doc.setLineWidth(0.2); doc.line(14,y,196,y); y+=5;
  doc.setFont('helvetica','normal');
  filtered.forEach(function(m){
    if(y>280){ doc.addPage(); y=18; }
    doc.text(m.data,14,y);
    doc.text(String(m.trn||'—').slice(0,40),42,y);
    doc.text(m.importo?'€ '+m.importo:'—',130,y);
    doc.text(m.stato||'—',155,y);
    doc.text(String(m.note||'').slice(0,18),175,y);
    y+=6;
  });
  y+=6; if(y>270){ doc.addPage(); y=18; }
  doc.setLineWidth(0.3); doc.line(14,y,196,y); y+=8;
  doc.setFont('helvetica','bold'); doc.setFontSize(11);
  doc.text('Riepilogo',14,y); y+=7;
  doc.setFont('helvetica','normal'); doc.setFontSize(10);
  doc.text('Versato nel periodo: '+eur(pv),14,y); y+=6;
  doc.text('Totale debito: '+eur(s.totale),14,y); y+=6;
  doc.text('Totale versato: '+eur(s.versato),14,y); y+=6;
  doc.text('Residuo: '+eur(s.residuo),14,y); y+=6;
  doc.text('Rate pagate: '+s.nPagate+' · Rate rimanenti: '+s.rateRim,14,y); y+=6;
  doc.text('Percentuale: '+Math.round(s.pct)+'%',14,y);
  doc.save('ricognizione-debito_'+new Date().toISOString().slice(0,10)+'.pdf');
  $('pdf-backdrop').classList.remove('open');
});

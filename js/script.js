const ADMIN_PASS = 'luciane123';
const GCAL_URL = '';

let patients = [
  { id:1, nome:'Ana Carolina Silva', email:'ana.carol@email.com', tel:'(34) 99812-3456', modal:'Presencial', status:'agendado', data:'02/06/2026', hora:'09:00', msg:'Ansiedade no trabalho.', calId:null },
  { id:2, nome:'Marcos Pereira Lima', email:'marcos.lima@gmail.com', tel:'(34) 98741-2200', modal:'Online (videochamada)', status:'pendente', data:'10/06/2026', hora:'14:00', msg:'', calId:null },
  { id:3, nome:'Renata Souza', email:'renata.s@hotmail.com', tel:'(34) 99654-0011', modal:'Presencial', status:'pendente', data:'11/06/2026', hora:'10:00', msg:'Autoestima.', calId:null },
  { id:4, nome:'Felipe Andrade', email:'fandrade@empresa.com.br', tel:'(34) 98200-5533', modal:'Online (videochamada)', status:'cancelado', data:'01/06/2026', hora:'19:00', msg:'', calId:null },
];
let nextId = 5;
let activeFilter = 'todos';

// Date picker state
let pickedDate = new Date();
pickedDate.setDate(pickedDate.getDate() + 1);
let pickedSlot = null;

const SLOTS = ['08:00','09:00','10:00','11:00','14:00','15:00','16:00','17:00','19:00','20:00'];
const DAYS_PT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const MONTHS_PT = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

function fmtDate(d) {
  return `${DAYS_PT[d.getDay()]}, ${d.getDate()} ${MONTHS_PT[d.getMonth()]}`;
}
function fmtISO(d) {
  return d.toISOString().slice(0,10);
}
function pad(n){ return String(n).padStart(2,'0'); }

function changeDay(delta) {
  pickedDate.setDate(pickedDate.getDate() + delta);
  const today = new Date(); today.setHours(0,0,0,0);
  if(pickedDate < today) { pickedDate = new Date(today); pickedDate.setDate(today.getDate()+1); }
  pickedSlot = null;
  document.getElementById('btnConfirm').disabled = true;
  renderDatePicker();
}

function renderDatePicker() {
  document.getElementById('dateLabel').textContent = fmtDate(pickedDate);
  // figure out which slots are already taken by patients on this day
  const dateStr = `${pad(pickedDate.getDate())}/${pad(pickedDate.getMonth()+1)}/${pickedDate.getFullYear()}`;
  const taken = patients.filter(p => p.data === dateStr && p.status !== 'cancelado').map(p => p.hora);
  const isWeekend = pickedDate.getDay() === 0 || pickedDate.getDay() === 6;
  if(isWeekend) {
    document.getElementById('slotsArea').innerHTML = '<p class="slots-loading">Sem atendimento aos finais de semana.</p>';
    return;
  }
  const grid = SLOTS.map(s => {
    const isTaken = taken.includes(s);
    const isSel = s === pickedSlot;
    return `<button class="slot-btn${isSel?' selected':''}" ${isTaken?'disabled style="opacity:0.35;cursor:not-allowed;"':''} onclick="selectSlot('${s}')">${s}</button>`;
  }).join('');
  document.getElementById('slotsArea').innerHTML = `<div class="slot-grid">${grid}</div>`;
}

function selectSlot(s) {
  pickedSlot = s;
  document.getElementById('btnConfirm').disabled = false;
  renderDatePicker();
}

function openModal() {
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('formContent').style.display = 'block';
  document.getElementById('successMsg').style.display = 'none';
  pickedDate = new Date(); pickedDate.setDate(pickedDate.getDate()+1);
  pickedSlot = null;
  document.getElementById('btnConfirm').disabled = true;
  renderDatePicker();
}
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  ['f_nome','f_email','f_tel','f_msg'].forEach(id => document.getElementById(id).value='');
  document.getElementById('f_modal').selectedIndex=0;
  pickedSlot=null;
}

async function submitForm() {
  const nome = document.getElementById('f_nome').value.trim();
  const email = document.getElementById('f_email').value.trim();
  const tel = document.getElementById('f_tel').value.trim();
  const modal = document.getElementById('f_modal').value;
  if(!nome||!email||!tel||!modal||!pickedSlot) { alert('Preencha todos os campos e escolha um horário.'); return; }

  const btn = document.getElementById('btnConfirm');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinning">⏳</span> Agendando...';

  const dateStr = `${pad(pickedDate.getDate())}/${pad(pickedDate.getMonth()+1)}/${pickedDate.getFullYear()}`;
  const [hh,mm] = pickedSlot.split(':').map(Number);
  const startDT = new Date(pickedDate); startDT.setHours(hh,mm,0,0);
  const endDT = new Date(startDT); endDT.setMinutes(endDT.getMinutes()+50);

  let calId = null;
  try {
    const res = await callCalendarAPI('create_event', {
      summary: `Consulta – ${nome} (${modal})`,
      description: `Paciente: ${nome}\nE-mail: ${email}\nTelefone: ${tel}\nModalidade: ${modal}`,
      start: { dateTime: startDT.toISOString(), timeZone: 'America/Sao_Paulo' },
      end:   { dateTime: endDT.toISOString(),   timeZone: 'America/Sao_Paulo' },
    });
    calId = res?.id || 'criado';
  } catch(e) { /* continua mesmo sem calendar */ }

  patients.unshift({ id:nextId++, nome, email, tel, modal, status:'agendado', data:dateStr, hora:pickedSlot, msg:document.getElementById('f_msg').value.trim(), calId });
  renderAdmin();

  document.getElementById('formContent').style.display='none';
  document.getElementById('successMsg').style.display='block';
  document.getElementById('successDetail').textContent = `Consulta marcada para ${dateStr} às ${pickedSlot}. Evento adicionado ao Google Calendar da Dra. Luciane.`;
}


const CLIENT_ID = '289288652429-3vplpt2mduqmmgnb3291b3468d5lo4oh.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/calendar.events'; 

let tokenClient;
let gapiInited = false;
let gisiInited = false;
let accessToken = null; // Guardará a permissão temporária da Dra. Luciane

// Inicializa as ferramentas do Google assim que a página carrega
window.onload = function() {
  gapi.load('client', intializeGapiClient);
  initializeGisClient();
};

async function intializeGapiClient() {
  await gapi.client.init({});
  gapiInited = true;
}

function initializeGisClient() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: (tokenResponse) => {
      if (tokenResponse.error !== undefined) {
        throw (tokenResponse);
      }
      accessToken = tokenResponse.access_token;
      
      // Atualiza o visual do botão no painel de controle
      const btn = document.getElementById('btn-gcal-auth');
      if(btn) {
        btn.innerHTML = '<i class="bx bx-check-circle"></i> Agenda Conectada';
        btn.style.background = '#7B9E87';
        btn.style.color = '#fff';
      }
      showToast('✅ Google Calendar conectado com sucesso!');
    },
  });
  gisiInited = true;
}

// Função chamada quando a Dra. clica para conectar a agenda
function handleAuthClick() {
  if (!tokenClient) return;
  
  // Se já tiver token, solicita uma renovação silenciosa ou abre a janela se exppirado
  if (accessToken === null) {
    tokenClient.requestAccessToken({prompt: 'consent'});
  } else {
    tokenClient.requestAccessToken({prompt: ''});
  }
}

// ── Nova Função de Integração Direta com a Google Calendar API ──
async function callCalendarAPI(action, params) {
  // Se a Dra. não realizou o login na sessão, avisa
  if (!accessToken) {
    showToast('⚠️ Agenda desconectada! Faça login no botão superior do painel.');
    throw new Error('Google Calendar não autorizado.');
  }

  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  };

  if (action === 'create_event') {
    const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(params)
    });
    
    if (!response.ok) throw new Error('Erro ao criar evento no Google');
    const data = await response.json();
    return { id: data.id };
  } 
  
  if (action === 'delete_event') {
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${params.eventId}`, {
      method: 'DELETE',
      headers: headers
    });
    
    if (!response.ok && response.status !== 404) throw new Error('Erro ao deletar evento no Google');
    return { id: 'ok' };
  }
}

// Adaptação dos parâmetros para o formato nativo que a API do Google exige
async function createCalendarEvent(p) {
  const [d, mo, y] = p.data.split('/').map(Number);
  const [hh, mm] = p.hora.split(':').map(Number);
  
  // Monta as datas no fuso horário local correto
  const startDT = new Date(y, mo - 1, d, hh, mm, 0);
  const endDT = new Date(startDT); 
  endDT.setMinutes(endDT.getMinutes() + 50); // Consulta de 50 minutos

  return callCalendarAPI('create_event', {
    summary: `Consulta – ${p.nome} (${p.modal})`,
    description: `Paciente: ${p.nome}\nE-mail: ${p.email}\nTelefone: ${p.tel}\nModalidade: ${p.modal}\nNotas: ${p.msg || 'Sem observações'}`,
    start: { dateTime: startDT.toISOString(), timeZone: 'America/Sao_Paulo' },
    end: { dateTime: endDT.toISOString(), timeZone: 'America/Sao_Paulo' }
  });
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 3000);
}

async function changeStatus(id, newStatus, btn) {
  const p = patients.find(x=>x.id===id);
  if(!p) return;
  const old = p.status;
  p.status = newStatus;

  if(newStatus==='agendado' && old!=='agendado') {
    if(btn) { btn.disabled=true; btn.textContent='⏳ Criando evento...'; }
    try {
      const res = await createCalendarEvent(p);
      p.calId = res?.id||'criado';
      showToast('✅ Evento criado no Google Calendar!');
    } catch(e) {
      showToast('⚠️ Erro ao criar evento. Verifique permissões.');
    }
  }
  if(newStatus==='cancelado' && p.calId) {
    try {
      await callCalendarAPI('delete_event',{eventId:p.calId});
      p.calId = null;
      showToast('🗑️ Evento removido do Google Calendar.');
    } catch(e) {}
  }
  renderAdmin();
}

function showAdmin() {
  document.getElementById('confirmAdmin').classList.add('open');
  document.getElementById('adminPass').value='';
  setTimeout(()=>document.getElementById('adminPass').focus(),100);
}
function checkPass() {
  if(document.getElementById('adminPass').value===ADMIN_PASS){
    document.getElementById('confirmAdmin').classList.remove('open');
    document.getElementById('patientView').style.display='none';
    document.getElementById('adminView').style.display='block';
    renderAdmin();
  } else { alert('Senha incorreta.'); }
}
function showPatient() {
  document.getElementById('adminView').style.display='none';
  document.getElementById('patientView').style.display='flex';
}

function renderAdmin() {
  const pending=patients.filter(p=>p.status==='pendente').length;
  const sched=patients.filter(p=>p.status==='agendado').length;
  const canc=patients.filter(p=>p.status==='cancelado').length;
  document.getElementById('statsRow').innerHTML=`
    <div class="stat-card"><p class="stat-label">Pendentes</p><p class="stat-value s-pending">${pending}</p></div>
    <div class="stat-card"><p class="stat-label">Agendados</p><p class="stat-value s-agendado">${sched}</p></div>
    <div class="stat-card"><p class="stat-label">Cancelados</p><p class="stat-value s-cancelado">${canc}</p></div>`;

  const filtered=activeFilter==='todos'?patients:patients.filter(p=>p.status===activeFilter);
  const list=document.getElementById('patientsList');
  if(!filtered.length){
    list.innerHTML='<div class="empty-state"><i class="ti ti-calendar-off" style="font-size:32px;display:block;margin-bottom:8px" aria-hidden="true"></i>Nenhum paciente nesta categoria.</div>';
    return;
  }
  list.innerHTML=filtered.map(p=>{
    const ini=p.nome.split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase();
    const calBtn = p.status==='agendado'
      ? `<button class="btn-cal" disabled title="Já está no Calendar"><i class="ti ti-calendar-check" aria-hidden="true"></i> No Calendar</button>`
      : ``;
    return `<div class="patient-card">
      <div class="patient-avatar">${ini}</div>
      <div class="patient-info">
        <p class="patient-name">${p.nome}</p>
        <p class="patient-meta"><i class="ti ti-mail" style="font-size:12px;vertical-align:-1px" aria-hidden="true"></i> ${p.email} &nbsp;·&nbsp; <i class="ti ti-phone" style="font-size:12px;vertical-align:-1px" aria-hidden="true"></i> ${p.tel}</p>
        <p class="patient-meta"><i class="ti ti-device-desktop" style="font-size:12px;vertical-align:-1px" aria-hidden="true"></i> ${p.modal}</p>
        <p class="patient-date"><i class="ti ti-clock" style="font-size:12px;vertical-align:-1px" aria-hidden="true"></i> ${p.data} às ${p.hora}${p.msg?` &nbsp;·&nbsp; <em>"${p.msg}"</em>`:''}</p>
      </div>
      <div class="patient-actions">
        <select class="status-select" onchange="changeStatus(${p.id}, this.value, this)">
          <option value="pendente" ${p.status==='pendente'?'selected':''}>⏳ Pendente</option>
          <option value="agendado" ${p.status==='agendado'?'selected':''}>✅ Agendado</option>
          <option value="cancelado" ${p.status==='cancelado'?'selected':''}>❌ Cancelado</option>
        </select>
        ${calBtn}
      </div>
    </div>`;
  }).join('');
}

document.getElementById('adminPass').addEventListener('keydown',e=>{ if(e.key==='Enter') checkPass(); });
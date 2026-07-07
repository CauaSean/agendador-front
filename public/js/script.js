const API_BASE_URL = 'https://agendador-back.onrender.com';
const GCAL_URL = '';

let patients = [];
let nextId = 1;
let activeFilter = 'todos';
let gapiInited = false;
let gisiInited = false;

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

function toLocalISOString(d) {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function loadPatients() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/patients`);
    if (!res.ok) throw new Error('Erro na resposta do servidor');
    patients = await res.json();
    
    // Atualiza o sequencial do nextId com base no maior ID existente vindo do banco
    if (patients.length > 0) {
      const maxId = Math.max(...patients.map(p => Number(p.id) || 0));
      if (maxId >= nextId) nextId = maxId + 1;
    }
  } catch(e) {
    console.error('Erro ao carregar pacientes da API. Mantendo cache local.', e);
  }
}

async function changeDay(delta) {
  pickedDate.setDate(pickedDate.getDate() + delta);
  const today = new Date(); today.setHours(0,0,0,0);
  if(pickedDate < today) { 
    pickedDate = new Date(today); 
    pickedDate.setDate(today.getDate()+1); 
  }
  pickedSlot = null;
  document.getElementById('btnConfirm').disabled = true;
  await loadPatients();
  renderDatePicker();
}

function renderDatePicker() {
  document.getElementById('dateLabel').textContent = fmtDate(pickedDate);
  const dateStr = `${pad(pickedDate.getDate())}/${pad(pickedDate.getMonth()+1)}/${pickedDate.getFullYear()}`;
  
  const taken = patients
    .filter(p => p && p.data === dateStr && p.status !== 'cancelado')
    .map(p => p.hora);
    
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

async function openModal() {
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('formContent').style.display = 'block';
  document.getElementById('successMsg').style.display = 'none';
  pickedDate = new Date(); pickedDate.setDate(pickedDate.getDate()+1);
  pickedSlot = null;
  document.getElementById('btnConfirm').disabled = true;
  await loadPatients();
  renderDatePicker();
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  ['f_nome','f_email','f_tel','f_msg'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.value = '';
  });
  const modalSelect = document.getElementById('f_modal');
  if(modalSelect) modalSelect.selectedIndex = 0;
  pickedSlot = null;
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
      start: { dateTime: toLocalISOString(startDT), timeZone: 'America/Sao_Paulo' },
      end:   { dateTime: toLocalISOString(endDT),   timeZone: 'America/Sao_Paulo' },
    });
    calId = res?.id || 'criado';
  } catch(e) { /* continua mesmo sem calendar */ }

  const novoPaciente = {
    id: nextId++,
    nome,
    email,
    tel,
    modal,
    status: 'pendente',
    data: dateStr,
    hora: pickedSlot,
    msg: document.getElementById('f_msg').value.trim(),
    calId
  };

  // Envia ao servidor de forma assíncrona
  try {
    await fetch('/api/patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(novoPaciente)
    });
  } catch(e) {
    console.error('Erro ao registrar no banco, mantendo cópia em memória local.', e);
  }

  // Alimenta a lista local imediatamente para o painel refletir a mudança
  patients.push(novoPaciente);
  renderAdmin();

  document.getElementById('formContent').style.display='none';
  document.getElementById('successMsg').style.display='block';
  document.getElementById('successDetail').textContent = `Consulta marcada para ${dateStr} às ${pickedSlot}. Evento adicionado ao Google Calendar da Dra. Luciane.`;
}

// CONFIGURAÇÕES GOOGLE OAUTH2 & GIS
const CLIENT_ID = '289288652429-3vplpt2mduqmmgnb3291b3468d5lo4oh.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/calendar.events'; 

let codeClient = null; 

function iniciarGoogleIdentityServices() {
    try {
        codeClient = google.accounts.oauth2.initCodeClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            ux_mode: 'popup', // Mudamos de redirect para popup
            callback: (response) => {
                // O Google valida o login e te entrega o código bem aqui
                if (response.code) {
                    console.log("Código de autorização recebido:", response.code);
                    // Dispara a sua função que faz o POST para o Render salvando as credenciais
                    enviarCodigoParaOBackend(response.code); 
                }
            },
            error_callback: (err) => {
                console.error("Erro no fluxo do Google:", err);
            }
        });
        console.log("Google Identity Services inicializado em modo Popup.");
    } catch (e) {
        console.error("Falha ao inicializar o GIS:", e);
    }
}

// Função disparada pelo clique do botão "Conectar Agenda"
function handleConectarGoogle() {
    if (!codeClient) {
        console.error("O codeClient ainda não foi inicializado. Chamando inicialização...");
        iniciarGoogleIdentityServices();
    }
    
    if (codeClient) {
        codeClient.requestCode();
    } else {
        alert("Erro ao carregar o autenticador do Google. Tente novamente em instantes.");
    }
}

// Garante que o cliente seja criado assim que a página carregar
window.onload = function() {
    // Se o script do Google já estiver carregado, inicializa.
    if (typeof google !== 'undefined' && google.accounts) {
        iniciarGoogleIdentityServices();
    }
};

// Garante o carregamento mesmo se os scripts externos demorarem
function initApp() {
  const gapiDisponivel = typeof gapi !== 'undefined' && gapi.load;
  const gisDisponivel = typeof google !== 'undefined' && google.accounts && google.accounts.oauth2;

  if (gapiDisponivel && !gapiInited) {
    gapi.load('client', intializeGapiClient);
  }

  if (gisDisponivel && !gisiInited) {
    initializeGisClient();
  }

  // Se algum ainda não estiver pronto, tenta novamente em breve
  if (!gapiInited || !gisiInited) {
    setTimeout(initApp, 200);
  }
}

// Dispara a inicialização assim que o DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

async function intializeGapiClient() {
  try {
    await gapi.client.init({});
    gapiInited = true;
  } catch (e) {
    console.error('Erro ao inicializar GAPI client:', e);
  }
}

function initializeGisClient() {
  try {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (tokenResponse) => {
        // 1. Em vez de dar throw, tratamos o erro diretamente aqui dentro
        if (tokenResponse.error !== undefined) {
          
          // Se for apenas o usuário fechando a janela, tratamos com suavidade
          if (tokenResponse.type === 'popup_closed') {
            console.warn('O usuário fechou a janela de login antes de concluir.');
            showToast('⚠️ Login cancelado pelo usuário.');
            return; // Para a execução aqui de forma limpa
          }
          
          // Se for qualquer outro erro real da API do Google
          console.error('Erro no retorno do Google Identity:', tokenResponse.error);
          showToast('❌ Falha ao conectar com o Google Calendar.');
          return;
        }

        // 2. Fluxo de sucesso (continua igual ao seu)
        accessToken = tokenResponse.access_token;
        
        // Atualiza visual do botão
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
  } catch (e) {
    // Esse catch só vai pegar erros caso o próprio 'initTokenClient' falhe na inicialização do script
    console.error('Erro ao inicializar GIS client:', e);
  }
}

function handleAuthClick() {
  if (!tokenClient) {
    const gisDisponivel = typeof google !== 'undefined' && google.accounts && google.accounts.oauth2;
    if (gisDisponivel) {
      initializeGisClient();
    } else {
      showToast('⚠️ Os serviços do Google ainda estão carregando. Aguarde 3 segundos e tente novamente.');
      return;
    }
  }
  
  try {
    if (accessToken === null) {
      tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
      tokenClient.requestAccessToken({prompt: ''});
    }
  } catch (err) {
    console.error('Erro ao solicitar Access Token:', err);
    showToast('❌ Falha ao abrir autenticação do Google.');
  }
}

async function callCalendarAPI(action, params) {
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

async function createCalendarEvent(p) {
  const [d, mo, y] = p.data.split('/').map(Number);
  const [hh, mm] = p.hora.split(':').map(Number);
  
  const startDT = new Date(y, mo - 1, d, hh, mm, 0);
  const endDT = new Date(startDT); 
  endDT.setMinutes(endDT.getMinutes() + 50);

  return callCalendarAPI('create_event', {
    summary: `Consulta – ${p.nome} (${p.modal})`,
    description: `Paciente: ${p.nome}\nE-mail: ${p.email}\nTelefone: ${p.tel}\nModalidade: ${p.modal}\nNotas: ${p.msg || 'Sem observações'}`,
    start: { dateTime: toLocalISOString(startDT), timeZone: 'America/Sao_Paulo' },
    end: { dateTime: toLocalISOString(endDT), timeZone: 'America/Sao_Paulo' }
  });
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if(!t) return;
  t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 3000);
}

async function changeStatus(id, newStatus, btn) {
  const p = patients.find(x => x && x.id == id);
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

  try {
    await fetch(`/api/patients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: p.status, calId: p.calId })
    });
  } catch(e) {
    console.error('Erro ao atualizar paciente', e);
  }
  renderAdmin();
}

function showAdmin() {
  document.getElementById('confirmAdmin').classList.add('open');
  document.getElementById('adminPass').value='';
  setTimeout(()=>document.getElementById('adminPass').focus(),100);
}

async function checkPass() {
  const senha = document.getElementById('adminPass').value;
  try {
    const res = await fetch(`${API_BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: senha })
    });
    const data = await res.json();

    if (data.ok) {
      document.getElementById('confirmAdmin').classList.remove('open');
      document.getElementById('patientView').style.display = 'none';
      document.getElementById('adminView').style.display = 'block';
      await loadPatients();
      renderAdmin();
    } else {
      alert('Senha incorreta.');
    }
  } catch (e) {
    alert('Erro ao verificar senha.');
  }
}

function showPatient() {
  document.getElementById('adminView').style.display='none';
  document.getElementById('patientView').style.display='flex';
}

function renderAdmin() {
  if (!Array.isArray(patients)) patients = [];

  const pending=patients.filter(p=>p && p.status==='pendente').length;
  const sched=patients.filter(p=>p && p.status==='agendado').length;
  const canc=patients.filter(p=>p && p.status==='cancelado').length;
  
  const statsRow = document.getElementById('statsRow');
  if(statsRow) {
    statsRow.innerHTML=`
      <div class="stat-card"><p class="stat-label">Pendentes</p><p class="stat-value s-pending">${pending}</p></div>
      <div class="stat-card"><p class="stat-label">Agendados</p><p class="stat-value s-agendado">${sched}</p></div>
      <div class="stat-card"><p class="stat-label">Cancelados</p><p class="stat-value s-cancelado">${canc}</p></div>`;
  }

  const filtered = activeFilter === 'todos' ? patients : patients.filter(p => p && p.status === activeFilter);
  const list = document.getElementById('patientsList');
  if(!list) return;

  if(!filtered.length){
    list.innerHTML='<div class="empty-state"><i class="bx bx-calendar-x" style="font-size:32px;display:block;margin-bottom:8px" aria-hidden="true"></i>Nenhum paciente nesta categoria.</div>';
    return;
  }
  
  list.innerHTML = filtered.map((p, index) => {
    if (!p) return '';
    const seguroId = p.id !== undefined && p.id !== null ? p.id : index;
    const nomePaciente = p.nome || "Paciente Sem Nome";
    const ini = nomePaciente.split(' ').slice(0,2).map(n=>n[0]||'').join('').toUpperCase() || 'P';
    
    const calBtn = p.status==='agendado'
      ? `<button class="btn-cal" disabled title="Já está no Calendar"><i class="bx bx-calendar-check" aria-hidden="true"></i> No Calendar</button>`
      : ``;
      
    return `<div class="patient-card">
      <div class="patient-avatar">${ini}</div>
      <div class="patient-info">
        <p class="patient-name">${nomePaciente}</p>
        <p class="patient-meta"><i class="bx bx-envelope" style="font-size:12px;vertical-align:-1px" aria-hidden="true"></i> ${p.email || ''} &nbsp;·&nbsp; <i class="bx bx-phone" style="font-size:12px;vertical-align:-1px" aria-hidden="true"></i> ${p.tel || ''}</p>
        <p class="patient-meta"><i class="bx bx-desktop" style="font-size:12px;vertical-align:-1px" aria-hidden="true"></i> ${p.modal || ''}</p>
        <p class="patient-date"><i class="bx bx-time" style="font-size:12px;vertical-align:-1px" aria-hidden="true"></i> ${p.data || ''} às ${p.hora || ''}${p.msg?` &nbsp;·&nbsp; <em>"${p.msg}"</em>`:''}</p>
      </div>
      <div class="patient-actions">
        <select class="status-select" onchange="changeStatus(${seguroId}, this.value, this)">
          <option value="pendente" ${p.status==='pendente'?'selected':''}>⏳ Pendente</option>
          <option value="agendado" ${p.status==='agendado'?'selected':''}>✅ Agendado</option>
          <option value="cancelado" ${p.status==='cancelado'?'selected':''}>❌ Cancelado</option>
        </select>
        ${calBtn}
      </div>
    </div>`;
  }).join('');
}

// Função de filtragem chamada pelos botões do menu admin
function filterList(filter, btn) {
  activeFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderAdmin();
}

document.getElementById('adminPass').addEventListener('keydown',e=>{ if(e.key==='Enter') checkPass(); });
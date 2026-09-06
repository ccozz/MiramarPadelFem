const sb = window.supabase.createClient('https://scdgdfxkvkgqueeozznd.supabase.co', 'sb_publishable_UgQh8Fq2C-ydgDCPSbii6A_J5Eqoia1');
const app = document.querySelector('#admin-app');
let active = 'tournaments';
let editingTournament = null;
let editingPair = null;
let pairsCache = [];
let selectedResultsCategoryId = '';
let editingMatchId = '';

const themeToggle = document.querySelector('#admin-theme-toggle');
const resultConfirmDialog = document.querySelector('#result-confirm-dialog');
const resultConfirmDetails = document.querySelector('#result-confirm-details');
let pendingMatchResult = null;
const setTheme = theme => { document.documentElement.dataset.theme = theme; themeToggle?.setAttribute('aria-pressed', String(theme === 'dark')); themeToggle?.setAttribute('aria-label', theme === 'dark' ? 'Modo oscuro activo. Cambiar a modo claro' : 'Modo claro activo. Cambiar a modo oscuro'); };
setTheme(localStorage.getItem('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
themeToggle?.addEventListener('click', () => { const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; localStorage.setItem('theme', theme); setTheme(theme); });

const esc = (value = '') => String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char]));
const signed = value => value > 0 ? `+${value}` : String(value);
const numeric = value => /^[0-9]+$/.test(String(value));
const scoreOptions = selected => `<option value=""></option>${Array.from({ length: 51 }, (_, value) => `<option value="${value}" ${String(selected) === String(value) ? 'selected' : ''}>${value}</option>`).join('')}`;
const scoreSets = score => String(score || '').split(',').map(part => part.trim().match(/^(\d+)\s*-\s*(\d+)$/)).filter(Boolean).map(values => [Number(values[1]), Number(values[2])]);
const validSet = (first, second) => (first === 6 && second >= 0 && second <= 4) || (second === 6 && first >= 0 && first <= 4) || (first === 7 && (second === 5 || second === 6)) || (second === 7 && (first === 5 || first === 6));
const scoreInputs = (score = '') => {
  const sets = scoreSets(score);
  return [0, 1, 2].map(index => ({ first: sets[index]?.[0] ?? '', second: sets[index]?.[1] ?? '' }));
};
const setFields = (score = '') => scoreInputs(score).map((set, index) => `<fieldset class="set-score"><legend>Set ${index + 1}${index === 2 ? ' (opcional)' : ''}</legend><label><span class="sr-only">Pareja 1</span><select name="s${index + 1}p1" aria-label="Set ${index + 1}, pareja 1">${scoreOptions(set.first)}</select></label><span aria-hidden="true">-</span><label><span class="sr-only">Pareja 2</span><select name="s${index + 1}p2" aria-label="Set ${index + 1}, pareja 2">${scoreOptions(set.second)}</select></label></fieldset>`).join('');
const readMatchScore = data => {
  const sets = [1, 2, 3].map(index => [String(data.get(`s${index}p1`) || '').trim(), String(data.get(`s${index}p2`) || '').trim()]);
  if (sets.slice(0, 2).some(([first, second]) => !first || !second)) return { error: 'Completá los dos primeros sets.' };
  if (sets[2].some(value => value) && sets[2].some(value => !value)) return { error: 'Completá ambos marcadores del tercer set.' };
  const parsed = sets.filter(([first, second]) => first && second).map(([first, second]) => [Number(first), Number(second)]);
  if (parsed.some(([first, second]) => !Number.isInteger(first) || !Number.isInteger(second) || first < 0 || second < 0 || first > 7 || second > 7 || !validSet(first, second))) return { error: 'Cada set debe ser 6-0 a 6-4, 7-5 o 7-6.' };
  const wins = parsed.reduce((total, [first, second]) => total + (first > second ? 1 : 0), 0);
  const losses = parsed.length - wins;
  if (parsed.length === 3 && wins !== 2 && losses !== 2) return { error: 'El tercer set solo se usa cuando hay un set ganado por lado.' };
  if (parsed.length === 2 && wins !== 2 && losses !== 2) return { error: 'Si quedan 1 a 1 en sets, cargá el tercer set.' };
  return { score: parsed.map(([first, second]) => `${first}-${second}`).join(', '), winnerIndex: wins === 2 ? 1 : 2 };
};

document.addEventListener('invalid', event => {
  const form = event.target.closest('form');
  const message = form?.querySelector('.form-message');
  if (message) message.textContent = event.target.validationMessage || 'Revisá los campos obligatorios.';
}, true);

async function auth() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    app.innerHTML = `<section class="admin-card login-card"><p class="kicker">ACCESO ADMIN</p><h1>Ingresar</h1><form id="login"><label>Email<input name="email" type="email" autocomplete="email" required></label><label>Contraseña<input name="password" type="password" autocomplete="current-password" required></label><button class="button button--primary">Ingresar</button><p class="form-message"></p></form></section>`;
    return false;
  }
  const { data } = await sb.from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
  if (!data) { app.innerHTML = '<section class="admin-card"><h1>Sin permisos</h1><p>Esta cuenta no tiene acceso de administración.</p></section>'; return false; }
  return true;
}

function tournamentForm(t = editingTournament) {
  const isEdit = Boolean(t);
  const open = isEdit ? '' : '<details class="admin-collapsible"><summary>Crear torneo</summary>';
  const close = isEdit ? '' : '</details>';
  const schedule = Object.fromEntries((t?.tournament_phase_dates || []).map(phase => [phase.stage, phase]));
  const phaseFields = [['group','Grupos'],['round_of_16','Octavos'],['quarter_final','Cuartos'],['semi_final','Semifinales'],['final','Final']].map(([stage,label]) => `<fieldset class="phase-dates"><legend>${label}</legend><label>Desde<input type="date" name="${stage}Start" value="${esc(schedule[stage]?.start_date)}"></label><label>Hasta<input type="date" name="${stage}End" value="${esc(schedule[stage]?.end_date)}"></label></fieldset>`).join('');
  return `<section class="admin-card"><p class="kicker">TORNEOS</p>${isEdit ? '<h1>Modificar torneo</h1>' : open}<form id="tournament-form" class="admin-grid">
    <label>Nombre<input name="title" value="${esc(t?.title)}" required></label><label>Sede<input name="location" value="${esc(t?.location)}" required></label>
    <label>Inicio<input type="date" name="startDate" value="${esc(t?.start_date)}" required></label><label>Cierre<input type="date" name="endDate" value="${esc(t?.end_date)}" required></label>
    <label class="wide">Cierre de inscripciones<input type="date" name="registrationCloseDate" value="${esc(t?.registration_close_date)}"><small>Luego de esta fecha no se aceptan nuevas parejas.</small></label>
    <label>Precio por persona<input type="number" name="price" min="0" step="1" value="${t?.registration_price ?? ''}"></label><label>WhatsApp<input name="whatsapp" type="tel" inputmode="numeric" pattern="[0-9]+" value="${esc(t?.whatsapp_number)}" required></label>
    <label>Estado<select name="status">${['draft','open','in_progress','finished'].map(s => `<option value="${s}" ${t?.status === s || (!t && s === 'open') ? 'selected':''}>${({draft:'Borrador',open:'Inscripción abierta',in_progress:'En juego',finished:'Finalizado'})[s]}</option>`).join('')}</select></label>
    <label class="wide">Categoría <small>Cada categoría corresponde a un torneo independiente.</small><input name="category" value="${esc(t?.tournament_categories?.[0]?.name)}" required></label>
    <div class="wide phase-date-grid"><h2>Fechas por fase</h2>${phaseFields}</div>
    <label class="wide">Descripción<textarea name="description">${esc(t?.description)}</textarea></label><div class="admin-actions"><button class="button button--primary">${isEdit ? 'Guardar cambios':'Guardar torneo'}</button>${isEdit ? '<button type="button" id="cancel-tournament" class="button button--outline">Cancelar</button>':''}</div><p class="form-message"></p>
  </form>${close}</section>`;
}

async function renderTournaments() {
  const { data, error } = await sb.from('tournaments').select('id,title,start_date,end_date,registration_close_date,location,registration_price,whatsapp_number,status,description,tournament_categories(id,name),tournament_phase_dates(stage,start_date,end_date)').order('start_date');
  app.innerHTML = tournamentForm() + `<section class="admin-card"><h2>Torneos existentes</h2><div id="tournament-admin-list">${error ? '<p>No se pudieron cargar los torneos.</p>' : (data || []).map(t => `<article class="admin-row"><div><b>${esc(t.title)}</b><span>${esc(t.start_date)} · ${(t.tournament_categories || []).map(c => esc(c.name)).join(', ') || 'sin categorías'}</span></div><div><button data-edit-tournament="${t.id}">Editar</button><button data-delete-tournament="${t.id}">Eliminar</button></div></article>`).join('') || '<p>Sin torneos todavía.</p>'}</div></section>`;
  window.tournamentsCache = data || [];
}

function pairForm(categories) {
  const p = editingPair;
  const privateData = p?.pair_private_data;
  const d = Array.isArray(privateData) ? privateData[0] || {} : privateData || {};
  const catOptions = categories.map(c => `<option value="${c.id}" ${p?.category_id === c.id ? 'selected':''}>${esc(c.tournaments?.title || 'Torneo')} · ${esc(c.name)}</option>`).join('');
  const open = p ? '' : '<details class="admin-collapsible"><summary>Agregar pareja</summary>';
  const close = p ? '' : '</details>';
  return `<section class="admin-card"><p class="kicker">PAREJAS</p>${p ? '<h1>Modificar pareja</h1>' : open}<form id="pair-form" class="admin-grid">
    <label class="wide">Torneo y categoría<select name="categoryId" required><option value="">Elegir categoría</option>${catOptions}</select></label>
    <h2 class="wide">Jugadora 1</h2><label>Nombre<input name="p1first" value="${esc(d.player_one_first_name)}" required></label><label>Apellido<input name="p1last" value="${esc(d.player_one_last_name)}" required></label><label>Alias<input name="p1alias" value="${esc(p?.player_one_alias)}" required></label><label>DNI<input name="p1dni" type="number" inputmode="numeric" pattern="[0-9]+" value="${esc(d.player_one_dni)}" required></label><label class="wide">Categoría declarada<input name="p1category" value="${esc(d.player_one_category)}" required></label>
    <h2 class="wide">Jugadora 2</h2><label>Nombre<input name="p2first" value="${esc(d.player_two_first_name)}" required></label><label>Apellido<input name="p2last" value="${esc(d.player_two_last_name)}" required></label><label>Alias<input name="p2alias" value="${esc(p?.player_two_alias)}" required></label><label>DNI<input name="p2dni" type="number" inputmode="numeric" pattern="[0-9]+" value="${esc(d.player_two_dni)}" required></label><label class="wide">Categoría declarada<input name="p2category" value="${esc(d.player_two_category)}" required></label>
    <label>Teléfono de contacto<input name="phone" type="tel" inputmode="numeric" pattern="[0-9]+" value="${esc(d.contact_phone)}" required></label><label>Estado<select name="status">${['pending','confirmed','cancelled'].map(s => `<option value="${s}" ${p?.status === s || (!p && s === 'pending') ? 'selected':''}>${({pending:'Pendiente',confirmed:'Confirmada',cancelled:'Cancelada'})[s]}</option>`).join('')}</select></label>
    <div class="admin-actions wide"><button class="button button--primary">${p ? 'Guardar cambios':'Agregar pareja'}</button>${p ? '<button type="button" id="cancel-pair" class="button button--outline">Cancelar</button>':''}</div><p class="form-message wide"></p>
  </form>${close}</section>`;
}

async function renderPairs() {
  const [{ data: categories }, { data: pairs, error }] = await Promise.all([
    sb.from('tournament_categories').select('id,name,tournaments(title)').order('name'),
    sb.from('pairs').select('id,category_id,player_one_alias,player_two_alias,status,pair_private_data(*),tournament_categories(name,tournaments(title))').order('created_at', { ascending:false })
  ]);
  pairsCache = pairs || [];
  app.innerHTML = pairForm(categories || []) + `<section class="admin-card"><h2>Parejas cargadas</h2><div>${error ? '<p>No se pudieron cargar las parejas.</p>' : pairsCache.map(p => `<article class="admin-row"><div><b>${esc(p.player_one_alias)} / ${esc(p.player_two_alias)}</b><span>${esc(p.tournament_categories?.tournaments?.title || '')} · ${esc(p.tournament_categories?.name || '')} · ${esc(p.status)}</span></div><div>${p.status === 'pending' ? `<button data-pair-status="confirmed" data-pair-id="${p.id}">Confirmar</button><button data-pair-status="cancelled" data-pair-id="${p.id}">Rechazar</button>` : ''}<button data-edit-pair="${p.id}">Editar</button><button data-delete-pair="${p.id}">Eliminar</button></div></article>`).join('') || '<p>Sin parejas cargadas.</p>'}</div></section>`;
}

const pairLabel = pair => `${pair.player_one_alias} / ${pair.player_two_alias}`;
const playoffStages = ['round_of_16', 'quarter_final', 'semi_final', 'final'];
const createPlayoffs = async (categoryId, pairs, groupMatches) => {
  const standings = window.PadelTournament.buildStandings(pairs, groupMatches);
  const plan = window.PadelTournament.buildPlayoffPlan(standings);
  if (!plan) return { error: 'Se necesitan al menos dos parejas para generar playoffs.' };
  const { error: clearError } = await sb.from('matches').delete().eq('category_id', categoryId).neq('stage', 'group');
  if (clearError) return { error: 'No se pudo limpiar el playoff anterior.' };
  const { data: preliminary, error: preliminaryError } = plan.preliminary.length ? await sb.from('matches').insert(plan.preliminary.map((match, index) => ({ category_id: categoryId, stage: 'round_of_16', bracket_position: index + 1, pair_one_id: match.pairOneId, pair_two_id: match.pairTwoId }))).select('id,bracket_position') : { data: [], error: null };
  if (preliminaryError) return { error: 'No se pudo crear la ronda previa.' };
  const preliminaryId = index => preliminary.find(match => match.bracket_position === index + 1)?.id || null;
  const createRound = async (stage, slots) => {
    const { data, error } = await sb.from('matches').insert(slots.map((slot, index) => ({ category_id: categoryId, stage, bracket_position: index + 1, pair_one_id: slot[0].pairId || null, pair_two_id: slot[1].pairId || null, source_pair_one_match_id: slot[0].sourceId || null, source_pair_two_match_id: slot[1].sourceId || null }))).select('id,bracket_position');
    return { data: data || [], error };
  };
  const firstSlots = Array.from({ length: plan.mainSize / 2 }, (_, index) => plan.seedSlots.slice(index * 2, index * 2 + 2).map(slot => ({ pairId: slot.pairId, sourceId: slot.sourcePreliminaryIndex === null ? null : preliminaryId(slot.sourcePreliminaryIndex) })));
  let stage = plan.firstStage;
  let round = await createRound(stage, firstSlots);
  if (round.error) return { error: 'No se pudo crear la primera ronda de playoffs.' };
  let previous = round.data;
  while (previous.length > 1) {
    stage = window.PadelTournament.playoffStage(previous.length / 2);
    const slots = Array.from({ length: previous.length / 2 }, (_, index) => [{ sourceId: previous[index * 2].id }, { sourceId: previous[index * 2 + 1].id }]);
    round = await createRound(stage, slots);
    if (round.error) return { error: 'No se pudo crear una ronda de playoffs.' };
    previous = round.data;
  }
  return { error: null };
};
const advancePlayoffWinner = async (matchId, winnerId) => {
  const { data: targets, error } = await sb.from('matches').select('id,source_pair_one_match_id,source_pair_two_match_id').or(`source_pair_one_match_id.eq.${matchId},source_pair_two_match_id.eq.${matchId}`);
  if (error) return error;
  return Promise.all((targets || []).map(target => sb.from('matches').update(target.source_pair_one_match_id === matchId ? { pair_one_id: winnerId } : { pair_two_id: winnerId }).eq('id', target.id)));
};

async function renderResults() {
  const { data: categories, error: categoryError } = await sb.from('tournament_categories').select('id,name,tournaments(id,title,status)').order('name');
  if (categoryError || !categories?.length) {
    app.innerHTML = '<section class="admin-card"><h1>Resultados</h1><p>Primero creá un torneo y una categoría.</p></section>';
    return;
  }
  if (!categories.some(category => category.id === selectedResultsCategoryId)) selectedResultsCategoryId = categories[0].id;
  const category = categories.find(item => item.id === selectedResultsCategoryId);
  const [{ data: pairs }, { data: groups }, { data: matches }, { data: playoffMatches }] = await Promise.all([
    sb.from('pairs').select('id,category_id,player_one_alias,player_two_alias,status,group_name').eq('category_id', category.id).eq('status', 'confirmed').order('created_at'),
    sb.from('groups').select('id,name').eq('category_id', category.id).order('name'),
    sb.from('matches').select('id,group_id,pair_one_id,pair_two_id,score,winner_pair_id,played_at').eq('category_id', category.id).eq('stage', 'group').order('played_at'),
    sb.from('matches').select('id,stage,bracket_position,pair_one_id,pair_two_id,score,winner_pair_id,source_pair_one_match_id,source_pair_two_match_id').eq('category_id', category.id).neq('stage', 'group').order('bracket_position')
  ]);
  const pairMap = new Map((pairs || []).map(pair => [pair.id, pair]));
  const matchForm = (match, finished = false, showHeader = true) => `<form class="admin-grid match-result-form" data-match-id="${match.id}" data-pair-one-id="${match.pair_one_id}" data-pair-two-id="${match.pair_two_id}" data-pair-one-label="${esc(pairLabel(pairMap.get(match.pair_one_id) || {}))}" data-pair-two-label="${esc(pairLabel(pairMap.get(match.pair_two_id) || {}))}">
    ${showHeader ? `<p class="wide"><b>${esc(pairLabel(pairMap.get(match.pair_one_id) || {}))}</b> vs <b>${esc(pairLabel(pairMap.get(match.pair_two_id) || {}))}</b>${finished ? ' · <span class="match-finished">Terminado</span>' : ''}</p>` : ''}
    <div class="set-scores wide">${setFields(match.score)}</div>
    <button class="button button--primary" type="submit">${finished ? 'Editar resultado' : 'Guardar resultado'}</button></form>`;
  const finishedCard = match => {
    const pairOneWon = match.winner_pair_id === match.pair_one_id;
    const winner = pairMap.get(pairOneWon ? match.pair_one_id : match.pair_two_id) || {};
    const loser = pairMap.get(pairOneWon ? match.pair_two_id : match.pair_one_id) || {};
    const sets = String(match.score || '').split(',').map(set => set.trim()).filter(Boolean).map(set => {
      const values = set.match(/^(\d+)\s*-\s*(\d+)$/); if (!values) return `<span class="match-set">${esc(set)}</span>`;
      const first = Number(values[1]); const second = Number(values[2]); const display = pairOneWon ? `${first}-${second}` : `${second}-${first}`;
      return `<span class="match-set ${Number(display.split('-')[0]) > Number(display.split('-')[1]) ? 'match-set--won' : 'match-set--lost'}">${esc(display)}</span>`;
    }).join('<i aria-hidden="true">|</i>');
    return `<article class="completed-match"><p class="match-results__teams">${esc(pairLabel(winner))} <b>a</b> ${esc(pairLabel(loser))}</p><div class="completed-match__actions"><strong class="match-results__sets">${sets}</strong><button class="button button--outline" type="button" data-edit-match="${match.id}">Editar</button></div></article>`;
  };
  const groupsHtml = (groups || []).map(group => {
    const groupPairs = (pairs || []).filter(pair => pair.group_name === group.name);
    const groupMatches = (matches || []).filter(match => match.group_id === group.id);
    const rows = window.PadelTournament.buildStandings(groupPairs, groupMatches);
    const pendingForms = groupMatches.filter(match => !match.winner_pair_id).map(match => matchForm(match)).join('') || '<p>No hay partidos pendientes.</p>';
    const finishedMatches = groupMatches.filter(match => match.winner_pair_id);
    const finishedForms = finishedMatches.length ? `<details class="completed-matches"><summary>Terminados (${finishedMatches.length})</summary>${finishedMatches.map(match => match.id === editingMatchId ? matchForm(match, true) : finishedCard(match)).join('')}</details>` : '';
    const tableRows = rows.map((row, index) => `<tr><td>${index + 1}</td><td>${esc(row.label)}</td><td>${row.played}</td><td>${row.won}</td><td>${row.lost}</td><td>${signed(row.setsWon - row.setsLost)}</td><td>${signed(row.gamesWon - row.gamesLost)}</td><td>${row.points}</td></tr>`).join('');
    return `<details class="admin-card results-group"><summary>${esc(group.name)}</summary><div class="results-group__content"><p>${groupPairs.length} parejas · victoria 2 puntos, derrota con partido jugado 1 punto. Empate de 2: partido entre sí. Empate múltiple o sin cruce: DS y DG; persistente: organización.</p><div class="table-wrap"><table><thead><tr><th>#</th><th>Pareja</th><th>PJ</th><th>G</th><th>P</th><th>DS</th><th>DG</th><th>Pts</th></tr></thead><tbody>${tableRows}</tbody></table></div><h3>Partidos pendientes</h3>${pendingForms}${finishedForms}</div></details>`;
  }).join('');
  const playoffHtml = playoffStages.map(stage => {
    const stageMatches = (playoffMatches || []).filter(match => match.stage === stage);
    if (!stageMatches.length) return '';
    const roundName = window.PadelTournament.playoffStageLabel(stage);
    const sourceLabel = sourceId => { const source = (playoffMatches || []).find(match => match.id === sourceId); const shortName = { round_of_16: 'Octavos', quarter_final: 'Cuartos', semi_final: 'Semis', final: 'Final' }[source?.stage]; return source ? `${shortName} ${source.bracket_position}` : 'Pendiente'; };
    const entrant = (pairId, sourceId) => pairId ? pairLabel(pairMap.get(pairId) || {}) : sourceId ? sourceLabel(sourceId) : 'Pendiente';
    const finishedPlayoffCard = match => {
      const pairOneWon = match.winner_pair_id === match.pair_one_id;
      const winner = pairMap.get(pairOneWon ? match.pair_one_id : match.pair_two_id) || {};
      const loser = pairMap.get(pairOneWon ? match.pair_two_id : match.pair_one_id) || {};
      const sets = String(match.score || '').split(',').map(set => set.trim()).filter(Boolean).map(set => {
        const values = set.match(/^(\d+)\s*-\s*(\d+)$/); if (!values) return `<span class="match-set">${esc(set)}</span>`;
        const first = Number(values[1]); const second = Number(values[2]); const display = pairOneWon ? `${first}-${second}` : `${second}-${first}`;
        return `<span class="match-set ${Number(display.split('-')[0]) > Number(display.split('-')[1]) ? 'match-set--won' : 'match-set--lost'}">${esc(display)}</span>`;
      }).join('<i aria-hidden="true">|</i>');
      return `<article class="playoff-match playoff-match--finished"><small>${roundName} ${match.bracket_position}</small><div class="playoff-finished-row"><p class="playoff-match__teams">${esc(pairLabel(winner))} <b>vs</b> ${esc(pairLabel(loser))}</p><strong class="match-results__sets">${sets}</strong><button class="button button--outline" type="button" data-edit-match="${match.id}">Editar</button></div></article>`;
    };
    const cards = stageMatches.map(match => match.winner_pair_id ? finishedPlayoffCard(match) : `<article class="playoff-match"><small>${roundName} ${match.bracket_position}</small><p class="playoff-match__teams">${esc(entrant(match.pair_one_id, match.source_pair_one_match_id))} <b>vs</b> ${esc(entrant(match.pair_two_id, match.source_pair_two_match_id))}</p>${match.pair_one_id && match.pair_two_id ? matchForm(match, false, false) : '<em>Pendiente</em>'}</article>`).join('');
    return `<section class="playoff-round"><h3>${roundName}</h3>${cards}</section>`;
  }).join('');
  const fixtureReady = Boolean(groups?.length);
  const finalMatch = (playoffMatches || []).find(match => match.stage === 'final' && match.winner_pair_id);
  const finishAction = finalMatch && category.tournaments?.status !== 'finished' ? `<form id="finish-tournament-form"><input type="hidden" name="tournamentId" value="${category.tournaments?.id}"><button class="button button--primary" type="submit">Terminar torneo</button><p class="form-message" aria-live="polite"></p></form>` : '';
  app.innerHTML = `<details class="admin-card admin-results-panel"><summary>${esc(category.tournaments?.title || 'Torneo')} · ${esc(category.name)}</summary><div class="admin-results-panel__content">
    <form id="results-category-form"><label>Torneo y categoría<select name="categoryId">${categories.map(item => `<option value="${item.id}" ${item.id === category.id ? 'selected' : ''}>${esc(item.tournaments?.title || 'Torneo')} · ${esc(item.name)}</option>`).join('')}</select></label><div class="results-primary-actions"><button class="button button--outline" type="submit">Editar</button><button class="button button--primary" type="submit" form="fixture-form">Regenerar</button></div></form>
    <form id="fixture-form" class="admin-grid"><input type="hidden" name="categoryId" value="${category.id}"><input type="hidden" name="groupCount" value="${Math.max(1, Math.ceil((pairs || []).length / 4))}"><p class="form-message wide" aria-live="polite">${pairs?.length < 2 ? 'Confirmá al menos dos parejas antes de generar el fixture.' : ''}</p></form>${groupsHtml || '<p>Sin fixture todavía.</p>'}<details class="admin-card playoff-panel"><summary>Playoffs</summary><div class="playoff-panel__content"><form id="playoff-form"><input type="hidden" name="categoryId" value="${category.id}"><button class="button button--primary" type="submit">Generar playoffs</button><p class="form-message" aria-live="polite"></p></form>${playoffHtml || '<p>Completá los partidos de grupos para generar la llave.</p>'}${finishAction}</div></details></div></details>`;
}
function renderSettings() { app.innerHTML = '<section class="admin-card"><p class="kicker">CONFIGURACIÓN</p><h1>Cuenta administradora</h1><p>La sesión actual está protegida por Supabase Auth.</p></section>'; }
async function render() { if (!await auth()) return; await ({ tournaments:renderTournaments, pairs:renderPairs, results:renderResults, settings:renderSettings })[active](); }

function invalidNumbers(d) { return ['p1dni','p2dni','phone','whatsapp'].filter(k => k in d && !numeric(d[k])); }
document.addEventListener('click', async event => {
  const confirmResult = event.target.closest('[data-confirm-result]');
  if (confirmResult && pendingMatchResult) {
    confirmResult.disabled = true;
    const { error } = await sb.from('matches').update({ score: pendingMatchResult.score, winner_pair_id: pendingMatchResult.winnerId, played_at: new Date().toISOString() }).eq('id', pendingMatchResult.matchId);
    confirmResult.disabled = false;
    if (error) { alert('No se pudo guardar el resultado.'); return; }
    await advancePlayoffWinner(pendingMatchResult.matchId, pendingMatchResult.winnerId);
    pendingMatchResult = null; editingMatchId = ''; resultConfirmDialog?.close(); await renderResults(); return;
  }
  const editMatch = event.target.closest('[data-edit-match]');
  if (editMatch) { editingMatchId = editMatch.dataset.editMatch; await renderResults(); return; }
  const tab = event.target.closest('[data-tab]');
  if (tab) { active = tab.dataset.tab; editingTournament = null; editingPair = null; document.querySelectorAll('.admin-tab').forEach(x => x.classList.toggle('active', x === tab)); await render(); return; }
  if (event.target.id === 'signout') { await sb.auth.signOut(); await render(); return; }
  if (event.target.id === 'cancel-tournament') { editingTournament = null; await renderTournaments(); return; }
  if (event.target.id === 'cancel-pair') { editingPair = null; await renderPairs(); return; }
  const te = event.target.closest('[data-edit-tournament]'); if (te) { editingTournament = window.tournamentsCache.find(t => t.id === te.dataset.editTournament) || null; await renderTournaments(); return; }
  const pe = event.target.closest('[data-edit-pair]'); if (pe) { editingPair = pairsCache.find(p => p.id === pe.dataset.editPair) || null; await renderPairs(); return; }
  const statusButton = event.target.closest('[data-pair-status]'); if (statusButton) { await sb.from('pairs').update({ status: statusButton.dataset.pairStatus }).eq('id', statusButton.dataset.pairId); await renderPairs(); return; }
  const td = event.target.closest('[data-delete-tournament]'); if (td && confirm('¿Eliminar este torneo? También elimina sus categorías y parejas.')) { await sb.from('tournaments').delete().eq('id', td.dataset.deleteTournament); await renderTournaments(); return; }
  const pd = event.target.closest('[data-delete-pair]'); if (pd && confirm('¿Eliminar esta pareja?')) { await sb.from('pairs').delete().eq('id', pd.dataset.deletePair); await renderPairs(); }
});

document.addEventListener('submit', async event => {
  if (event.target.id === 'results-category-form') { event.preventDefault(); selectedResultsCategoryId = new FormData(event.target).get('categoryId'); await renderResults(); return; }
  if (event.target.id === 'finish-tournament-form') {
    event.preventDefault(); const form = event.target; const message = form.querySelector('.form-message'); const tournamentId = new FormData(form).get('tournamentId');
    if (!confirm('¿Terminás el torneo? Se cerrarán las inscripciones y se publicarán campeonas y subcampeonas.')) return;
    const { error } = await sb.from('tournaments').update({ status: 'finished' }).eq('id', tournamentId);
    if (error) { message.textContent = 'No se pudo terminar el torneo.'; return; }
    await renderResults(); return;
  }
  if (event.target.id === 'playoff-form') {
    event.preventDefault(); const form = event.target; const categoryId = new FormData(form).get('categoryId'); const message = form.querySelector('.form-message');
    const [{ data: pairs }, { data: groupMatches }] = await Promise.all([
      sb.from('pairs').select('id,category_id,player_one_alias,player_two_alias,status').eq('category_id', categoryId).eq('status', 'confirmed').order('created_at'),
      sb.from('matches').select('id,pair_one_id,pair_two_id,score,winner_pair_id').eq('category_id', categoryId).eq('stage', 'group')
    ]);
    if (!pairs?.length || !groupMatches?.length || groupMatches.some(match => !match.winner_pair_id)) { message.textContent = 'Completá todos los partidos de grupos antes de generar playoffs.'; return; }
    if (!confirm('Se generará una llave de eliminación directa según la tabla actual. Si ya existe una llave, será reemplazada. ¿Continuar?')) return;
    const result = await createPlayoffs(categoryId, pairs, groupMatches);
    if (result.error) { message.textContent = result.error; return; }
    await renderResults(); return;
  }
  if (event.target.id === 'fixture-form') {
    event.preventDefault(); const form = event.target; const categoryId = new FormData(form).get('categoryId'); const groupCount = new FormData(form).get('groupCount'); const message = form.querySelector('.form-message');
    const { data: pairs, error } = await sb.from('pairs').select('id,category_id,player_one_alias,player_two_alias,status').eq('category_id', categoryId).eq('status', 'confirmed').order('created_at');
    if (error || pairs.length < 2) { message.textContent = 'Necesitás al menos dos parejas confirmadas.'; return; }
    if (!confirm('Vas a regenerar grupos y fixture de esta categoría. Se eliminarán únicamente sus grupos y partidos actuales; las parejas inscriptas se conservan. Esta acción no se puede deshacer. ¿Continuar?')) return;
    const groups = window.PadelTournament.createGroups(pairs, groupCount);
    const clearMatches = await sb.from('matches').delete().eq('category_id', categoryId);
    const clearGroups = await sb.from('groups').delete().eq('category_id', categoryId);
    if (clearMatches.error || clearGroups.error) { message.textContent = 'No se pudo limpiar el fixture anterior.'; return; }
    const { data: createdGroups, error: groupError } = await sb.from('groups').insert(groups.map(group => ({ category_id: categoryId, name: group.name }))).select('id,name');
    if (groupError || !createdGroups) { message.textContent = 'No se pudieron crear los grupos.'; return; }
    const updates = groups.flatMap(group => group.pairs.map(pair => sb.from('pairs').update({ group_name: group.name }).eq('id', pair.id)));
    const fixtures = groups.flatMap(group => window.PadelTournament.createRoundRobin(createdGroups.find(item => item.name === group.name).id, group.pairs));
    const updateResults = await Promise.all(updates);
    const { error: matchError } = fixtures.length ? await sb.from('matches').insert(fixtures) : { error: null };
    if (updateResults.some(result => result.error) || matchError) { message.textContent = 'Se crearon grupos, pero algunos datos del fixture no se guardaron. Reintentá.'; return; }
    await renderResults(); return;
  }
  if (event.target.matches('.match-result-form')) {
    event.preventDefault(); const form = event.target; const matchId = form.dataset.matchId; const result = readMatchScore(new FormData(form));
    if (result.error) { alert(result.error); return; }
    const winnerId = result.winnerIndex === 1 ? form.dataset.pairOneId : form.dataset.pairTwoId;
    pendingMatchResult = { matchId, winnerId, score: result.score };
    const pairOneWon = result.winnerIndex === 1;
    const winnerLabel = pairOneWon ? form.dataset.pairOneLabel : form.dataset.pairTwoLabel;
    const loserLabel = pairOneWon ? form.dataset.pairTwoLabel : form.dataset.pairOneLabel;
    const displayScore = result.score.split(',').map(set => set.trim().split('-')).map(([first, second]) => pairOneWon ? `${first}-${second}` : `${second}-${first}`).join(' | ');
    resultConfirmDialog?.querySelector('h2')?.replaceChildren('¿Confirmás el resultado?');
    if (resultConfirmDetails) resultConfirmDetails.innerHTML = `<span>${esc(winnerLabel)} vence a ${esc(loserLabel)}</span><strong>${esc(displayScore)}</strong>`;
    resultConfirmDialog?.showModal(); return;
  }
  if (event.target.id === 'login') { event.preventDefault(); const d = Object.fromEntries(new FormData(event.target)); const { error } = await sb.auth.signInWithPassword({ email:d.email, password:d.password }); event.target.querySelector('.form-message').textContent = error ? 'Credenciales inválidas.' : ''; if (!error) await render(); return; }
  if (event.target.id === 'tournament-form') { event.preventDefault(); const form = event.target; const d = Object.fromEntries(new FormData(form)); const msg = form.querySelector('.form-message'); if (d.endDate < d.startDate) { msg.textContent = 'El cierre no puede ser anterior al inicio.'; return; } if (d.registrationCloseDate && d.registrationCloseDate > d.startDate) { msg.textContent = 'El cierre de inscripciones debe ser el día de inicio o anterior.'; return; } if (!numeric(d.whatsapp)) { msg.textContent = 'WhatsApp solo admite números.'; return; }
    const phaseRows = [['group','round_of_16','quarter_final','semi_final','final'].map(stage => ({ stage, start_date:d[`${stage}Start`], end_date:d[`${stage}End`] }))][0]; const incompletePhase = phaseRows.find(phase => Boolean(phase.start_date) !== Boolean(phase.end_date) || (phase.start_date && phase.end_date < phase.start_date)); if (incompletePhase) { msg.textContent = 'Cada fase debe tener ambas fechas y un rango válido.'; return; }
    const values = { title:d.title.trim(), location:d.location.trim(), start_date:d.startDate, end_date:d.endDate, registration_close_date:d.registrationCloseDate || null, registration_price:d.price || null, whatsapp_number:d.whatsapp, status:d.status, description:d.description.trim() };
    let result; if (editingTournament) result = await sb.from('tournaments').update(values).eq('id', editingTournament.id).select('id').single(); else result = await sb.from('tournaments').insert(values).select('id').single();
    if (result.error) { msg.textContent = 'No se pudo guardar el torneo.'; return; }
    const categoryName = d.category.trim(); if (!editingTournament) { await sb.from('tournament_categories').insert({ tournament_id:result.data.id, name:categoryName }); } else { const existing = editingTournament.tournament_categories?.[0]; if (existing) await sb.from('tournament_categories').update({ name:categoryName }).eq('id', existing.id); else await sb.from('tournament_categories').insert({ tournament_id:result.data.id, name:categoryName }); }
    await sb.from('tournament_phase_dates').delete().eq('tournament_id', result.data.id); const scheduled = phaseRows.filter(phase => phase.start_date).map(phase => ({ ...phase, tournament_id:result.data.id })); if (scheduled.length) { const { error: scheduleError } = await sb.from('tournament_phase_dates').insert(scheduled); if (scheduleError) { msg.textContent = 'El torneo se guardó, pero no las fechas de fases.'; return; } }
    editingTournament = null; await renderTournaments(); return;
  }
  if (event.target.id === 'pair-form') { event.preventDefault(); const form = event.target; const d = Object.fromEntries(new FormData(form)); const msg = form.querySelector('.form-message'); if (invalidNumbers(d).length) { msg.textContent = 'DNI y teléfono solo admiten números.'; return; }
    const pairValues = { category_id:d.categoryId, player_one_alias:d.p1alias.trim(), player_two_alias:d.p2alias.trim(), status:d.status };
    let pairId = editingPair?.id; let error;
    if (pairId) ({ error } = await sb.from('pairs').update(pairValues).eq('id', pairId)); else { const result = await sb.from('pairs').insert(pairValues).select('id').single(); error = result.error; pairId = result.data?.id; }
    if (error || !pairId) { msg.textContent = 'No se pudo guardar la pareja.'; return; }
    const privateValues = { pair_id:pairId, player_one_first_name:d.p1first.trim(), player_one_last_name:d.p1last.trim(), player_one_dni:d.p1dni, player_one_category:d.p1category.trim(), player_two_first_name:d.p2first.trim(), player_two_last_name:d.p2last.trim(), player_two_dni:d.p2dni, player_two_category:d.p2category.trim(), contact_phone:d.phone };
    const privateResult = await sb.from('pair_private_data').upsert(privateValues, { onConflict:'pair_id' }); if (privateResult.error) { msg.textContent = 'La pareja se guardó, pero faltan datos privados. Reintentá editarla.'; return; }
    editingPair = null; await renderPairs();
  }
});
render();

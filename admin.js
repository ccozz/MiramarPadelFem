const sb = window.supabase.createClient('https://scdgdfxkvkgqueeozznd.supabase.co', 'sb_publishable_UgQh8Fq2C-ydgDCPSbii6A_J5Eqoia1');
const app = document.querySelector('#admin-app');
let active = 'tournaments';
let editingTournament = null;
let editingPair = null;
let pairsCache = [];
let selectedResultsCategoryId = '';
let editingMatchId = '';
let showPairForm = false;
let selectedCategoryIdForPair = '';

const themeToggle = document.querySelector('#admin-theme-toggle');
const resultConfirmDialog = document.querySelector('#result-confirm-dialog');
const resultConfirmDetails = document.querySelector('#result-confirm-details');
const tournamentModal = document.querySelector('#tournament-modal');
const matchModal = document.querySelector('#match-modal');
const resultsModal = document.querySelector('#results-modal');
const playerModal = document.querySelector('#player-modal');
let pendingMatchResult = null;
let currentResultsMatches = [];
let currentResultsPairMap = new Map();
let currentOpenResultsCategoryId = '';

const setTheme = theme => { document.documentElement.dataset.theme = theme; themeToggle?.setAttribute('aria-pressed', String(theme === 'dark')); themeToggle?.setAttribute('aria-label', theme === 'dark' ? 'Modo oscuro activo. Cambiar a modo claro' : 'Modo claro activo. Cambiar a modo oscuro'); };
setTheme(localStorage.getItem('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
themeToggle?.addEventListener('click', () => { const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; localStorage.setItem('theme', theme); setTheme(theme); });

tournamentModal?.addEventListener('click', event => {
  if (event.target === tournamentModal) {
    editingTournament = null;
    tournamentModal.close();
  }
});
resultsModal?.addEventListener('click', event => {
  if (event.target === resultsModal) {
    resultsModal.close();
  }
});
matchModal?.addEventListener('click', event => {
  if (event.target === matchModal) {
    matchModal.close();
  }
});
playerModal?.addEventListener('click', event => {
  if (event.target === playerModal) {
    playerModal.close();
  }
});
resultConfirmDialog?.addEventListener('click', event => {
  if (event.target === resultConfirmDialog) {
    pendingMatchResult = null;
    resultConfirmDialog.close();
  }
});

const esc = (value = '') => String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char]));
const signed = value => value > 0 ? `+${value}` : String(value);
const numeric = value => /^[0-9]+$/.test(String(value));
const pairKey = (a1 = '', a2 = '') => {
  const norm1 = String(a1 || '').trim().toLowerCase();
  const norm2 = String(a2 || '').trim().toLowerCase();
  return [norm1, norm2].sort().join(' /// ');
};
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

let playersRegistry = new Map();

function updatePlayersRegistry(pairsList = []) {
  (pairsList || []).forEach(p => {
    const rawData = p.pair_private_data;
    const d = Array.isArray(rawData) ? rawData[0] || {} : rawData || {};
    if (d.player_one_dni && numeric(d.player_one_dni)) {
      const dni = String(d.player_one_dni).trim();
      const existing = playersRegistry.get(dni) || { count: 0 };
      playersRegistry.set(dni, {
        dni,
        first: (d.player_one_first_name || '').trim(),
        last: (d.player_one_last_name || '').trim(),
        alias: (p.player_one_alias || '').trim(),
        category: (d.player_one_category || '').trim(),
        phone: (d.contact_phone || existing.phone || '').trim(),
        count: (existing.count || 0) + 1
      });
    }
    if (d.player_two_dni && numeric(d.player_two_dni)) {
      const dni = String(d.player_two_dni).trim();
      const existing = playersRegistry.get(dni) || { count: 0 };
      playersRegistry.set(dni, {
        dni,
        first: (d.player_two_first_name || '').trim(),
        last: (d.player_two_last_name || '').trim(),
        alias: (p.player_two_alias || '').trim(),
        category: (d.player_two_category || '').trim(),
        phone: (d.contact_phone || existing.phone || '').trim(),
        count: (existing.count || 0) + 1
      });
    }
  });
}

async function ensurePlayersRegistryLoaded() {
  if (playersRegistry.size > 0) return;
  const { data: allPairs } = await sb.from('pairs').select('id,player_one_alias,player_two_alias,pair_private_data(*)');
  if (allPairs) updatePlayersRegistry(allPairs);
}

function playersDatalistHtml() {
  const players = Array.from(playersRegistry.values()).sort((a, b) => (a.last || '').localeCompare(b.last || ''));
  return `
    <datalist id="players-global-datalist">
      ${players.map(p => `
        <option value="${esc(p.dni)}">${esc(p.last)}, ${esc(p.first)} (${esc(p.alias || '-')}) · Cat: ${esc(p.category || '-')}</option>
      `).join('')}
    </datalist>
  `;
}

function openPlayerDetailsModal(dni) {
  const p = playersRegistry.get(String(dni));
  if (!p) return;
  playerModal.innerHTML = `
    <div class="modal-header">
      <h2>Ficha de Jugadora</h2>
      <button type="button" class="modal-close" id="close-player-modal" aria-label="Cerrar">×</button>
    </div>
    <div class="player-sheet-card">
      <div class="player-sheet-field">
        <span class="player-sheet-label">DNI</span>
        <span class="player-sheet-value">${esc(p.dni)}</span>
      </div>
      <div class="player-sheet-field">
        <span class="player-sheet-label">Jugadora</span>
        <span class="player-sheet-value">${esc(p.last)}, ${esc(p.first)}</span>
      </div>
      <div class="player-sheet-field">
        <span class="player-sheet-label">Alias</span>
        <span class="player-sheet-value" style="color:var(--green);">${esc(p.alias || '-')}</span>
      </div>
      <div class="player-sheet-field">
        <span class="player-sheet-label">Categoría declarada</span>
        <span class="player-sheet-value">${esc(p.category || '-')}</span>
      </div>
      <div class="player-sheet-field">
        <span class="player-sheet-label">Teléfono de contacto</span>
        <span class="player-sheet-value">${esc(p.phone || '-')}</span>
      </div>
    </div>
    <div class="player-sheet-actions">
      <button type="button" class="button button--edit button--small" data-edit-player="${esc(p.dni)}">Editar</button>
      <button type="button" class="button button--delete button--small" data-delete-player="${esc(p.dni)}">Eliminar</button>
    </div>
  `;
  if (!playerModal.open) playerModal.showModal();
}

function openEditPlayerModal(dni) {
  const p = playersRegistry.get(String(dni));
  if (!p) return;
  playerModal.innerHTML = `
    <div class="modal-header">
      <h2>Editar Jugadora</h2>
      <button type="button" class="modal-close" id="close-player-modal" aria-label="Cerrar">×</button>
    </div>
    <form id="edit-player-form" class="admin-grid" style="padding-top:10px;">
      <input type="hidden" name="oldDni" value="${esc(p.dni)}">
      <label>DNI<input name="dni" type="number" inputmode="numeric" value="${esc(p.dni)}" required></label>
      <label>Nombre<input name="firstName" value="${esc(p.first)}" required></label>
      <label>Apellido<input name="lastName" value="${esc(p.last)}" required></label>
      <label>Alias<input name="alias" value="${esc(p.alias)}" required></label>
      <label>Categoría declarada<input name="category" value="${esc(p.category)}"></label>
      <label>Teléfono<input name="phone" type="tel" inputmode="numeric" value="${esc(p.phone)}"></label>
      <div class="admin-actions wide" style="margin-top:10px;">
        <button class="button button--primary" type="submit">Guardar Jugadora</button>
        <button type="button" id="cancel-player-modal" class="button button--cancel">Cancelar</button>
      </div>
      <p class="form-message wide"></p>
    </form>
  `;
  if (!playerModal.open) playerModal.showModal();
}

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

function tournamentFormModalHtml(t = editingTournament, tPairs = [], tGroups = [], tMatches = [], bannerNotice = '') {
  const isEdit = Boolean(t);
  const schedule = Object.fromEntries((t?.tournament_phase_dates || []).map(phase => [phase.stage, phase]));
  const phaseFields = [['group','Grupos'],['round_of_32','Dieciseisavos'],['round_of_16','Octavos'],['quarter_final','Cuartos'],['semi_final','Semifinales'],['final','Final']].map(([stage,label]) => `<fieldset class="phase-dates"><legend>${label}</legend><label>Desde<input type="date" name="${stage}Start" value="${esc(schedule[stage]?.start_date)}"></label><label>Hasta<input type="date" name="${stage}End" value="${esc(schedule[stage]?.end_date)}"></label></fieldset>`).join('');
  
  const firstCatId = t?.tournament_categories?.[0]?.id || '';
  const currentCatIds = new Set((t?.tournament_categories || []).map(c => c.id));
  const pairBadges = tPairs.length ? tPairs.map(p => `<span class="pair-badge">${esc(p.player_one_alias)} / ${esc(p.player_two_alias)} <button type="button" data-delete-pair="${p.id}" title="Eliminar pareja">×</button></span>`).join(' ') : '<em>Sin parejas inscriptas aún.</em>';
  
  const enrolledKeys = new Set(tPairs.map(p => pairKey(p.player_one_alias, p.player_two_alias)));
  const otherPairs = (window.pairsCacheAll || []).filter(p => !currentCatIds.has(p.category_id));
  const uniqueOtherPairs = [];
  const seenKeys = new Set(enrolledKeys);
  otherPairs.forEach(p => {
    const key = pairKey(p.player_one_alias, p.player_two_alias);
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueOtherPairs.push(p);
    }
  });
  const otherPairOptions = uniqueOtherPairs.map(p => `<option value="${p.id}">${esc(p.player_one_alias)} / ${esc(p.player_two_alias)}</option>`).join('');

  const bannerHtml = bannerNotice ? `
    <div class="form-section form-section--notice" style="background:color-mix(in srgb,var(--green) 12%,var(--paper));border:1.5px solid var(--green);border-radius:8px;padding:12px;margin-bottom:14px;">
      <b style="color:var(--green);font-size:13px;display:flex;align-items:center;gap:6px;">
        <span style="font-size:16px;">✓</span> ${esc(bannerNotice)}
      </b>
    </div>` : '';

  const pairsSection = isEdit ? `
    <div class="tournament-pairs-list">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <h3 style="margin:0;">Parejas inscriptas (${tPairs.length})</h3>
        ${t?.status === 'open' || !tGroups.length ? `<button type="button" data-close-and-generate="${t.id}" class="button button--purple button--small">Cerrar inscripción y armar grupos</button>` : `<span class="status-badge status-badge--in_progress">Inscripción cerrada · ${tGroups.length} zonas</span>`}
      </div>
      <div class="pair-badges-container" style="margin-top:10px;">${pairBadges}</div>

      <div style="margin-top:14px; padding:12px; border:1px solid var(--line); border-radius:6px; background:var(--cream);">
        <h4 style="margin:0 0 8px; font-size:13px;">Inscribir Pareja a este Torneo</h4>
        
        ${uniqueOtherPairs.length ? `
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:12px;">
          <label style="flex:1; min-width:200px; font-size:12px; font-weight:600;">
            De otros torneos:
            <select id="modal-existing-pair-select" style="margin-top:4px;">
              <option value="">-- Seleccionar pareja existente --</option>
              ${otherPairOptions}
            </select>
          </label>
          <button type="button" id="modal-associate-pair-btn" data-target-cat="${firstCatId}" class="button button--small button--blue" style="margin-top:16px;">Asociar al Torneo</button>
        </div>` : ''}

        <div style="border-top:1px dashed var(--line); padding-top:10px; margin-top:10px;">
          <button type="button" id="toggle-inline-pair-btn" class="button button--blue-outline button--small">+ Inscribir Nueva Pareja</button>
          <div id="inline-pair-form-container" style="display:none; margin-top:12px;">
            ${playersDatalistHtml()}
            <form id="modal-inline-pair-form" class="admin-grid">
              <input type="hidden" name="categoryId" value="${firstCatId}">
              <div class="player-card wide">
                <h4>Jugadora 1</h4>
                <div class="admin-grid">
                  <label class="wide">DNI (Buscar / Autocompletar)<input name="p1dni" type="number" inputmode="numeric" list="players-global-datalist" placeholder="Ingresá DNI..." required><span class="player-lookup-hint" data-lookup-hint="p1"></span></label>
                  <label>Nombre<input name="p1first" required></label>
                  <label>Apellido<input name="p1last" required></label>
                  <label>Alias<input name="p1alias" required></label>
                  <label>Categoría declarada<input name="p1category" required></label>
                </div>
              </div>
              <div class="player-card wide">
                <h4>Jugadora 2</h4>
                <div class="admin-grid">
                  <label class="wide">DNI (Buscar / Autocompletar)<input name="p2dni" type="number" inputmode="numeric" list="players-global-datalist" placeholder="Ingresá DNI..." required><span class="player-lookup-hint" data-lookup-hint="p2"></span></label>
                  <label>Nombre<input name="p2first" required></label>
                  <label>Apellido<input name="p2last" required></label>
                  <label>Alias<input name="p2alias" required></label>
                  <label>Categoría declarada<input name="p2category" required></label>
                </div>
              </div>
              <label>Teléfono de contacto<input name="phone" type="tel" inputmode="numeric" required></label>
              <label>Estado<select name="status"><option value="confirmed" selected>Confirmada</option><option value="pending">Pendiente</option></select></label>
              <div class="admin-actions wide" style="margin-top:6px;">
                <button class="button button--primary button--small" type="submit">Guardar e Inscribir</button>
                <button type="button" id="cancel-inline-pair-btn" class="button button--cancel button--small">Cerrar</button>
              </div>
              <p class="form-message wide"></p>
            </form>
          </div>
        </div>
      </div>
    </div>
  ` : '';

  const groupsSection = isEdit && tGroups.length ? `
    <div class="form-section">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; border-bottom:1px solid var(--line); padding-bottom:8px;">
        <div>
          <h3 class="form-section__title" style="margin:0; border:0; padding:0;">4. Grupos y Zonas (${tGroups.length})</h3>
          <small style="color:var(--muted); font-size:11px;">Podés reasignar cualquier pareja a otra zona en tiempo real.</small>
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button type="button" class="button button--small button--blue-outline" data-modal-add-group="${firstCatId}">+ Agregar Grupo</button>
          <button type="button" class="button button--small button--purple" data-modal-regen-fixture="${firstCatId}">🔄 Reordenar Grupos</button>
          <button type="button" class="button button--small button--primary" data-go-to-results="${firstCatId}">Cargar Resultados ↗</button>
        </div>
      </div>
      <div class="groups-admin-grid" style="margin-top:12px; display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:12px;">
        ${tGroups.map(g => {
          const gPairs = tPairs.filter(p => p.group_name === g.name);
          const groupOptions = tGroups.map(og => `<option value="${og.name}" ${og.name === g.name ? 'selected' : ''}>${og.name}</option>`).join('');
          return `
            <div class="group-admin-card" style="background:var(--paper); border:1px solid var(--line); border-radius:8px; padding:12px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid var(--line); padding-bottom:6px;">
                <b style="color:var(--green); font-size:14px;">${esc(g.name)}</b>
                <span style="font-size:11px; color:var(--muted); font-weight:700;">${gPairs.length} parejas</span>
              </div>
              ${gPairs.length ? `
                <ul style="list-style:none; padding:0; margin:0; display:grid; gap:8px;">
                  ${gPairs.map(p => `
                    <li style="display:flex; justify-content:space-between; align-items:center; gap:8px; font-size:12px; padding:6px 8px; background:var(--cream); border:1px solid var(--line); border-radius:6px;">
                      <span style="font-weight:600; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(p.player_one_alias)} / ${esc(p.player_two_alias)}</span>
                      <label style="font-size:10px; color:var(--muted); display:flex; align-items:center; gap:4px; margin:0; flex-shrink:0;">
                        Zona:
                        <select data-reassign-group-pair="${p.id}" data-category-id="${p.category_id}" style="font-size:11px; min-height:30px; padding:2px 4px;">
                          ${groupOptions}
                          <option value="">(Sin grupo)</option>
                        </select>
                      </label>
                    </li>
                  `).join('')}
                </ul>
              ` : '<p style="font-size:12px; color:var(--muted); margin:4px 0;"><em>Sin parejas en este grupo.</em></p>'}
            </div>
          `;
        }).join('')}
      </div>
    </div>
  ` : (isEdit && tPairs.length >= 2 ? `
    <div class="form-section">
      <h3 class="form-section__title">4. Grupos y Zonas</h3>
      <p style="margin:4px 0 10px; font-size:13px; color:var(--muted);">Hay ${tPairs.length} parejas inscriptas. Al cerrar la inscripción se armarán las zonas automáticamente.</p>
      <button type="button" data-close-and-generate="${t.id}" class="button button--purple button--small">Cerrar inscripción y armar grupos</button>
    </div>
  ` : '');

  const playoffMatches = (tMatches || []).filter(m => m.stage !== 'group');
  const stageLabels = { round_of_32: 'Dieciseisavos', round_of_16: 'Octavos de Final', quarter_final: 'Cuartos de Final', semi_final: 'Semifinales', final: 'Final' };
  const playoffSection = isEdit && (tGroups.length || playoffMatches.length) ? `
    <div class="form-section">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <h3 class="form-section__title" style="margin:0; border:0; padding:0;">5. Instancias de Playoffs</h3>
        <div>
          <button type="button" class="button button--small button--purple" data-modal-generate-playoffs="${firstCatId}">⚡ ${playoffMatches.length ? 'Regenerar Llave de Playoffs' : 'Armar Llave de Playoffs'}</button>
        </div>
      </div>
      ${playoffMatches.length ? `
        <div style="margin-top:12px; display:grid; gap:10px;">
          ${['round_of_32','round_of_16','quarter_final','semi_final','final'].map(st => {
            const stMatches = playoffMatches.filter(m => m.stage === st);
            if (!stMatches.length) return '';
            return `
              <div style="background:var(--paper); border:1px solid var(--line); border-radius:6px; padding:10px;">
                <b style="font-size:12px; text-transform:uppercase; color:var(--green); letter-spacing:.04em;">${stageLabels[st] || st}</b>
                <div style="display:grid; gap:6px; margin-top:6px;">
                  ${stMatches.map((m, idx) => {
                    const p1 = tPairs.find(p => p.id === m.pair_one_id);
                    const p2 = tPairs.find(p => p.id === m.pair_two_id);
                    const p1Label = p1 ? `${p1.player_one_alias} / ${p1.player_two_alias}` : 'Pendiente';
                    const p2Label = p2 ? `${p2.player_one_alias} / ${p2.player_two_alias}` : 'Pendiente';
                    return `
                      <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; padding:6px 10px; background:var(--cream); border-radius:4px; border:1px solid var(--line);">
                        <span><b>${p1Label}</b> vs <b>${p2Label}</b></span>
                        <span style="font-size:11px; font-weight:700; color:var(--green);">${esc(m.score || 'Pendiente')}</span>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : `
        <p style="margin:8px 0 0; font-size:12px; color:var(--muted);">
          Aún no se ha armado la llave de eliminación directa. Podés generarla cuando los grupos estén avanzados o completados.
        </p>
      `}
    </div>
  ` : '';

  return `<div class="modal-header">
    <h2>${isEdit ? 'Editar y Gestionar Torneo' : 'Crear Nuevo Torneo'}</h2>
    <button type="button" class="modal-close" id="close-tournament-modal" aria-label="Cerrar">×</button>
  </div>
  ${bannerHtml}
  <form id="tournament-form">
    <div class="form-section">
      <h3 class="form-section__title">1. Información del Torneo</h3>
      <div class="admin-grid">
        <label>Nombre del torneo<input name="title" value="${esc(t?.title)}" placeholder="Ej: Copa Miramar" required></label>
        <label>Sede / Club<input name="location" value="${esc(t?.location)}" placeholder="Ej: Club Náutico" required></label>
        <label>Categoría<input name="category" value="${esc(t?.tournament_categories?.[0]?.name)}" placeholder="Ej: 5ª Femenino" required></label>
        <label>Estado<select name="status">${['draft','open','in_progress','finished'].map(s => `<option value="${s}" ${t?.status === s || (!t && s === 'open') ? 'selected':''}>${({draft:'Borrador',open:'Inscripción abierta',in_progress:'En juego',finished:'Finalizado'})[s]}</option>`).join('')}</select></label>
        <label>Precio por persona ($)<input type="number" name="price" min="0" step="1" value="${t?.registration_price ?? ''}" placeholder="Ej: 25000"></label>
        <label>WhatsApp de contacto<input name="whatsapp" type="tel" inputmode="numeric" pattern="[0-9]+" value="${esc(t?.whatsapp_number)}" placeholder="Ej: 549223..." required></label>
        <label class="wide">Descripción / Bases<textarea name="description" rows="2" placeholder="Detalles, premios, reglamento...">${esc(t?.description)}</textarea></label>
      </div>
    </div>

    <div class="form-section">
      <h3 class="form-section__title">2. Cronograma General</h3>
      <div class="admin-grid">
        <label>Fecha de Inicio<input type="date" name="startDate" value="${esc(t?.start_date)}" required></label>
        <label>Fecha de Cierre<input type="date" name="endDate" value="${esc(t?.end_date)}" required></label>
        <label class="wide">Límite para inscripciones<input type="date" name="registrationCloseDate" value="${esc(t?.registration_close_date)}"><small>Tras esta fecha no se aceptan nuevas parejas.</small></label>
      </div>
    </div>

    <details class="form-section form-section--collapsible">
      <summary class="form-section__title form-section__summary">
        <span>3. Cronograma por Fase (Opcional)</span>
        <span class="collapsible-indicator">▾</span>
      </summary>
      <div class="phase-date-grid" style="margin-top:12px;">${phaseFields}</div>
    </details>

    ${pairsSection}
    ${groupsSection}
    ${playoffSection}

    <div class="admin-actions wide modal-actions--sticky">
      <button class="button button--primary">${isEdit ? 'Guardar cambios':'Guardar torneo'}</button>
      <button type="button" id="cancel-tournament-modal" class="button button--cancel">Cancelar</button>
    </div>
    <p class="form-message wide"></p>
  </form>`;
}

async function renderTournaments() {
  const [{ data, error }, { data: pairs }] = await Promise.all([
    sb.from('tournaments').select('id,title,start_date,end_date,registration_close_date,location,registration_price,whatsapp_number,status,description,tournament_categories(id,name),tournament_phase_dates(stage,start_date,end_date)').order('start_date'),
    sb.from('pairs').select('id,category_id,player_one_alias,player_two_alias,status').order('created_at', { ascending: false })
  ]);
  window.tournamentsCache = data || [];
  window.pairsCacheAll = pairs || [];

  const tList = error ? '<p>No se pudieron cargar los torneos.</p>' : (data || []).map(t => {
    const categories = t.tournament_categories || [];
    const catIds = new Set(categories.map(c => c.id));
    const tPairs = (pairs || []).filter(p => catIds.has(p.category_id));
    const statusLabel = ({draft:'Borrador',open:'Inscripción abierta',in_progress:'En juego',finished:'Finalizado'})[t.status] || t.status;

    return `<article class="admin-row">
      <div>
        <b>${esc(t.title)}</b>
        <span>${esc(t.start_date)} · ${categories.map(c => esc(c.name)).join(', ') || 'sin categorías'} · ${tPairs.length} parejas · <span class="status-badge status-badge--${t.status}">${statusLabel}</span></span>
      </div>
      <div class="admin-actions">
        <button data-edit-tournament="${t.id}" class="button button--edit button--small">Editar</button>
        <button data-delete-tournament="${t.id}" class="button button--delete button--small">Eliminar</button>
      </div>
    </article>`;
  }).join('') || '<p>Sin torneos todavía.</p>';

  app.innerHTML = `<section class="admin-card">
    <div class="admin-row" style="margin-bottom:16px;">
      <p class="kicker">TORNEOS</p>
      <button type="button" id="open-tournament-form" class="button button--primary">+ Crear Torneo</button>
    </div>
    <h2>Torneos existentes</h2>
    <div id="tournament-admin-list">${tList}</div>
  </section>`;
}

async function openEditTournamentModal(tournamentId, bannerNotice = '') {
  await ensurePlayersRegistryLoaded();
  editingTournament = (window.tournamentsCache || []).find(t => t.id === tournamentId) || null;
  if (!editingTournament) {
    const { data: fetchedT } = await sb.from('tournaments').select('id,title,start_date,end_date,registration_close_date,location,registration_price,whatsapp_number,status,description,tournament_categories(id,name),tournament_phase_dates(stage,start_date,end_date)').eq('id', tournamentId).single();
    editingTournament = fetchedT || null;
  }
  if (!editingTournament) return;

  const catIds = (editingTournament.tournament_categories || []).map(c => c.id);
  const [{ data: pairs }, { data: groups }, { data: matches }] = await Promise.all([
    catIds.length ? sb.from('pairs').select('id,category_id,player_one_alias,player_two_alias,status,group_name').in('category_id', catIds).order('created_at') : { data: [] },
    catIds.length ? sb.from('groups').select('id,category_id,name').in('category_id', catIds).order('name') : { data: [] },
    catIds.length ? sb.from('matches').select('id,category_id,group_id,stage,pair_one_id,pair_two_id,score,winner_pair_id,bracket_position').in('category_id', catIds).order('bracket_position') : { data: [] }
  ]);

  const tPairs = pairs || [];
  const tGroups = groups || [];
  const tMatches = matches || [];

  tournamentModal.innerHTML = tournamentFormModalHtml(editingTournament, tPairs, tGroups, tMatches, bannerNotice);
  if (!tournamentModal.open) tournamentModal.showModal();
}

async function refreshTournamentModalPairs(notice = '') {
  if (!editingTournament) return;
  await openEditTournamentModal(editingTournament.id, notice);
  if (active === 'tournaments') await renderTournaments();
}

function pairForm(categories) {
  const p = editingPair;
  if (!p && !showPairForm) {
    return `<section class="admin-card"><div class="admin-actions"><button type="button" id="open-pair-form" class="button button--primary">+ Inscribir Nueva Pareja</button></div></section>`;
  }
  const privateData = p?.pair_private_data;
  const d = Array.isArray(privateData) ? privateData[0] || {} : privateData || {};
  const selectedCat = p?.category_id || selectedCategoryIdForPair;
  const catOptions = categories.map(c => `<option value="${c.id}" ${selectedCat === c.id ? 'selected':''}>${esc(c.tournaments?.title || 'Torneo')} · ${esc(c.name)}</option>`).join('');
  return `<section class="admin-card">
    <p class="kicker">PAREJAS</p>
    <h1>${p ? 'Modificar pareja' : 'Inscribir Pareja'}</h1>
    ${playersDatalistHtml()}
    <form id="pair-form">
      <div class="form-section">
        <label class="wide">Torneo y categoría<select name="categoryId" required><option value="">Elegir categoría</option>${catOptions}</select></label>
      </div>

      <div class="form-section">
        <div class="player-card">
          <h4>Jugadora 1</h4>
          <div class="admin-grid">
            <label class="wide">DNI (Buscar / Autocompletar)<input name="p1dni" type="number" inputmode="numeric" list="players-global-datalist" value="${esc(d.player_one_dni)}" placeholder="Ingresá DNI..." required><span class="player-lookup-hint" data-lookup-hint="p1"></span></label>
            <label>Nombre<input name="p1first" value="${esc(d.player_one_first_name)}" required></label>
            <label>Apellido<input name="p1last" value="${esc(d.player_one_last_name)}" required></label>
            <label>Alias<input name="p1alias" value="${esc(p?.player_one_alias)}" required></label>
            <label>Categoría declarada<input name="p1category" value="${esc(d.player_one_category)}" required></label>
          </div>
        </div>

        <div class="player-card" style="margin-top:12px;">
          <h4>Jugadora 2</h4>
          <div class="admin-grid">
            <label class="wide">DNI (Buscar / Autocompletar)<input name="p2dni" type="number" inputmode="numeric" list="players-global-datalist" value="${esc(d.player_two_dni)}" placeholder="Ingresá DNI..." required><span class="player-lookup-hint" data-lookup-hint="p2"></span></label>
            <label>Nombre<input name="p2first" value="${esc(d.player_two_first_name)}" required></label>
            <label>Apellido<input name="p2last" value="${esc(d.player_two_last_name)}" required></label>
            <label>Alias<input name="p2alias" value="${esc(p?.player_two_alias)}" required></label>
            <label>Categoría declarada<input name="p2category" value="${esc(d.player_two_category)}" required></label>
          </div>
        </div>
      </div>

      <div class="form-section">
        <div class="admin-grid">
          <label>Teléfono de contacto<input name="phone" type="tel" inputmode="numeric" value="${esc(d.contact_phone)}" required></label>
          <label>Estado<select name="status">${['pending','confirmed','cancelled'].map(s => `<option value="${s}" ${p?.status === s || (!p && s === 'confirmed') ? 'selected':''}>${({pending:'Pendiente',confirmed:'Confirmada',cancelled:'Cancelada'})[s]}</option>`).join('')}</select></label>
        </div>
      </div>

      <div class="admin-actions wide" style="margin-top:14px;">
        <button class="button button--primary">${p ? 'Guardar cambios':'Agregar pareja'}</button>
        <button type="button" id="cancel-pair" class="button button--cancel">Cancelar</button>
      </div>
      <p class="form-message wide"></p>
    </form>
  </section>`;
}

async function renderPairs() {
  const [{ data: categories }, { data: pairs, error }] = await Promise.all([
    sb.from('tournament_categories').select('id,name,tournaments(title)').order('name'),
    sb.from('pairs').select('id,category_id,player_one_alias,player_two_alias,status,pair_private_data(*),tournament_categories(name,tournaments(title))').order('created_at', { ascending:false })
  ]);
  pairsCache = pairs || [];
  updatePlayersRegistry(pairsCache);
  const statusLabels = { pending: 'Pendiente', confirmed: 'Confirmada', cancelled: 'Cancelada' };
  const sortedPlayers = Array.from(playersRegistry.values()).sort((a, b) => (a.last || '').localeCompare(b.last || ''));

  const padronSection = `
    <details class="players-registry-details">
      <summary class="players-registry-summary">
        <span>📋 Padrón General de Jugadoras (${playersRegistry.size})</span>
        <small style="font-size:12px; color:var(--muted); font-weight:normal;">Ver listado ▾</small>
      </summary>
      <div class="players-registry-search-box">
        <input type="search" id="players-registry-search" placeholder="🔍 Buscar por DNI, apellido, nombre o alias..." style="width:100%; font-size:16px; padding:10px 12px; border:1px solid var(--line); border-radius:6px; background:var(--cream); color:var(--ink);">
      </div>
      <table class="players-registry-table">
        <thead>
          <tr>
            <th class="col-dni">DNI</th>
            <th class="col-name">Jugadora</th>
            <th class="col-alias">Alias</th>
            <th class="col-cat">CAT</th>
          </tr>
        </thead>
        <tbody id="players-registry-tbody">
          ${sortedPlayers.map(pl => {
            const shortCat = esc(pl.category ? pl.category.replace(/ Femenino|damas/gi, '').trim() : '-');
            return `
            <tr class="player-row-clickable" data-player-dni="${esc(pl.dni)}" title="Tocar para ver datos y opciones">
              <td class="col-dni"><b>${esc(pl.dni)}</b></td>
              <td class="col-name">${esc(pl.last)}, ${esc(pl.first)}</td>
              <td class="col-alias"><span class="padron-alias">${esc(pl.alias || '-')}</span></td>
              <td class="col-cat"><b>${shortCat}</b></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </details>
  `;

  app.innerHTML = pairForm(categories || []) + `<section class="admin-card"><h2>Parejas cargadas</h2><div>${error ? '<p>No se pudieron cargar las parejas.</p>' : pairsCache.map(p => `
    <article class="admin-row">
      <div>
        <b>${esc(p.player_one_alias)} / ${esc(p.player_two_alias)}</b>
        <span>${esc(p.tournament_categories?.tournaments?.title || '')} · ${esc(p.tournament_categories?.name || '')} · <span class="status-badge status-badge--${p.status === 'confirmed' ? 'in_progress' : (p.status === 'pending' ? 'draft' : 'finished')}">${statusLabels[p.status] || p.status}</span></span>
      </div>
      <div class="admin-actions">
        ${p.status === 'pending' ? `
          <button data-pair-status="confirmed" data-pair-id="${p.id}" class="button button--primary button--small">Confirmar</button>
          <button data-pair-status="cancelled" data-pair-id="${p.id}" class="button button--cancel button--small">Rechazar</button>
        ` : ''}
        <button data-edit-pair="${p.id}" class="button button--edit button--small">Editar</button>
        <button data-delete-pair="${p.id}" class="button button--delete button--small">Eliminar</button>
      </div>
    </article>`).join('') || '<p>Sin parejas cargadas.</p>'}</div></section>` + padronSection;
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

function renderCompactMatchCard(match, pairMap, stageName = '') {
  const p1 = pairMap.get(match.pair_one_id);
  const p2 = pairMap.get(match.pair_two_id);
  const p1Label = p1 ? `${p1.player_one_alias} / ${p1.player_two_alias}` : (match.source_pair_one_match_id ? 'Ganador ronda previa' : 'A definir');
  const p2Label = p2 ? `${p2.player_one_alias} / ${p2.player_two_alias}` : (match.source_pair_two_match_id ? 'Ganador ronda previa' : 'A definir');
  const canLoad = Boolean(match.pair_one_id && match.pair_two_id);
  const isFinished = Boolean(match.winner_pair_id);

  let formattedScore = '';
  if (isFinished && match.score) {
    const pairOneWon = match.winner_pair_id === match.pair_one_id;
    formattedScore = String(match.score).split(',').map(s => s.trim()).filter(Boolean).map(s => {
      const parts = s.match(/^(\d+)\s*-\s*(\d+)$/);
      if (!parts) return s;
      return pairOneWon ? `${parts[1]}-${parts[2]}` : `${parts[2]}-${parts[1]}`;
    }).join(' | ');
  }

  const actionHtml = isFinished
    ? `<span class="match-score-pill">${esc(formattedScore)}</span><button type="button" class="button button--small button--edit" data-open-match-modal="${match.id}">Editar</button>`
    : (canLoad
        ? `<span class="match-pending-pill">Pendiente</span><button type="button" class="button button--small button--primary" data-open-match-modal="${match.id}">Cargar</button>`
        : `<span class="match-pending-pill">A definir</span>`
      );

  return `
    <article class="compact-match-card ${isFinished ? 'is-finished' : 'is-pending'}" ${canLoad ? `data-open-match-modal="${match.id}"` : ''}>
      <div class="compact-match-card__body">
        ${stageName ? `<small class="compact-match-card__stage">${esc(stageName)} ${match.bracket_position || ''}</small>` : ''}
        <div class="compact-match-card__teams">
          <span class="team-name ${match.winner_pair_id === match.pair_one_id ? 'team--winner' : ''}">${esc(p1Label)}</span>
          <span class="team-vs">vs</span>
          <span class="team-name ${match.winner_pair_id === match.pair_two_id ? 'team--winner' : ''}">${esc(p2Label)}</span>
        </div>
      </div>
      <div class="compact-match-card__action">
        ${actionHtml}
      </div>
    </article>
  `;
}

function openMatchResultModal(matchId) {
  const match = currentResultsMatches.find(m => m.id === matchId);
  if (!match) return;
  const p1 = currentResultsPairMap.get(match.pair_one_id);
  const p2 = currentResultsPairMap.get(match.pair_two_id);
  if (!p1 || !p2) {
    alert('Este partido aún no tiene las dos parejas confirmadas.');
    return;
  }
  const isFinished = Boolean(match.winner_pair_id);
  const p1Label = `${p1.player_one_alias} / ${p1.player_two_alias}`;
  const p2Label = `${p2.player_one_alias} / ${p2.player_two_alias}`;
  const isP1Winner = match.winner_pair_id === match.pair_one_id;
  const isP2Winner = match.winner_pair_id === match.pair_two_id;

  matchModal.innerHTML = `
    <div class="modal-header">
      <div>
        <h3 style="margin:0; font-family:'Playfair Display',serif; font-size:1.3rem;">${isFinished ? 'Editar Resultado' : 'Cargar Resultado'}</h3>
        <p style="margin:2px 0 0; font-size:12px; color:var(--muted);">${match.stage === 'group' ? 'Partido de Zona' : window.PadelTournament.playoffStageLabel(match.stage)}</p>
      </div>
      <button type="button" class="modal-close" id="close-match-modal" aria-label="Cerrar">×</button>
    </div>

    <div class="match-modal-versus">
      <div class="match-modal-team ${isP1Winner ? 'is-winner' : ''}">
        <b>${esc(p1Label)}</b>
        ${isP1Winner ? '<br><small style="color:var(--green); font-weight:700;">Ganadora</small>' : ''}
      </div>
      <span class="match-modal-vs">VS</span>
      <div class="match-modal-team ${isP2Winner ? 'is-winner' : ''}">
        <b>${esc(p2Label)}</b>
        ${isP2Winner ? '<br><small style="color:var(--green); font-weight:700;">Ganadora</small>' : ''}
      </div>
    </div>

    <form id="match-modal-form" class="match-result-form" data-match-id="${match.id}" data-pair-one-id="${match.pair_one_id}" data-pair-two-id="${match.pair_two_id}" data-pair-one-label="${esc(p1Label)}" data-pair-two-label="${esc(p2Label)}">
      <div class="set-scores wide">
        ${setFields(match.score)}
      </div>
      <p class="form-message wide" style="margin-top:8px;"></p>
      <div class="admin-actions wide modal-actions--sticky" style="margin-top:16px;">
        <button class="button button--primary" type="submit">${isFinished ? 'Guardar Cambios' : 'Confirmar y Guardar'}</button>
        ${isFinished ? `<button type="button" class="button button--delete button--small" data-clear-match-result="${match.id}">Limpiar Resultado</button>` : ''}
        <button type="button" id="cancel-match-modal" class="button button--cancel">Cancelar</button>
      </div>
    </form>
  `;

  matchModal.showModal();
}

async function openResultsModal(categoryId, bannerNotice = '') {
  currentOpenResultsCategoryId = categoryId;
  const [{ data: category }, { data: pairs }, { data: groups }, { data: matches }, { data: playoffMatches }] = await Promise.all([
    sb.from('tournament_categories').select('id,name,tournaments(id,title,status)').eq('id', categoryId).single(),
    sb.from('pairs').select('id,category_id,player_one_alias,player_two_alias,status,group_name').eq('category_id', categoryId).eq('status', 'confirmed').order('created_at'),
    sb.from('groups').select('id,name').eq('category_id', categoryId).order('name'),
    sb.from('matches').select('id,group_id,pair_one_id,pair_two_id,score,winner_pair_id,played_at').eq('category_id', categoryId).eq('stage', 'group').order('played_at'),
    sb.from('matches').select('id,stage,bracket_position,pair_one_id,pair_two_id,score,winner_pair_id,source_pair_one_match_id,source_pair_two_match_id').eq('category_id', categoryId).neq('stage', 'group').order('bracket_position')
  ]);

  if (!category) return;
  const pairMap = new Map((pairs || []).map(p => [p.id, p]));
  currentResultsMatches = [...(matches || []), ...(playoffMatches || [])];
  currentResultsPairMap = pairMap;

  const t = category.tournaments || {};
  const statusLabel = ({draft:'Borrador',open:'Inscripción abierta',in_progress:'En juego',finished:'Finalizado'})[t.status] || t.status;

  const groupsHtml = (groups || []).map(group => {
    const groupPairs = (pairs || []).filter(pair => pair.group_name === group.name);
    const groupMatches = (matches || []).filter(match => match.group_id === group.id);
    const rows = window.PadelTournament.buildStandings(groupPairs, groupMatches);
    const tableRows = rows.map((row, index) => `<tr><td>${index + 1}</td><td>${esc(row.label)}</td><td>${row.played}</td><td>${row.won}</td><td>${row.lost}</td><td>${signed(row.setsWon - row.setsLost)}</td><td>${signed(row.gamesWon - row.gamesLost)}</td><td>${row.points}</td></tr>`).join('');
    return `<div class="results-group-compact" style="margin-bottom:14px;">
      <div class="results-group-compact__head">
        <div style="display:flex; align-items:center; gap:8px;">
          <b style="color:var(--green); font-size:15px;">${esc(group.name)}</b>
          <span style="font-size:11px; color:var(--muted); font-weight:700;">${groupPairs.length} parejas</span>
        </div>
      </div>
      <div class="table-wrap table-wrap--compact" style="margin-top:8px;">
        <table>
          <thead>
            <tr><th>#</th><th>Pareja</th><th>PJ</th><th>G</th><th>P</th><th>DS</th><th>DG</th><th>Pts</th></tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
      <div style="margin-top:12px;">
        <h4 style="font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); margin:0 0 6px;">Partidos de la Zona (${groupMatches.length})</h4>
        <div class="matches-grid">
          ${groupMatches.map(match => renderCompactMatchCard(match, pairMap)).join('') || '<p style="font-size:12px; color:var(--muted); margin:0;">Sin partidos programados.</p>'}
        </div>
      </div>
    </div>`;
  }).join('');

  const playoffHtml = playoffStages.map(stage => {
    const stageMatches = (playoffMatches || []).filter(match => match.stage === stage);
    if (!stageMatches.length) return '';
    const roundName = window.PadelTournament.playoffStageLabel(stage);
    return `<div class="playoff-round" style="margin-top:12px;">
      <h4 style="margin:0 0 6px; font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:var(--green);">${esc(roundName)}</h4>
      <div class="matches-grid">
        ${stageMatches.map(match => renderCompactMatchCard(match, pairMap, roundName)).join('')}
      </div>
    </div>`;
  }).join('');

  const finalMatch = (playoffMatches || []).find(match => match.stage === 'final' && match.winner_pair_id);
  const finishAction = finalMatch && t.status !== 'finished' ? `<form id="finish-tournament-form" style="margin-top:14px;"><input type="hidden" name="tournamentId" value="${t.id}"><button class="button button--primary button--small" type="submit">Terminar torneo</button><p class="form-message" aria-live="polite"></p></form>` : '';

  const bannerNoticeHtml = bannerNotice ? `
    <div style="background:color-mix(in srgb,var(--green) 12%,var(--paper));border:1.5px solid var(--green);border-radius:8px;padding:10px 14px;margin-bottom:14px;">
      <b style="color:var(--green);font-size:13px;display:flex;align-items:center;gap:6px;">
        <span style="font-size:16px;">✓</span> ${esc(bannerNotice)}
      </b>
    </div>` : '';

  resultsModal.innerHTML = `
    <div class="modal-header">
      <div>
        <h2 style="margin:0; font-family:'Playfair Display',serif; font-size:1.4rem;">${esc(t.title || 'Torneo')} · ${esc(category.name)}</h2>
        <span style="font-size:12px; color:var(--muted);">${(pairs || []).length} parejas · <span class="status-badge status-badge--${t.status || 'open'}">${statusLabel}</span></span>
      </div>
      <button type="button" class="modal-close" id="close-results-modal" aria-label="Cerrar">×</button>
    </div>

    ${bannerNoticeHtml}

    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:14px; padding-bottom:10px; border-bottom:1px solid var(--line);">
      <div style="display:flex; gap:6px; flex-wrap:wrap;">
        <button type="button" class="button button--small button--purple" data-modal-regen-fixture="${category.id}">🔄 Regenerar Fixture</button>
        <button type="button" class="button button--small button--purple" data-modal-generate-playoffs="${category.id}">⚡ Armar Playoffs</button>
      </div>
      <div>
        <button type="button" class="button button--small button--edit" data-edit-tournament="${t.id}">⚙️ Editar Torneo y Zonas</button>
      </div>
    </div>

    ${(matches?.length || groups?.length) ? `
      <div>${groupsHtml}</div>
      <details class="admin-card playoff-panel" style="margin-top:14px;" ${playoffMatches?.length ? 'open' : ''}>
        <summary style="font-size:14px; font-weight:700;">🏆 Llaves de Playoff</summary>
        <div class="playoff-panel__content">
          ${playoffHtml || '<p style="font-size:12px; color:var(--muted); margin:4px 0;">Completá los partidos de grupos para generar la llave eliminatoria.</p>'}
          ${finishAction}
        </div>
      </details>
    ` : `
      <div style="text-align:center; padding:24px 16px; background:var(--cream); border-radius:8px; border:1px solid var(--line);">
        <p style="font-weight:600; margin:0 0 8px;">Aún no se ha generado el fixture para esta categoría.</p>
        <p style="font-size:12px; color:var(--muted); margin:0 0 14px;">Hay ${(pairs || []).length} parejas confirmadas.</p>
        ${(pairs?.length >= 2) ? `
          <button type="button" class="button button--primary button--small" data-modal-regen-fixture="${category.id}">Armar Grupos y Fixture Automático</button>
        ` : `
          <p style="color:var(--muted); font-size:12px;">Confirmá al menos 2 parejas desde la pestaña Parejas o Torneos para armar el fixture.</p>
        `}
      </div>
    `}

    <div class="admin-actions wide modal-actions--sticky" style="margin-top:16px;">
      <button type="button" id="close-results-modal-btn" class="button button--cancel">Cerrar</button>
    </div>
  `;

  if (!resultsModal.open) resultsModal.showModal();
}

async function renderResults() {
  const [{ data: categories, error: categoryError }, { data: pairs }, { data: matches }] = await Promise.all([
    sb.from('tournament_categories').select('id,name,tournament_id,tournaments(id,title,status,start_date)').order('name'),
    sb.from('pairs').select('id,category_id,status').eq('status', 'confirmed'),
    sb.from('matches').select('id,category_id,stage,winner_pair_id')
  ]);

  if (categoryError || !categories?.length) {
    app.innerHTML = '<section class="admin-card"><p class="kicker">RESULTADOS</p><h1>Resultados y Fixture</h1><p>Primero creá un torneo y una categoría en la pestaña Torneos.</p></section>';
    return;
  }

  const catRows = categories.map(cat => {
    const catPairs = (pairs || []).filter(p => p.category_id === cat.id);
    const catMatches = (matches || []).filter(m => m.category_id === cat.id);
    const finishedMatches = catMatches.filter(m => m.winner_pair_id);
    const t = cat.tournaments || {};
    const statusLabel = ({draft:'Borrador',open:'Inscripción abierta',in_progress:'En juego',finished:'Finalizado'})[t.status] || t.status || 'Borrador';

    const matchSummary = catMatches.length
      ? `${finishedMatches.length}/${catMatches.length} partidos jugados`
      : 'Sin fixture generado';

    return `
      <article class="admin-row">
        <div>
          <b>${esc(t.title || 'Torneo')} · ${esc(cat.name)}</b>
          <span>${catPairs.length} parejas · ${matchSummary} · <span class="status-badge status-badge--${t.status || 'open'}">${statusLabel}</span></span>
        </div>
        <div class="admin-actions">
          <button class="button button--primary button--small" data-open-results-modal="${cat.id}">
            ${catMatches.length ? 'Cargar Resultados' : 'Armar Fixture'}
          </button>
        </div>
      </article>
    `;
  }).join('');

  app.innerHTML = `
    <section class="admin-card">
      <div class="admin-row" style="margin-bottom:16px;">
        <div>
          <p class="kicker">RESULTADOS Y FIXTURE</p>
          <h2 style="margin:2px 0 0;">Torneos y Categorías</h2>
        </div>
      </div>
      <div id="results-admin-list">
        ${catRows || '<p class="empty-state">Sin torneos todavía.</p>'}
      </div>
    </section>
  `;
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
    pendingMatchResult = null; editingMatchId = ''; resultConfirmDialog?.close();
    if (currentOpenResultsCategoryId) await openResultsModal(currentOpenResultsCategoryId, 'Resultado guardado con éxito.');
    await renderResults();
    return;
  }

  const openResultsBtn = event.target.closest('[data-open-results-modal]');
  if (openResultsBtn) {
    const catId = openResultsBtn.dataset.openResultsModal;
    await openResultsModal(catId);
    return;
  }

  if (event.target.id === 'close-results-modal' || event.target.id === 'close-results-modal-btn') {
    resultsModal.close();
    currentOpenResultsCategoryId = '';
    return;
  }

  const openMatch = event.target.closest('[data-open-match-modal]');
  if (openMatch) {
    const matchId = openMatch.dataset.openMatchModal || openMatch.closest('[data-open-match-modal]')?.dataset.openMatchModal;
    if (matchId) {
      openMatchResultModal(matchId);
      return;
    }
  }

  if (event.target.id === 'close-match-modal' || event.target.id === 'cancel-match-modal') {
    matchModal.close();
    return;
  }

  const clearMatchBtn = event.target.closest('[data-clear-match-result]');
  if (clearMatchBtn) {
    const matchId = clearMatchBtn.dataset.clearMatchResult;
    if (!confirm('¿Limpiar el resultado de este partido y dejarlo pendiente?')) return;
    clearMatchBtn.disabled = true;
    const { error } = await sb.from('matches').update({ score: null, winner_pair_id: null, played_at: null }).eq('id', matchId);
    if (error) alert('No se pudo limpiar el resultado.');
    else {
      matchModal.close();
      if (currentOpenResultsCategoryId) await openResultsModal(currentOpenResultsCategoryId, 'Resultado eliminado.');
      await renderResults();
    }
    return;
  }

  if (event.target.id === 'open-tournament-form') {
    editingTournament = null;
    tournamentModal.innerHTML = tournamentFormModalHtml(null, []);
    tournamentModal.showModal();
    return;
  }
  if (event.target.id === 'close-tournament-modal' || event.target.id === 'cancel-tournament-modal') {
    tournamentModal.close();
    editingTournament = null;
    return;
  }
  if (event.target.id === 'open-pair-form') { showPairForm = true; selectedCategoryIdForPair = ''; await renderPairs(); return; }
  
  if (event.target.id === 'toggle-inline-pair-btn') {
    const container = document.querySelector('#inline-pair-form-container');
    if (container) container.style.display = container.style.display === 'none' ? 'block' : 'none';
    return;
  }
  if (event.target.id === 'cancel-inline-pair-btn') {
    const container = document.querySelector('#inline-pair-form-container');
    if (container) container.style.display = 'none';
    return;
  }

  const assocBtn = event.target.closest('#modal-associate-pair-btn');
  if (assocBtn) {
    const targetCatId = assocBtn.dataset.targetCat;
    const select = document.querySelector('#modal-existing-pair-select');
    const sourcePairId = select?.value;
    if (!sourcePairId) { alert('Seleccioná una pareja existente.'); return; }
    assocBtn.disabled = true;
    const { data: sourcePair } = await sb.from('pairs').select('player_one_alias, player_two_alias, pair_private_data(*)').eq('id', sourcePairId).single();
    if (sourcePair) {
      const { data: targetPairs } = await sb.from('pairs').select('player_one_alias, player_two_alias').eq('category_id', targetCatId);
      const candKey = pairKey(sourcePair.player_one_alias, sourcePair.player_two_alias);
      if ((targetPairs || []).some(p => pairKey(p.player_one_alias, p.player_two_alias) === candKey)) {
        alert('Esta pareja ya está inscripta en este torneo.');
        assocBtn.disabled = false;
        return;
      }
      const { data: newPair, error } = await sb.from('pairs').insert({
        category_id: targetCatId,
        player_one_alias: sourcePair.player_one_alias,
        player_two_alias: sourcePair.player_two_alias,
        status: 'confirmed'
      }).select('id').single();
      
      if (!error && newPair) {
        const pData = Array.isArray(sourcePair.pair_private_data) ? sourcePair.pair_private_data[0] : sourcePair.pair_private_data;
        if (pData) {
          await sb.from('pair_private_data').insert({
            pair_id: newPair.id,
            player_one_first_name: pData.player_one_first_name,
            player_one_last_name: pData.player_one_last_name,
            player_one_dni: pData.player_one_dni,
            player_one_category: pData.player_one_category,
            player_two_first_name: pData.player_two_first_name,
            player_two_last_name: pData.player_two_last_name,
            player_two_dni: pData.player_two_dni,
            player_two_category: pData.player_two_category,
            contact_phone: pData.contact_phone
          });
        }
      }
    }
    await refreshTournamentModalPairs();
    return;
  }

  const editMatch = event.target.closest('[data-edit-match]');
  if (editMatch) { editingMatchId = editMatch.dataset.editMatch; await renderResults(); return; }
  const tab = event.target.closest('[data-tab]');
  if (tab) { active = tab.dataset.tab; editingTournament = null; editingPair = null; showPairForm = false; document.querySelectorAll('.admin-tab').forEach(x => x.classList.toggle('active', x === tab)); await render(); return; }
  if (event.target.id === 'signout') { await sb.auth.signOut(); await render(); return; }
  if (event.target.id === 'cancel-pair') { showPairForm = false; editingPair = null; await renderPairs(); return; }
  
  const te = event.target.closest('[data-edit-tournament]');
  if (te) {
    await openEditTournamentModal(te.dataset.editTournament);
    return;
  }
  
  const pe = event.target.closest('[data-edit-pair]'); if (pe) { editingPair = pairsCache.find(p => p.id === pe.dataset.editPair) || null; showPairForm = true; await renderPairs(); return; }
  const statusButton = event.target.closest('[data-pair-status]'); if (statusButton) { await sb.from('pairs').update({ status: statusButton.dataset.pairStatus }).eq('id', statusButton.dataset.pairId); await renderPairs(); return; }
  const td = event.target.closest('[data-delete-tournament]'); if (td && confirm('¿Eliminar este torneo? También elimina sus categorías y parejas.')) { await sb.from('tournaments').delete().eq('id', td.dataset.deleteTournament); await renderTournaments(); return; }
  
  const closeGen = event.target.closest('[data-close-and-generate]');
  if (closeGen) {
    const tournamentId = closeGen.dataset.closeAndGenerate;
    const t = window.tournamentsCache.find(x => x.id === tournamentId) || editingTournament;
    if (!t || !confirm(`¿Cerrar inscripciones y armar grupos automáticamente para "${t.title}"?`)) return;
    closeGen.disabled = true;
    await sb.from('tournaments').update({ status: 'in_progress' }).eq('id', tournamentId);
    const categories = t.tournament_categories || [];
    for (const cat of categories) {
      const { data: pairs } = await sb.from('pairs').select('id,category_id,player_one_alias,player_two_alias,status').eq('category_id', cat.id).eq('status', 'confirmed');
      if (pairs && pairs.length >= 2) {
        const groupCount = Math.max(1, Math.ceil(pairs.length / 4));
        const groups = window.PadelTournament.createGroups(pairs, groupCount);
        await sb.from('matches').delete().eq('category_id', cat.id);
        await sb.from('groups').delete().eq('category_id', cat.id);
        const { data: createdGroups } = await sb.from('groups').insert(groups.map(g => ({ category_id: cat.id, name: g.name }))).select('id,name');
        if (createdGroups) {
          await Promise.all(groups.flatMap(group => group.pairs.map(pair => sb.from('pairs').update({ group_name: group.name }).eq('id', pair.id))));
          const groupMatches = createdGroups.flatMap(created => {
            const gPairs = groups.find(g => g.name === created.name)?.pairs || [];
            return window.PadelTournament.createRoundRobin(created.id, gPairs);
          });
          if (groupMatches.length) await sb.from('matches').insert(groupMatches);
        }
      }
    }
    await openEditTournamentModal(tournamentId, '¡Inscripciones cerradas y grupos generados con éxito! A continuación podés revisar las zonas y reasignar parejas si lo necesitás.');
    if (active === 'tournaments') await renderTournaments();
    return;
  }

  const addGroupBtn = event.target.closest('[data-modal-add-group]');
  if (addGroupBtn) {
    const catId = addGroupBtn.dataset.modalAddGroup;
    const groupName = prompt('Nombre de la nueva zona o grupo (ej: Zona C):');
    if (groupName && groupName.trim()) {
      addGroupBtn.disabled = true;
      const { error } = await sb.from('groups').insert({ category_id: catId, name: groupName.trim() });
      if (error) alert('No se pudo crear el grupo.');
      else await refreshTournamentModalPairs(`Grupo "${groupName.trim()}" agregado.`);
    }
    return;
  }

  const regenFixtureBtn = event.target.closest('[data-modal-regen-fixture]');
  if (regenFixtureBtn) {
    const catId = regenFixtureBtn.dataset.modalRegenFixture;
    if (!confirm('¿Regenerar grupos y partidos para esta categoría? Las parejas inscriptas se redistribuirán equitativamente.')) return;
    regenFixtureBtn.disabled = true;
    const { data: pairs } = await sb.from('pairs').select('id,category_id,player_one_alias,player_two_alias,status').eq('category_id', catId).eq('status', 'confirmed').order('created_at');
    if (!pairs || pairs.length < 2) { alert('Se necesitan al menos 2 parejas confirmadas.'); regenFixtureBtn.disabled = false; return; }
    const groupCount = Math.max(1, Math.ceil(pairs.length / 4));
    const groups = window.PadelTournament.createGroups(pairs, groupCount);
    await sb.from('matches').delete().eq('category_id', catId);
    await sb.from('groups').delete().eq('category_id', catId);
    const { data: createdGroups } = await sb.from('groups').insert(groups.map(g => ({ category_id: catId, name: g.name }))).select('id,name');
    if (createdGroups) {
      await Promise.all(groups.flatMap(group => group.pairs.map(pair => sb.from('pairs').update({ group_name: group.name }).eq('id', pair.id))));
      const groupMatches = createdGroups.flatMap(created => {
        const gPairs = groups.find(g => g.name === created.name)?.pairs || [];
        return window.PadelTournament.createRoundRobin(created.id, gPairs);
      });
      if (groupMatches.length) await sb.from('matches').insert(groupMatches);
    }
    if (currentOpenResultsCategoryId) await openResultsModal(currentOpenResultsCategoryId, 'Grupos y fixture regenerados.');
    if (editingTournament) await refreshTournamentModalPairs('Grupos y fixture regenerados.');
    if (active === 'results') await renderResults();
    return;
  }

  const genPlayoffsBtn = event.target.closest('[data-modal-generate-playoffs]');
  if (genPlayoffsBtn) {
    const catId = genPlayoffsBtn.dataset.modalGeneratePlayoffs;
    genPlayoffsBtn.disabled = true;
    const [{ data: pairs }, { data: groupMatches }] = await Promise.all([
      sb.from('pairs').select('id,category_id,player_one_alias,player_two_alias,status').eq('category_id', catId).eq('status', 'confirmed').order('created_at'),
      sb.from('matches').select('id,pair_one_id,pair_two_id,score,winner_pair_id').eq('category_id', catId).eq('stage', 'group')
    ]);
    if (!pairs?.length || !groupMatches?.length) {
      alert('Primero generá las zonas y completá partidos para armar playoffs.');
      genPlayoffsBtn.disabled = false;
      return;
    }
    const pending = groupMatches.filter(m => !m.winner_pair_id);
    if (pending.length && !confirm(`Hay ${pending.length} partidos de grupo sin resultado cargado. ¿Generar la llave eliminatoria de todas formas?`)) {
      genPlayoffsBtn.disabled = false;
      return;
    }
    const res = await createPlayoffs(catId, pairs, groupMatches);
    if (res.error) alert(res.error);
    else {
      if (currentOpenResultsCategoryId) await openResultsModal(currentOpenResultsCategoryId, '¡Llave de playoffs generada!');
      if (editingTournament) await refreshTournamentModalPairs('¡Llave de playoffs generada!');
      if (active === 'results') await renderResults();
    }
    return;
  }

  const goToResultsBtn = event.target.closest('[data-go-to-results]');
  if (goToResultsBtn) {
    const catId = goToResultsBtn.dataset.goToResults;
    tournamentModal.close();
    editingTournament = null;
    active = 'results';
    document.querySelectorAll('.admin-tab').forEach(x => x.classList.toggle('active', x.dataset.tab === 'results'));
    await render();
    await openResultsModal(catId);
    return;
  }
  
  const pd = event.target.closest('[data-delete-pair]');
  if (pd && confirm('¿Eliminar esta pareja?')) {
    await sb.from('pairs').delete().eq('id', pd.dataset.deletePair);
    if (editingTournament) {
      await refreshTournamentModalPairs();
    }
    if (active === 'tournaments') await renderTournaments(); else await renderPairs();
  }

  const playerRow = event.target.closest('[data-player-dni]');
  if (playerRow && !event.target.closest('button')) {
    openPlayerDetailsModal(playerRow.dataset.playerDni);
    return;
  }

  const editPlayerBtn = event.target.closest('[data-edit-player]');
  if (editPlayerBtn) {
    openEditPlayerModal(editPlayerBtn.dataset.editPlayer);
    return;
  }
  if (event.target.id === 'close-player-modal' || event.target.id === 'cancel-player-modal') {
    playerModal?.close();
    return;
  }
  const deletePlayerBtn = event.target.closest('[data-delete-player]');
  if (deletePlayerBtn) {
    const dni = deletePlayerBtn.dataset.deletePlayer;
    const pl = playersRegistry.get(dni);
    const name = pl ? `${pl.last}, ${pl.first}` : dni;
    if (!confirm(`¿Eliminar a ${name} (DNI ${dni}) del padrón de jugadoras?`)) return;
    deletePlayerBtn.disabled = true;
    playersRegistry.delete(dni);
    await sb.from('players').delete().eq('dni', dni);
    playerModal?.close();
    await renderPairs();
    return;
  }
});

function handleDniAutocomplete(input) {
  const form = input.closest('form');
  if (!form) return;
  const isP1 = input.name === 'p1dni';
  const prefix = isP1 ? 'p1' : 'p2';
  const dni = String(input.value || '').trim();
  const hintEl = form.querySelector(`[data-lookup-hint="${prefix}"]`);
  
  if (!dni || dni.length < 5) {
    if (hintEl) hintEl.innerHTML = '';
    return;
  }
  
  const found = playersRegistry.get(dni);
  if (found) {
    const fFirst = form.querySelector(`[name="${prefix}first"]`);
    const fLast = form.querySelector(`[name="${prefix}last"]`);
    const fAlias = form.querySelector(`[name="${prefix}alias"]`);
    const fCat = form.querySelector(`[name="${prefix}category"]`);
    const fPhone = form.querySelector('[name="phone"]');

    if (fFirst && (!fFirst.value || fFirst.value !== found.first)) fFirst.value = found.first;
    if (fLast && (!fLast.value || fLast.value !== found.last)) fLast.value = found.last;
    if (fAlias && (!fAlias.value || fAlias.value !== found.alias)) fAlias.value = found.alias;
    if (fCat && (!fCat.value || fCat.value !== found.category)) fCat.value = found.category;
    if (fPhone && !fPhone.value && found.phone) fPhone.value = found.phone;

    if (hintEl) {
      hintEl.innerHTML = `<span class="player-found-badge">✓ Encontrada: ${esc(found.last)}, ${esc(found.first)} (${esc(found.alias || '-')})</span>`;
    }
  } else {
    if (hintEl) {
      hintEl.innerHTML = dni.length >= 7 ? '<span style="color:var(--muted); font-size:11px;">Jugadora nueva (se registrará al guardar).</span>' : '';
    }
  }
}

document.addEventListener('input', event => {
  if (event.target.name === 'p1dni' || event.target.name === 'p2dni') {
    handleDniAutocomplete(event.target);
  }
  if (event.target.id === 'players-registry-search') {
    const query = event.target.value.toLowerCase().trim();
    const rows = document.querySelectorAll('#players-registry-tbody tr');
    rows.forEach(tr => {
      const text = tr.textContent.toLowerCase();
      tr.style.display = text.includes(query) ? '' : 'none';
    });
  }
});

document.addEventListener('change', async event => {
  if (event.target.name === 'p1dni' || event.target.name === 'p2dni') {
    handleDniAutocomplete(event.target);
  }
  const reassignSelect = event.target.closest('[data-reassign-group-pair]');
  if (reassignSelect) {
    const pairId = reassignSelect.dataset.reassignGroupPair;
    const catId = reassignSelect.dataset.categoryId;
    const newGroupName = reassignSelect.value;
    reassignSelect.disabled = true;

    await sb.from('pairs').update({ group_name: newGroupName || null }).eq('id', pairId);

    const [{ data: catPairs }, { data: catGroups }] = await Promise.all([
      sb.from('pairs').select('id,category_id,player_one_alias,player_two_alias,status,group_name').eq('category_id', catId).eq('status', 'confirmed'),
      sb.from('groups').select('id,name').eq('category_id', catId)
    ]);

    await sb.from('matches').delete().eq('category_id', catId).eq('stage', 'group');
    if (catGroups && catPairs) {
      const newFixtures = catGroups.flatMap(cg => {
        const gPairs = catPairs.filter(p => p.group_name === cg.name);
        return window.PadelTournament.createRoundRobin(cg.id, gPairs);
      });
      if (newFixtures.length) await sb.from('matches').insert(newFixtures);
    }

    await refreshTournamentModalPairs(`Pareja asignada a ${newGroupName || 'sin zona'} y fixture actualizado.`);
  }
});

document.addEventListener('submit', async event => {
  if (event.target.id === 'results-category-form') { event.preventDefault(); selectedResultsCategoryId = new FormData(event.target).get('categoryId'); await renderResults(); return; }
  
  if (event.target.id === 'modal-inline-pair-form') {
    event.preventDefault();
    const form = event.target;
    const d = Object.fromEntries(new FormData(form));
    const msg = form.querySelector('.form-message');
    if (invalidNumbers(d).length) { msg.textContent = 'DNI y teléfono solo admiten números.'; return; }
    
    const candKey = pairKey(d.p1alias, d.p2alias);
    const { data: targetPairs } = await sb.from('pairs').select('player_one_alias, player_two_alias').eq('category_id', d.categoryId);
    if ((targetPairs || []).some(p => pairKey(p.player_one_alias, p.player_two_alias) === candKey)) {
      msg.textContent = 'Esta pareja ya está inscripta en este torneo.';
      return;
    }
    
    const { data: newPair, error } = await sb.from('pairs').insert({
      category_id: d.categoryId,
      player_one_alias: d.p1alias.trim(),
      player_two_alias: d.p2alias.trim(),
      status: d.status || 'confirmed'
    }).select('id').single();
    
    if (error || !newPair) { msg.textContent = 'Error al registrar la pareja.'; return; }
    
    await sb.from('pair_private_data').insert({
      pair_id: newPair.id,
      player_one_first_name: d.p1first.trim(),
      player_one_last_name: d.p1last.trim(),
      player_one_dni: d.p1dni,
      player_one_category: d.p1category.trim(),
      player_two_first_name: d.p2first.trim(),
      player_two_last_name: d.p2last.trim(),
      player_two_dni: d.p2dni,
      player_two_category: d.p2category.trim(),
      contact_phone: d.phone
    });
    
    playersRegistry.set(String(d.p1dni).trim(), {
      dni: String(d.p1dni).trim(),
      first: d.p1first.trim(),
      last: d.p1last.trim(),
      alias: d.p1alias.trim(),
      category: d.p1category.trim(),
      phone: d.phone,
      count: (playersRegistry.get(String(d.p1dni).trim())?.count || 0) + 1
    });
    playersRegistry.set(String(d.p2dni).trim(), {
      dni: String(d.p2dni).trim(),
      first: d.p2first.trim(),
      last: d.p2last.trim(),
      alias: d.p2alias.trim(),
      category: d.p2category.trim(),
      phone: d.phone,
      count: (playersRegistry.get(String(d.p2dni).trim())?.count || 0) + 1
    });

    await refreshTournamentModalPairs();
    return;
  }

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
    if (result.error) {
      const msg = form.querySelector('.form-message');
      if (msg) msg.textContent = result.error; else alert(result.error);
      return;
    }
    const winnerId = result.winnerIndex === 1 ? form.dataset.pairOneId : form.dataset.pairTwoId;
    pendingMatchResult = { matchId, winnerId, score: result.score };
    const pairOneWon = result.winnerIndex === 1;
    const winnerLabel = pairOneWon ? form.dataset.pairOneLabel : form.dataset.pairTwoLabel;
    const loserLabel = pairOneWon ? form.dataset.pairTwoLabel : form.dataset.pairOneLabel;
    const displayScore = result.score.split(',').map(set => set.trim().split('-')).map(([first, second]) => pairOneWon ? `${first}-${second}` : `${second}-${first}`).join(' | ');
    matchModal?.close();
    resultConfirmDialog?.querySelector('h2')?.replaceChildren('¿Confirmás el resultado?');
    if (resultConfirmDetails) resultConfirmDetails.innerHTML = `<span>${esc(winnerLabel)} vence a ${esc(loserLabel)}</span><strong>${esc(displayScore)}</strong>`;
    resultConfirmDialog?.showModal(); return;
  }
  if (event.target.id === 'login') { event.preventDefault(); const d = Object.fromEntries(new FormData(event.target)); const { error } = await sb.auth.signInWithPassword({ email:d.email, password:d.password }); event.target.querySelector('.form-message').textContent = error ? 'Credenciales inválidas.' : ''; if (!error) await render(); return; }
  if (event.target.id === 'tournament-form') { event.preventDefault(); const form = event.target; const d = Object.fromEntries(new FormData(form)); const msg = form.querySelector('.form-message'); if (d.endDate < d.startDate) { msg.textContent = 'El cierre no puede ser anterior al inicio.'; return; } if (d.registrationCloseDate && d.registrationCloseDate > d.startDate) { msg.textContent = 'El cierre de inscripciones debe ser el día de inicio o anterior.'; return; } if (!numeric(d.whatsapp)) { msg.textContent = 'WhatsApp solo admite números.'; return; }
    const phaseRows = [['group','round_of_32','round_of_16','quarter_final','semi_final','final'].map(stage => ({ stage, start_date:d[`${stage}Start`], end_date:d[`${stage}End`] }))][0]; const incompletePhase = phaseRows.find(phase => Boolean(phase.start_date) !== Boolean(phase.end_date) || (phase.start_date && phase.end_date < phase.start_date)); if (incompletePhase) { msg.textContent = 'Cada fase debe tener ambas fechas y un rango válido.'; return; }
    const values = { title:d.title.trim(), location:d.location.trim(), start_date:d.startDate, end_date:d.endDate, registration_close_date:d.registrationCloseDate || null, registration_price:d.price || null, whatsapp_number:d.whatsapp, status:d.status, description:d.description.trim() };
    let result; if (editingTournament) result = await sb.from('tournaments').update(values).eq('id', editingTournament.id).select('id').single(); else result = await sb.from('tournaments').insert(values).select('id').single();
    if (result.error) { msg.textContent = 'No se pudo guardar el torneo.'; return; }
    const categoryName = d.category.trim(); if (!editingTournament) { await sb.from('tournament_categories').insert({ tournament_id:result.data.id, name:categoryName }); } else { const existing = editingTournament.tournament_categories?.[0]; if (existing) await sb.from('tournament_categories').update({ name:categoryName }).eq('id', existing.id); else await sb.from('tournament_categories').insert({ tournament_id:result.data.id, name:categoryName }); }
    await sb.from('tournament_phase_dates').delete().eq('tournament_id', result.data.id); const scheduled = phaseRows.filter(phase => phase.start_date).map(phase => ({ ...phase, tournament_id:result.data.id })); if (scheduled.length) { const { error: scheduleError } = await sb.from('tournament_phase_dates').insert(scheduled); if (scheduleError) { msg.textContent = 'El torneo se guardó, pero no las fechas de fases.'; return; } }
    tournamentModal.close(); editingTournament = null; await renderTournaments(); return;
  }
  if (event.target.id === 'pair-form') { event.preventDefault(); const form = event.target; const d = Object.fromEntries(new FormData(form)); const msg = form.querySelector('.form-message'); if (invalidNumbers(d).length) { msg.textContent = 'DNI y teléfono solo admiten números.'; return; }
    if (!editingPair) {
      const candKey = pairKey(d.p1alias, d.p2alias);
      const { data: targetPairs } = await sb.from('pairs').select('player_one_alias, player_two_alias').eq('category_id', d.categoryId);
      if ((targetPairs || []).some(p => pairKey(p.player_one_alias, p.player_two_alias) === candKey)) {
        msg.textContent = 'Esta pareja ya está inscripta en esta categoría.';
        return;
      }
    }
    const pairValues = { category_id:d.categoryId, player_one_alias:d.p1alias.trim(), player_two_alias:d.p2alias.trim(), status:d.status };
    let pairId = editingPair?.id; let error;
    if (pairId) ({ error } = await sb.from('pairs').update(pairValues).eq('id', pairId)); else { const result = await sb.from('pairs').insert(pairValues).select('id').single(); error = result.error; pairId = result.data?.id; }
    if (error || !pairId) { msg.textContent = 'No se pudo guardar la pareja.'; return; }
    const privateValues = { pair_id:pairId, player_one_first_name:d.p1first.trim(), player_one_last_name:d.p1last.trim(), player_one_dni:d.p1dni, player_one_category:d.p1category.trim(), player_two_first_name:d.p2first.trim(), player_two_last_name:d.p2last.trim(), player_two_dni:d.p2dni, player_two_category:d.p2category.trim(), contact_phone:d.phone };
    const privateResult = await sb.from('pair_private_data').upsert(privateValues, { onConflict:'pair_id' }); if (privateResult.error) { msg.textContent = 'La pareja se guardó, pero faltan datos privados. Reintentá editarla.'; return; }
    playersRegistry.set(String(d.p1dni).trim(), {
      dni: String(d.p1dni).trim(),
      first: d.p1first.trim(),
      last: d.p1last.trim(),
      alias: d.p1alias.trim(),
      category: d.p1category.trim(),
      phone: d.phone,
      count: (playersRegistry.get(String(d.p1dni).trim())?.count || 0) + 1
    });
    playersRegistry.set(String(d.p2dni).trim(), {
      dni: String(d.p2dni).trim(),
      first: d.p2first.trim(),
      last: d.p2last.trim(),
      alias: d.p2alias.trim(),
      category: d.p2category.trim(),
      phone: d.phone,
      count: (playersRegistry.get(String(d.p2dni).trim())?.count || 0) + 1
    });
    showPairForm = false; editingPair = null; await renderPairs();
  }

  if (event.target.id === 'edit-player-form') {
    event.preventDefault();
    const form = event.target;
    const d = Object.fromEntries(new FormData(form));
    const msg = form.querySelector('.form-message');
    if (!numeric(d.dni) || (d.phone && !numeric(d.phone))) {
      msg.textContent = 'DNI y teléfono solo admiten números.';
      return;
    }
    const oldDni = d.oldDni;
    const newDni = d.dni.trim();
    if (newDni !== oldDni && playersRegistry.has(newDni)) {
      msg.textContent = 'Ya existe otra jugadora con ese DNI en el padrón.';
      return;
    }

    const prev = playersRegistry.get(oldDni) || {};
    const updatedPlayer = {
      dni: newDni,
      first: d.firstName.trim(),
      last: d.lastName.trim(),
      alias: d.alias.trim(),
      category: d.category.trim(),
      phone: d.phone ? d.phone.trim() : '',
      count: prev.count || 1
    };

    if (newDni !== oldDni) {
      playersRegistry.delete(oldDni);
    }
    playersRegistry.set(newDni, updatedPlayer);

    await sb.from('players').upsert({
      dni: newDni,
      first_name: updatedPlayer.first,
      last_name: updatedPlayer.last,
      alias: updatedPlayer.alias,
      category: updatedPlayer.category,
      phone: updatedPlayer.phone || null
    }, { onConflict: 'dni' });

    await Promise.all([
      sb.from('pair_private_data').update({
        player_one_first_name: updatedPlayer.first,
        player_one_last_name: updatedPlayer.last,
        player_one_category: updatedPlayer.category,
        contact_phone: updatedPlayer.phone,
        player_one_dni: newDni
      }).eq('player_one_dni', oldDni),
      sb.from('pair_private_data').update({
        player_two_first_name: updatedPlayer.first,
        player_two_last_name: updatedPlayer.last,
        player_two_category: updatedPlayer.category,
        player_two_dni: newDni
      }).eq('player_two_dni', oldDni)
    ]);

    playerModal?.close();
    await renderPairs();
  }
});
render();

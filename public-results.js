(function () {
  const sb = window.supabase.createClient('https://scdgdfxkvkgqueeozznd.supabase.co', 'sb_publishable_UgQh8Fq2C-ydgDCPSbii6A_J5Eqoia1');
  const esc = (value = '') => String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const label = pair => `${pair.player_one_alias} / ${pair.player_two_alias}`;
  const signed = value => value > 0 ? `+${value}` : String(value);
  const formatRange = (start, end) => {
    const shortDate = value => { const [, month, day] = String(value || '').split('-'); return month && day ? `${day}/${month}` : ''; };
    return `${shortDate(start)} - ${shortDate(end)}`;
  };
  const addDetailNavigation = () => {
    const title = document.querySelector('#dialog-title');
    document.querySelector('.tournament-subnav')?.remove();
    if (!title) return;
    title.insertAdjacentHTML('afterend', '<nav class="tournament-subnav" aria-label="Secciones del torneo"><button type="button" data-detail-page="tournament-summary" aria-controls="tournament-summary">Resumen</button><button type="button" data-detail-page="tournament-groups" aria-controls="tournament-groups">Fixture</button><button type="button" data-detail-page="tournament-results" aria-controls="tournament-results">Resultados</button><button type="button" data-detail-page="tournament-pairs" aria-controls="tournament-pairs">Parejas</button></nav>');
    const pages = document.querySelector('#detail-pages');
    const nav = document.querySelector('.tournament-subnav');
    const showPage = id => {
      pages.querySelectorAll(':scope > section[id]').forEach(section => { section.hidden = section.id !== id; });
      nav.querySelectorAll('[data-detail-page]').forEach(button => { const active = button.dataset.detailPage === id; button.classList.toggle('is-active', active); button.setAttribute('aria-current', active ? 'page' : 'false'); });
      pages.scrollTop = 0;
    };
    nav.addEventListener('click', event => { const button = event.target.closest('[data-detail-page]'); if (button && pages.querySelector(`#${button.dataset.detailPage}`)) showPage(button.dataset.detailPage); });
    showPage('tournament-summary');
  };

  async function applyPublicRules(tournamentId) {
    const { data } = await sb.from('tournaments').select('start_date,end_date,status').eq('id', tournamentId).maybeSingle();
    if (!data) return;
    const pages = document.querySelector('#detail-pages');
    const dateTitle = pages.querySelector('section h3');
    if (dateTitle) dateTitle.textContent = formatRange(data.start_date, data.end_date);
    const registration = pages.querySelector(`[data-register="${tournamentId}"]`);
    if (registration && data.status !== 'open') {
      const message = document.createElement('p');
      message.className = 'public-status';
      message.textContent = data.status === 'finished' ? 'El torneo ha finalizado.' : data.status === 'in_progress' ? 'Las inscripciones están cerradas: el torneo ya comenzó.' : 'Las inscripciones para este torneo están cerradas.';
      registration.replaceWith(message);
    }
  }

  async function appendResults(tournamentId) {
    const pages = document.querySelector('#detail-pages');
    const { data: categories, error } = await sb.from('tournament_categories').select('id,name').eq('tournament_id', tournamentId).order('name');
    if (error || !categories?.length) return;
    const title = document.querySelector('#dialog-title');
    if (title && !title.dataset.baseTitle) title.dataset.baseTitle = title.textContent || '';
    if (title) title.textContent = `${title.dataset.baseTitle} (${categories.map(category => category.name).join(' · ')})`;
    let hasPublishedGroups = false;
    const sections = await Promise.all(categories.map(async category => {
      const [{ data: pairs }, { data: groups }, { data: matches }] = await Promise.all([
        sb.from('pairs').select('id,player_one_alias,player_two_alias,group_name').eq('category_id', category.id).eq('status', 'confirmed'),
        sb.from('groups').select('id,name').eq('category_id', category.id).order('name'),
        sb.from('matches').select('group_id,pair_one_id,pair_two_id,score,winner_pair_id').eq('category_id', category.id).eq('stage', 'group')
      ]);
      if (!groups?.length) return `<section data-public-results="true"><small>03 · RESULTADOS</small><p>Fixture próximo a publicarse.</p></section>`;
      hasPublishedGroups = true;
      const pairMap = new Map((pairs || []).map(pair => [pair.id, pair]));
      const groupCards = groups.map(group => {
        const groupPairs = (pairs || []).filter(pair => pair.group_name === group.name);
        const groupMatches = (matches || []).filter(match => match.group_id === group.id);
        const rows = window.PadelTournament.buildStandings(groupPairs, groupMatches);
        const table = rows.map((row, index) => `<tr><td>${index + 1}</td><td>${esc(row.label)}</td><td>${row.played}</td><td>${row.won}</td><td>${row.lost}</td><td>${signed(row.setsWon - row.setsLost)}</td><td>${signed(row.gamesWon - row.gamesLost)}</td><td>${row.points}</td></tr>`).join('');
        const played = groupMatches.filter(match => match.winner_pair_id).map(match => {
          const pairOneWon = match.winner_pair_id === match.pair_one_id;
          const winner = pairMap.get(pairOneWon ? match.pair_one_id : match.pair_two_id) || {};
          const loser = pairMap.get(pairOneWon ? match.pair_two_id : match.pair_one_id) || {};
          const sets = String(match.score || '').split(',').map(set => set.trim()).filter(Boolean).map(set => `<span class="match-set ${pairOneWon === (Number(set.split('-')[0]) > Number(set.split('-')[1])) ? 'match-set--won' : 'match-set--lost'}">${esc(pairOneWon ? set : set.split('-').reverse().join('-'))}</span>`).join('<i aria-hidden="true">|</i>');
          return `<li><span class="match-results__teams">${esc(label(winner))} <b>a</b> ${esc(label(loser))}</span><strong class="match-results__sets">${sets}</strong></li>`;
        }).join('');
        return `<details class="public-fixture-group"><summary>${esc(group.name)}</summary><div class="public-table-wrap"><table><thead><tr><th>#</th><th>Pareja</th><th>PJ</th><th>G</th><th>P</th><th>DS</th><th>DG</th><th>Pts</th></tr></thead><tbody>${table}</tbody></table></div><div class="fixture-results"><h4>Partidos y resultados</h4>${played ? `<ul class="match-results">${played}</ul>` : '<p>Partidos pendientes.</p>'}</div></details>`;
      }).join('');
      const resultsCards = groups.map(group => {
        const groupMatches = (matches || []).filter(match => match.group_id === group.id && match.winner_pair_id);
        const played = groupMatches.map(match => {
          const pairOneWonMatch = match.winner_pair_id === match.pair_one_id;
          const winner = pairMap.get(pairOneWonMatch ? match.pair_one_id : match.pair_two_id) || {};
          const loser = pairMap.get(pairOneWonMatch ? match.pair_two_id : match.pair_one_id) || {};
          const sets = String(match.score || '').split(',').map(set => set.trim()).filter(Boolean).map(set => {
            const values = set.match(/^(\d+)\s*-\s*(\d+)$/); if (!values) return `<span class="match-set">${esc(set)}</span>`;
            const first = Number(values[1]); const second = Number(values[2]);
            const display = pairOneWonMatch ? `${first}-${second}` : `${second}-${first}`;
            return `<span class="match-set ${first === second ? '' : (Number(display.split('-')[0]) > Number(display.split('-')[1]) ? 'match-set--won' : 'match-set--lost')}">${esc(display)}</span>`;
          }).join('<i aria-hidden="true">|</i>');
          return `<li><span class="match-results__teams">${esc(label(winner))} <b>a</b> ${esc(label(loser))}</span><strong class="match-results__sets">${sets || 'Resultado'}</strong></li>`;
        }).join('');
        return `<details class="public-result-group"><summary>${esc(group.name)}</summary>${played ? `<ul class="match-results">${played}</ul>` : '<p>Partidos pendientes.</p>'}</details>`;
      }).join('');
      return `<section data-public-results="true" id="tournament-groups"><small>02 · FIXTURE</small>${groupCards}</section><section data-public-results="true" id="tournament-results"><small>03 · RESULTADOS</small><p>Los resultados de grupos se consultan dentro del fixture.</p></section>`;
    }));
    const categoryIds = categories.map(category => category.id);
    const [{ data: enrolledPairs }, { data: playoffMatches }] = await Promise.all([
      sb.from('pairs').select('id,player_one_alias,player_two_alias,tournament_categories(name)').in('category_id', categoryIds).eq('status', 'confirmed').order('created_at'),
      sb.from('matches').select('id,stage,bracket_position,pair_one_id,pair_two_id,score,winner_pair_id,source_pair_one_match_id,source_pair_two_match_id').in('category_id', categoryIds).neq('stage', 'group').order('bracket_position')
    ]);
    const playoffPairMap = new Map((enrolledPairs || []).map(pair => [pair.id, pair]));
    const finals = (playoffMatches || []).filter(match => match.stage === 'final' && match.winner_pair_id);
    const championsMarkup = finals.length ? `<div class="tournament-champions champions-summary"><small>POSICIONES FINALES</small>${finals.map(match => { const runnerUpId = match.winner_pair_id === match.pair_one_id ? match.pair_two_id : match.pair_one_id; return `<div><p><b>🥇 Primer puesto</b>${esc(label(playoffPairMap.get(match.winner_pair_id) || {}))}</p><p><b>🥈 Segundo puesto</b>${esc(label(playoffPairMap.get(runnerUpId) || {}))}</p></div>`; }).join('')}</div>` : '';
    const playoffContent = (playoffMatches || []).length ? `<div class="playoff-results"><small>PLAYOFFS</small>${['round_of_16','quarter_final','semi_final','final'].map(stage => {
      const matches = (playoffMatches || []).filter(match => match.stage === stage); if (!matches.length) return '';
      const roundName = window.PadelTournament.playoffStageLabel(stage);
      const position = (match, index) => Number.isInteger(match.bracket_position) ? match.bracket_position : index + 1;
      const sourceLabel = sourceId => { const sourceIndex = (playoffMatches || []).findIndex(match => match.id === sourceId); const source = (playoffMatches || [])[sourceIndex]; const shortName = { round_of_16: 'Octavos', quarter_final: 'Cuartos', semi_final: 'Semis', final: 'Final' }[source?.stage]; return source ? `${shortName} ${position(source, sourceIndex)}` : 'Pendiente'; };
      const entrant = (pairId, sourceId) => pairId ? label(playoffPairMap.get(pairId) || {}) : sourceId ? sourceLabel(sourceId) : 'Pendiente';
      return `<details class="public-playoff-round"><summary>${roundName}</summary>${matches.map((match, index) => `<div class="public-playoff-match"><small>${roundName} ${position(match, index)}</small><p class="match-results__teams">${esc(entrant(match.pair_one_id, match.source_pair_one_match_id))} <b>a</b> ${esc(entrant(match.pair_two_id, match.source_pair_two_match_id))}</p><strong>${esc(match.score ? String(match.score).replace(/,\s*/g, ' | ') : 'Pendiente')}</strong></div>`).join('')}</details>`;
    }).join('')}</div>` : '';
    const pairsSection = `<section data-public-results="true" id="tournament-pairs"><small>05 · PAREJAS INSCRIPTAS</small>${enrolledPairs?.length ? `<ul class="pairs-list public-pairs-list">${enrolledPairs.map(pair => `<li><span>${esc(pair.tournament_categories?.name || '')}</span>${esc(label(pair))}</li>`).join('')}</ul>` : '<p>Aún no hay parejas confirmadas.</p>'}</section>`;
    pages.querySelectorAll('[data-public-results]').forEach(node => node.remove());
    pages.querySelector('[data-results-placeholder]')?.remove();
    const summarySection = pages.querySelector('section:first-child');
    if (summarySection) { summarySection.id = 'tournament-summary'; summarySection.querySelector('.champions-summary')?.remove(); if (championsMarkup) summarySection.insertAdjacentHTML('beforeend', championsMarkup); summarySection.insertAdjacentHTML('afterend', `${sections.join('')}${pairsSection}`); if (playoffContent) pages.querySelector('#tournament-results')?.insertAdjacentHTML('beforeend', playoffContent); }
    addDetailNavigation();
    if (hasPublishedGroups) {
      pages.querySelector(`[data-register="${tournamentId}"]`)?.remove();
      const summary = pages.querySelector('section:first-child p');
      if (summary) summary.innerHTML = summary.innerHTML.replace(/<br><b>Valor:<\/b>[^<]*/, '');
    }
  }

  const tournamentList = document.querySelector('#tournament-list');
  tournamentList.addEventListener('click', event => {
    const button = event.target.closest('[data-id]');
    if (button) {
      applyPublicRules(button.dataset.id); appendResults(button.dataset.id);
    }
  });
}());

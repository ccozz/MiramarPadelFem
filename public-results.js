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

    const categoryIds = categories.map(category => category.id);
    const [catData, enrolledPairsRes, playoffMatchesRes] = await Promise.all([
      Promise.all(categories.map(async category => {
        const [{ data: pairs }, { data: groups }, { data: matches }] = await Promise.all([
          sb.from('pairs').select('id,player_one_alias,player_two_alias,group_name').eq('category_id', category.id).eq('status', 'confirmed'),
          sb.from('groups').select('id,name').eq('category_id', category.id).order('name'),
          sb.from('matches').select('id,group_id,pair_one_id,pair_two_id,score,winner_pair_id,stage').eq('category_id', category.id).eq('stage', 'group')
        ]);
        return { category, pairs: pairs || [], groups: groups || [], matches: matches || [] };
      })),
      sb.from('pairs').select('id,player_one_alias,player_two_alias,tournament_categories(name)').in('category_id', categoryIds).eq('status', 'confirmed').order('created_at'),
      sb.from('matches').select('id,stage,bracket_position,pair_one_id,pair_two_id,score,winner_pair_id,source_pair_one_match_id,source_pair_two_match_id').in('category_id', categoryIds).neq('stage', 'group').order('bracket_position')
    ]);

    const enrolledPairs = enrolledPairsRes.data || [];
    const playoffMatches = playoffMatchesRes.data || [];
    const playoffPairMap = new Map(enrolledPairs.map(pair => [pair.id, pair]));

    let hasPublishedGroups = false;
    let fixtureContent = '';
    let groupResultsContent = '';
    const multipleCats = categories.length > 1;

    catData.forEach(({ category, pairs, groups, matches }) => {
      if (!groups.length) return;
      hasPublishedGroups = true;
      const pairMap = new Map(pairs.map(pair => [pair.id, pair]));
      const catHeader = multipleCats ? `<h4>${esc(category.name)}</h4>` : '';

      const groupCards = groups.map(group => {
        const groupPairs = pairs.filter(pair => pair.group_name === group.name);
        const groupMatches = matches.filter(match => match.group_id === group.id);
        const rows = window.PadelTournament.buildStandings(groupPairs, groupMatches);
        const table = rows.map((row, index) => `<tr><td>${index + 1}</td><td>${esc(row.label)}</td><td>${row.played}</td><td>${row.won}</td><td>${row.lost}</td><td>${signed(row.setsWon - row.setsLost)}</td><td>${signed(row.gamesWon - row.gamesLost)}</td><td>${row.points}</td></tr>`).join('');

        const matchItems = groupMatches.map(match => {
          const p1 = pairMap.get(match.pair_one_id);
          const p2 = pairMap.get(match.pair_two_id);
          const p1Label = p1 ? label(p1) : 'Pareja 1';
          const p2Label = p2 ? label(p2) : 'Pareja 2';
          if (match.winner_pair_id) {
            const pairOneWon = match.winner_pair_id === match.pair_one_id;
            const winner = pairOneWon ? p1Label : p2Label;
            const loser = pairOneWon ? p2Label : p1Label;
            const sets = String(match.score || '').split(',').map(set => set.trim()).filter(Boolean).map(set => `<span class="match-set ${pairOneWon === (Number(set.split('-')[0]) > Number(set.split('-')[1])) ? 'match-set--won' : 'match-set--lost'}">${esc(pairOneWon ? set : set.split('-').reverse().join('-'))}</span>`).join('<i aria-hidden="true">|</i>');
            return `<li><span class="match-results__teams">${esc(winner)} <b>a</b> ${esc(loser)}</span><strong class="match-results__sets">${sets || 'Victoria'}</strong></li>`;
          } else {
            return `<li><span class="match-results__teams">${esc(p1Label)} <b>vs</b> ${esc(p2Label)}</span><strong class="match-results__sets" style="background:color-mix(in srgb,var(--muted) 12%,var(--paper));color:var(--muted);padding:3px 6px;border-radius:4px;font-size:11px">Pendiente</strong></li>`;
          }
        }).join('');

        return `<details class="public-fixture-group" open><summary>${esc(group.name)}</summary><div class="public-table-wrap"><table><thead><tr><th>#</th><th>Pareja</th><th>PJ</th><th>G</th><th>P</th><th>DS</th><th>DG</th><th>Pts</th></tr></thead><tbody>${table}</tbody></table></div><div class="fixture-results"><h4>Partidos</h4>${matchItems ? `<ul class="match-results">${matchItems}</ul>` : '<p>Partidos pendientes.</p>'}</div></details>`;
      }).join('');

      const resultsCards = groups.map(group => {
        const playedMatches = matches.filter(match => match.group_id === group.id && match.winner_pair_id);
        if (!playedMatches.length) return '';
        const played = playedMatches.map(match => {
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
        return `<details class="public-result-group" open><summary>${esc(group.name)}</summary><ul class="match-results">${played}</ul></details>`;
      }).filter(Boolean).join('');

      fixtureContent += `${catHeader}${groupCards}`;
      if (resultsCards) groupResultsContent += `${catHeader}${resultsCards}`;
    });

    const finals = playoffMatches.filter(match => match.stage === 'final' && match.winner_pair_id);
    const championsMarkup = finals.length ? `<div class="tournament-champions champions-summary"><small>POSICIONES FINALES</small>${finals.map(match => { const runnerUpId = match.winner_pair_id === match.pair_one_id ? match.pair_two_id : match.pair_one_id; return `<div><p><b>🥇 Primer puesto</b>${esc(label(playoffPairMap.get(match.winner_pair_id) || {}))}</p><p><b>🥈 Segundo puesto</b>${esc(label(playoffPairMap.get(runnerUpId) || {}))}</p></div>`; }).join('')}</div>` : '';

    const playoffContent = playoffMatches.length ? `<div class="playoff-results"><small>PLAYOFFS</small>${['round_of_16','quarter_final','semi_final','final'].map(stage => {
      const stageMatches = playoffMatches.filter(match => match.stage === stage); if (!stageMatches.length) return '';
      const roundName = window.PadelTournament.playoffStageLabel(stage);
      const position = (match, index) => Number.isInteger(match.bracket_position) ? match.bracket_position : index + 1;
      const sourceLabel = sourceId => { const sourceIndex = playoffMatches.findIndex(match => match.id === sourceId); const source = playoffMatches[sourceIndex]; const shortName = { round_of_16: 'Octavos', quarter_final: 'Cuartos', semi_final: 'Semis', final: 'Final' }[source?.stage]; return source ? `${shortName} ${position(source, sourceIndex)}` : 'Pendiente'; };
      const entrant = (pairId, sourceId) => pairId ? label(playoffPairMap.get(pairId) || {}) : sourceId ? sourceLabel(sourceId) : 'Pendiente';
      return `<details class="public-playoff-round" open><summary>${roundName}</summary>${stageMatches.map((match, index) => `<div class="public-playoff-match"><small>${roundName} ${position(match, index)}</small><p class="match-results__teams">${esc(entrant(match.pair_one_id, match.source_pair_one_match_id))} <b>a</b> ${esc(entrant(match.pair_two_id, match.source_pair_two_match_id))}</p><strong>${esc(match.score ? String(match.score).replace(/,\s*/g, ' | ') : 'Pendiente')}</strong></div>`).join('')}</details>`;
    }).join('')}</div>` : '';

    const fixtureSection = `<section data-public-results="true" id="tournament-groups"><small>02 · FIXTURE</small>${hasPublishedGroups ? fixtureContent : '<p>El fixture se publicará al cerrar las inscripciones.</p>'}</section>`;

    const resultsBody = (championsMarkup || groupResultsContent || playoffContent) ? `${championsMarkup}${groupResultsContent}${playoffContent}` : '<p>Los resultados se publicarán cuando comience el torneo.</p>';
    const resultsSection = `<section data-public-results="true" id="tournament-results"><small>03 · RESULTADOS</small>${resultsBody}</section>`;

    const pairsSection = `<section data-public-results="true" id="tournament-pairs"><small>04 · PAREJAS INSCRIPTAS</small>${enrolledPairs.length ? `<ul class="pairs-list public-pairs-list">${enrolledPairs.map(pair => `<li><span>${esc(pair.tournament_categories?.name || '')}</span>${esc(label(pair))}</li>`).join('')}</ul>` : '<p>Aún no hay parejas confirmadas.</p>'}</section>`;

    pages.querySelectorAll('[data-public-results]').forEach(node => node.remove());
    pages.querySelector('[data-results-placeholder]')?.remove();

    const summarySection = pages.querySelector('section:first-child');
    if (summarySection) {
      summarySection.id = 'tournament-summary';
      summarySection.querySelector('.champions-summary')?.remove();
      if (championsMarkup) summarySection.insertAdjacentHTML('beforeend', championsMarkup);
      summarySection.insertAdjacentHTML('afterend', `${fixtureSection}${resultsSection}${pairsSection}`);
    }

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

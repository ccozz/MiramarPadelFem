(function () {
  const shuffle = (items) => {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[target]] = [copy[target], copy[index]];
    }
    return copy;
  };

  const createGroups = (pairs, requestedCount) => {
    const count = Math.max(1, Math.min(Number(requestedCount) || 1, pairs.length));
    return shuffle(pairs).reduce((groups, pair, index) => {
      groups[index % count].pairs.push(pair);
      return groups;
    }, Array.from({ length: count }, (_, index) => ({ name: `Grupo ${String.fromCharCode(65 + index)}`, pairs: [] })));
  };

  const createRoundRobin = (groupId, pairs) => pairs.flatMap((pair, index) =>
    pairs.slice(index + 1).map(opponent => ({ category_id: pair.category_id, stage: 'group', group_id: groupId, pair_one_id: pair.id, pair_two_id: opponent.id })));

  const buildStandings = (pairs, matches) => {
    const rows = new Map(pairs.map(pair => [pair.id, { id: pair.id, label: `${pair.player_one_alias} / ${pair.player_two_alias}`, played: 0, won: 0, lost: 0, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0, points: 0 }]));
    matches.filter(match => match.winner_pair_id).forEach(match => {
      const winner = rows.get(match.winner_pair_id);
      const loserId = match.winner_pair_id === match.pair_one_id ? match.pair_two_id : match.pair_one_id;
      const loser = rows.get(loserId);
      if (!winner || !loser) return;
      winner.played += 1; winner.won += 1; winner.points += 1;
      loser.played += 1; loser.lost += 1;
      String(match.score || '').split(',').forEach(set => {
        const values = set.trim().match(/^(\d+)\s*-\s*(\d+)$/);
        if (!values) return;
        const first = Number(values[1]); const second = Number(values[2]);
        if (first === second) return;
        const firstPairWon = first > second;
        const pairOne = rows.get(match.pair_one_id); const pairTwo = rows.get(match.pair_two_id);
        if (!pairOne || !pairTwo) return;
        pairOne.setsWon += firstPairWon ? 1 : 0; pairOne.setsLost += firstPairWon ? 0 : 1;
        pairTwo.setsWon += firstPairWon ? 0 : 1; pairTwo.setsLost += firstPairWon ? 1 : 0;
        pairOne.gamesWon += first; pairOne.gamesLost += second;
        pairTwo.gamesWon += second; pairTwo.gamesLost += first;
      });
    });
    return [...rows.values()].sort((left, right) => right.points - left.points || (right.setsWon - right.setsLost) - (left.setsWon - left.setsLost) || (right.gamesWon - right.gamesLost) - (left.gamesWon - left.gamesLost) || right.won - left.won || left.label.localeCompare(right.label, 'es'));
  };

  const playoffStage = matchCount => ({ 1: 'final', 2: 'semi_final', 4: 'quarter_final', 8: 'round_of_16' }[matchCount] || 'round_of_16');
  const playoffStageLabel = stage => ({ round_of_16: 'Previa', quarter_final: 'Cuartos de final', semi_final: 'Semifinales', final: 'Final' }[stage] || 'Playoffs');
  const buildPlayoffPlan = standings => {
    const seeded = standings.map(row => row.id);
    if (seeded.length < 2) return null;
    let mainSize = 1;
    while (mainSize * 2 <= seeded.length) mainSize *= 2;
    const preliminaryCount = seeded.length - mainSize;
    const directCount = seeded.length - preliminaryCount * 2;
    const preliminary = Array.from({ length: preliminaryCount }, (_, index) => ({ pairOneId: seeded[directCount + index], pairTwoId: seeded[seeded.length - 1 - index], seed: directCount + index + 1 }));
    const seedSlots = [];
    const order = size => size === 2 ? [1, 2] : order(size / 2).flatMap(seed => [seed, size + 1 - seed]);
    order(mainSize).forEach(seed => {
      if (seed <= directCount) seedSlots.push({ pairId: seeded[seed - 1], sourcePreliminaryIndex: null });
      else seedSlots.push({ pairId: null, sourcePreliminaryIndex: seed - directCount - 1 });
    });
    return { preliminary, mainSize, seedSlots, firstStage: playoffStage(mainSize / 2) };
  };

  window.PadelTournament = { createGroups, createRoundRobin, buildStandings, buildPlayoffPlan, playoffStage, playoffStageLabel };
}());

(function () {
  'use strict';

  const shuffle = (items) => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  const parseScore = (scoreStr) => {
    if (!scoreStr || typeof scoreStr !== 'string') return [];
    return scoreStr
      .split(',')
      .map((s) => s.trim().match(/^(\d+)\s*-\s*(\d+)$/))
      .filter(Boolean)
      .map((m) => [parseInt(m[1], 10), parseInt(m[2], 10)]);
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
    const statsMap = new Map();

    pairs.forEach((pair) => {
      statsMap.set(pair.id, {
        id: pair.id,
        label: `${pair.player_one_alias} / ${pair.player_two_alias}`,
        played: 0,
        won: 0,
        lost: 0,
        setsWon: 0,
        setsLost: 0,
        gamesWon: 0,
        gamesLost: 0,
        points: 0,
      });
    });

    const validMatches = matches.filter((m) => m.winner_pair_id && m.stage === 'group');

    validMatches.forEach((match) => {
      const p1 = statsMap.get(match.pair_one_id);
      const p2 = statsMap.get(match.pair_two_id);
      if (!p1 || !p2) return;

      p1.played += 1;
      p2.played += 1;

      if (match.winner_pair_id === p1.id) {
        p1.won += 1;
        p1.points += 2;
        p2.lost += 1;
        p2.points += 1;
      } else {
        p2.won += 1;
        p2.points += 2;
        p1.lost += 1;
        p1.points += 1;
      }

      const parsedSets = parseScore(match.score);
      parsedSets.forEach(([g1, g2], index) => {
        if (g1 > g2) {
          p1.setsWon += 1;
          p2.setsLost += 1;
        } else if (g2 > g1) {
          p2.setsWon += 1;
          p1.setsLost += 1;
        }

        const isSuperTieBreak = index === 2 && (g1 >= 10 || g2 >= 10);
        if (!isSuperTieBreak) {
          p1.gamesWon += g1;
          p1.gamesLost += g2;
          p2.gamesWon += g2;
          p2.gamesLost += g1;
        }
      });
    });

    const resolveGroupTie = (tiedPairs, allGroupMatches) => {
      if (tiedPairs.length <= 1) return tiedPairs;

      if (tiedPairs.length === 2) {
        const [p1, p2] = tiedPairs;
        const directMatch = allGroupMatches.find(
          (m) =>
            m.winner_pair_id &&
            ((m.pair_one_id === p1.id && m.pair_two_id === p2.id) ||
              (m.pair_one_id === p2.id && m.pair_two_id === p1.id))
        );
        if (directMatch) {
          return directMatch.winner_pair_id === p1.id ? [p1, p2] : [p2, p1];
        }
      }

      const tiedIds = new Set(tiedPairs.map((p) => p.id));
      const subMatches = allGroupMatches.filter(
        (m) => m.winner_pair_id && tiedIds.has(m.pair_one_id) && tiedIds.has(m.pair_two_id)
      );

      const subStats = new Map();
      tiedPairs.forEach((p) => {
        subStats.set(p.id, { setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0 });
      });

      subMatches.forEach((m) => {
        const s1 = subStats.get(m.pair_one_id);
        const s2 = subStats.get(m.pair_two_id);
        const parsed = parseScore(m.score);
        parsed.forEach(([g1, g2], idx) => {
          if (g1 > g2) { s1.setsWon++; s2.setsLost++; }
          else if (g2 > g1) { s2.setsWon++; s1.setsLost++; }

          if (!(idx === 2 && (g1 >= 10 || g2 >= 10))) {
            s1.gamesWon += g1; s1.gamesLost += g2;
            s2.gamesWon += g2; s2.gamesLost += g1;
          }
        });
      });

      return [...tiedPairs].sort((a, b) => {
        const sa = subStats.get(a.id);
        const sb = subStats.get(b.id);

        const diffSetsA = sa.setsWon - sa.setsLost;
        const diffSetsB = sb.setsWon - sb.setsLost;
        if (diffSetsB !== diffSetsA) return diffSetsB - diffSetsA;

        const diffGamesA = sa.gamesWon - sa.gamesLost;
        const diffGamesB = sb.gamesWon - sb.gamesLost;
        if (diffGamesB !== diffGamesA) return diffGamesB - diffGamesA;

        const globalDiffSetsA = a.setsWon - a.setsLost;
        const globalDiffSetsB = b.setsWon - b.setsLost;
        if (globalDiffSetsB !== globalDiffSetsA) return globalDiffSetsB - globalDiffSetsA;

        return (b.gamesWon - b.gamesLost) - (a.gamesWon - a.gamesLost);
      });
    };

    const sortedByPoints = [...statsMap.values()].sort((a, b) => b.points - a.points);
    const finalStandings = [];

    let i = 0;
    while (i < sortedByPoints.length) {
      const currentPoints = sortedByPoints[i].points;
      const tiedGroup = [];
      while (i < sortedByPoints.length && sortedByPoints[i].points === currentPoints) {
        tiedGroup.push(sortedByPoints[i]);
        i++;
      }
      const resolved = resolveGroupTie(tiedGroup, validMatches);
      finalStandings.push(...resolved);
    }

    return finalStandings;
  };

  const playoffStage = matchCount => ({ 1: 'final', 2: 'semi_final', 4: 'quarter_final', 8: 'round_of_16', 16: 'round_of_32' }[matchCount] || 'round_of_16');
  const playoffStageLabel = stage => ({ round_of_32: 'Dieciseisavos de final', round_of_16: 'Octavos de final', quarter_final: 'Cuartos de final', semi_final: 'Semifinales', final: 'Final' }[stage] || 'Playoffs');

  const buildPlayoffPlan = (standings) => {
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

  window.PadelTournament = {
    shuffle,
    createGroups,
    createRoundRobin,
    buildStandings,
    buildPlayoffPlan,
    playoffStage,
    playoffStageLabel,
    parseScore,
  };
}());

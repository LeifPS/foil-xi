// Regressionstest für das Skill-Modus-Fundament: Kartenauswahl (nur Feldspieler), das PlayStyle+ ->
// Move-Mapping (SKILL_MOVE_BY_TRAIT/skillMovesForCard) und den Karten-Referenz-Roundtrip
// (fullCardRefForSkillPick/resolveSkillCardRef), der beim echten Match die eigene Karte an die
// Gegenseite überträgt. Die eigentliche Live-Physik/RTDB-Synchronisation (echtes Zwei-Geräte-Match)
// lässt sich mit dem vorhandenen Playwright-Setup nicht sinnvoll automatisieren (siehe README) -
// dieser Test deckt bewusst nur den Teil ab, der ohne zwei echte Browser/Accounts testbar ist:
// "hat die Karte den Trait -> ist der Move nutzbar" und "wird die Karte korrekt über die Leitung
// rekonstruiert".
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    // Eine echte Basiskarte mit Powerschuss+Grätsche als Traits, unabhängig von echten Spielerdaten -
    // resolveCardTraits liest zuerst card.traits, bevor es irgendetwas automatisch hertleitet.
    const fakeCard = {id:900000001, n:'Testspieler', pos:'ST,CF', ov:90, club:'Test FC', nat:'DE', lg:'Test-Liga',
      pac:80, sho:85, pas:70, dri:75, defn:40, phy:78, traits:['Powerschuss','Grätsche+'], variant:'base'};
    BY_ID.set(fakeCard.id, fakeCard);

    const moves = skillMovesForCard(fakeCard);
    const hasOnlyExpectedMoves = moves.has('powershot') && moves.has('slide') && moves.size===2;
    const hasNoUngatedMoves = !moves.has('finesse') && !moves.has('quickstep') && !moves.has('technical') && !moves.has('chip') && !moves.has('rush') && !moves.has('block');

    // Torwart darf nie in der Kartenauswahl auftauchen, selbst wenn er die stärkste besessene Karte ist.
    const fakeGk = {id:900000002, n:'Test-Torwart', pos:'GK', ov:99, pac:1,sho:1,pas:1,dri:1,defn:1,phy:1, traits:[], variant:'base'};
    BY_ID.set(fakeGk.id, fakeGk);
    const savedCollection = collection;
    collection = [
      {uid:'sk-test-field', cardId:fakeCard.id, xp:0},
      {uid:'sk-test-gk', cardId:fakeGk.id, xp:0},
    ];
    const eligible = eligibleSkillCards();
    const gkExcluded = !eligible.some(x=>x.card.id===fakeGk.id);
    const fieldIncluded = eligible.some(x=>x.card.id===fakeCard.id);
    collection = savedCollection;

    // Roundtrip: was beim Picken über die Leitung geschickt wird, muss auf der Gegenseite exakt
    // dieselben Werte/Traits (und damit dieselben freigeschalteten Moves) ergeben.
    const ref = fullCardRefForSkillPick(fakeCard);
    const rebuilt = resolveSkillCardRef(ref);
    const roundtripStatsMatch = rebuilt.pac===fakeCard.pac && rebuilt.sho===fakeCard.sho && rebuilt.defn===fakeCard.defn;
    const rebuiltMoves = skillMovesForCard(rebuilt);
    const roundtripMovesMatch = rebuiltMoves.has('powershot') && rebuiltMoves.has('slide') && rebuiltMoves.size===2;

    // deriveSkillPhysics: höhere Werte müssen echte, spürbare Vorteile ergeben (kein Blindgänger-Stat).
    const weakCard = {...fakeCard, pac:20, sho:20, dri:20};
    const strongCard = {...fakeCard, pac:99, sho:99, dri:99};
    const weakPhys = deriveSkillPhysics(weakCard), strongPhys = deriveSkillPhysics(strongCard);
    const statsScaleUp = strongPhys.maxSpeed>weakPhys.maxSpeed && strongPhys.shotPowerMult>weakPhys.shotPowerMult && strongPhys.friction>weakPhys.friction;

    // Elite-Variante desselben Traits (Grätsche+ statt Grätsche) muss denselben Move freischalten -
    // sonst wäre ein Move nur für Nicht-Elite-Karten nutzbar, was PLAYSTYLE_ELITE_OF widerspräche.
    const eliteOnlyCard = {...fakeCard, traits:['Grätsche+']};
    const eliteMoves = skillMovesForCard(eliteOnlyCard);
    const eliteAlsoUnlocks = eliteMoves.has('slide');

    BY_ID.delete(fakeCard.id); BY_ID.delete(fakeGk.id);

    return {hasOnlyExpectedMoves, hasNoUngatedMoves, gkExcluded, fieldIncluded, roundtripStatsMatch, roundtripMovesMatch, statsScaleUp, eliteAlsoUnlocks};
  }));

  console.log('Skill-Modus-Fundament-Test');
  noErrors(errors, 'Seite');
  eq(result.hasOnlyExpectedMoves, true, 'eine Karte mit Powerschuss+Grätsche+ schaltet genau powershot und slide frei, sonst nichts');
  eq(result.hasNoUngatedMoves, true, 'Moves ohne passenden Trait bleiben gesperrt (kein Move ist je universell verfügbar)');
  eq(result.gkExcluded, true, 'ein Torwart taucht nie in der Skill-Duell-Kartenauswahl auf');
  eq(result.fieldIncluded, true, 'ein normaler Feldspieler taucht in der Kartenauswahl auf');
  eq(result.roundtripStatsMatch, true, 'fullCardRefForSkillPick/resolveSkillCardRef überträgt die echten Substats unverändert an die Gegenseite');
  eq(result.roundtripMovesMatch, true, 'nach dem Roundtrip sind auf der Gegenseite exakt dieselben Moves nutzbar wie beim Picker');
  eq(result.statsScaleUp, true, 'deriveSkillPhysics: höhere PAC/SHO/DRI-Werte ergeben spürbar bessere Physik-Parameter');
  eq(result.eliteAlsoUnlocks, true, 'die Elite-Variante eines Traits (z.B. Grätsche+) schaltet denselben Move frei wie die Basis-Variante');

  summary('Skill-Modus-Fundament-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });

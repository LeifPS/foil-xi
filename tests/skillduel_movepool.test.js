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

    // Balance-Fix ("100+ Karten sind viel zu OPP"): oberhalb von 85 darf ein Substat nur noch
    // abgeschwächt weiterwirken (weicher Deckel), weil dasselbe Substat gleichzeitig in ~10
    // Mechaniken einfließt und sich sonst zu einem uneinholbaren Gesamtvorteil aufsummiert. Der
    // Abstand 99 vs. 85 muss also spürbar kleiner ausfallen als der (gleich große) Abstand 85 vs. 71.
    // Getestet über SHO/shotPowerMult statt PAC/maxSpeed - Tempo hat inzwischen einen eigenen,
    // separaten Deckel (siehe nächster Test-Block), der allgemeine 85er-Deckel bleibt aber für alle
    // anderen Substate (SHO/PAS/DRI/DEF/PHY) unverändert in Kraft.
    const card85 = {...fakeCard, sho:85}, card99 = {...fakeCard, sho:99}, card71 = {...fakeCard, sho:71};
    const pow85 = deriveSkillPhysics(card85).shotPowerMult, pow99 = deriveSkillPhysics(card99).shotPowerMult, pow71 = deriveSkillPhysics(card71).shotPowerMult;
    const gap99v85 = pow99-pow85, gap85v71 = pow85-pow71;
    const eliteAdvantageIsSoftCapped = gap99v85>0 && gap99v85<gap85v71;
    // Unterhalb des Deckels bleibt die Skalierung unverändert linear - zwei Karten mit demselben
    // Abstand (60 vs. 74 wie 71 vs. 85) müssen also denselben Vorteil bringen.
    const card60 = {...fakeCard, sho:60}, card74 = {...fakeCard, sho:74};
    const pow60 = deriveSkillPhysics(card60).shotPowerMult, pow74 = deriveSkillPhysics(card74).shotPowerMult;
    const gap74v60 = pow74-pow60;
    const belowCapStaysLinear = Math.abs(gap74v60-gap85v71)<0.0001;

    // Neuer, separater Tempo-Deckel ("viel langsamer, ungefähr die Hälfte davon"): unterhalb von 50
    // PAC exakt dieselbe Geschwindigkeit wie vorher (linear, Deckel unten überhaupt nicht aktiv),
    // oberhalb von 50 wird der weitere Tempozuwachs auf nur noch 12% Wirkung gedrückt.
    // Alle erwarteten Werte werden mit dem generellen "deutlich deutlich langsamere Spieler"-
    // Multiplikator SK_PLAYER_SPEED_MULT skaliert - der verändert das PAC-Tempo-Deckel-Verhalten
    // relativ zueinander nicht, senkt nur das gesamte Geschwindigkeitsniveau gleichermaßen.
    const pacLowA = {...fakeCard, pac:30}, pacLowB = {...fakeCard, pac:50};
    const speedLowA = deriveSkillPhysics(pacLowA).maxSpeed, speedLowB = deriveSkillPhysics(pacLowB).maxSpeed;
    const belowSpeedCapUnaffected = Math.abs(speedLowA - (250 + (30/99)*150)*SK_PLAYER_SPEED_MULT) < 0.0001 && Math.abs(speedLowB - (250 + (50/99)*150)*SK_PLAYER_SPEED_MULT) < 0.0001;
    const pac70 = {...fakeCard, pac:70}, pac99forSpeed = {...fakeCard, pac:99};
    const speed70 = deriveSkillPhysics(pac70).maxSpeed, speed99forSpeed = deriveSkillPhysics(pac99forSpeed).maxSpeed;
    const linearProjectionAt99 = (250 + (99/99)*150) * SK_PLAYER_SPEED_MULT; // was ein 99er ohne Deckel hätte (400*Mult)
    const fastPlayersAreSlowerThanLinear = speed99forSpeed < linearProjectionAt99 && speed99forSpeed > speed70;
    // "Ungefähr die Hälfte" heißt: der Tempo-BONUS (nicht die absolute Geschwindigkeit, die ja immer
    // mindestens die (skalierte) Basis hat) eines 99er-PAC-Spielers muss ungefähr auf die Hälfte dessen
    // sinken, was er ganz ohne Deckel hätte - großzügiger Korridor (35-65%) statt eines exakten Werts,
    // da "ungefähr" ausdrücklich keine Punktlandung verlangt.
    const baseSpeed = 250*SK_PLAYER_SPEED_MULT;
    const bonusAt99 = speed99forSpeed - baseSpeed, linearBonusAt99 = linearProjectionAt99 - baseSpeed;
    const reductionIsSubstantial = bonusAt99/linearBonusAt99 >= 0.35 && bonusAt99/linearBonusAt99 <= 0.65;

    // Elite-Variante desselben Traits (Grätsche+ statt Grätsche) muss denselben Move freischalten -
    // sonst wäre ein Move nur für Nicht-Elite-Karten nutzbar, was PLAYSTYLE_ELITE_OF widerspräche.
    const eliteOnlyCard = {...fakeCard, traits:['Grätsche+']};
    const eliteMoves = skillMovesForCard(eliteOnlyCard);
    const eliteAlsoUnlocks = eliteMoves.has('slide');

    BY_ID.delete(fakeCard.id); BY_ID.delete(fakeGk.id);

    return {hasOnlyExpectedMoves, hasNoUngatedMoves, gkExcluded, fieldIncluded, roundtripStatsMatch, roundtripMovesMatch, statsScaleUp, eliteAlsoUnlocks, eliteAdvantageIsSoftCapped, belowCapStaysLinear, belowSpeedCapUnaffected, fastPlayersAreSlowerThanLinear, reductionIsSubstantial};
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
  eq(result.eliteAdvantageIsSoftCapped, true, 'Balance-Fix: der Vorteil von 99 gegenüber 85 fällt kleiner aus als der gleich große Abstand 85 gegenüber 71 (100+-Karten nicht mehr grotesk überlegen)');
  eq(result.belowCapStaysLinear, true, 'unterhalb des weichen Deckels (85) bleibt die Skalierung unverändert linear');
  eq(result.belowSpeedCapUnaffected, true, 'Tempo-Deckel: unterhalb von 50 PAC exakt dieselbe Höchstgeschwindigkeit wie ohne Deckel (langsame Spieler werden nicht noch langsamer)');
  eq(result.fastPlayersAreSlowerThanLinear, true, 'Tempo-Deckel: ein 99er-PAC-Spieler ist spürbar langsamer als ohne Deckel, aber immer noch schneller als ein 70er');
  eq(result.reductionIsSubstantial, true, 'Tempo-Deckel: der Tempo-Bonus bei PAC 99 liegt bei ungefähr der Hälfte (35-65%) dessen, was er ohne Deckel wäre');

  summary('Skill-Modus-Fundament-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });

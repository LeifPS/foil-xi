// Regressionstest für "mach klarer wo das Tor ist, indem du ihm Tiefe gibst, so gibt es auch Pfosten
// zb., mach den Ball etwas stärker schießen, und der Spieler soll deutlich langsamer sein (ungefähr
// ein Drittel von dem, was ein 99er gerade hat)": deckt (1) die neue Tor-Tiefe (breiterer Canvas als
// das Spielfeld, damit ein echter Netzkasten mit Pfosten hinter der Torlinie sichtbaren Platz hat),
// (2) den erneuten Schusspower-Buff und (3) die erneute, diesmal sehr starke Tempo-Reduktion.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    const fakeCard = {id:900001301, n:'Goal-Depth-Test', pos:'ST', ov:88, pac:80,sho:80,pas:70,dri:75,defn:40,phy:75, traits:[], variant:'base'};
    BY_ID.set(fakeCard.id, fakeCard);

    // ---------- (1) Tor-Tiefe ----------
    const goalDepthExists = SK_GOAL_DEPTH > 0;
    startSkillMatch(null, true, {hostName:'Ich', guestName:'AFK-Bot', hostPick:fakeCard, guestPick:SK_BOT_CARD}, {mode:'bot'});
    await new Promise(r=>setTimeout(r, 50));
    const canvas = document.getElementById('sk-canvas');
    // Der Canvas ist links UND rechts um SK_GOAL_DEPTH breiter als das reine Spielfeld (SK_W) - genug
    // Platz, damit die Tor-Box tatsächlich sichtbar HINTER der Torlinie liegt statt vom Canvas-Rand
    // abgeschnitten zu werden.
    const canvasHasExtraWidthForGoalDepth = canvas.width === SK_W + SK_GOAL_DEPTH*2;
    const fieldHeightUnchanged = canvas.height === SK_H;
    // skDrawField/skDrawGoalDepth dürfen mit einem echten 2D-Context nicht crashen (deckt u.a. den
    // Transform-Reset ab, der ein Aufsummieren der Verschiebung über mehrere Frames verhindert).
    const ctx = canvas.getContext('2d');
    let renderErrorFrame1 = null, renderErrorFrame2 = null;
    try{ skRender(ctx, skillDuelState.engine); }catch(e){ renderErrorFrame1 = e.message; }
    try{ skRender(ctx, skillDuelState.engine); }catch(e){ renderErrorFrame2 = e.message; }
    // Nach dem Zeichnen muss die Transform-Matrix wieder exakt der eine Translate von skDrawField sein
    // (kein Aufsummieren über mehrere Frames hinweg).
    const t = ctx.getTransform();
    const transformDoesNotAccumulate = t.e === SK_GOAL_DEPTH && t.f === 0;
    document.getElementById('sk-close-btn').click();

    // ---------- (2) Ball schießt etwas stärker ----------
    // Muss über der zuvor schon erhöhten Schwelle (1.85) liegen - "etwas stärker" ist ein weiterer,
    // wenn auch kleinerer Schritt auf dem bereits verstärkten Schusstempo.
    const shotIsStrongerThanBefore = SK_SHOT_SPEED_BOOST > 1.85;

    // ---------- (3) Tempo-Verlauf: 0.6 -> 0.2 (ein Drittel) -> "schneller 2x" -> 0.4 ----------
    // SK_PLAYER_SPEED_MULT muss exakt beim Zwischenstand (0.2) verdoppelt worden sein, aber deutlich
    // unter dem allerersten Stand (0.6) bleiben - "schneller 2x" bezog sich auf den zuletzt gesetzten
    // Wert, nicht auf eine Rückkehr zur ursprünglichen Geschwindigkeit.
    const playerIsTwiceAsFastAsPreviousStep = Math.abs(SK_PLAYER_SPEED_MULT - 0.2*2) < 0.0001;
    const playerStillSlowerThanOriginal = SK_PLAYER_SPEED_MULT < 0.6;

    BY_ID.delete(fakeCard.id);

    return {
      goalDepthExists, canvasHasExtraWidthForGoalDepth, fieldHeightUnchanged,
      renderErrorFrame1, renderErrorFrame2, transformDoesNotAccumulate,
      shotIsStrongerThanBefore, playerIsTwiceAsFastAsPreviousStep, playerStillSlowerThanOriginal,
    };
  }));

  console.log('Skill-Duell-Tor-Tiefe-Power-Tempo-Test');
  noErrors(errors, 'Seite');
  eq(result.goalDepthExists, true, 'SK_GOAL_DEPTH ist gesetzt (Tor bekommt sichtbare Tiefe)');
  eq(result.canvasHasExtraWidthForGoalDepth, true, 'der Canvas ist links+rechts um SK_GOAL_DEPTH breiter als das reine Spielfeld');
  eq(result.fieldHeightUnchanged, true, 'die Canvas-Höhe bleibt unverändert bei SK_H');
  eq(result.renderErrorFrame1, null, 'skRender zeichnet die neue Tor-Tiefe/Pfosten ohne Fehler');
  eq(result.renderErrorFrame2, null, 'ein zweiter aufeinanderfolgender Render-Frame läuft ebenfalls fehlerfrei');
  eq(result.transformDoesNotAccumulate, true, 'die Canvas-Transform-Verschiebung summiert sich nicht über mehrere Frames auf');
  eq(result.shotIsStrongerThanBefore, true, 'SK_SHOT_SPEED_BOOST wurde gegenüber dem vorherigen Stand (1.85) nochmal erhöht');
  eq(result.playerIsTwiceAsFastAsPreviousStep, true, '"schneller 2x": SK_PLAYER_SPEED_MULT ist exakt doppelt so hoch wie der zuletzt gesetzte Zwischenstand (0.2)');
  eq(result.playerStillSlowerThanOriginal, true, 'trotz der Verdopplung bleibt das Tempo deutlich unter dem allerersten Stand (0.6)');

  summary('Skill-Duell-Tor-Tiefe-Power-Tempo-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });

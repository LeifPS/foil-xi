// Regressionstest für "Deutlich deutlich langsamere Spieler, größere Map und mehr slide wieder aber
// nur etwas": deckt (1) den generellen Tempo-Multiplikator SK_PLAYER_SPEED_MULT (wirkt auf Beschleunigung
// UND Höchsttempo jeder Karte gleichermaßen, ohne die relative PAC-Skalierung/den PAC-Tempo-Deckel
// zwischen schnellen und langsamen Karten zu verändern), (2) die größere Spielfeldfläche (SK_W/SK_H im
// selben Seitenverhältnis, Tor im selben Verhältnis mitskaliert) und (3) den kleinen Grätsche-Buff
// (Reichweite/Wucht etwas höher, Dauer/Cooldown/Kosten unverändert - "nur etwas", keine Neubalance).
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    const fakeCard = {id:900000901, n:'Speed-Map-Slide-Test', pos:'ST', ov:88, pac:80,sho:75,pas:70,dri:75,defn:40,phy:75, traits:[], variant:'base'};
    BY_ID.set(fakeCard.id, fakeCard);

    // ---------- (1) Deutlich langsamere Spieler ----------
    const playersAreSubstantiallySlower = SK_PLAYER_SPEED_MULT <= 0.7; // "deutlich deutlich" = kein homöopathischer Nudge
    const phys = deriveSkillPhysics(fakeCard);
    // Direkter, robuster Vergleich: der Multiplikator muss TATSÄCHLICH auf die finalen Physik-Werte
    // wirken - eine Karte mit demselben PAC muss nach Anwendung des Multiplikators spürbar langsamer
    // sein, als sie es OHNE ihn wäre (Formel exakt wie in deriveSkillPhysics, aber ohne SK_PLAYER_SPEED_MULT).
    const SK_PAC_SPEED_SOFT_CAP = 50, SK_PAC_SPEED_SOFT_CAP_RATE = 0.12;
    const nPacSpeedRef = raw => {
      const v = Math.max(1, Math.min(99, raw||50));
      const capped = v<=SK_PAC_SPEED_SOFT_CAP ? v : SK_PAC_SPEED_SOFT_CAP + (v-SK_PAC_SPEED_SOFT_CAP)*SK_PAC_SPEED_SOFT_CAP_RATE;
      return capped/99;
    };
    const unmultipliedMaxSpeed = 250 + nPacSpeedRef(80)*150;
    const unmultipliedAccel = 1600 + nPacSpeedRef(80)*1800;
    const maxSpeedMatchesMultiplier = Math.abs(phys.maxSpeed - unmultipliedMaxSpeed*SK_PLAYER_SPEED_MULT) < 0.01;
    const accelMatchesMultiplier = Math.abs(phys.accel - unmultipliedAccel*SK_PLAYER_SPEED_MULT) < 0.01;
    const substantiallySlowerThanUnmultiplied = phys.maxSpeed < unmultipliedMaxSpeed*0.7;

    // Relative PAC-Skalierung bleibt erhalten: eine 99er-PAC-Karte ist weiterhin schneller als eine
    // 40er-PAC-Karte, trotz des generellen Verlangsamungs-Multiplikators.
    const slowCard = {...fakeCard, pac:40}, fastCard = {...fakeCard, pac:99};
    const slowSpeed = deriveSkillPhysics(slowCard).maxSpeed, fastSpeed = deriveSkillPhysics(fastCard).maxSpeed;
    const relativeScalingPreserved = fastSpeed > slowSpeed;

    // ---------- (2) Größere Map ----------
    const mapIsBigger = SK_W > 900 && SK_H > 540;
    const aspectRatioPreserved = Math.abs(SK_W/SK_H - 900/540) < 0.01;
    const goalScalesWithField = Math.abs(SK_GOAL_H/SK_H - 150/540) < 0.02;
    // Der Canvas übernimmt die neue Auflösung tatsächlich (kein hartkodiertes altes Maß irgendwo).
    startSkillMatch(null, true, {hostName:'Ich', guestName:'AFK-Bot', hostPick:fakeCard, guestPick:SK_BOT_CARD}, {vsBot:true});
    await new Promise(r=>setTimeout(r, 50));
    const canvas = document.getElementById('sk-canvas');
    // Canvas ist links+rechts um SK_GOAL_DEPTH breiter als das Spielfeld selbst (Platz für die Tor-
    // Tiefe/Pfosten, siehe skDrawField) - die reine Spielfeldgröße bleibt SK_W/SK_H.
    const canvasMatchesNewSize = canvas.width===SK_W+SK_GOAL_DEPTH*2 && canvas.height===SK_H;
    document.getElementById('sk-close-btn').click();

    // ---------- (3) Etwas mehr Slide ----------
    const slideIsBuffedALittle = SK_SLIDE_IMPULSE > 380 && SK_SLIDE_IMPULSE <= 380*1.3; // spürbar, aber "nur etwas" - kein Verdoppeln
    const eliteSlideStillStronger = SK_ELITE_SLIDE_IMPULSE > SK_SLIDE_IMPULSE;
    // Dauer/Cooldown/Kosten bleiben unangetastet - der Buff betrifft ausdrücklich nur Reichweite/Wucht.
    const slideOtherStatsUnchanged = SK_SLIDE_DURATION===0.35 && SK_SLIDE_COOLDOWN===2.2 && SK_SLIDE_STAMINA_COST===14;
    const eliteSlideCooldownCostUnchanged = SK_ELITE_SLIDE_COOLDOWN===1.6 && SK_ELITE_SLIDE_STAMINA_COST===11;

    BY_ID.delete(fakeCard.id);

    return {
      playersAreSubstantiallySlower, maxSpeedMatchesMultiplier, accelMatchesMultiplier,
      substantiallySlowerThanUnmultiplied, relativeScalingPreserved,
      mapIsBigger, aspectRatioPreserved, goalScalesWithField, canvasMatchesNewSize,
      slideIsBuffedALittle, eliteSlideStillStronger, slideOtherStatsUnchanged, eliteSlideCooldownCostUnchanged,
    };
  }));

  console.log('Skill-Duell-Tempo-Map-Slide-Test');
  noErrors(errors, 'Seite');
  eq(result.playersAreSubstantiallySlower, true, 'SK_PLAYER_SPEED_MULT senkt das Tempo deutlich (<=0.7), kein homöopathischer Nudge');
  eq(result.maxSpeedMatchesMultiplier, true, 'deriveSkillPhysics wendet SK_PLAYER_SPEED_MULT tatsächlich auf maxSpeed an');
  eq(result.accelMatchesMultiplier, true, 'deriveSkillPhysics wendet SK_PLAYER_SPEED_MULT tatsächlich auf accel an');
  eq(result.substantiallySlowerThanUnmultiplied, true, 'die tatsächliche Höchstgeschwindigkeit liegt spürbar (< 70%) unter der unmultiplizierten Basis-Formel');
  eq(result.relativeScalingPreserved, true, 'eine 99er-PAC-Karte ist trotz des generellen Verlangsamungs-Multiplikators weiterhin schneller als eine 40er-PAC-Karte');
  eq(result.mapIsBigger, true, 'die Spielfeldabmessungen (SK_W/SK_H) sind größer als vorher (900x540)');
  eq(result.aspectRatioPreserved, true, 'das Seitenverhältnis der Map bleibt bei 5:3 wie vorher');
  eq(result.goalScalesWithField, true, 'die Torgröße wächst im selben Verhältnis mit der Feldhöhe mit');
  eq(result.canvasMatchesNewSize, true, 'der echte Spiel-Canvas übernimmt die neue, größere Auflösung');
  eq(result.slideIsBuffedALittle, true, 'die Grätsche ist etwas stärker als vorher (380), aber nicht drastisch (max. +30%)');
  eq(result.eliteSlideStillStronger, true, 'Grätsche+ bleibt weiterhin stärker als die Basis-Variante');
  eq(result.slideOtherStatsUnchanged, true, 'Dauer/Cooldown/Ausdauerkosten der Grätsche bleiben unverändert - nur Reichweite/Wucht wurden gebufft');
  eq(result.eliteSlideCooldownCostUnchanged, true, 'Cooldown/Ausdauerkosten der Elite-Grätsche bleiben ebenfalls unverändert');

  summary('Skill-Duell-Tempo-Map-Slide-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });

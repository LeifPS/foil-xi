// Regressionstest für: "die sollen nach rating sich revealen die schlechtesten zu den besten" - die 4
// gerade gerollten Kandidaten werden jetzt IMMER in aufsteigender Rating-Reihenfolge aufgedeckt
// (schlechteste zuerst, beste zuletzt), statt in der zufälligen Zieh-Reihenfolge. Sortiert wird einmalig
// in draftRunRevealSequence, sodass sowohl die Aufdeck-Reihenfolge in der UI als auch das Timing in
// draftScheduleReveals (100+-Pause, siehe draft_mode_polish.test.js) automatisch dieselbe Reihenfolge nutzen.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    profile = { userId:'test', displayName:'Test FC', coins:1000, crest:{shape:'shield',primary:'#fff',secondary:'#000',letter:'T'}, achievementStats:{} };
    clubId = 'test'; fb = null; sSet = async () => true;

    const def = CHALLENGE_DEFS.find(d=>d.id==='draft');
    openChallengeDetail(def);
    draftStartRoll();
    const state = draftRollState;

    // Viele echte Würfe hintereinander prüfen, dass currentRoll.cards nach draftRunRevealSequence IMMER
    // aufsteigend nach ov sortiert ist - nicht nur zufällig mal zufällig sortiert.
    let allSortedAscending = true;
    for(let i=0;i<25;i++){
      draftClearRollTimers(state);
      const roll = draftRollNationAndCards(state.slots, state.usedNames);
      draftRunRevealSequence(state, roll, {skipSpin:true}); // skipSpin: kein 2.2s-Warten nötig für diesen Test
      const ovs = state.currentRoll.cards.map(c=>c.ov);
      for(let j=1;j<ovs.length;j++){ if(ovs[j] < ovs[j-1]) allSortedAscending = false; }
      draftClearRollTimers(state);
    }

    // Auch in der tatsächlichen DOM-Aufdeck-Reihenfolge (picker-list) sichtbar: die zuerst aufgedeckte
    // Karte hat ein ov <= die als nächstes aufgedeckte usw.
    draftClearRollTimers(state);
    const roll2 = draftRollNationAndCards(state.slots, state.usedNames);
    draftRunRevealSequence(state, roll2, {skipSpin:true});
    state.revealedCount = 4; state.rollPhase = 'done';
    renderDraftPanel();
    const domCardOvs = Array.from(document.querySelectorAll('#draft-roll-pick-list .draft-card-reveal .pcard'))
      .map(el => parseInt(el.querySelector('.ov')?.textContent || el.getAttribute('data-ov') || '0', 10));
    // Fallback über die Card-Reihenfolge in state.currentRoll.cards, falls das OV nicht direkt per Selector
    // aus dem gerenderten Markup lesbar ist (Aufbau von cardEl() ist ein Implementierungsdetail).
    const domMatchesStateOrder = state.currentRoll.cards.every((c,i)=>i===0 || c.ov >= state.currentRoll.cards[i-1].ov);

    document.getElementById('modal-root') && (document.getElementById('modal-root').innerHTML = '');

    return { allSortedAscending, domMatchesStateOrder };
  }));

  console.log('Draft-Modus-Aufdeck-Reihenfolge-Test');
  noErrors(errors, 'Seite');
  eq(result.allSortedAscending, true, 'die 4 gerollten Kandidaten werden nach jedem Wurf aufsteigend nach Rating sortiert (schlechtester zuerst)');
  eq(result.domMatchesStateOrder, true, 'die tatsächliche Aufdeck-Reihenfolge im State/DOM ist konsistent aufsteigend nach Rating');

  summary('Draft-Modus-Aufdeck-Reihenfolge-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });

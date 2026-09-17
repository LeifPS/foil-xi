// Regressionstest: gemeldeter Bug "bei denen die [Finesse Shot] haben kommt kein Symbol". Die
// Move-Icons sind externe, hotgelinkte EA-Bilder (drop-assets.ea.com) - werden sie lazy erst beim
// allerersten Trigger eines Moves im ersten Match einer Session angefordert, ist das Bild zu diesem
// exakten Zeitpunkt garantiert noch nicht fertig geladen, und die alte Render-Logik zeigte in diesem
// Fall schlicht GAR NICHTS für die gesamte 0,9s-Anzeigedauer - bei langsamem Netz, einem Ad-/Tracker-
// Blocker oder sonst irgendeiner Netzwerk-Hürde blieb das Symbol dadurch dauerhaft unsichtbar, obwohl
// der Move korrekt ausgelöst wurde. Fix: (1) die Icons werden vorgeladen, sobald ein Match TATSÄCHLICH
// beginnt (startSkillMatch), nicht erst beim ersten Move-Trigger mitten im Match - das gibt dem Browser
// die Ladezeit, die zwischen Matchstart und dem ersten ausgelösten Move ohnehin vergeht. (Bewusst NICHT
// mehr unconditioned beim App-Boot, wie es zwischenzeitlich der Fall war - das lud ~40 externe Bilder
// für JEDEN Seitenaufruf, auch für Leute, die Skill-Duell nie öffnen.) (2) skDrawPlayer zeigt so oder so
// IMMER ein sichtbares Feedback (echtes Icon, sobald es fertig geladen ist, sonst ein Text-Fallback),
// nie mehr "gar nichts".
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    const fakeCard = {id:900000091, n:'Icon-Fallback-Test', pos:'ST', ov:88, pac:75,sho:75,pas:75,dri:75,defn:40,phy:75,
      traits:['Angeschn. Schuss'], variant:'base'};
    BY_ID.set(fakeCard.id, fakeCard);
    startSkillMatch(null, true, {hostName:'Ich', guestName:'AFK-Bot', hostPick:fakeCard, guestPick:SK_BOT_CARD}, {vsBot:true});

    // (1) Vorladen ist spätestens jetzt (direkt nach dem Matchstart-Aufruf) angestoßen - der Cache
    // enthält bereits echte Image-Objekte mit gesetzter src, lange bevor im Match überhaupt ein Move
    // ausgelöst werden könnte.
    const preloadedAtMatchStart = Object.keys(skMoveIconImgs()).length >= 8
      && Object.values(skMoveIconImgs()).every(img => img instanceof Image && img.src);

    await new Promise(r=>setTimeout(r, 50));

    const ctx = document.getElementById('sk-canvas').getContext('2d');
    const p1 = skillDuelState.engine.p1;

    // (2a) Bild noch nicht fertig geladen (img.complete=false, ganz normaler Zustand kurz nach dem
    // Vorladen) - muss trotzdem OHNE Fehler zeichnen (Text-Fallback statt gar nichts).
    p1.toastIcon = 'finesse'; p1.toastTimer = 0.5;
    let errorWhileNotLoaded = null;
    try{ skDrawPlayer(ctx, p1); }catch(e){ errorWhileNotLoaded = e.message; }

    // (2b) Bild lädt garantiert NIE (simulierter Netzwerkfehler) - muss dauerhaft trotzdem zeichnen,
    // nicht nur einmalig direkt nach dem Fehler.
    const imgs = skMoveIconImgs();
    Object.values(imgs).forEach(img=>{
      img._failed = true;
      Object.defineProperty(img, 'complete', {value:false, configurable:true});
    });
    let errorAfterPermanentFailure = null;
    try{ skDrawPlayer(ctx, p1); skDrawPlayer(ctx, p1); }catch(e){ errorAfterPermanentFailure = e.message; }

    // (2c) Kein toastIcon aktiv -> darf natürlich nichts zeichnen und keinen Fehler werfen.
    p1.toastIcon = null; p1.toastTimer = 0;
    let errorWithNoIcon = null;
    try{ skDrawPlayer(ctx, p1); }catch(e){ errorWithNoIcon = e.message; }

    document.getElementById('sk-close-btn').click();
    BY_ID.delete(fakeCard.id);

    return {preloadedAtMatchStart, errorWhileNotLoaded, errorAfterPermanentFailure, errorWithNoIcon};
  }));

  console.log('Skill-Duell-Move-Icon-Fallback-Test');
  noErrors(errors, 'Seite');
  eq(result.preloadedAtMatchStart, true, 'die Move-Icons werden vorgeladen, sobald ein Match startet, statt erst beim ersten Move-Trigger');
  eq(result.errorWhileNotLoaded, null, 'zeichnet fehlerfrei, solange das echte Icon noch lädt (Text-Fallback statt gar nichts)');
  eq(result.errorAfterPermanentFailure, null, 'zeichnet dauerhaft fehlerfrei, auch wenn das Icon nie lädt (permanenter Netzwerkfehler)');
  eq(result.errorWithNoIcon, null, 'zeichnet fehlerfrei, wenn gerade kein Move-Icon aktiv ist');

  summary('Skill-Duell-Move-Icon-Fallback-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });

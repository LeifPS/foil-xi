// Regressionstest für den gemeldeten schwersten Vorfall: "aus irgendeinem Grund wird mindestens einmal
// täglich mein Verein gelöscht" (iPad, iPadOS) - der Account war danach auch in Firestore selbst blank,
// also wie frisch angelegt. Drei unabhängige Löcher, durch die ein bestehender Spielstand überschrieben
// werden konnte, sind jetzt zu; jedes einzelne hätte den Vorfall verhindert:
//
// (1) init() legte einen frischen, leeren Account an, sobald der profile-Key fehlte - AUCH wenn das
//     Save-Dokument sehr wohl existierte (halb geschriebener Zustand, ein früher fehlgeschlagener
//     profile-Write, ein Fremdschreiber). Der leere Account wurde sofort darüber geschrieben. Jetzt
//     wird in genau diesem Fall hart blockiert (showSaveIncompleteScreen), nie überschrieben.
// (2) sSet('profile', ...) hatte - anders als sSet('collection', ...) - überhaupt keinen Wächter. Jetzt
//     werden Schreibversuche blockiert, die careerWins oder prestige senken; beide können im echten
//     Spiel per Design nie sinken (careerWins überlebt sogar einen Great Reset), ein Absinken bedeutet
//     also immer "hier überschreibt gerade etwas Leeres/Fremdes einen echten Stand".
// (3) Der Sitzungs-Heartbeat stempelte sich alle 75s blind als Besitzer ein, ohne je zu prüfen, ob
//     inzwischen ein anderes Gerät übernommen hat - ein von iOS im Hintergrund gehaltenes/wieder
//     aufgewecktes Alt-Tab schrieb so seinen veralteten Stand über den neuen. Jetzt wird die Sperre vor
//     jedem Heartbeat geprüft und bei Verlust JEDER weitere Schreibvorgang dieses Tabs verweigert.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    clubId = 'testclub';
    const writes = [];
    const toasts = [];
    toast = (m) => toasts.push(m);

    // ---------- (2) profile-Collapse-Wächter ----------
    fb = {
      doc: (db, col, id) => ({ path: col + '/' + id }),
      setDoc: async (ref, val) => { writes.push({ path: ref.path, val }); },
    };
    _lastKnownCollectionLen = null;
    _lastKnownProfileFloor = null;

    // Ein echter, fortgeschrittener Spielstand wird geladen -> ab jetzt ist der Wächter scharf.
    rememberProfileFloor({ coins: 500000, careerWins: 240, prestige: 2 });

    // 2a) Ein ganz normaler Write (Fortschritt bleibt/steigt) geht selbstverständlich durch.
    await sSet('profile', { coins: 501000, careerWins: 241, prestige: 2 });
    const normalWriteAllowed = writes.length === 1;

    // 2b) Genau der Schadensfall: ein frisch angelegtes Profil (careerWins/prestige auf 0) soll über den
    // echten Stand geschrieben werden -> muss blockiert werden, NICHTS darf rausgehen.
    const blankProfile = { coins: 0, userId: 'testclub', displayName: 'testclub', wins: 0, losses: 0, careerWins: 0, prestige: 0 };
    const blankResult = await sSet('profile', blankProfile);
    const blankWriteBlocked = writes.length === 1 && blankResult === null;
    const blockToastShown = toasts.some(t => t.includes('zurückgesetzt') || t.includes('blockiert'));

    // 2c) Auch ein Great Reset bleibt möglich: Coins/Siege auf 0, ABER prestige steigt und careerWins
    // bleibt erhalten - genau so macht es greatResetProfilePatch. Darf NICHT blockiert werden.
    const afterGreatReset = { coins: 0, wins: 0, losses: 0, careerWins: 241, prestige: 3 };
    await sSet('profile', afterGreatReset);
    const greatResetStillAllowed = writes.length === 2;

    // 2d) Ein Rückschritt allein bei prestige (ohne careerWins-Verlust) wird ebenfalls erkannt.
    const prestigeBack = { coins: 1000, careerWins: 241, prestige: 1 };
    await sSet('profile', prestigeBack);
    const prestigeDropBlocked = writes.length === 2;

    // ---------- (3) Sitzungsübernahme stoppt alle weiteren Writes ----------
    const writesBeforeTakeover = writes.length;
    handleSessionTakenOver();
    const takeoverModalShown = document.querySelector('#modal-root').innerHTML.includes('anderem Gerät');
    // Selbst ein völlig unverdächtiger, legitimer Write darf jetzt nicht mehr rausgehen.
    const afterTakeoverResult = await sSet('profile', { coins: 600000, careerWins: 250, prestige: 3 });
    const writesStoppedAfterTakeover = writes.length === writesBeforeTakeover && afterTakeoverResult === null;
    // Auch andere Keys (nicht nur profile) sind gesperrt - ein Zombie-Tab darf GAR NICHTS mehr schreiben.
    await sSet('collection', [{ uid: 'x', cardId: 1 }]);
    const allKeysBlockedAfterTakeover = writes.length === writesBeforeTakeover;
    sessionLostToOtherDevice = false; // für den nächsten Abschnitt zurücksetzen
    document.getElementById('modal-root').innerHTML = '';

    // ---------- (1) init() darf bei existierendem Dokument ohne profile nichts überschreiben ----------
    const writesBeforeInit = writes.length;
    // sGetMany liefert exakt den kaputten Zustand: Dokument existiert, profile fehlt.
    sGetMany = async () => {
      const out = { profile: null, collection: null, managerCollection: null, packCollection: null, squad: null, squadPresets: null };
      Object.defineProperty(out, '__saveDocExisted', { value: true, enumerable: false });
      return out;
    };
    await init();
    const initBlockedInsteadOfOverwriting = writes.length === writesBeforeInit;
    const saveIncompleteScreenShown = document.querySelector('#modal-root').innerHTML.includes('unvollständig');

    document.getElementById('modal-root').innerHTML = '';

    // ---------- (4) Fremd-Account-Writes (Admin-Panel, Transfermarkt) laufen jetzt durch denselben
    // Wächter - diese Pfade gingen komplett an sSet() vorbei und waren dadurch völlig ungeschützt.
    const foreignWrites = [];
    let storedForeignProfile = { coins: 90000, careerWins: 120, prestige: 1 };
    fb = {
      doc: (db, col, id) => ({ path: col + '/' + id }),
      getDoc: async (ref) => ({ exists: () => true, data: () => ({ profile: storedForeignProfile }) }),
      setDoc: async (ref, val) => { foreignWrites.push({ path: ref.path, val }); },
    };

    // 4a) Legitimer Admin-Write (z.B. Coins geben) geht durch.
    await writeForeignProfileGuarded('fremdverein', { ...storedForeignProfile, coins: 95000 });
    const foreignNormalWriteAllowed = foreignWrites.length === 1;

    // 4b) Genau der Schadensfall: das Panel hatte einen leeren/unvollständigen Snapshot, newProfile ist
    // daher praktisch leer -> muss blockiert werden und werfen (damit die try/catch der Aufrufer greifen).
    let threw = false;
    try { await writeForeignProfileGuarded('fremdverein', { coins: 95000 }); }
    catch (e) { threw = true; }
    const foreignBlankWriteBlocked = threw && foreignWrites.length === 1;

    // 4c) Kann der aktuelle Stand nicht gelesen werden, wird ebenfalls NICHT geschrieben (im Zweifel
    // lieber gar nichts tun, als blind über einen unbekannten Stand zu schreiben).
    fb.getDoc = async () => { throw new Error('network'); };
    let threwOnReadFail = false;
    try { await writeForeignProfileGuarded('fremdverein', { ...storedForeignProfile, coins: 1 }); }
    catch (e) { threwOnReadFail = true; }
    const foreignReadFailBlocksWrite = threwOnReadFail && foreignWrites.length === 1;

    // 4d) Die Versions-Wiederherstellung darf als EINZIGE bewusst zurückspielen (allowRollback).
    fb.getDoc = async () => ({ exists: () => true, data: () => ({ profile: storedForeignProfile }) });
    await writeForeignProfileGuarded('fremdverein', { coins: 10, careerWins: 5, prestige: 0 }, { collection: [] }, { allowRollback: true });
    const rollbackRestoreStillAllowed = foreignWrites.length === 2;

    return {
      normalWriteAllowed, blankWriteBlocked, blockToastShown, greatResetStillAllowed, prestigeDropBlocked,
      takeoverModalShown, writesStoppedAfterTakeover, allKeysBlockedAfterTakeover,
      initBlockedInsteadOfOverwriting, saveIncompleteScreenShown,
      foreignNormalWriteAllowed, foreignBlankWriteBlocked, foreignReadFailBlocksWrite, rollbackRestoreStillAllowed,
    };
  }));

  console.log('Spielstand-Überschreib-Schutz-Test');
  noErrors(errors, 'Seite');
  eq(result.normalWriteAllowed, true, 'ein ganz normaler Profil-Write (Fortschritt steigt) geht unverändert durch');
  eq(result.blankWriteBlocked, true, 'ein frisch angelegtes, leeres Profil kann NICHT mehr über einen echten Spielstand geschrieben werden');
  ok(result.blockToastShown, 'der Spieler sieht, dass ein Schreibversuch blockiert wurde, statt es still geschehen zu lassen');
  eq(result.greatResetStillAllowed, true, 'ein legitimer Great Reset (Coins/Siege auf 0, prestige steigt, careerWins bleibt) wird weiterhin gespeichert');
  eq(result.prestigeDropBlocked, true, 'auch ein alleiniger Prestige-Rückschritt wird als Überschreib-Versuch erkannt und blockiert');
  eq(result.takeoverModalShown, true, 'wird die Sitzung von einem anderen Gerät übernommen, sagt dieses Fenster das klar an');
  eq(result.writesStoppedAfterTakeover, true, 'nach einer Übernahme schreibt dieses Tab nichts mehr (kein Überschreiben des anderen Geräts)');
  eq(result.allKeysBlockedAfterTakeover, true, 'die Schreibsperre gilt für alle Keys, nicht nur profile');
  eq(result.initBlockedInsteadOfOverwriting, true, 'existiert das Save-Dokument, enthält aber kein Profil, legt init() KEINEN leeren Account an und schreibt nichts');
  eq(result.saveIncompleteScreenShown, true, 'stattdessen erscheint ein klarer Hinweis-Screen mit Verweis auf die Wiederherstellung');
  eq(result.foreignNormalWriteAllowed, true, 'ein legitimer Write in einen fremden Account (Admin-Panel) geht unverändert durch');
  eq(result.foreignBlankWriteBlocked, true, 'ein leeres/unvollständiges Profil kann NICHT mehr über einen fremden Spielstand geschrieben werden (Admin-Panel/Transfermarkt liefen bisher komplett an jedem Schutz vorbei)');
  eq(result.foreignReadFailBlocksWrite, true, 'lässt sich der aktuelle Stand des Zielaccounts nicht lesen, wird gar nicht erst geschrieben');
  eq(result.rollbackRestoreStillAllowed, true, 'die Versions-Wiederherstellung darf als einzige bewusst einen älteren Stand zurückspielen (allowRollback)');

  summary('Spielstand-Überschreib-Schutz-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });

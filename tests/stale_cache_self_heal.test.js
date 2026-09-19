// Regressionstest für den aktiven Stale-Cache-Selbstheilungs-Mechanismus im <head> (foil11CheckStaleCache):
// ein Browser, der nach einem Deploy noch eine alte gecachte Kopie von index.html ausliefert, lief bisher
// unbegrenzt auf veraltetem Code weiter - genau das hat zu mehreren echten, gemeldeten Vorfällen geführt
// (u.a. der alte "10.000 Coins"-Draft-Modus und ein kompletter Spielstand-Verlust auf einem iPad, weil
// die alte Version noch einen längst gefixten Bug hatte: ein fehlgeschlagener Firestore-Lesevorgang beim
// Boot wurde fälschlich als "neuer Account" behandelt). Der Mechanismus vergleicht per günstigem
// HEAD-Request den ETag/Last-Modified-Header des Servers mit dem zuletzt gesehenen Wert und erzwingt bei
// einer Abweichung einen echten Netzwerk-Reload über eine cache-gebustete URL.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(async () => {
    localStorage.removeItem('foil11-last-seen-version');
    sessionStorage.removeItem('foil11-cachebust-inflight');
    const realFetch = window.fetch;
    let testEtag = 'etag-A';
    const fetchCalls = [];
    window.fetch = async (url, opts) => {
      fetchCalls.push({ url, method: opts && opts.method });
      return { headers: { get: (k) => (k === 'etag' ? testEtag : null) } };
    };
    let replaceCalls = [];
    window.foil11ForceReload = (url) => { replaceCalls.push(url); };

    // ---------- (1) Erster Aufruf überhaupt: kein gespeicherter Wert -> keine Umleitung, Wert wird nur gemerkt ----------
    foil11CheckStaleCache();
    await new Promise(r => setTimeout(r, 20));
    const noReloadOnFirstCall = replaceCalls.length === 0;
    const storedAfterFirstCall = localStorage.getItem('foil11-last-seen-version');
    const usedHeadMethod = fetchCalls[0] && fetchCalls[0].method === 'HEAD';

    // ---------- (2) Erneuter Aufruf, Server-ETag UNVERÄNDERT -> keine Umleitung ----------
    foil11CheckStaleCache();
    await new Promise(r => setTimeout(r, 20));
    const noReloadWhenUnchanged = replaceCalls.length === 0;

    // ---------- (3) Server-ETag hat sich geändert (simuliert ein neues Deployment) -> erzwingt einen
    // Reload über eine cache-gebustete URL ----------
    testEtag = 'etag-B';
    foil11CheckStaleCache();
    await new Promise(r => setTimeout(r, 20));
    const forcedReloadOnMismatch = replaceCalls.length === 1 && replaceCalls[0].includes('_v=');
    const versionUpdatedToNewEtag = localStorage.getItem('foil11-last-seen-version') === 'etag-B';
    const guardSetAfterForcedReload = sessionStorage.getItem('foil11-cachebust-inflight') === '1';

    // ---------- (4) Der erzwungene Reload selbst darf sich NICHT nochmal umleiten (Loop-Schutz) - der
    // nächste Aufruf (wie er nach einem echten Reload passieren würde) räumt nur den Schutz-Flag ab.
    testEtag = 'etag-C'; // simuliert, dass sich der Server-Stand zufällig genau dazwischen nochmal geändert hätte
    foil11CheckStaleCache();
    await new Promise(r => setTimeout(r, 20));
    const noSecondJumpDespiteAnotherChange = replaceCalls.length === 1; // immer noch nur der eine aus Schritt (3)
    const guardClearedAfterSkip = sessionStorage.getItem('foil11-cachebust-inflight') === null;

    // ---------- (5) Danach löst ein GANZ NORMALER weiterer Aufruf (kein Loop-Schutz mehr aktiv) wieder
    // normal aus - der Loop-Schutz blockiert also nicht dauerhaft künftige echte Erkennungen.
    foil11CheckStaleCache();
    await new Promise(r => setTimeout(r, 20));
    const detectsAgainAfterGuardCleared = replaceCalls.length === 2 && replaceCalls[1].includes('_v=');

    window.fetch = realFetch;

    return {
      noReloadOnFirstCall, storedAfterFirstCall, usedHeadMethod,
      noReloadWhenUnchanged,
      forcedReloadOnMismatch, versionUpdatedToNewEtag, guardSetAfterForcedReload,
      noSecondJumpDespiteAnotherChange, guardClearedAfterSkip,
      detectsAgainAfterGuardCleared,
    };
  }));

  console.log('Stale-Cache-Selbstheilung-Test');
  noErrors(errors, 'Seite');
  eq(result.noReloadOnFirstCall, true, 'beim allerersten Aufruf (kein gespeicherter Wert) wird nicht umgeleitet');
  eq(result.storedAfterFirstCall, 'etag-A', 'der aktuelle Server-ETag wird beim ersten Aufruf lokal gemerkt');
  eq(result.usedHeadMethod, true, 'die Prüfung nutzt einen günstigen HEAD-Request, keinen vollen Download');
  eq(result.noReloadWhenUnchanged, true, 'bleibt der Server-ETag unverändert, wird nicht umgeleitet');
  eq(result.forcedReloadOnMismatch, true, 'ändert sich der Server-ETag (simuliertes Deployment), wird ein echter Reload über eine cache-gebustete URL erzwungen');
  eq(result.versionUpdatedToNewEtag, true, 'nach dem erzwungenen Reload ist der neue ETag lokal gemerkt');
  eq(result.guardSetAfterForcedReload, true, 'der Loop-Schutz-Flag wird beim Auslösen gesetzt');
  eq(result.noSecondJumpDespiteAnotherChange, true, 'der erzwungene Reload selbst löst keinen zweiten Sprung aus, selbst wenn sich der Server-Stand dazwischen nochmal geändert hätte (Loop-Schutz)');
  eq(result.guardClearedAfterSkip, true, 'der Loop-Schutz-Flag wird nach dem einen übersprungenen Aufruf wieder aufgeräumt');
  eq(result.detectsAgainAfterGuardCleared, true, 'nach dem Abklingen erkennt ein weiteres echtes Deployment wieder normal (der Loop-Schutz blockiert nicht dauerhaft)');

  summary('Stale-Cache-Selbstheilung-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });

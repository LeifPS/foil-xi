// Regressionstest: alle 72 UCL/UEL-Klub-Elfen (uclClubXI) müssen 11 Spieler, einen Trainer und (bis
// auf ein paar real sehr kleine Kader) keine doppelten Karten-IDs haben. Wurde ursprünglich als
// Ad-hoc-Skript während der Arbeit an den UCL/UEL-Bugfixes benutzt - hier fest verankert, damit jede
// künftige Änderung an boostBotXI/uclClubXI/den Pot-Listen automatisch dagegen geprüft werden kann.
const { withPage } = require('./lib/browser');
const { ok, eq, noErrors, summary } = require('./lib/assert');

// Diese Klubs haben im echten Kartenbestand so kleine Kader, dass Duplikate beim Auffüllen auf 11
// Positionen unvermeidbar sind - siehe UCL: Bugfix "kleine Kader spammen eine einzelne Karte in alle
// Positionen" (behoben wurde die Häufung, nicht jedes einzelne Duplikat bei extrem kleinen Kadern).
// Kommt ein NEUER Klub mit Duplikaten dazu, der hier nicht aufgeführt ist, soll der Test das melden.
const KNOWN_SMALL_ROSTER_DUP_CLUBS = new Set([
  'Club Brugge KV', 'FK Bodø/Glimt', 'Shakhtar Donetsk', 'LASK Linz', 'AZ Alkmaar',
  'Union Saint-Gilloise', 'Sparta Praha', 'Beşiktaş JK',
]);

(async () => {
  const { result, errors } = await withPage(async (page) => page.evaluate(() => {
    const rows = UCL_ALL_CLUBS.concat(UEL_ALL_CLUBS).map(club => {
      const xi = uclClubXI(club);
      const ids = xi.players.map(p => p.id);
      const dupIds = ids.length !== new Set(ids).size;
      return { club, rating: xi.rating, dupIds, hasManager: !!xi.managerName, len: xi.players.length };
    });
    return {
      count: rows.length,
      rows,
      minRating: Math.min(...rows.map(r => r.rating)),
      maxRating: Math.max(...rows.map(r => r.rating)),
    };
  }));

  console.log('UCL/UEL-Klub-Elfen-Test');
  noErrors(errors, 'Seite');
  eq(result.count, 72, 'alle 72 UCL/UEL-Klubs geprüft');

  const wrongLen = result.rows.filter(r => r.len !== 11);
  ok(wrongLen.length === 0, `jede Klub-Elf hat genau 11 Spieler${wrongLen.length ? ' (Ausnahmen: ' + wrongLen.map(r => r.club).join(', ') + ')' : ''}`);

  const noManager = result.rows.filter(r => !r.hasManager);
  ok(noManager.length === 0, `jeder Klub hat einen Trainer${noManager.length ? ' (Ausnahmen: ' + noManager.map(r => r.club).join(', ') + ')' : ''}`);

  const unexpectedDups = result.rows.filter(r => r.dupIds && !KNOWN_SMALL_ROSTER_DUP_CLUBS.has(r.club));
  ok(unexpectedDups.length === 0, `keine UNERWARTETEN doppelten Karten-IDs${unexpectedDups.length ? ' (neu betroffen: ' + unexpectedDups.map(r => r.club).join(', ') + ')' : ''}`);

  ok(result.minRating >= 60 && result.minRating <= 100, `niedrigstes Team-Rating plausibel (${result.minRating})`);
  ok(result.maxRating >= 100 && result.maxRating <= 140, `höchstes Team-Rating plausibel (${result.maxRating})`);

  summary('UCL/UEL-Klub-Elfen-Test');
})().catch(e => { console.error('FATAL', e); process.exit(1); });

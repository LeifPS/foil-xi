# Regressionstests

Playwright-gestützte Regressionstests für die Kernsysteme von FOIL ELEVEN, die wiederholt Ziel echter
Bugs waren (UCL/UEL-Ligaphase, K.o.-Runde). Kein Test-Framework, kein Build-Schritt — `index.html` ist
eine reine Static-Site, die Tests laden sie direkt in einem echten Browser (Playwright/Chromium) und
rufen die echten Spiel-Funktionen per `page.evaluate` auf, statt irgendetwas nachzubauen.

## Voraussetzungen

- Node.js
- Playwright mit Chromium. In der normalen Claude-Code-Sandbox für dieses Projekt ist beides schon
  vorinstalliert (`/opt/node22`, `/opt/pw-browsers/chromium` über `PLAYWRIGHT_BROWSERS_PATH`) — die
  Tests finden das automatisch (siehe `tests/lib/browser.js`). Auf einer anderen Maschine:
  `npm install playwright && npx playwright install chromium`.

## Ausführen

```bash
bash tests/run.sh
```

Startet bei Bedarf selbst kurz `python3 -m http.server 8931` für `index.html` (falls dort noch keiner
läuft) und führt danach jede `tests/*.test.js`-Datei aus. Exit-Code `1`, falls irgendein Test
fehlschlägt — geeignet für CI.

Läuft bereits ein eigener Server (z.B. während einer laufenden Entwicklungssitzung), einfach direkt:

```bash
FOIL_TEST_URL="http://localhost:8931/index.html?nosave=1" node tests/ucl_clubs.test.js
```

## Was wird geprüft

- **`ucl_clubs.test.js`** — alle 72 UCL/UEL-Klub-Elfen (`uclClubXI`) haben genau 11 Spieler, einen
  Trainer, und (bis auf eine bekannte Handvoll real sehr kleiner Kader) keine doppelten Karten-IDs.
- **`ucl_schedule.test.js`** — der gemeinsame Ligaphasen-Spielplan (`uclLeaguePhaseMatchPairs` +
  `uclAssignMatchdays`) ist für jeden Klub an jedem Spieltag eindeutig UND zwischen zwei Klubs
  gegenseitig konsistent (spielt A gegen B, zeigt B's Kalender am selben Spieltag genau A) — genau die
  Eigenschaft, die vor dem Fix fehlte ("Bodø/Glimt verliert gegen Bayern, obwohl Bayerns eigener
  Kalender an dem Tag gar kein Spiel gegen Bodø zeigte").
- **`ucl_knockout_aggregate.test.js`** — K.o.-Rückspiel-Logik: kein unnötiger Decider bei einem
  Rückspiel-Unentschieden trotz klarem Aggregat, aber ein Decider MUSS greifen, wenn umgekehrt das
  Aggregat unentschieden ist; `buildDecisiveMatch` mit `allowDraw:true` erzwingt keine Verlängerung auf
  einen echten 90-Minuten-Gleichstand; die live angezeigte Siegchance rechnet einen mitgebrachten
  Aggregat-Vorsprung aus dem Hinspiel ein.

## Neue Tests ergänzen

Eine neue Datei `tests/<name>.test.js` nach demselben Muster anlegen (siehe bestehende Dateien):
`withPage(...)` aus `tests/lib/browser.js` für das Browser-Setup, `ok`/`eq`/`noErrors`/`summary` aus
`tests/lib/assert.js` für Prüfungen. `run.sh` findet und führt sie automatisch mit aus (Glob `*.test.js`).

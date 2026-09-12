// Kleine gemeinsame Playwright-Bootstrap-Helfer für alle Regressionstests in diesem Ordner.
// index.html ist eine reine Static-Site ohne Build-Schritt - die Tests laden sie deshalb direkt aus
// einem lokalen HTTP-Server (siehe README.md) und rufen echte Spiel-Funktionen per page.evaluate auf,
// statt irgendetwas nachzubauen.
const fs = require('fs');

function loadPlaywright() {
  try { return require('playwright'); }
  catch (e) {
    // Fallback auf den in dieser Sandbox vorinstallierten Pfad, falls playwright nicht als
    // npm-Abhängigkeit dieses Repos vorliegt (siehe README.md "Voraussetzungen").
    return require('/opt/node22/lib/node_modules/playwright');
  }
}

const { chromium } = loadPlaywright();
const BASE_URL = process.env.FOIL_TEST_URL || 'http://localhost:8931/index.html?nosave=1';
const CHROMIUM_PATH = process.env.PLAYWRIGHT_CHROMIUM_PATH || '/opt/pw-browsers/chromium';

// Läuft `fn(page)` gegen eine frische, isolierte Seite mit dem üblichen Test-Setup (Gate-Overlay weg,
// keine echte Firebase-Verbindung, kein echtes localStorage-Gejammer) und gibt {result, errors}
// zurück - errors sind alle waehrend des Laufs aufgetretenen echten JS-Fehler der Seite (pageerror),
// die ein Test IMMER selbst prüfen sollte (leeres Array erwartet), nicht nur sein eigenes Ergebnis.
async function withPage(fn) {
  const launchOpts = {};
  try { fs.accessSync(CHROMIUM_PATH); launchOpts.executablePath = CHROMIUM_PATH; } catch (e) { /* System-Default verwenden */ }
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message + '\n' + e.stack));
  try {
    await page.goto(BASE_URL);
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      document.getElementById('gate-overlay')?.remove();
      warnStorageOnce = () => {};
      initFirebase = async () => false;
    });
    const result = await fn(page);
    return { result, errors };
  } finally {
    await browser.close();
  }
}

module.exports = { withPage, BASE_URL };

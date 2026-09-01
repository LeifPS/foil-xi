# FOIL ELEVEN Discord Bot — Setup

Läuft komplett als Firebase Cloud Functions im selben Projekt (`chess-rng`) wie das Spiel — kein
eigener Server, kein 24/7-Prozess. Slash-Commands laufen über Discords "HTTP Interactions"-Modus
(ein signierter HTTP-Request pro Command), die Liga-Ankündigung über einen Firestore-Trigger.

## 1. Discord-Application anlegen

1. https://discord.com/developers/applications → "New Application"
2. Unter **Bot**: Bot erstellen, **Token** kopieren (`DISCORD_BOT_TOKEN`) — nur einmal sichtbar, sicher
   aufbewahren.
3. Unter **General Information**: **Application ID** (`DISCORD_APPLICATION_ID`) und **Public Key**
   (`DISCORD_PUBLIC_KEY`) kopieren.
4. Unter **OAuth2 → URL Generator**: Scopes `bot` + `applications.commands`, Permission mindestens
   `Manage Roles` (für `/verify`) anhaken, generierten Link öffnen, um den Bot auf deinen Server
   einzuladen.
5. **Wichtig**: Die Bot-Rolle muss in der Server-Rollenliste ÜBER `Verifiziert` UND den 4 Liga-
   Rollen stehen, sonst darf er sie nicht vergeben (Discord-Rollenhierarchie).

## 2. Server-Rollen/Channels

- Rolle `Verifiziert` anlegen, ihre ID kopieren (Rechtsklick → ID kopieren, braucht
  Entwicklermodus in Discord-Einstellungen) → `DISCORD_VERIFIED_ROLE_ID`.
- 4 weitere Rollen anlegen: `Liga A`, `Liga B`, `Liga C`, `Liga D+` (D und alle tieferen Ligen
  teilen sich diese eine Rolle) → IDs kopieren → `DISCORD_ROLE_LIGA_A`/`_B`/`_C`/`_DPLUS`. Der Bot
  vergibt/wechselt diese Rolle automatisch bei `/verify` und bei jedem Liga-Rollover.
- Alle Channels außer `#verifizieren` auf "nur für Verifiziert sichtbar" stellen.
- Einen Webhook für den Ankündigungs-Channel anlegen (Kanal-Einstellungen → Integrationen →
  Webhooks → Neu) → URL kopieren → `DISCORD_ANNOUNCE_WEBHOOK_URL`.
- Server-ID kopieren → `DISCORD_GUILD_ID`.

## 3. Firebase Secrets setzen

Aus dem `functions/`-Ordner (braucht die Firebase CLI, `npm i -g firebase-tools`, `firebase login`):

```
firebase functions:secrets:set DISCORD_PUBLIC_KEY
firebase functions:secrets:set DISCORD_BOT_TOKEN
firebase functions:secrets:set DISCORD_GUILD_ID
firebase functions:secrets:set DISCORD_VERIFIED_ROLE_ID
firebase functions:secrets:set DISCORD_ANNOUNCE_WEBHOOK_URL
firebase functions:secrets:set DISCORD_ROLE_LIGA_A
firebase functions:secrets:set DISCORD_ROLE_LIGA_B
firebase functions:secrets:set DISCORD_ROLE_LIGA_C
firebase functions:secrets:set DISCORD_ROLE_LIGA_DPLUS
```

Jeder Befehl fragt interaktiv nach dem Wert (nicht in der Shell-History sichtbar).

## 4. Deployen

```
cd functions
npm install
firebase deploy --only functions
```

Nach dem Deploy zeigt die CLI die URL der `discordInteractions`-Function an
(sowas wie `https://discordinteractions-xxxxx-uc.a.run.app`).

## 5. Interactions Endpoint URL setzen

Zurück im Discord Developer Portal → **General Information** → **Interactions Endpoint URL** →
die Function-URL aus Schritt 4 eintragen und speichern. Discord schickt sofort einen Test-Ping;
schlägt der fehl, ist entweder die URL falsch oder `DISCORD_PUBLIC_KEY` nicht (oder falsch) gesetzt.

## 6. Commands registrieren

Discords Command-Liste ist getrennt vom Function-Code — nach jeder Änderung an
`register-commands.js` erneut ausführen:

```
DISCORD_APPLICATION_ID=... DISCORD_BOT_TOKEN=... node register-commands.js
```

Globale Commands brauchen bis zu 1 Stunde, um überall aufzutauchen. Für schnelles Testen während
der Entwicklung stattdessen an
`https://discord.com/api/v10/applications/{APPLICATION_ID}/guilds/{GUILD_ID}/commands` PUTten
(guild-spezifische Commands sind sofort da) — einfach die URL im Skript anpassen.

## 7. Im Spiel: Verify-Code anzeigen

Bereits eingebaut — Mein Verein → ⚙ Einstellungen → "Discord verknüpfen" → "Code erzeugen" zeigt
einen 15 Minuten gültigen 6-stelligen Code, den der Spieler dann mit `/verify code:...` einträgt.

## Befehle

| Command | Was er macht |
|---|---|
| `/verify code:XXXXXX` | Discord-Account mit Verein verknüpfen, vergibt Verifiziert- + Liga-Rolle |
| `/stats [verein]` | Coins, Siege, Karten |
| `/liga [buchstabe]` | Tabelle der letzten abgeschlossenen Liga-Woche |
| `/liga-preise [buchstabe]` | Belohnungstabelle für eine Liga |
| `/naechster-rollover` | Countdown bis Samstag 12:00 Uhr Berlin |
| `/vergleich verein1 verein2` | Zwei Vereine nebeneinander |
| `/leaderboard [kategorie]` | Top 10 nach Coins oder Siegen |
| `/karte name` | Reale Basis-Karte eines Spielers (keine Pack-Sondervarianten - siehe unten) |

`/karte` liest aus `functions/players_data.js`, einer Kopie der echten Spielerdatenbank
(`players_data.js` im Hauptordner) - sie zeigt nur die REALEN aktuellen Ratings, keine im Spiel
per Pack/SBC geboosteten Sonderkarten (die werden zur Laufzeit im Browser gebaut und existieren
nirgends als Datei, auf die der Bot zugreifen könnte). Nach jeder Regenerierung der Haupt-Datei
neu reinkopieren:
```
cp ../players_data.js players_data.js
echo "" >> players_data.js
echo "module.exports = PLAYERS_REAL_DB;" >> players_data.js
```

## Kosten

Braucht den Blaze-Tarif (pay-as-you-go) wegen ausgehender Netzwerk-Calls zu Discord. Bei
Hobby-Projekt-Volumen (ein paar hundert Commands/Tag, 1 Rollover/Woche) bleibt das im Rahmen des
kostenlosen Kontingents von Cloud Functions/Firestore — realistisch Cent-Bereich oder $0.

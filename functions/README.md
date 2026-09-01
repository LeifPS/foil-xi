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

Noch offen (siehe Hauptaufgabe) — im Spiel selbst muss unter Einstellungen ein Button "Discord
verknüpfen" einen zufälligen Code erzeugen und in `profile.discordVerifyCode` speichern, den der
Spieler dann mit `/verify code:...` einträgt.

## Kosten

Braucht den Blaze-Tarif (pay-as-you-go) wegen ausgehender Netzwerk-Calls zu Discord. Bei
Hobby-Projekt-Volumen (ein paar hundert Commands/Tag, 1 Rollover/Woche) bleibt das im Rahmen des
kostenlosen Kontingents von Cloud Functions/Firestore — realistisch Cent-Bereich oder $0.

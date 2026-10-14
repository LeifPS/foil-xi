# Foil XI – Design „Spieltag"

Die Oberfläche wurde komplett neu gestaltet. Spiellogik, Firebase und Daten sind unverändert; die Karten (`.pcard`) und ihre Effekte bleiben bewusst, wie sie waren.

## Idee
Ein Spieltag im Stadion: Rasen mit Mähstreifen als Fläche, Kreidelinien als Struktur, Anpfiff-Gelb als einzige Hauptaktion pro Ansicht, ein Folienverlauf (`--foil`) als Signatur für Besonderes.

## Tokens (Anfang des `<style>`-Blocks)
- Farben: `--rasen #0e3a28`, `--void #06201a`, `--panel #0a2c1f`, `--chalk #f2f0e4`, `--go #ffd23f`, `--turf-bright #4be39a`, `--gold #f6c859`, `--danger #ff5b49`.
- Schrift: Archivo Variable, selbst gehostet unter `fonts/`. Überschriften schmal (`--fd`, Breite 68 %), Fließtext `--fb`.
- Radien `--r1 6px`, `--r2 10px`.

## Aufbau
- Desktop: Seitenleiste (`#rail`) mit drei Gruppen (Sammeln, Verein, Spielen) und Kopfzeile (`#topbar`).
- Handy: Bottom-Bar mit 4 Bereichen plus „Mehr"-Sheet.
- Icons: `ICONS` / `ico(name)` (Strich-Icons). Alte Emoji in Texten ersetzt `convertEmojiIn()` zentral; das Originalzeichen bleibt unsichtbar im Text.
- Wiederverwendbare Bausteine: `.subnav`, `.filterbar`, `.toggle`, `.sec-h`, `.section-title`, `.tag`, `.mini-btn`, `.feature-strip`.

## Test-Hinweise
Die Tests in `tests/` laufen unverändert (`bash tests/run.sh`). Angepasst wurden nur drei Tests an Timing bzw. das neue Icon des Sichern-Knopfs.

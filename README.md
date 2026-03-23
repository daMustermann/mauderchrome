**mauderchrome — Einfache Anleitung für Windows 11 (ohne Docker)**

Dieses Repository enthält die Web‑UI einer Open‑Source‑Musik‑App. Die Anleitung hier erklärt die einfachste Methode, die App lokal auf Windows 11 zu starten — ohne Docker und so, dass auch Laien folgen können.

**Voraussetzungen (empfohlen):**
- **Bun**: Empfohlen. Installiere Bun von https://bun.sh/ — Bun ist schnell und vereinheitlicht `install`/`run` Befehle.
- **Git** (optional): Für das Klonen des Repositories. Alternativ kannst du das ZIP von GitHub herunterladen.

**Schritt für Schritt (sehr einfach)**
1. Repository herunterladen:

   - Mit Git: `git clone https://github.com/monochrome-music/monochrome.git`
   - Oder lade die ZIP von der GitHub‑Seite herunter und entpacke sie.

2. In das Projektverzeichnis wechseln:

   - `cd monochrome`

3. Abhängigkeiten installieren (einfachste Variante mit Bun):

   - Mit Bun (empfohlen): `bun install`

4. Entwicklungsserver starten:

   - Mit Bun (empfohlen): `bun run dev`

5. Im Browser öffnen:

   - Öffne `http://localhost:5173` in deinem Webbrowser.

Das ist alles — die App sollte jetzt im Browser laufen und ihr könnt Musik suchen und abspielen.


**Produktion / lokal testen (optional)**
- Produktion bauen (Bun): `bun run build`
- Vorschau lokal anzeigen (Bun): `bun run preview` (öffnet einen lokalen Server für die gebaute Version)

Viel Spaß — die obigen Schritte reichen für einen einfachen lokalen Start unter Windows 11 ohne Docker.

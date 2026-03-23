**mauderchrome — Einfache Anleitung für Windows 11 (ohne Docker)**

Dieses Repository enthält die Web‑UI einer Open‑Source‑Musik‑App. Die Anleitung hier erklärt die einfachste Methode, die App lokal auf Windows 11 zu starten — ohne Docker und so, dass auch Laien folgen können.

**Voraussetzungen (empfohlen):**
- **Bun**: Empfohlen. Installiere Bun von https://bun.sh/ — Bun ist schnell und vereinheitlicht `install`/`run` Befehle.
- **Node.js** (optional): Falls du Bun nicht nutzen möchtest, funktioniert auch Node.js (Version 18+).
- **Git** (optional): Für das Klonen des Repositories. Alternativ kannst du das ZIP von GitHub herunterladen.

**Schritt für Schritt (sehr einfach)**
1. Repository herunterladen:

   - Mit Git: `git clone https://github.com/monochrome-music/monochrome.git`
   - Oder lade die ZIP von der GitHub‑Seite herunter und entpacke sie.

2. In das Projektverzeichnis wechseln:

   - `cd monochrome`

3. Abhängigkeiten installieren (einfachste Variante mit Bun):

   - Mit Bun (empfohlen): `bun install`
   - Alternative mit NPM: `npm install`

4. Entwicklungsserver starten:

   - Mit Bun (empfohlen): `bun run dev`
   - Alternative mit NPM: `npm run dev`

5. Im Browser öffnen:

   - Öffne `http://localhost:5173` in deinem Webbrowser.

Das ist alles — die App sollte jetzt im Browser laufen und ihr könnt Musik suchen und abspielen.

**Wenn etwas nicht klappt (kurze Hilfe)**
- Prüfe, ob Bun korrekt installiert ist: `bun -v` sollte eine Versionsnummer anzeigen.
- Falls du NPM benutzt: `node -v` und `npm -v` zeigen die Versionen an.
- Falls `bun install`/`npm install` Fehler zeigt: versuche `npm ci` oder `npm install --legacy-peer-deps`.
- Firewall/Antivirus: Erlaube lokalen Zugriff auf den Port 5173, falls der Browser keine Verbindung herstellen kann.
- Port belegt: Wenn 5173 bereits verwendet wird, startet Vite normalerweise auf einem anderen Port; schau in die Konsolenausgabe nach der genauen URL.

**Produktion / lokal testen (optional)**
- Produktion bauen (Bun): `bun run build`
- Vorschau lokal anzeigen (Bun): `bun run preview` (öffnet einen lokalen Server für die gebaute Version)

Wenn du NPM verwendest, funktionieren die üblichen `npm run build` / `npm run preview` Befehle ebenso.

**Kurz: Wie benutze ich die App?**
- Suche nach Künstlern, Alben oder Titeln in der Suchleiste.
- Klick auf Play, um Musik zu hören.
- Nutze die Player‑Steuerung (laut, leise, vor/ zurück, Warteschlange).

**Weitere Hilfe / Support**
- Für Fragen oder Probleme erstelle ein Issue auf GitHub: https://github.com/monochrome-music/monochrome/issues

Viel Spaß — die obigen Schritte reichen für einen einfachen lokalen Start unter Windows 11 ohne Docker.

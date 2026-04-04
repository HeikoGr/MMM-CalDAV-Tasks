# CLI Debug Tool für MMM-CalDAV-Tasks

Ein Kommandozeilen-Werkzeug zum Testen und Debuggen des MMM-CalDAV-Tasks Moduls außerhalb von MagicMirror².

## Überblick

Das CLI Debug Tool ermöglicht es, die wichtigsten Funktionen des Moduls direkt von der Kommandozeile aus zu testen:

- ✅ **Konfigurationsvalidierung** - Überprüfen der config.js auf Fehler
- 📥 **Task-Abruf** - Tasks vom CalDAV-Server abrufen und anzeigen
- 🔄 **Status-Toggle** - Task-Status (erledigt/offen) direkt ändern

Das Tool kommuniziert direkt mit dem `node_helper` Backend und simuliert die Socket-Kommunikation, die normalerweise zwischen dem Frontend (MMM-CalDAV-Tasks.js) und dem Backend (node_helper.js) stattfindet.

## Installation

Das Tool ist bereits im Modul enthalten. Keine zusätzliche Installation erforderlich.

## Konfiguration

Das Tool liest standardmäßig die Konfiguration aus `config/config.js`. Diese Datei kann entweder:

1. **Eine vollständige MagicMirror-Konfiguration sein** (wie in der Hauptinstallation)
2. **Eine Standalone-Konfiguration sein** (nur das MMM-CalDAV-Tasks config-Objekt)

### Vollständige MagicMirror-Konfiguration

```javascript
let config = {
  modules: [
    {
      module: 'MMM-CalDAV-Tasks',
      config: {
        webDavAuth: {
          url: 'https://nextcloud.example.com/',
          username: 'username',
          password: 'password'
        },
        updateInterval: 60000,
        // ... weitere Optionen
      }
    }
  ]
};
```

### Standalone-Konfiguration

```javascript
{
  webDavAuth: {
    url: 'https://nextcloud.example.com/',
    username: 'username',
    password: 'password'
  },
  updateInterval: 60000,
  // ... weitere Optionen
}
```

## Verwendung

### Hilfe anzeigen

```bash
node scripts/cli-debug.js help
# oder mit npm script:
node --run debug:help
```

### Konfiguration testen

```bash
node scripts/cli-debug.js test-config
# oder:
node --run debug:config
```

**Ausgabe:**
- ✅ Konfiguration ist gültig
- 📋 Normalisierte Konfiguration mit allen Standardwerten
- ❌ Fehlermeldungen bei ungültiger Konfiguration

### Tasks vom Server abrufen

```bash
node scripts/cli-debug.js fetch
# oder:
node --run debug:fetch
```

**Ausgabe:**
- Anzahl der geladenen Tasks und Kalender
- Liste aller Kalender mit:
  - Name, URL, Farbe
  - Alle Tasks mit Status (✓/○), Priorität, Titel
  - UID und Dateiname (für toggle-Kommando)
  - Fälligkeitsdatum

**Beispiel:**
```
✅ Successfully fetched 37 tasks from 8 calendar(s)

📅 Calendar 1: ToDo Merle
   URL: https://nc.example.com/remote.php/dav/calendars/user/calendar/
   Color: #63DA38
   Tasks: 36

   📝 Tasks:
      ✓ [P1] Vokabeln lernen
         UID: 9941C9D7-2175-4EAE-830B-58B19B948B09
         File: https://nc.example.com/.../9941C9D7-2175-4EAE-830B-58B19B948B09.ics
         Due: 09.03.2025 17:00
      ○ [P5] Einkaufen
         UID: ABC123-DEF456-GHI789
         File: https://nc.example.com/.../ABC123-DEF456-GHI789.ics
```

### Task-Status umschalten

```bash
node scripts/cli-debug.js toggle <UID>
```

**UID ermitteln:** Verwende `fetch` um die UID eines Tasks zu finden

**Beispiel:**
```bash
# Task als erledigt markieren (oder wieder öffnen)
node scripts/cli-debug.js toggle 9941C9D7-2175-4EAE-830B-58B19B948B09
```

**Ausgabe:**
```
🔄 Toggling task: 9941C9D7-2175-4EAE-830B-58B19B948B09...

📝 Found task: Vokabeln lernen
   Status: COMPLETED
   Filename: https://nc.example.com/.../9941C9D7-2175-4EAE-830B-58B19B948B09.ics

✅ Task toggled successfully!
   New status: IN-PROGRESS

🔄 Fetching updated tasks...
```

### Alternative Konfigurationsdatei verwenden

```bash
node scripts/cli-debug.js fetch --config /path/to/custom-config.js
```

## NPM Scripts

Das Modul stellt folgende npm-Scripts bereit:

| Script | Befehl | Beschreibung |
|--------|--------|--------------|
| `debug` | `node --run debug` | Zeigt Hilfe an |
| `debug:help` | `node --run debug:help` | Zeigt Hilfe an |
| `debug:config` | `node --run debug:config` | Validiert Konfiguration |
| `debug:fetch` | `node --run debug:fetch` | Ruft Tasks vom Server ab |

## Debug-Modus

Für detaillierte Fehlerinformationen mit Stack Traces:

```bash
DEBUG=1 node scripts/cli-debug.js fetch
```

## Architektur

### Komponenten

Das CLI-Tool besteht aus folgenden Komponenten:

```
scripts/cli-debug.js
├── MockNodeHelper         - Simuliert MagicMirror NodeHelper
├── loadConfig()           - Lädt und parst Konfigurationsdatei
├── testConfig()           - Validiert Konfiguration (config-validator.js)
├── fetchTasks()           - Ruft Tasks ab (implementiert getData aus node_helper)
└── toggleTask()           - Ändert Task-Status (implementiert toggleStatusViaWebDav)
```

### Verwendete Module

Das Tool verwendet die gleichen Backend-Module wie `node_helper.js`:

- `transformer.js` - Sortierung und Transformation
- `webDavHelper.js` - CalDAV-Kommunikation
- `vtodo-completer.js` - Task-Completion (inkl. wiederkehrende Tasks)
- `config-validator.js` - Konfigurationsvalidierung
- `error-handler.js` - Fehlerbehandlung
- `date-utils.js` - Datumsformatierung (indirekt via vtodo-completer)

### Workflow

1. **Konfiguration laden**
   - Liest `config/config.js`
   - Erkennt MagicMirror- vs. Standalone-Format
   - Extrahiert MMM-CalDAV-Tasks config

2. **fetch: Tasks abrufen**
   - Validiert Konfiguration
   - Ruft `fetchCalendarData()` auf
   - Parst ICS-Daten mit `parseList()`
   - Transformiert und sortiert Tasks
   - Zeigt formatierte Ausgabe

3. **toggle: Status ändern**
   - Ruft erst `fetchTasks()` auf
   - Findet Task anhand UID
   - Initialisiert DAV-Client
   - Ruft `VTodoCompleter.completeVTodo()` auf
   - Zeigt aktualisierte Task-Liste

## Fehlerbehandlung

Das Tool behandelt folgende Fehler:

| Fehler | Meldung | Lösung |
|--------|---------|--------|
| Config nicht gefunden | ❌ Config file not found | config/config.js erstellen |
| Modul nicht konfiguriert | ❌ MMM-CalDAV-Tasks module not found | Modul in config.js hinzufügen |
| Ungültige Config | ❌ Configuration has errors | Fehler in Ausgabe beheben |
| Server nicht erreichbar | ❌ Error fetching tasks | URL, Credentials prüfen |
| Task nicht gefunden | ❌ Task with UID ... not found | UID mit `fetch` prüfen |

## Anwendungsfälle

### 1. Entwicklung und Testing

```bash
# Nach Code-Änderungen testen
node --run debug:fetch

# Konfiguration nach Änderungen validieren
node --run debug:config
```

### 2. Debugging von Problemen

```bash
# Detaillierte Fehlerausgabe
DEBUG=1 node scripts/cli-debug.js fetch

# Überprüfen ob Server erreichbar
node --run debug:fetch
```

### 3. Task-Management

```bash
# Alle offenen Tasks anzeigen
node --run debug:fetch | grep "○"

# Task als erledigt markieren
node scripts/cli-debug.js toggle ABC123-DEF456
```

### 4. CI/CD Integration

```bash
# In automatisierten Tests
node --run debug:config && node --run debug:fetch
```

## Limitierungen

- **Keine Browser-Features**: DOM-Rendering, CSS nicht testbar
- **Kein Socket.IO**: Simuliert Socket-Kommunikation, kein echtes WebSocket
- **Konfigurationsdatei erforderlich**: Kein interaktiver Modus

## Sicherheitshinweise

⚠️ **Wichtig**: Das Tool verwendet `eval()` und `Function()` zum Parsen der Konfigurationsdatei.

- Nur vertrauenswürdige Konfigurationsdateien verwenden
- Nicht in Produktionsumgebungen mit unbekannten Configs nutzen
- Passwörter nicht in öffentliche Repositories committen

**Best Practice**: Verwende `.env`-Dateien oder Umgebungsvariablen für Credentials:

```javascript
// In config.js
{
  webDavAuth: {
    url: process.env.CALDAV_URL,
    username: process.env.CALDAV_USER,
    password: process.env.CALDAV_PASS
  }
}
```

## Troubleshooting

### "Cannot find module 'xxx'"

```bash
# Dependencies installieren
npm install
```

### "Configuration error: ..."

```bash
# Konfiguration validieren
node --run debug:config

# Template kopieren
cp config/config.template.js config/config.js
```

### "Error fetching tasks"

1. Server-URL prüfen (mit `/` am Ende)
2. Credentials überprüfen
3. Netzwerk-Verbindung testen:
   ```bash
   curl -u username:password https://nextcloud.example.com/remote.php/dav/calendars/
   ```

### "Task with UID ... not found"

- UID komplett kopieren (ohne Zeichen weglassen)
- Mit `fetch` aktuelle UIDs abrufen
- Prüfen ob Task wirklich existiert

## Weiterführende Dokumentation

- [UTILITIES.md](UTILITIES.md) - Dokumentation der Utility-Module
- [README.md](README.md) - Haupt-Dokumentation des Moduls
- [REFACTORING_REPORT.md](REFACTORING_REPORT.md) - Technischer Refactoring-Bericht

## Lizenz

MIT License - siehe [LICENSE.txt](LICENSE.txt)

## Support

Bei Problemen oder Fragen:
- GitHub Issues: https://github.com/Coernel82/MMM-CalDAV-Tasks/issues
- MagicMirror² Forum: https://forum.magicmirror.builders/

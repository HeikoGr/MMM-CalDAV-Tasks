# MMM-CalDAV-Tasks Documentation

Dieses Verzeichnis sammelt die Zusatzdokumentation des Repositories. Der Einstieg fuer Installation, Konfiguration und Nutzung bleibt in [../README.md](../README.md).

## Inhalte

- [CLI-DEBUG.md](CLI-DEBUG.md): englische CLI-Dokumentation fuer das Debug-Tool
- [CLI-DEBUG_DE.md](CLI-DEBUG_DE.md): deutsche CLI-Dokumentation fuer das Debug-Tool
- [DEVCONTAINER.md](DEVCONTAINER.md): Devcontainer-spezifische Hinweise

## Architekturhinweise

- Requests werden pro Modulinstanz ueber die MagicMirror-Identifier korreliert.
- Long-Press-Handler werden nur innerhalb des aktuellen Modul-DOMs gebunden.
- `suspend()` und `resume()` steuern den Polling-Timer und den Frontend-Timeout sauber.
# Innovaphone App Development Context

Übertragbare Hinweise für zukünftige Projekte mit der innovaphone App Platform
und JavaScript Runtime. Diese Notizen stammen aus der Arbeit am RSS Feed
Connector und sind kein Ersatz für die Dokumentation der tatsächlich
eingesetzten SDK-/PBX-Version.

## 1. APIs anhand der Zielversion verifizieren

- Vor der Implementierung die offizielle SDK-Dokumentation der Zielversion
  lesen. Nicht aus Browser-JavaScript oder Node.js auf die App-Platform-Runtime
  schließen.
- API-Namen, Argumente, Callback-Reihenfolge und Fehlerfälle genau prüfen.
  Beispielsweise den dokumentierten HTTP-Weg `HttpClient.request("GET", url)`
  verwenden und nicht `HttpClient.get(...)` oder globales `fetch()` annehmen.
- Verfügbarkeit auch zur Laufzeit explizit prüfen. Bei nicht vorhandenen
  APIs mit einer verständlichen Fehlermeldung abbrechen, nicht still auf einen
  unbestätigten Ersatz ausweichen.
- Browser-App, Appwebsocket und serverseitige JavaScript Runtime sind getrennte
  Umgebungen. Eine API, die im Browser oder in Node.js verfügbar ist, ist nicht
  automatisch auch im Service verfügbar.

Dokumentationsstartpunkte (vor Nutzung auf Aktualität für die Zielversion
prüfen):

- [App Platform: AppGeneric](https://sdk.innovaphone.com/15r1/doc/appgeneric.htm)
- [HttpClient](https://sdk.innovaphone.com/15r1/doc/javascript/HttpClient.htm)
- [AppWebsocketClient](https://sdk.innovaphone.com/15r1/doc/javascript/AppWebsocketClient.htm)
- [Services protocol](https://sdk.innovaphone.com/15r1/doc/appwebsocket/Services.htm)
- [Messages protocol](https://sdk.innovaphone.com/15r1/doc/appwebsocket/Messages.htm)

Dieses Repository enthält außerdem ein lokales, nicht versioniertes SDK-Korpus
unter `.local-docs/innovaphone-sdk`. Für gezielte lokale Suche siehe
[`tools/README.md`](./tools/README.md).

## 2. Runtime-Dateien und globale Namensräume

- Die Dateien aus `config.json` werden in der angegebenen Reihenfolge in die
  Runtime geladen. Reihenfolge und Abhängigkeiten sind Teil des Laufzeitvertrags.
- Runtime-Skripte können denselben globalen Namensraum teilen. Generische
  globale Funktionsnamen wie `parse`, `init` oder `start` können eine andere
  Datei unbemerkt überschreiben.
- Verwende eindeutige, modulbezogene Namen (zum Beispiel `parseFeedUrl`) und
  halte Exporte/Globals mit den vorhandenen Projektmustern kompatibel.
- Ein Node-Test mit `require()` bildet globale Auswertung nicht automatisch ab.
  Für Dateien, die im Runtime-Globalbereich konkurrieren können, einen
  Regressionstest ergänzen, der die tatsächliche Ladefolge simuliert.
- Nach Änderungen an `config.json` kontrollieren, dass jede referenzierte Datei
  existiert und vor ihren Nutzern geladen wird.

## 3. Asynchrone Services und Protokolle

- App-Platform-Netzwerk- und Datenbankzugriffe sind callback-/eventbasiert.
  Fehlerpfade, Abbrüche, Timeouts und Mehrfach-Callbacks von Anfang an
  behandeln; Erfolg erst melden, wenn die zugehörige Protokollantwort eintrifft.
- Bei Services API und `messages-api` Discovery, Login/Challenge und die
  erforderlichen Berechtigungen des PBX-App-Objekts getrennt verifizieren.
  Ein erfolgreicher Websocket-Aufbau beweist noch keine Berechtigung für ein
  bestimmtes Messages-Topic.
- Nachrichten gemäß dem dokumentierten Protokoll bauen und Antworten über
  Request-/Source-IDs korrelieren. Kein Feld wie `api` ergänzen, sofern das
  jeweilige Protokoll es nicht vorsieht.
- Topic-/Zielauswahl möglichst über die Service-API ermitteln und vor dem
  Betrieb gegen die erreichbaren Topics validieren; keine nicht bestätigte
  Benutzerangabe als erfolgreiches Ziel behandeln.
- Persistente Zustandsänderungen erst nach erfolgreicher Remote-Bestätigung
  speichern. Sonst kann ein Fehler beim Posten Einträge fälschlich als erledigt
  markieren oder ein Neustart Duplikate verursachen.

## 4. Eingaben, Netzwerkzugriffe und Ressourcen

- Externe URLs sind nicht vertrauenswürdig. Protokoll, Host, Credentials,
  IP-Literale und aufgelöste Ziele validieren; private/reservierte Ziele
  ablehnen und Redirects nur dann erlauben, wenn jedes Redirect-Ziel erneut
  sicher validiert wird.
- DNS-Prüfung vor dem Request allein verhindert DNS-Rebinding nicht zwingend.
  Wo möglich zusätzlich ausgehenden Netzwerkverkehr auf Plattform-/PBX-Ebene
  begrenzen.
- Eingaben für Datenbankabfragen mit den dokumentierten Datenbank-Helpers
  behandeln. Große Mengen in begrenzten Batches abfragen; Query- und
  Parallelitätsgrenzen explizit festlegen.
- Größen- und Zeitgrenzen für externe Antworten, Warteschlangen und
  ausstehende Requests vorsehen. Keine unbeschränkte Parallelität oder
  unbegrenzte Antwortpuffer einführen.
- Logs sollen Phase, Statuscode und knappe Diagnose enthalten, nicht komplette
  Feed-Inhalte, Zugangsdaten, Authentifizierungs-Challenges oder Tokens.
  Vor Weitergabe von PBX-Traces sensible Werte schwärzen.

## 5. Persistenz und Konfiguration

- App-Platform-Datenbanktabellen in der App-Konfiguration deklarieren und
  Repository-Zugriff von Service-Orchestrierung trennen.
- Persistenz über App-/Service-Neustarts hinweg testen; flüchtige
  Status-/Scheduler-Daten ausdrücklich als flüchtig dokumentieren.
- Konfigurationsdateien wie `config.json` sind Teil des Deployments: Schema,
  Tabellen und Service-Skripte gemeinsam prüfen.
- Unbekannte oder ungültige Daten explizit als Fehler behandeln, statt mit
  success-shaped Defaults weiterzulaufen.

## 6. Tests und Deployment

- Fachlogik als möglichst reine Funktionen halten und lokal mit Node-Tests
  sowie kleinen Fixtures testen. Runtime-APIs durch schmale Test-Doubles
  ersetzen, nicht im Produktivcode durch undokumentierte Fallbacks.
- Kritische Fälle abdecken: ungültige Eingaben, Callback-Fehler, Timeouts,
  Wiederanlauf, doppelte Zustellung, Runtime-Ladereihenfolge und Antworten
  ohne erwartete Metadaten.
- Lokale Tests ersetzen keinen PBX-Smoke-Test. Vor Freigabe auf der Ziel-PBX
  Installation, Berechtigungen, Service Discovery, echten Post und Fehlerpfade
  prüfen.
- Bei Änderungen an Runtime-/HTTP-Dateien alle daraus gebauten Artefakte und
  Architekturpakete aktualisieren. Archive öffnen bzw. auf Integrität und
  enthaltene aktuelle Dateien prüfen, statt nur den Build-Erfolg anzunehmen.
- In vorhandenen Projekten zuerst Build-/Paketierungsabläufe, Namenskonventionen
  und Git-Status lesen. Keine generierten Pakete oder fremde Arbeitsänderungen
  überschreiben.

## 7. Effizienter Arbeitsablauf für neue Projekte

1. Ziel-PBX-/SDK-Version, App-Typ, Ausführungsumgebungen und erforderliche
   Services/Berechtigungen festhalten.
2. Dokumentation und vorhandene Beispiel-Apps nachweisbasiert prüfen; API-
   Annahmen als bestätigt, unbestätigt oder versionsabhängig kennzeichnen.
3. Eine kleine vertikale Integration bauen: Konfiguration → Runtime-Start →
   Service-Verbindung → eine echte, bestätigte Antwort.
4. Fachlogik und Repository-/Protokolladapter trennen und die Kernlogik mit
   lokalen Tests absichern.
5. Runtime-spezifische Risiken (globale Namen, Ladefolge, Callbacks) mit
   passenden Regressionstests abbilden.
6. Auf der PBX smoke-testen, dann vollständige Artefakte bauen, prüfen und
   dokumentieren.

Für den RSS Feed Connector gelten die konkreten Dateipfade, Datenmodelle,
Topics und Testbefehle in [`.ai-context.md`](./.ai-context.md); projektfremde
Apps sollten diese Annahmen nicht ungeprüft übernehmen.

# Innovaphone RSS Feed Connector

**Current release: 0.3.0 Beta** · [GitHub release](https://github.com/F3nti/rss-feed-connector-Inno/releases/tag/v0.3.0-beta)

![Innovaphone Connect RSS app logo](httpfiles/rss-connect-icon.png)

The RSS Feed Connector is an innovaphone App Platform application that polls
RSS 2.0 and Atom feeds and posts new entries to accessible innovaphone Connect
topics. Administrators manage feeds from a myApps interface.

> **Beta notice:** The 0.3.0 Beta release includes the HTTP files archive, but
> not ready-to-install App Platform binaries or architecture-specific
> application packages. A successful local test run is not a substitute for a
> smoke test on your target PBX.

## Features

- Manage multiple feeds from the myApps UI: add, edit, pause, delete, refresh
  status, and start an enabled feed manually.
- Discover available Connect topics through the Messages API and validate a
  selected topic before saving or scheduling a feed.
- Poll feeds at configurable intervals between 1 and 1,440 minutes.
- Parse RSS 2.0 and Atom entries, sanitize feed descriptions, and format
  Connect-compatible posts.
- Configure each feed's first-run backlog: post a chosen number of newest
  entries (1–50, default 5) or explicitly load all entries.
- Persist feed configuration and posted entry GUIDs in the App Platform
  database so known entries remain deduplicated across service restarts.
- Persist each feed's latest status, summary, and run time so the myApps
  overview retains useful diagnostics after service restarts.
- Configure the PBX App Object from the PBX Manager plugin, including Services
  API and Messages API access, and grant selected user templates access to the
  app.
- Limit concurrent Messages API posts and batch database lookups for known
  GUIDs.
- Validate feed URLs and resolved addresses before downloading; reject
  non-public destinations and HTTP redirects.

## How it works

```text
Feed configuration in myApps
             │
             ▼
Scheduler ── URL / DNS destination checks
             │
             ▼
       HttpClient.request
             │
             ▼
       RSS / Atom parser
             │
             ▼
 Persistent GUID lookup ── known entries are skipped
             │
             ▼
 HTML sanitization and Connect post
             │
             ▼
 Save GUID after successful PostResult
```

After the Messages API connects and the configured topic is confirmed, enabled
feeds are scheduled. A feed cycle downloads and parses the feed, skips
previously posted GUIDs, and submits new entries as Messages API posts. The
entry GUID is saved only after a successful `PostResult`. The latest feed
status and run summary are also saved with the feed and loaded again after a
service restart. A feed that was marked as running when the service stopped
is reported as interrupted when it starts again.
If the post succeeds but saving its GUID fails, the service retries the
database save up to two additional times (after 500 ms and 1.5 s). It does not
repost the message during these retries. If all attempts fail, the cycle is
reported as an error so the GUID can be retried on a later feed run; this
remaining failure case can result in the entry being posted again.

When a feed has no stored entry history, its initial-post setting controls the
first run. By default, only the five newest entries by publication date are
posted. Choose a limit from 1 to 50, or enable **Alle vorhandenen Beiträge
laden** to post every entry returned by the feed. Entries older than the
selected limit are recorded as skipped, so they are not posted on the next
poll. Deleting and recreating a feed clears its history and triggers this
initial-feed behavior again.

The last reported PBX trace confirmed an HTTP 200 Atom response and a cycle
with 40 duplicates and no failures. That run did **not** contain a new entry,
so it did not verify a new post end to end.

## Requirements

### Runtime / PBX

- An innovaphone App Platform environment with the JavaScript Runtime and
  App Platform database available.
- A PBX App Object for this application with the Services API enabled and
  permission to connect to `messages-api`.
- A Connect-enabled PBX environment with the Connect license/entitlement
  required by the deployment's innovaphone release and licensing model.
- An accessible Connect topic for every feed destination.
- Outbound DNS and HTTP(S) connectivity from the App Platform runtime to the
  configured feed hosts.
- Assignment of the app to the administrators who will configure feeds.

Check the SDK documentation for the version installed on your PBX. APIs and
packaging requirements can vary between SDK and App Platform versions. Useful
starting points:

- [App Platform / AppGeneric](https://sdk.innovaphone.com/15r1/doc/appgeneric.htm)
- [HttpClient](https://sdk.innovaphone.com/15r1/doc/javascript/HttpClient.htm)
- [AppWebsocketClient](https://sdk.innovaphone.com/15r1/doc/javascript/AppWebsocketClient.htm)
- [Services protocol](https://sdk.innovaphone.com/15r1/doc/appwebsocket/Services.htm)
- [Messages protocol](https://sdk.innovaphone.com/15r1/doc/appwebsocket/Messages.htm)

### Local development

- Node.js 18 or newer for the built-in test runner.
- Git.
- An innovaphone SDK / App Platform toolchain matching the deployment target
  for packaging and PBX installation.
- The SDK documentation for the version installed on the target PBX (see links
  above).

The service uses innovaphone runtime APIs; Node.js is used for local tests, not
to run the complete application service outside the App Platform.

## Repository layout

```text
.
├── apps.json                         # App URL mapping
├── config.json                       # Database schema and runtime script order
├── httpfiles/                        # myApps UI and browser-side SDK files
├── service/
│   ├── rss-service.js                # Service startup, feed lifecycle and control API
│   ├── rss/                          # URL policy, downloader, parser, HTML builder
│   ├── messages/                     # Services discovery and Messages API clients
│   ├── scheduler/                    # Feed scheduler
│   └── db/                           # Feed and entry repositories
├── test/                             # Node.js tests and RSS / Atom fixtures
└── tools/                             # SDK documentation indexer
```

`config.json` declares the `rss_feeds` and `rss_entries` database tables and
loads service scripts in dependency order. In particular,
`rss-url-policy.js` must be loaded before the downloader and service.
`apps.json` maps the application name to its app URL. `plugins.json`
registers the PBX Manager setup plugin for creating the PBX App Object.

## Run the tests

From the repository root:

```powershell
node --test test/*.test.js
```

The test suite covers the URL policy and downloader, RSS and Atom parsing,
database repositories, feed deduplication and deletion, service topic
validation, scheduler behavior, Messages API communication, PBX Manager
provisioning, and myApps UI startup. The current suite contains 13 test files.

The parser fixtures are `test/sample-rss.xml` and `test/sample-atom.xml`.
Tests use local doubles for innovaphone APIs and do not require a live PBX or
network connection.

## Build and deploy

The `dist/` directory is generated and ignored by Git. Build the App Platform
archives with the generic JavaScript Runtime binaries from the SDK version
matching the target PBX. For SDK 16r1, run:

```powershell
.\tools\build-app-platform-package.ps1 `
  -SdkRoot C:\innovaphone\sdk\sdk\16r1
```

The script creates `httpfiles.zip` and complete per-architecture archives for
ARM, ARM64, and x86_64 under `dist/app-platform/`. Each archive contains the
SDK runtime binary renamed for this app, `httpfiles.zip`, the app icon, and the
license. The script checks required files, HTTP build metadata, and the ELF
architecture of each runtime. Use the archive matching the App Platform
architecture; the tested PBX in this project uses x86_64.

Deployment checklist:

1. Check out the desired release tag and build the package with the toolchain
   for the target App Platform version and architecture.
2. Include the service scripts, `config.json`, `apps.json`, `plugins.json`,
   PBX Manager plugin assets, browser UI assets, and required browser-side SDK
   files in the package.
3. Install or update the app and open its setup plugin in the PBX Manager.
4. Create or update the App Object in the PBX Manager plugin. It enables the
   Websocket, Messages, and Services APIs and grants access to `connect` and
   `messages-api`. Select one or more user configuration templates to grant
   those users access to and visibility of the app. Additional App Objects can
   target separate App Platform instances. Their instance path is derived from
   the SIP name (the part before `@`), so the corresponding instance must already
   exist on the App Platform.
5. Confirm that the service connects to `messages-api`, can read the intended
   Connect topic, and can reach feed hosts over DNS and HTTP(S).
6. Add a test feed containing a previously unseen GUID. Verify the resulting
   Connect post and successful `PostResult`, then confirm the next poll reports
   that entry as a duplicate.

### App instance and PBX App Object URLs

The App Platform instance and the PBX App Object use related, but different,
paths. Configure the instance with a webserver path, for example:

```text
appdev/rss-feed-connector
```

The app is provided by that instance under the name `rss-feed-connector`, as
declared in `apps.json`. In the PBX App Object, point the URL to the app's start
page. For an instance named `rss-feed-connector`, the resulting path is:

```text
appdev/rss-feed-connector/rss-feed-connector.htm
```

For another App Platform instance with SIP name `rss-feed-backup`, the plugin
uses:

```text
appdev/rss-feed-backup/rss-feed-connector.htm
```

These are relative path examples; the PBX supplies the scheme and host. The
target App Platform instance must already exist and use the SIP name as its
webserver-path segment. Do not add `.htm` to the instance webserver path or to
the app name in `apps.json`. The PBX App Object URL must resolve to the start
`.htm` file; using only the path without `.htm` may return 404 instead of
opening the app.

When the PBX Manager is opened through an App Proxy URL such as
`http://localhost:10008/appproxy/ext/<ap-host>/<path>`, the plugin stores the
public HTTPS URL `https://<ap-host>/<path>` in the PBX object instead of the
local proxy URL.

### PBX App Object APIs, permissions, and Connect access

Configure the PBX App Object used to launch the app with:

- **AppWebsocket access** to the app service, as used by the myApps client to
  exchange control messages with this app.
- The **Services API** enabled. The service uses it to discover and authenticate
  to another app service.
- The service permission for **`messages-api`** granted to this App Object.
  The service uses that permission to establish its authenticated connection;
  without it, topic discovery and posting cannot work.
- The App Object assigned to the intended users, so they can launch the app.

The browser UI stays hidden until its AppWebsocket connection is established and
shows a not-authorized message when opened directly. This is a presentation gate
only; server-side AppWebsocket and Services API authorization remains the actual
access control.

The Messages API session must be able to access the destination Connect topics.
If a topic is not returned by topic discovery, check Connect topic access and
the identity/permissions used for the `messages-api` service connection.

Connect must also be licensed/enabled on the PBX for the deployment's
innovaphone release. This project does not define or check a separate
`rss-feed-connector` App or Service license; whether a Connect license is
required, and which license or entitlement applies, depends on the PBX version
and deployment contract. Confirm that requirement with the PBX administrator
or the applicable innovaphone licensing documentation.

The app does not use a separate PBX **WebServices API** in its source code.
Its browser UI uses the app's AppWebsocket connection, while its service uses
the PBX Services API only for discovery and login to `messages-api`. Do not
confuse the Services API permission with the `messages-api` service permission:
both are needed for the service-to-service flow.

The source is architecture-independent, but App Platform packaging is
platform/version-specific. Do not copy a generated package from a different
SDK version or architecture without verifying compatibility.

## Configure feeds

Open the app in myApps and add a feed with:

| Field | Description |
|---|---|
| Feed name | Required; 1–128 characters. |
| Feed URL | Required HTTP or HTTPS URL, up to 2,048 characters. |
| Connect topic | Select from the topics discovered for the app's Messages API connection. |
| Tags | Optional comma-separated Connect tags; up to 20 tags, each 1–64 characters. |
| Poll interval | Required whole number from 1 to 1,440 minutes; the UI defaults to 15. |
| Feed active | Disabled feeds are not scheduled or manually run. |

Save a feed to persist it. The interface refreshes its state periodically and
shows the last run status, summary, and time. These diagnostics are stored with
the feed and remain available after a service restart. Use **Jetzt abrufen**
(“Run now”) to start an enabled feed immediately; edit or delete feeds from
their cards.

Feed configuration and known entry GUIDs are stored in the App Platform
database. Scheduler timers are recreated when the service restarts; if a feed
was marked as running when the service stopped, its status is changed to show
that the previous cycle was interrupted.

## Security notes and limitations

- Feed URLs are untrusted input. Only HTTP(S) URLs without embedded credentials
  are accepted. Private/reserved IP destinations and hosts resolving to
  non-public addresses are rejected.
- Redirect responses are rejected rather than followed, avoiding an unchecked
  redirect to a different destination.
- The runtime does not provide documented DNS pinning in this implementation.
  Checking DNS answers before the HTTP request cannot fully eliminate DNS
  rebinding; enforce outbound network restrictions at the PBX/platform layer
  where possible.
- Feed HTML is sanitized before posting. Feed text and authentication material
  should not be added to logs; redact secrets from PBX traces before sharing.
- Feed polling can publish content from third-party sources to Connect. Only
  configure feeds and destinations you are authorized to use, and review the
  source feed's terms and content before enabling it.

## Troubleshooting

| Symptom | Checks |
|---|---|
| myApps shows a connection error | Confirm the app is launched from its myApps App Object and the browser-side SDK files are present in the package. |
| No Connect topics appear | Check Services API enablement, `messages-api` permission, service connection, and topic access for the App Object. |
| Feed cannot be saved | Check the URL, interval, tags, and that the selected Connect topic is still accessible. |
| Feed URL destination is rejected | Confirm it uses HTTP(S), contains no credentials, and resolves only to public addresses. Private, reserved, and redirected destinations are intentionally blocked. |
| Download or parsing fails | Inspect the service log for the failure phase and HTTP status / content type. Confirm the URL returns an RSS or Atom XML document rather than a web page or redirect. |
| No post appears | Check the feed cycle status, Messages API connectivity, Connect topic permissions, and `PostResult` errors. A cycle that reports only duplicates has no new entry to post. |
| A post repeats after a successful send | Check for database errors when saving the GUID after `PostResult`. |

When sharing logs, remove tokens, credentials, authentication challenges, and
other sensitive values first.

## Release status

The current public release is **0.3.0 Beta** (`v0.3.0-beta`). It is a
prerelease. The release includes the HTTP files archive, but not a ready-to-
install App Platform binary or architecture-specific application package.
Build those with the SDK toolchain matching the target PBX platform.

## License

Project-owned source code is available under the
[PolyForm Noncommercial License 1.0.0](./LICENSE). Noncommercial use,
modification, and redistribution are permitted under its terms, with the
required copyright notice retained. Commercial use is not granted by this
license. This is not an OSI-approved open-source license.

Third-party components, including the innovaphone SDK files under
`httpfiles/web1/`, are not relicensed by this project license and remain
subject to their respective upstream notices and terms.

# Innovaphone RSS Feed Connector

**Current release: 0.2.1 Beta** · [GitHub release](https://github.com/F3nti/rss-feed-connector-Inno/releases/tag/v0.2.1-beta)

![Innovaphone Connect RSS app logo](httpfiles/rss-connect-icon.png)

The RSS Feed Connector is an innovaphone App Platform application that polls
RSS 2.0 and Atom feeds and posts new entries to accessible innovaphone Connect
topics. Administrators manage feeds from a myApps interface.

> **Beta notice:** The project is published as source code. The 0.2.1 Beta
> release does not include ready-to-install App Platform binaries or
> architecture-specific packages. A successful local test run is not a
> substitute for a smoke test on your target PBX.

## Features

- Manage multiple feeds from the myApps UI: add, edit, pause, delete, refresh
  status, and start an enabled feed manually.
- Discover available Connect topics through the Messages API and validate a
  selected topic before saving or scheduling a feed.
- Poll feeds at configurable intervals between 1 and 1,440 minutes.
- Parse RSS 2.0 and Atom entries, sanitize feed descriptions, and format
  Connect-compatible posts.
- Persist feed configuration and posted entry GUIDs in the App Platform
  database so known entries remain deduplicated across service restarts.
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
entry GUID is saved only after a successful `PostResult`.

The last reported PBX trace confirmed an HTTP 200 Atom response and a cycle
with 40 duplicates and no failures. That run did **not** contain a new entry,
so it did not verify a new post end to end.

## Requirements

### Runtime / PBX

- An innovaphone App Platform environment with the JavaScript Runtime and
  App Platform database available.
- A PBX App Object for this application with the Services API enabled and
  permission to connect to `messages-api`.
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
`apps.json` maps the application name to its app URL; it does not create or
configure a PBX App Object or assign users.

## Run the tests

From the repository root:

```powershell
node --test test/*.test.js
```

The test suite covers the URL policy and downloader, RSS and Atom parsing,
database repositories, feed deduplication and deletion, service topic
validation, scheduler behavior, Messages API communication, and myApps UI
startup. The current suite passes all 12 test files.

The parser fixtures are `test/sample-rss.xml` and `test/sample-atom.xml`.
Tests use local doubles for innovaphone APIs and do not require a live PBX or
network connection.

## Build and deploy

This repository contains the application source, not a prebuilt App Platform
binary or deployable `httpfiles.zip`. The `dist/` directory is generated and
ignored by Git. Use the packaging toolchain documented for your installed
innovaphone SDK / App Platform version to create and install the app package.

Deployment checklist:

1. Check out the desired release tag and build the package with the toolchain
   for the target App Platform version and architecture.
2. Include the service scripts, `config.json`, `apps.json`, browser UI assets,
   and required browser-side SDK files in the package.
3. Configure the PBX App Object with the Services API and the required
   `messages-api` service permission.
4. Install or update the app, create/configure its App Object, and assign it to
   the administrators who need the myApps UI.
5. Confirm that the service connects to `messages-api`, can read the intended
   Connect topic, and can reach feed hosts over DNS and HTTP(S).
6. Add a test feed containing a previously unseen GUID. Verify the resulting
   Connect post and successful `PostResult`, then confirm the next poll reports
   that entry as a duplicate.

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
shows the last in-memory run status. Use **Jetzt abrufen** (“Run now”) to start
an enabled feed immediately; edit or delete feeds from their cards.

Feed configuration and known entry GUIDs are stored in the App Platform
database. Run status and scheduler state are held in service memory and are
recreated when the service restarts.

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

The current public release is **0.2.1 Beta** (`v0.2.1-beta`). It is a
prerelease and is provided as source code with GitHub-generated source
archives. App Platform installation packages are not attached.

## License

This repository currently has no `LICENSE` file. Do not assume the source is
available under MIT or another open-source license; clarify reuse and
redistribution terms with the project owner.

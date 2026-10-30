# Local innovaphone SDK documentation

Run the indexer from the repository root in Windows PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\Index-InnovaphoneSdk.ps1
```

The indexer follows the site's sitemap and `robots.txt`, saves original pages
and searchable text under `.local-docs\innovaphone-sdk`, and writes a CSV
containing each page's title, URL, last-modified date, and local paths. The
corpus is ignored by Git. Rerunning skips pages already downloaded; use
`-Refresh` to download them again. `-MaxPages 5` can be used for a small test.

Search the extracted documentation with ripgrep, for example:

```powershell
rg -n -i "HttpClient.request|ReadTopics" .\.local-docs\innovaphone-sdk\text
```

The original HTML pages are preserved alongside the text copies. The crawler
does not download paths disallowed by the site's `robots.txt` (`/exe` and
`/platform`).

param(
    [string]$Destination = (Join-Path $PSScriptRoot "..\.local-docs\innovaphone-sdk"),
    [int]$DelayMilliseconds = 300,
    [int]$MaxPages = 0,
    [switch]$Refresh
)

$ErrorActionPreference = "Stop"
$baseUri = [Uri]"https://sdk.innovaphone.com/"
$destinationPath = [System.IO.Path]::GetFullPath($Destination)
$htmlRoot = Join-Path $destinationPath "html"
$textRoot = Join-Path $destinationPath "text"
$indexPath = Join-Path $destinationPath "index.csv"
$failuresPath = Join-Path $destinationPath "failed-pages.txt"

New-Item -ItemType Directory -Path $htmlRoot, $textRoot -Force | Out-Null

function Get-RelativePagePath {
    param([Uri]$PageUri)

    if ($PageUri.Host -ne $baseUri.Host -or $PageUri.Scheme -notin @("http", "https")) {
        throw "Unexpected URL in sitemap: $PageUri"
    }

    $segments = @(
        $PageUri.AbsolutePath.TrimStart("/") -split "/" |
            ForEach-Object { [Uri]::UnescapeDataString($_) }
    )
    $unsafeSegments = @($segments | Where-Object { $_ -in @("", ".", "..") })
    if ($segments.Count -eq 0 -or $unsafeSegments.Count -gt 0) {
        throw "Unsafe page path in sitemap: $PageUri"
    }
    if ($segments[0] -in @("exe", "platform")) {
        return $null
    }

    $relativePath = $segments[0]
    for ($i = 1; $i -lt $segments.Count; $i++) {
        $relativePath = Join-Path $relativePath $segments[$i]
    }
    return $relativePath
}

function Convert-HtmlToText {
    param([string]$Html)

    $text = [System.Text.RegularExpressions.Regex]::Replace(
        $Html,
        '(?is)<(script|style|noscript)\b[^>]*>.*?</\1\s*>',
        ""
    )
    $text = [System.Text.RegularExpressions.Regex]::Replace($text, '(?i)<br\s*/?>', "`n")
    $text = [System.Text.RegularExpressions.Regex]::Replace(
        $text,
        '(?i)</(address|article|blockquote|dd|div|dl|dt|h[1-6]|li|ol|p|pre|section|table|tr|ul)\s*>',
        "`n"
    )
    $text = [System.Text.RegularExpressions.Regex]::Replace($text, '(?i)</t[dh]\s*>', "`t")
    $text = [System.Text.RegularExpressions.Regex]::Replace($text, '<[^>]+>', "")
    $text = [System.Net.WebUtility]::HtmlDecode($text)
    $text = $text -replace "`r", ""
    $text = [System.Text.RegularExpressions.Regex]::Replace($text, '[ \t]+\n', "`n")
    $text = [System.Text.RegularExpressions.Regex]::Replace($text, '\n[ \t]+', "`n")
    $text = [System.Text.RegularExpressions.Regex]::Replace($text, '\n{3,}', "`n`n")
    return $text.Trim()
}

try {
    $robotsResponse = Invoke-WebRequest -Uri ([Uri]::new($baseUri, "robots.txt")) -UseBasicParsing -TimeoutSec 30
    if ($robotsResponse.Content -notmatch '(?im)^\s*user-agent:\s*\*\s*$') {
        throw "Could not verify the site's general robots.txt policy."
    }
    foreach ($blockedPath in @("/exe", "/platform")) {
        if ($robotsResponse.Content -notmatch "(?im)^\s*disallow:\s*$([regex]::Escape($blockedPath))\s*$") {
            throw "Expected robots.txt exclusion '$blockedPath' was not found; refusing to crawl."
        }
    }

    $sitemapResponse = Invoke-WebRequest -Uri ([Uri]::new($baseUri, "sitemap.xml")) -UseBasicParsing -TimeoutSec 30
    [xml]$sitemap = $sitemapResponse.Content
    $pages = @(
        foreach ($urlNode in $sitemap.SelectNodes("//*[local-name()='url']")) {
            $loc = $urlNode.SelectSingleNode("./*[local-name()='loc']")
            if ($null -ne $loc) {
                [pscustomobject]@{
                    Uri = [Uri]$loc.InnerText.Trim()
                    LastModified = if ($null -ne $urlNode.SelectSingleNode("./*[local-name()='lastmod']")) {
                        $urlNode.SelectSingleNode("./*[local-name()='lastmod']").InnerText.Trim()
                    } else {
                        ""
                    }
                }
            }
        }
    )

    $pages = @(
        foreach ($page in $pages) {
            $relativePath = Get-RelativePagePath -PageUri $page.Uri
            if ($null -ne $relativePath) {
                $page | Add-Member -NotePropertyName RelativePath -NotePropertyValue $relativePath -PassThru
            }
        }
    )
    if ($MaxPages -gt 0) {
        $pages = @($pages | Select-Object -First $MaxPages)
    }
    if ($pages.Count -eq 0) {
        throw "No allowed documentation pages were found in the sitemap."
    }

    $rows = [System.Collections.Generic.List[object]]::new()
    $failures = [System.Collections.Generic.List[string]]::new()
    $headers = @{ "User-Agent" = "InnovaphoneSdkLocalIndexer/1.0 (polite, sitemap-based)" }

    for ($i = 0; $i -lt $pages.Count; $i++) {
        $page = $pages[$i]
        $htmlPath = Join-Path $htmlRoot $page.RelativePath
        $textRelativePath = [System.IO.Path]::ChangeExtension($page.RelativePath, ".txt")
        $textPath = Join-Path $textRoot $textRelativePath
        New-Item -ItemType Directory -Path (Split-Path -Parent $htmlPath), (Split-Path -Parent $textPath) -Force | Out-Null

        $html = $null
        if ((-not $Refresh) -and (Test-Path -LiteralPath $htmlPath -PathType Leaf)) {
            $html = [System.IO.File]::ReadAllText($htmlPath)
        } else {
            $downloaded = $false
            for ($attempt = 1; $attempt -le 3 -and -not $downloaded; $attempt++) {
                try {
                    $response = Invoke-WebRequest -Uri $page.Uri -UseBasicParsing -TimeoutSec 45 -Headers $headers
                    $html = $response.Content
                    [System.IO.File]::WriteAllText($htmlPath, $html, [System.Text.UTF8Encoding]::new($false))
                    $downloaded = $true
                } catch {
                    if ($attempt -eq 3) {
                        $failures.Add("$($page.Uri) - $($_.Exception.Message)")
                    } else {
                        Start-Sleep -Seconds $attempt
                    }
                }
            }
            if (-not $downloaded) {
                Write-Progress -Activity "Indexing innovaphone SDK documentation" -Status "$($i + 1) / $($pages.Count) pages; $($failures.Count) failed" -PercentComplete ((($i + 1) / $pages.Count) * 100)
                Start-Sleep -Milliseconds $DelayMilliseconds
                continue
            }
            Start-Sleep -Milliseconds $DelayMilliseconds
        }

        $titleMatch = [System.Text.RegularExpressions.Regex]::Match($html, '(?is)<title\b[^>]*>(.*?)</title\s*>')
        $title = if ($titleMatch.Success) {
            [System.Net.WebUtility]::HtmlDecode(($titleMatch.Groups[1].Value -replace '<[^>]+>', '')).Trim()
        } else {
            [System.IO.Path]::GetFileNameWithoutExtension($page.RelativePath)
        }
        $plainText = Convert-HtmlToText -Html $html
        [System.IO.File]::WriteAllText($textPath, $plainText, [System.Text.UTF8Encoding]::new($false))
        $relativeDestination = $destinationPath.TrimEnd([char[]]@("\", "/")) + [System.IO.Path]::DirectorySeparatorChar
        $rows.Add([pscustomobject]@{
            Title = $title
            Url = $page.Uri.AbsoluteUri
            LastModified = $page.LastModified
            HtmlFile = $htmlPath.Substring($relativeDestination.Length)
            TextFile = $textPath.Substring($relativeDestination.Length)
        })

        Write-Progress -Activity "Indexing innovaphone SDK documentation" -Status "$($i + 1) / $($pages.Count) pages; $($failures.Count) failed" -PercentComplete ((($i + 1) / $pages.Count) * 100)
    }
    Write-Progress -Activity "Indexing innovaphone SDK documentation" -Completed

    $rows | Export-Csv -LiteralPath $indexPath -NoTypeInformation -Encoding UTF8
    if ($failures.Count -gt 0) {
        [System.IO.File]::WriteAllLines($failuresPath, $failures, [System.Text.UTF8Encoding]::new($false))
        throw "Indexed $($rows.Count) of $($pages.Count) pages. $($failures.Count) failed; see '$failuresPath'. Rerun to retry missing pages."
    }
    if (Test-Path -LiteralPath $failuresPath) {
        Remove-Item -LiteralPath $failuresPath
    }

    Write-Output "Indexed $($rows.Count) pages."
    Write-Output "HTML archive: $htmlRoot"
    Write-Output "Searchable text: $textRoot"
    Write-Output "CSV index: $indexPath"
} catch {
    Write-Error $_
    exit 1
}

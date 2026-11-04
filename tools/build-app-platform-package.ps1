param(
    [Parameter(Mandatory = $true)]
    [string]$SdkRoot,
    [string]$Version = "0.3.0-rc.1"
)

$ErrorActionPreference = "Stop"
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$outputRoot = Join-Path $repositoryRoot "dist\app-platform"
$httpOutputRoot = Join-Path $repositoryRoot "dist\httpfiles"
$httpZip = Join-Path $repositoryRoot "dist\httpfiles.zip"
$sdkRootPath = (Resolve-Path $SdkRoot).Path
$workRoot = Join-Path ([System.IO.Path]::GetTempPath()) (
    "rss-feed-connector-package-" + [guid]::NewGuid().ToString("N")
)

if ($Version -notmatch '^[0-9]+\.[0-9]+\.[0-9]+-[a-zA-Z0-9.-]+$') {
    throw "Version must use semantic version prerelease format, for example 0.3.0-rc.1"
}

$httpStage = Join-Path $workRoot "httpfiles"
$requiredHttpFiles = @(
    "config.json",
    "apps.json",
    "plugins.json",
    "LICENSE",
    "f3nti.ManagerRssFeedConnector.js",
    "f3nti.ManagerRssFeedConnectorTexts.js",
    "service/rss-service.js",
    "service/db/rss-feed-repository.js"
)
$architectures = @(
    @{ Name = "arm"; ElfClass = 1; Machine = 40 },
    @{ Name = "arm64"; ElfClass = 2; Machine = 183 },
    @{ Name = "x86_64"; ElfClass = 2; Machine = 62 }
)

function Assert-ZipEntries($Path, $RequiredEntries) {
    $archive = [System.IO.Compression.ZipFile]::OpenRead($Path)
    try {
        $entries = @($archive.Entries | ForEach-Object {
            $_.FullName.Replace("\", "/")
        })
        foreach ($requiredEntry in $RequiredEntries) {
            if ($entries -notcontains $requiredEntry) {
                throw "Package '$Path' is missing '$requiredEntry'"
            }
        }
        return $archive.Entries.Count
    }
    finally {
        $archive.Dispose()
    }
}

function Assert-RuntimeArchitecture($Path, $ElfClass, $Machine) {
    $bytes = [System.IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -lt 20 -or
        $bytes[0] -ne 0x7f -or
        $bytes[1] -ne 0x45 -or
        $bytes[2] -ne 0x4c -or
        $bytes[3] -ne 0x46 -or
        $bytes[4] -ne $ElfClass -or
        [System.BitConverter]::ToUInt16($bytes, 18) -ne $Machine) {
        throw "Runtime binary has an unexpected ELF architecture: $Path"
    }
}

try {
    New-Item -ItemType Directory -Path $workRoot -Force | Out-Null
    New-Item -ItemType Directory -Path $httpStage -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $httpStage "service") -Force | Out-Null

    Copy-Item -Path (Join-Path $repositoryRoot "httpfiles\*") `
        -Destination $httpStage -Recurse -Force
    Copy-Item -Path (Join-Path $repositoryRoot "service\*") `
        -Destination (Join-Path $httpStage "service") -Recurse -Force
    Copy-Item -Path (Join-Path $repositoryRoot "config.json") `
        -Destination $httpStage -Force
    Copy-Item -Path (Join-Path $repositoryRoot "apps.json") `
        -Destination $httpStage -Force
    Copy-Item -Path (Join-Path $repositoryRoot "plugins.json") `
        -Destination $httpStage -Force
    Copy-Item -Path (Join-Path $repositoryRoot "LICENSE") `
        -Destination $httpStage -Force

    foreach ($requiredFile in $requiredHttpFiles) {
        $filePath = Join-Path $httpStage ($requiredFile.Replace("/", "\"))
        if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
            throw "HTTP files are missing '$requiredFile'"
        }
    }

    $build = (Get-Content -Raw (Join-Path $httpStage "build.txt")).Trim()
    $label = (Get-Content -Raw (Join-Path $httpStage "label.txt")).Trim()
    if ($build -ne "9" -or $label -ne "rc") {
        throw "Expected HTTP build 9 with label rc; got build '$build', label '$label'"
    }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
    if (Test-Path -LiteralPath $httpOutputRoot) {
        Remove-Item -LiteralPath $httpOutputRoot -Recurse -Force
    }
    New-Item -ItemType Directory -Path $httpOutputRoot -Force | Out-Null
    Compress-Archive -Path (Join-Path $httpStage "*") `
        -DestinationPath $httpZip -Force

    $httpEntryCount = Assert-ZipEntries $httpZip $requiredHttpFiles
    Copy-Item -Path (Join-Path $httpStage "*") `
        -Destination $httpOutputRoot -Recurse -Force

    foreach ($architecture in $architectures) {
        $runtimeSource = Join-Path $sdkRootPath (
            "jse\" + $architecture.Name + "\generic"
        )
        if (-not (Test-Path -LiteralPath $runtimeSource -PathType Leaf)) {
            throw "SDK generic runtime not found: $runtimeSource"
        }
        Assert-RuntimeArchitecture $runtimeSource $architecture.ElfClass $architecture.Machine

        $packageStage = Join-Path $workRoot $architecture.Name
        New-Item -ItemType Directory -Path $packageStage -Force | Out-Null
        Copy-Item -Path $runtimeSource `
            -Destination (Join-Path $packageStage "rss-feed-connector")
        Copy-Item -Path $httpZip -Destination $packageStage
        Copy-Item -Path (Join-Path $repositoryRoot "httpfiles\rss-feed-connector.png") `
            -Destination $packageStage
        Copy-Item -Path (Join-Path $repositoryRoot "LICENSE") `
            -Destination $packageStage

        $architectureDirectory = Join-Path $outputRoot $architecture.Name
        New-Item -ItemType Directory -Path $architectureDirectory -Force | Out-Null
        Copy-Item -Path (Join-Path $packageStage "*") `
            -Destination $architectureDirectory -Force

        $packageZip = Join-Path $outputRoot (
            "rss-feed-connector-" + $Version + "-" + $architecture.Name + ".zip"
        )
        Compress-Archive -Path (Join-Path $packageStage "*") `
            -DestinationPath $packageZip -Force

        Assert-ZipEntries $packageZip @(
            "rss-feed-connector",
            "httpfiles.zip",
            "rss-feed-connector.png",
            "LICENSE"
        ) | Out-Null

        [PSCustomObject]@{
            Architecture = $architecture.Name
            Package = $packageZip
            RuntimeSha256 = (Get-FileHash $runtimeSource -Algorithm SHA256).Hash
            PackageSha256 = (Get-FileHash $packageZip -Algorithm SHA256).Hash
            HttpFiles = $httpEntryCount
        }
    }
}
finally {
    if (Test-Path -LiteralPath $workRoot) {
        Remove-Item -LiteralPath $workRoot -Recurse -Force
    }
}

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$projectRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $projectRoot 'scripts/speech-jobs.json'
$audioDirectory = Join-Path $projectRoot 'public/audio'
$manifest = [IO.File]::ReadAllText($manifestPath) | ConvertFrom-Json
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $synth.SelectVoice('Microsoft Paul')
    $synth.Rate = -1
    $count = 0
    foreach ($entry in $manifest) {
        $target = Join-Path $audioDirectory $entry.file
        if (-not (Test-Path -LiteralPath $target)) {
            $synth.SetOutputToWaveFile($target)
            $synth.Speak([string]$entry.text)
            $synth.SetOutputToNull()
        }
        $count++
        if ($count % 50 -eq 0) { Write-Output "$count exemples audio disponibles" }
    }
    Write-Output "$count fichiers audio français prêts."
} finally { $synth.Dispose() }

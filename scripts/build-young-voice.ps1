$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$projectRoot = Split-Path -Parent $PSScriptRoot
$jobs = [IO.File]::ReadAllText((Join-Path $projectRoot 'scripts/speech-jobs.json')) | ConvertFrom-Json
$rawDirectory = Join-Path $projectRoot 'data/young-voice-source'
$outputDirectory = Join-Path $projectRoot 'public/audio-young'
New-Item -ItemType Directory -Force -Path $rawDirectory,$outputDirectory | Out-Null
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $synth.SelectVoice('Microsoft Julie')
    $synth.Rate = -1
    $count=0
    foreach ($job in $jobs) {
        $source = Join-Path $rawDirectory $job.file
        $target = Join-Path $outputDirectory $job.file
        if (-not (Test-Path -LiteralPath $target)) {
            $synth.SetOutputToWaveFile($source)
            $synth.Speak([string]$job.text)
            $synth.SetOutputToNull()
            & ffmpeg -nostdin -hide_banner -loglevel error -y -i $source -af 'rubberband=pitch=1.22:formant=shifted:pitchq=quality,alimiter=limit=0.95' -c:a pcm_s16le $target
            if ($LASTEXITCODE -ne 0) { throw "Échec audio : $($job.file)" }
        }
        $count++
        if ($count % 50 -eq 0) { Write-Output "$count exemples de Léo disponibles" }
    }
    Copy-Item -LiteralPath (Join-Path $projectRoot 'public/audio/manifest.json') -Destination (Join-Path $outputDirectory 'manifest.json')
    Write-Output "$count modèles prêts : timbre synthétique enfantin, rythme conservé."
} finally { $synth.Dispose() }

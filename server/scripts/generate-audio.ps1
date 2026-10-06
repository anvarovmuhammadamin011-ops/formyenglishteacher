param(
  [Parameter(Mandatory = $true)][string]$OutDir
)
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voices = @($synth.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo })
$en = $voices | Where-Object { $_.Culture.Name -like "en-*" } | Select-Object -First 1
if ($en) {
  $synth.SelectVoice($en.Name)
}
Write-Output "Voice: $($en.Name) ($($en.Culture.Name)) rate=$($synth.Rate)"
$synth.Rate = -1

$items = @(
  @{
    file = "listening-airport.wav"
    text = "Agent: Good morning. May I see your passport, please? Passenger: Here you are. I'm flying to Istanbul at ten thirty. Agent: Here is your boarding pass. Your gate is number twelve. Boarding starts at ten o'clock. Passenger: Thank you. How many kilograms can I check in? Agent: Twenty-three kilograms. Have a nice flight!"
  },
  @{
    file = "listening-meeting.wav"
    text = "Hello, this is Anna from design team. Is Mr. Karimov available? I'm afraid he's in a meeting until three o'clock. I see. Could you tell him that our meeting on Thursday is moved to Friday at nine in the morning? Certainly. Shall I spell your name? Yes, please. A double N in Anna. Thank you very much. Goodbye."
  },
  @{
    file = "listening-weather.wav"
    text = "And now the weather forecast for the weekend. Saturday will be cloudy with light rain in the afternoon, so take an umbrella if you are going out. Temperatures will stay around eighteen degrees. Sunday will be much nicer: sunny from morning to evening and twenty-four degrees. A perfect day for a picnic. Winds will be gentle, from the south-east, around ten kilometres per hour. That's all from the weather desk. Enjoy your weekend!"
  }
)

foreach ($item in $items) {
  $path = Join-Path $OutDir $item.file
  $synth.SetOutputToWaveFile($path)
  $synth.Speak($item.text)
  $synth.SetOutputToNull()
  $size = (Get-Item $path).Length
  Write-Output "wrote $($item.file) ($size bytes)"
}
$synth.Dispose()

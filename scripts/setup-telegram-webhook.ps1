[CmdletBinding()]
param(
  [Parameter(Mandatory = $false)]
  [System.Security.SecureString]$BotToken,

  [Parameter(Mandatory = $false)]
  [string]$WebhookUrl = 'https://calcu-flow.vercel.app/api/telegram',

  [Parameter(Mandatory = $false)]
  [System.Security.SecureString]$VercelBypassSecret,

  [Parameter(Mandatory = $false)]
  [switch]$TelegramTestEnvironment
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$PlainToken = $null
$PlainVercelBypassSecret = $null
$EscapedVercelBypassSecret = $null
$EffectiveWebhookUrl = $null

function ConvertFrom-SecureValue {
  param([System.Security.SecureString]$SecureValue)

  $valuePointer = [IntPtr]::Zero
  try {
    $valuePointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($valuePointer)
  } finally {
    if ($valuePointer -ne [IntPtr]::Zero) {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($valuePointer)
    }
  }
}

function Protect-SensitiveText {
  param([AllowNull()][string]$Text)

  if ($null -eq $Text) { return $null }

  $safeText = $Text
  foreach ($secret in @($script:PlainToken, $script:PlainVercelBypassSecret, $script:EscapedVercelBypassSecret)) {
    if (-not [string]::IsNullOrEmpty($secret)) {
      $safeText = $safeText.Replace($secret, '[REDACTED]')
    }
  }
  return $safeText
}

function Get-SanitizedWebhookUrl {
  param([AllowNull()][string]$Url)

  if ([string]::IsNullOrWhiteSpace($Url)) { return '' }

  $parsedUrl = $null
  if (-not [Uri]::TryCreate($Url, [UriKind]::Absolute, [ref]$parsedUrl)) {
    return Protect-SensitiveText -Text $Url
  }

  $baseUrl = $parsedUrl.GetLeftPart([UriPartial]::Path)
  if ([string]::IsNullOrEmpty($parsedUrl.Query)) { return $baseUrl }
  return "${baseUrl}?x-vercel-protection-bypass=[REDACTED]"
}

function Get-SanitizedTelegramError {
  param([System.Management.Automation.ErrorRecord]$ErrorRecord)

  $message = if ($ErrorRecord.ErrorDetails) { $ErrorRecord.ErrorDetails.Message } else { $null }
  if ($message) {
    try {
      $telegramError = $message | ConvertFrom-Json -ErrorAction Stop
      $descriptionProperty = $telegramError.PSObject.Properties['description']
      if ($descriptionProperty -and $descriptionProperty.Value) {
        return Protect-SensitiveText -Text ([string]$descriptionProperty.Value)
      }
    } catch {
      # Fall back to the sanitized PowerShell exception below.
    }
  }

  return Protect-SensitiveText -Text ([string]$ErrorRecord.Exception.Message)
}

function Get-OptionalProperty {
  param(
    [Parameter(Mandatory = $true)][object]$InputObject,
    [Parameter(Mandatory = $true)][string]$Name
  )

  $property = $InputObject.PSObject.Properties[$Name]
  if ($property) { return $property.Value }
  return $null
}

function Invoke-TelegramMethod {
  param(
    [Parameter(Mandatory = $true)][string]$Method,
    [Parameter(Mandatory = $true)][hashtable]$Body
  )

  try {
    $response = Invoke-RestMethod `
      -Uri "$script:ApiBase/$Method" `
      -Method Post `
      -ContentType 'application/json; charset=utf-8' `
      -Headers @{ Accept = 'application/json' } `
      -Body ($Body | ConvertTo-Json -Depth 5 -Compress) `
      -ErrorAction Stop
  } catch {
    $description = Get-SanitizedTelegramError -ErrorRecord $_
    throw [InvalidOperationException]::new("Telegram $Method rechazó la solicitud: $description")
  }

  if (-not $response.ok) {
    $responseDescription = Get-OptionalProperty -InputObject $response -Name 'description'
    $description = if ($responseDescription) { [string]$responseDescription } else { 'Respuesta no exitosa sin descripción.' }
    throw [InvalidOperationException]::new("Telegram $Method rechazó la solicitud: $description")
  }

  return $response
}

try {
  if ($BotToken) {
    $PlainToken = ConvertFrom-SecureValue -SecureValue $BotToken
  } elseif (-not [string]::IsNullOrWhiteSpace($env:TELEGRAM_BOT_TOKEN)) {
    $PlainToken = [string]$env:TELEGRAM_BOT_TOKEN
  }

  if ([string]::IsNullOrWhiteSpace($PlainToken)) {
    throw 'TELEGRAM_BOT_TOKEN no está definido. Usa la variable de entorno o el parámetro seguro -BotToken.'
  }

  if ($PlainToken -cne $PlainToken.Trim() -or
      $PlainToken -match '\s' -or
      $PlainToken.Contains('"') -or
      $PlainToken.Contains("'") -or
      $PlainToken.Contains('<') -or
      $PlainToken.Contains('>') -or
      $PlainToken -match '(?i)YOUR_BOT_TOKEN' -or
      $PlainToken -match '(?i)^bot' -or
      $PlainToken -notmatch '^\d{5,15}:[A-Za-z0-9_-]{20,}$') {
    throw 'TELEGRAM_BOT_TOKEN tiene un formato inválido. No uses marcadores, comillas, espacios, saltos de línea ni el prefijo bot.'
  }

  $WebhookUrl = ([string]$WebhookUrl).Trim()
  $WebhookUri = $null
  if (-not [Uri]::TryCreate($WebhookUrl, [UriKind]::Absolute, [ref]$WebhookUri) -or
      $WebhookUri.Scheme -cne [Uri]::UriSchemeHttps -or
      $WebhookUri.DnsSafeHost -notmatch '(?i)(^|\.)vercel\.app$' -or
      (-not $WebhookUri.IsDefaultPort -and $WebhookUri.Port -ne 443) -or
      -not [string]::IsNullOrEmpty($WebhookUri.UserInfo) -or
      $WebhookUri.AbsolutePath -cne '/api/telegram' -or
      -not [string]::IsNullOrEmpty($WebhookUri.Query) -or
      -not [string]::IsNullOrEmpty($WebhookUri.Fragment)) {
    throw 'WebhookUrl debe ser una URL HTTPS de vercel.app con la ruta exacta /api/telegram y sin credenciales, query ni fragmento.'
  }
  $WebhookBaseUrl = $WebhookUri.GetLeftPart([UriPartial]::Path)

  if ($VercelBypassSecret) {
    $PlainVercelBypassSecret = ConvertFrom-SecureValue -SecureValue $VercelBypassSecret
    if ([string]::IsNullOrWhiteSpace($PlainVercelBypassSecret) -or
        $PlainVercelBypassSecret -cne $PlainVercelBypassSecret.Trim() -or
        $PlainVercelBypassSecret -match '\s') {
      throw 'VercelBypassSecret está vacío o contiene espacios/saltos de línea.'
    }
    $EscapedVercelBypassSecret = [Uri]::EscapeDataString($PlainVercelBypassSecret)
    $EffectiveWebhookUrl = "${WebhookBaseUrl}?x-vercel-protection-bypass=$EscapedVercelBypassSecret"
  } else {
    $EffectiveWebhookUrl = $WebhookBaseUrl
  }

  $ApiBase = if ($TelegramTestEnvironment) {
    "https://api.telegram.org/bot$PlainToken/test"
  } else {
    "https://api.telegram.org/bot$PlainToken"
  }

  try {
    $me = Invoke-TelegramMethod -Method 'getMe' -Body @{}
  } catch {
    [Console]::Error.WriteLine("ERROR: getMe falló. La autenticación/token de Telegram no es válida o la API no está accesible. No se intentó setWebhook. $($_.Exception.Message)")
    exit 1
  }

  $botUsername = Get-OptionalProperty -InputObject $me.result -Name 'username'
  $botLabel = if ($botUsername) { "@$botUsername" } else { 'bot sin username público' }
  Write-Host "getMe: OK ($botLabel)"

  try {
    $healthResponse = Invoke-WebRequest `
      -Uri $EffectiveWebhookUrl `
      -Method Get `
      -MaximumRedirection 0 `
      -UseBasicParsing `
      -ErrorAction Stop
    $health = $healthResponse.Content | ConvertFrom-Json -ErrorAction Stop
    if ([int]$healthResponse.StatusCode -ne 200 -or
        -not $health.ok -or
        $health.service -ne 'calcuflow-telegram-webhook') {
      throw 'La respuesta de salud no corresponde al webhook de CalcuFlow.'
    }
  } catch {
    $healthError = Protect-SensitiveText -Text ([string]$_.Exception.Message)
    throw "El endpoint $WebhookBaseUrl no está listo con HTTP 200 directo (sin redirecciones). No se intentó setWebhook. $healthError"
  }
  Write-Host 'Webhook endpoint: OK (HTTP 200 directo)'

  $setWebhook = Invoke-TelegramMethod -Method 'setWebhook' -Body @{
    url = $EffectiveWebhookUrl
    allowed_updates = @('message', 'edited_message', 'callback_query', 'pre_checkout_query')
    drop_pending_updates = $false
  }
  $setWebhookDescription = Get-OptionalProperty -InputObject $setWebhook -Name 'description'
  $setWebhookDescription = Protect-SensitiveText -Text ([string]$setWebhookDescription)
  Write-Host "setWebhook: OK ($setWebhookDescription)"

  $webhookInfo = Invoke-TelegramMethod -Method 'getWebhookInfo' -Body @{}
  $lastErrorUnix = Get-OptionalProperty -InputObject $webhookInfo.result -Name 'last_error_date'
  $lastErrorDate = if ($lastErrorUnix) {
    [DateTimeOffset]::FromUnixTimeSeconds([int64]$lastErrorUnix).ToLocalTime().ToString('yyyy-MM-dd HH:mm:ss zzz')
  } else {
    $null
  }
  $allowedUpdates = Get-OptionalProperty -InputObject $webhookInfo.result -Name 'allowed_updates'
  $lastErrorMessage = Get-OptionalProperty -InputObject $webhookInfo.result -Name 'last_error_message'

  Write-Host 'getWebhookInfo: OK'
  [pscustomobject]@{
    Url = Get-SanitizedWebhookUrl -Url ([string]$webhookInfo.result.url)
    VercelProtectionBypass = if ($VercelBypassSecret) { 'configured (secret redacted)' } else { 'not configured' }
    TelegramEnvironment = if ($TelegramTestEnvironment) { 'test' } else { 'production' }
    PendingUpdates = [int]$webhookInfo.result.pending_update_count
    AllowedUpdates = ($allowedUpdates -join ', ')
    LastErrorDate = $lastErrorDate
    LastErrorMessage = Protect-SensitiveText -Text ([string]$lastErrorMessage)
  } | Format-List
} catch {
  $safeMessage = Protect-SensitiveText -Text ([string]$_.Exception.Message)
  [Console]::Error.WriteLine("ERROR: $safeMessage")
  exit 1
} finally {
  $PlainToken = $null
  $PlainVercelBypassSecret = $null
  $EscapedVercelBypassSecret = $null
  $EffectiveWebhookUrl = $null
  $ApiBase = $null
}

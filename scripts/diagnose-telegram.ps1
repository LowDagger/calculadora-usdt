[CmdletBinding()]
param(
  [System.Security.SecureString]$BotToken,
  [string]$EndpointUrl = 'https://calcuflow.live/api/telegram',
  [string]$GroupChatId = '-1003824051698',
  [switch]$PromptForToken,
  [switch]$TelegramTestEnvironment
)

# Read-only: no polling, webhook changes, queue changes, or message delivery.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$PlainToken = $null

function Get-Field($Value, [string]$Name) {
  if ($null -eq $Value) { return $null }
  $property = $Value.PSObject.Properties[$Name]
  if ($property) { return $property.Value }
  return $null
}

function Get-SafeErrorCategory([string]$Message) {
  # Never echo descriptions: they can contain URLs, credentials or user content.
  if ($Message -match '(?i)429|too many requests') { return 'rate_limited' }
  if ($Message -match '(?i)401|403|forbidden|unauthorized|not enough rights|blocked') { return 'permission_or_protection' }
  if ($Message -match '(?i)30[1278]|redirect') { return 'redirect' }
  if ($Message -match '(?i)timed?\s*out|timeout') { return 'timeout' }
  if ($Message -match '(?i)50[0-9]|bad gateway|unavailable') { return 'server' }
  if ($Message -match '(?i)chat not found|member.*not found') { return 'inaccessible_chat' }
  return 'unknown'
}

function Get-SafeUrl([string]$Url) {
  if ([string]::IsNullOrWhiteSpace($Url)) { return '' }
  $parsed = $null
  if (-not [Uri]::TryCreate($Url, [UriKind]::Absolute, [ref]$parsed) -or
      $parsed.Scheme -ne 'https' -or $parsed.UserInfo -or
      ($parsed.DnsSafeHost -ne 'calcuflow.live' -and $parsed.DnsSafeHost -notmatch '^[a-z0-9-]+\.vercel\.app$') -or
      $parsed.AbsolutePath -ne '/api/telegram') { return '[unexpected URL redacted]' }
  $safe = $parsed.GetLeftPart([UriPartial]::Path)
  if ($parsed.Query -or $parsed.Fragment) { $safe += '?[REDACTED]' }
  return $safe
}

function Invoke-ReadOnlyTelegram([string]$Method, [hashtable]$Body = @{}) {
  if ($Method -notin @('getMe', 'getWebhookInfo', 'getChat', 'getChatMember')) {
    throw 'Method outside diagnostic allowlist.'
  }
  try {
    $response = Invoke-RestMethod -Uri "$script:ApiBase/$Method" -Method Post `
      -ContentType 'application/json' -Body ($Body | ConvertTo-Json -Compress) `
      -TimeoutSec 10 -MaximumRedirection 0 -ErrorAction Stop
    if ((Get-Field $response 'ok') -ne $true) {
      return @{ ok = $false; category = Get-SafeErrorCategory ([string](Get-Field $response 'description')) }
    }
    return @{ ok = $true; result = Get-Field $response 'result' }
  } catch {
    return @{ ok = $false; category = Get-SafeErrorCategory ([string]$_.Exception.Message) }
  }
}

function Test-Endpoint([string]$Url) {
  try {
    $response = Invoke-WebRequest -Uri $Url -Method Get -MaximumRedirection 0 `
      -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    $status = [int]$response.StatusCode
    $body = $null
    try { $body = $response.Content | ConvertFrom-Json -ErrorAction Stop } catch {}
    $valid = $status -eq 200 -and (Get-Field $body 'ok') -eq $true -and
      (Get-Field $body 'service') -eq 'calcuflow-telegram-webhook'
    return @{ http_status = $status; direct_health = $valid;
      category = if ($valid) { 'healthy_get_only' } elseif ($status -ge 300 -and $status -lt 400) { 'redirect' } else { 'unexpected_response_or_protection' } }
  } catch {
    $status = Get-Field (Get-Field $_.Exception 'Response') 'StatusCode'
    return @{ http_status = if ($null -ne $status) { [int]$status } else { $null };
      direct_health = $false; category = Get-SafeErrorCategory ([string]$_.Exception.Message) }
  }
}

try {
  $endpoint = $null
  if (-not [Uri]::TryCreate($EndpointUrl, [UriKind]::Absolute, [ref]$endpoint) -or
      (Get-SafeUrl $EndpointUrl) -in @('', '[unexpected URL redacted]') -or
      $endpoint.Query -or $endpoint.Fragment -or -not $endpoint.IsDefaultPort) {
    throw 'Invalid diagnostic endpoint.'
  }
  if ($GroupChatId -notmatch '^-\d+$') { throw 'Invalid group ID.' }
  if ($PromptForToken -and -not $BotToken) { $BotToken = Read-Host 'Telegram token (secure input)' -AsSecureString }
  if ($BotToken) {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($BotToken)
    try { $PlainToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  } elseif ($env:TELEGRAM_BOT_TOKEN) { $PlainToken = $env:TELEGRAM_BOT_TOKEN }
  if ($PlainToken -and $PlainToken -notmatch '^\d{5,15}:[A-Za-z0-9_-]{20,}$') { throw 'Invalid token format.' }

  $report = [ordered]@{
    read_only = $true
    endpoint = Get-SafeUrl $EndpointUrl
    anonymous_endpoint = Test-Endpoint $EndpointUrl
    telegram_environment = if ($TelegramTestEnvironment) { 'test' } else { 'production' }
    credentials_available = [bool]$PlainToken
    telegram = 'skipped_without_credentials'
    limitations = @('GET health is not a webhook POST or Telegram interaction test.',
      'Zero pending updates does not prove delivery.', 'Error descriptions and URL secrets are redacted.')
  }
  if ($PlainToken) {
    $ApiBase = "https://api.telegram.org/bot$PlainToken"
    if ($TelegramTestEnvironment) { $ApiBase += '/test' }
    $me = Invoke-ReadOnlyTelegram 'getMe'
    $info = Invoke-ReadOnlyTelegram 'getWebhookInfo'
    $telegram = [ordered]@{ getMe = @{ ok = $me.ok }; getWebhookInfo = @{ ok = $info.ok } }
    if ($me.ok) {
      $telegram.getMe = @{
        ok = $true
        expected_username = ([string](Get-Field $me.result 'username') -ieq 'calcuflowbot')
        can_join_groups = Get-Field $me.result 'can_join_groups'
        can_read_all_group_messages = Get-Field $me.result 'can_read_all_group_messages'
      }
      $group = Invoke-ReadOnlyTelegram 'getChat' @{ chat_id = $GroupChatId }
      $member = Invoke-ReadOnlyTelegram 'getChatMember' @{ chat_id = $GroupChatId; user_id = Get-Field $me.result 'id' }
      $telegram.group = @{ ok = $group.ok }
      $telegram.membership = @{ ok = $member.ok }
      if ($group.ok) {
        $permissions = Get-Field $group.result 'permissions'
        $telegram.group = @{ ok = $true; type = Get-Field $group.result 'type'; is_forum = Get-Field $group.result 'is_forum';
          can_send_messages = Get-Field $permissions 'can_send_messages' }
      } else { $telegram.group.category = $group.category }
      if ($member.ok) {
        $telegram.membership = @{ ok = $true; status = Get-Field $member.result 'status';
          is_member = Get-Field $member.result 'is_member'; can_send_messages = Get-Field $member.result 'can_send_messages';
          can_manage_topics = Get-Field $member.result 'can_manage_topics'; can_delete_messages = Get-Field $member.result 'can_delete_messages' }
      } else { $telegram.membership.category = $member.category }
    } else { $telegram.getMe.category = $me.category }
    if ($info.ok) {
      $registered = [string](Get-Field $info.result 'url')
      $errorDate = Get-Field $info.result 'last_error_date'
      $lastError = [string](Get-Field $info.result 'last_error_message')
      $telegram.getWebhookInfo = @{
        ok = $true; registered_url = Get-SafeUrl $registered
        matches_endpoint_without_query = ((Get-SafeUrl $registered).Split('?')[0] -eq $EndpointUrl)
        allowed_updates = Get-Field $info.result 'allowed_updates'
        pending_update_count = Get-Field $info.result 'pending_update_count'
        last_error_date = if ($errorDate) { [DateTimeOffset]::FromUnixTimeSeconds([long]$errorDate).ToUniversalTime().ToString('o') } else { $null }
        last_error_message = if ($lastError) { (Get-SafeErrorCategory $lastError) + ' [details redacted]' } else { $null }
      }
      # Probe the registered bypass URL only when its base matches the approved endpoint.
      if ($registered -and $telegram.getWebhookInfo.matches_endpoint_without_query -and
          (Get-SafeUrl $registered) -ne '[unexpected URL redacted]') {
        $telegram.registered_endpoint = Test-Endpoint $registered
      }
    } else { $telegram.getWebhookInfo.category = $info.category }
    $report.telegram = $telegram
  }
  $report | ConvertTo-Json -Depth 8
} catch {
  # Do not propagate raw exception objects or input values to the console.
  @{ read_only = $true; diagnostic_error = 'invalid_input_or_unexpected_failure'; details = '[redacted]' } | ConvertTo-Json
} finally {
  $PlainToken = $null
  $ApiBase = $null
  $registered = $null
}

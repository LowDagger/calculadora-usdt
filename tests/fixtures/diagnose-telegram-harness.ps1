param([string]$ScriptPath, [string]$Scenario = 'healthy')
$ErrorActionPreference = 'Stop'
$env:TELEGRAM_BOT_TOKEN = $null # Never use inherited production credentials in this simulation.
$global:DiagnosticMethods = [System.Collections.Generic.List[string]]::new()
$global:DiagnosticEndpointCalls = 0
$global:DiagnosticFakeToken = '123456:SIMULATED_SECRET_abcdefghijklmnopqrstuvwxyz'
function Invoke-RestMethod {
  param($Uri, $Method, $ContentType, $Body, $TimeoutSec, $MaximumRedirection, $ErrorAction)
  if ($Method -ne 'Post' -or $MaximumRedirection -ne 0) { throw 'Unsafe diagnostic request' }
  $operation = ([Uri]$Uri).Segments[-1]
  if ($operation -notin @('getMe', 'getWebhookInfo', 'getChat', 'getChatMember')) { throw 'Mutation attempted' }
  $global:DiagnosticMethods.Add($operation)
  if ($Scenario -eq 'denied') { return [pscustomobject]@{ ok = $false; description = "Forbidden 403 $global:DiagnosticFakeToken PRIVATE_NAME 987.65" } }
  $result = switch ($operation) {
    'getMe' { @{ id = 123456; username = 'calcuflowbot'; first_name = 'PRIVATE_NAME'; can_join_groups = $true; can_read_all_group_messages = $false } }
    'getWebhookInfo' { @{
      url = if ($Scenario -eq 'unexpected-url') { 'https://example.test/PRIVATE_NAME?token=SIMULATED_SECRET' } else { 'https://calcuflow.live/api/telegram?x-vercel-protection-bypass=SIMULATED_BYPASS' }
      pending_update_count = 7; last_error_date = 1788350400
      last_error_message = "Wrong response from webhook: 403 $global:DiagnosticFakeToken PRIVATE_NAME 987.65"
    } }
    'getChat' { @{ type = 'supergroup'; title = 'PRIVATE_NAME'; is_forum = $false; permissions = @{ can_send_messages = $true } } }
    'getChatMember' { @{ status = 'member'; user = @{ first_name = 'PRIVATE_NAME' } } }
  }
  return (@{ ok = $true; result = $result } | ConvertTo-Json -Depth 6 | ConvertFrom-Json)
}
function Invoke-WebRequest {
  param($Uri, $Method, $MaximumRedirection, [switch]$UseBasicParsing, $TimeoutSec, $ErrorAction)
  if ($Method -ne 'Get' -or $MaximumRedirection -ne 0) { throw 'Unsafe endpoint probe' }
  $global:DiagnosticEndpointCalls++
  if ($Scenario -eq 'timeout') { throw "Request timed out $global:DiagnosticFakeToken" }
  if ($Scenario -eq 'protected') { return [pscustomobject]@{ StatusCode = 403; Content = 'PRIVATE_NAME SIMULATED_SECRET' } }
  if ($Scenario -eq 'redirect') { return [pscustomobject]@{ StatusCode = 307; Content = 'PRIVATE_NAME SIMULATED_SECRET' } }
  if ($Scenario -eq 'html') { return [pscustomobject]@{ StatusCode = 200; Content = '<html>Vercel login PRIVATE_NAME</html>' } }
  return [pscustomobject]@{ StatusCode = 200; Content = '{"ok":true,"service":"calcuflow-telegram-webhook"}' }
}
$params = @{}
if ($Scenario -ne 'no-token') { $params.BotToken = ConvertTo-SecureString $global:DiagnosticFakeToken -AsPlainText -Force }
if ($Scenario -eq 'invalid-input') { $params.EndpointUrl = 'https://example.test/?token=SIMULATED_SECRET' }
$output = & $ScriptPath @params
[pscustomobject]@{ report = ($output | ConvertFrom-Json); methods = $global:DiagnosticMethods.ToArray(); endpointCalls = $global:DiagnosticEndpointCalls } | ConvertTo-Json -Depth 10

'use strict';

const path = require('path');
const { execFileSync } = require('child_process');

// No process is owned merely because it uses an expected port or executable name.
function commandArguments(commandLine) {
  return (String(commandLine || '').match(/(?:[^\s"]|"[^"]*")+/g) || []).map(value => value.replace(/"/g, ''));
}

function absolutePath(value) {
  if (!value || !path.win32.isAbsolute(value)) return '';
  return path.win32.normalize(value).replace(/[\\/]+$/, '').toLowerCase();
}

function argumentValue(args, name) {
  const index = args.findIndex(arg => arg === name || arg.startsWith(`${name}=`));
  if (index < 0) return '';
  return args[index] === name ? (args[index + 1] || '') : args[index].slice(name.length + 1);
}

function classifyProcess(info, rootDir, port = 3333) {
  if (!info || !Number.isSafeInteger(info.pid) || info.pid <= 4 || !info.createdAt) return null;
  const args = commandArguments(info.commandLine);
  const executable = path.win32.basename(info.executablePath || args[0] || '').toLowerCase();
  const expected = relative => absolutePath(path.win32.join(rootDir, relative));
  if (executable === 'node.exe' && absolutePath(args[1]) === expected('bot-service/dist/index.js')) return 'bot';
  if (['chrome.exe', 'msedge.exe'].includes(executable)
      && absolutePath(argumentValue(args, '--user-data-dir')) === expected('bot-service/data/browser_profile')) return 'browser';
  if (executable === 'cloudflared.exe'
      && args[1] === 'tunnel'
      && absolutePath(argumentValue(args, '--logfile')) === expected('tunnel.log')
      && [`http://localhost:${port}`, `http://127.0.0.1:${port}`].includes(argumentValue(args, '--url'))) return 'tunnel';
  return null;
}

function sameProcess(actual, expected) {
  return !!actual && !!expected && actual.pid === expected.pid && actual.createdAt === expected.createdAt
    && actual.commandLine === expected.commandLine
    && absolutePath(actual.executablePath) === absolutePath(expected.executablePath);
}

function createProcessController({ rootDir, port = 3333, run = execFileSync, platform = process.platform,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  if (!rootDir || !path.win32.isAbsolute(rootDir)) throw new Error('An absolute project root is required');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid project port');
  function powershell(script) {
    if (platform !== 'win32') throw new Error('Project process ownership inspection requires Windows');
    return run('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand',
      Buffer.from(`$ErrorActionPreference = 'Stop'; ${script}`, 'utf16le').toString('base64')], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, shell: false, timeout: 15000
    }).trim();
  }
  function listProcesses() {
    const raw = powershell(`@(Get-CimInstance Win32_Process -Filter "Name = 'node.exe' OR Name = 'chrome.exe' OR Name = 'msedge.exe' OR Name = 'cloudflared.exe'" | ForEach-Object { [pscustomobject]@{ pid = [int]$_.ProcessId; parentPid = [int]$_.ParentProcessId; executablePath = $_.ExecutablePath; commandLine = $_.CommandLine; createdAt = $_.CreationDate.ToUniversalTime().ToString('o') } }) | ConvertTo-Json -Compress`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  }
  function portOwners(targetPort = port) {
    if (!Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) throw new Error('Invalid port');
    const raw = powershell(`@(Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -eq ${targetPort} } | Select-Object -ExpandProperty OwningProcess -Unique) | ConvertTo-Json -Compress`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return (Array.isArray(parsed) ? parsed : [parsed]).map(Number);
  }
  const classify = info => classifyProcess(info, rootDir, port);
  function ownedProcesses(kind, processes = listProcesses()) {
    return processes.filter(info => classify(info) === kind);
  }
  function assertPortAvailable() {
    const owners = portOwners();
    if (owners.length) throw new Error(`Port ${port} is already occupied; preserving PID(s) ${owners.join(', ')}. Start aborted.`);
  }
  function assertBotPortOwnership() {
    const processes = listProcesses();
    const owners = portOwners();
    for (const pid of owners) {
      if (classify(processes.find(info => info.pid === pid)) !== 'bot') {
        throw new Error(`Port ${port} belongs to an unverified process (PID ${pid}); preserving it. Operation aborted.`);
      }
    }
    return { processes, owners };
  }
  function stopOwnedProcess(snapshot, kind) {
    if (classify(snapshot) !== kind) throw new Error(`Refusing to stop an unverified ${kind} process`);
    const current = listProcesses().find(info => info.pid === snapshot.pid);
    if (!current) return;
    if (!sameProcess(current, snapshot) || classify(current) !== kind) throw new Error(`PID ${snapshot.pid} identity changed; preserving it`);
    const encoded = Buffer.from(JSON.stringify(snapshot), 'utf8').toString('base64');
    powershell(`$expected = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')) | ConvertFrom-Json; $p = [Diagnostics.Process]::GetProcessById(${snapshot.pid}); $null = $p.Handle; try { $actual = Get-CimInstance Win32_Process -Filter 'ProcessId = ${snapshot.pid}'; if ($null -eq $actual) { return }; if ($actual.CreationDate.ToUniversalTime().ToString('o') -cne $expected.createdAt -or $actual.CommandLine -cne $expected.commandLine -or $actual.ExecutablePath -ine $expected.executablePath) { throw 'Process identity changed; refusing termination' }; $p.Kill(); if (-not $p.WaitForExit(10000)) { throw 'Process did not stop' } } finally { $p.Dispose() }`);
    if (listProcesses().some(info => sameProcess(info, snapshot))) throw new Error(`Project ${kind} process ${snapshot.pid} did not stop`);
  }
  async function waitForBotPort(snapshot, timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs;
    do {
      const current = listProcesses().find(info => info.pid === snapshot.pid);
      if (!sameProcess(current, snapshot) || classify(current) !== 'bot') throw new Error('New bot exited or changed identity before becoming ready');
      const owners = portOwners();
      if (owners.some(pid => pid !== snapshot.pid)) throw new Error(`Port ${port} was occupied by another process; preserving it`);
      if (owners.includes(snapshot.pid)) return;
      await sleep(250);
    } while (Date.now() < deadline);
    throw new Error(`New bot did not listen on port ${port} within ${timeoutMs} ms`);
  }
  return { listProcesses, portOwners, classify, ownedProcesses, assertPortAvailable, assertBotPortOwnership, stopOwnedProcess, waitForBotPort };
}

module.exports = { createProcessController, classifyProcess, commandArguments, sameProcess };

#!/usr/bin/env node
/**
 * Install a global `ssw` launcher into a user-writable bin dir
 * and ensure that dir is on the user PATH.
 */
import { execFileSync, execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const entry = path.resolve(__dirname, '..', 'bin', 'ssw.js');

if (!fs.existsSync(entry)) {
  console.error('Missing entry script:', entry);
  process.exit(1);
}

function canWriteDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.ssw-write-test-${process.pid}`);
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

function resolveBinDir() {
  const candidates = [];
  if (process.platform === 'win32') {
    candidates.push(
      path.join(
        process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
        'Seesawim',
        'bin'
      )
    );
  } else {
    candidates.push(path.join(os.homedir(), '.local', 'bin'));
  }
  try {
    const prefix = execSync('npm config get prefix', { encoding: 'utf8' }).trim();
    if (prefix) candidates.push(prefix);
  } catch {
    /* ignore */
  }
  for (const dir of candidates) {
    if (canWriteDir(dir)) return dir;
  }
  throw new Error('No writable bin directory found');
}

function ensureUserPath(dir) {
  if (process.platform !== 'win32') {
    console.log('');
    console.log('If `ssw` is not found, add this to your shell profile:');
    console.log(`  export PATH="${dir}:$PATH"`);
    return;
  }

  const ps1Path = path.join(os.tmpdir(), `ssw-path-${process.pid}.ps1`);
  const ps1 = `
$dir = ${JSON.stringify(dir)}
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (-not $userPath) { $userPath = '' }
$parts = @($userPath -split ';' | Where-Object { $_ -and $_.Trim() -ne '' })
if ($parts -contains $dir) {
  Write-Output 'PATH_OK'
  exit 0
}
$newPath = if ($userPath) { "$userPath;$dir" } else { $dir }
[Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
Write-Output 'PATH_UPDATED'
`;
  fs.writeFileSync(ps1Path, ps1, 'utf8');
  try {
    const result = execFileSync(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1Path],
      { encoding: 'utf8' }
    ).trim();
    if (result.includes('PATH_UPDATED')) {
      console.log(`Added to User PATH: ${dir}`);
      console.log('(Open a new terminal for PATH changes to take effect.)');
    } else {
      console.log(`User PATH already includes: ${dir}`);
    }
  } finally {
    try {
      fs.unlinkSync(ps1Path);
    } catch {
      /* ignore */
    }
  }
}

const binDir = resolveBinDir();
const entryPosix = entry.replace(/\\/g, '/');

fs.writeFileSync(path.join(binDir, 'ssw.cmd'), `@ECHO off\r\nnode "${entry}" %*\r\n`, 'utf8');
fs.writeFileSync(
  path.join(binDir, 'ssw.ps1'),
  `#!/usr/bin/env pwsh
$entry = '${entryPosix.replace(/'/g, "''")}'
if ($MyInvocation.ExpectingInput) {
  $input | & node $entry @args
} else {
  & node $entry @args
}
exit $LASTEXITCODE
`,
  'utf8'
);
fs.writeFileSync(
  path.join(binDir, 'ssw'),
  `#!/bin/sh\nexec node "${entryPosix}" "$@"\n`,
  'utf8'
);
try {
  fs.chmodSync(path.join(binDir, 'ssw'), 0o755);
} catch {
  /* ignore on Windows */
}

ensureUserPath(binDir);

console.log('');
console.log('Installed global command: ssw');
console.log(`  entry: ${entry}`);
console.log(`  bin:   ${binDir}`);
console.log('');
console.log('Try in a new terminal:');
console.log('  ssw');
console.log('  ssw path\\to\\file.txt');
console.log('');
console.log(`This session:  $env:Path += ";${binDir}"`);

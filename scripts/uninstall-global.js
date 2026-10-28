#!/usr/bin/env node
import fs from 'fs';
import os from 'os';
import path from 'path';

const names = ['ssw', 'ssw.cmd', 'ssw.ps1'];
const dirs = [];

if (process.platform === 'win32') {
  dirs.push(
    path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Seesawim', 'bin')
  );
} else {
  dirs.push(path.join(os.homedir(), '.local', 'bin'));
}

for (const dir of dirs) {
  for (const name of names) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      console.log('Removed', p);
    }
  }
}

console.log('Done. You can remove the Seesawim bin folder from User PATH manually if you want.');

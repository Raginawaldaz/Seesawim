import path from 'path';
import { fileURLToPath } from 'url';
import { startEditor } from './core/editor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const defaultFile = path.join(root, 'demo.txt');

const fileArg = process.argv[2];
const target = fileArg ? path.resolve(process.cwd(), fileArg) : defaultFile;

try {
  startEditor(target);
} catch (err) {
  console.error('Seesawim failed to start:', err.message || err);
  process.exit(1);
}

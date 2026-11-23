// Copies the extension's shared code (the same request, variable, test and
// scenario logic the Workbench uses) into src/, so the CLI behaves exactly
// like the extension. Run by `npm test` and before `npm pack` / `npm publish`.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ext = process.env.HITAPI_EXTENSION_DIR || join(root, '..', 'hitapi-extension');
if (!existsSync(join(ext, 'shared', 'vars.js'))) {
  if (existsSync(join(root, 'src', 'shared', 'vars.js'))) { console.log('copy-shared: extension not found, keeping the existing copy'); process.exit(0); }
  console.error(`copy-shared: can't find the extension at ${ext} (set HITAPI_EXTENSION_DIR)`);
  process.exit(1);
}
cpSync(join(ext, 'shared'), join(root, 'src', 'shared'), { recursive: true, force: true });
mkdirSync(join(root, 'src', 'lib'), { recursive: true });
cpSync(join(ext, 'lib', 'js-yaml.mjs'), join(root, 'src', 'lib', 'js-yaml.mjs'));
console.log(`copy-shared: copied ${join(ext, 'shared')} → src/shared`);

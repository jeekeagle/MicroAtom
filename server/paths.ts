import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const dataDir = path.resolve(
  process.env.KEXU_DATA_DIR || path.join(appRoot, 'data')
);

export const mediaRoot = path.join(dataDir, 'media');
export const secretsPath = path.join(dataDir, 'secrets.json');
export const distRoot = path.join(appRoot, 'dist');
export const serverScriptsRoot = path.join(appRoot, 'server', 'scripts');

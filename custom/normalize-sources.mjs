// SPDX-License-Identifier: AGPL-3.0-or-later
// Upstream generators compare LF-delimited source literals; Windows CRLF checkout breaks them.
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!readFileSync(path.join(root, 'custom/config.json'), 'utf8').includes('FluxerLePast')) throw new Error('Unexpected workspace');
execFileSync('git', ['config', '--local', 'core.autocrlf', 'false'], {cwd: root});
execFileSync('git', ['config', '--local', 'core.eol', 'lf'], {cwd: root});
const paths = execFileSync('git', ['ls-files', '-z'], {cwd: root, maxBuffer: 16 * 1024 * 1024}).toString().split('\0');
let count = 0;
for (const name of paths) {
	if (!/\.(ts|tsx|js|mjs|cjs|css|json|html|yaml|yml|toml|rs|md|sh|ps1)$/.test(name)) continue;
	const file = path.join(root, name);
	const bytes = readFileSync(file);
	if (bytes.includes(0)) continue;
	const text = bytes.toString('utf8');
	if (text.includes('\r\n')) { writeFileSync(file, text.replaceAll('\r\n', '\n')); count++; }
}
console.log('Normalized LF source files: ' + count);

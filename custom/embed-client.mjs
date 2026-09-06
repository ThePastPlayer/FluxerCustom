// SPDX-License-Identifier: AGPL-3.0-or-later
import {readFile, writeFile, cp, mkdir, readdir, mkdtemp, rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await readFile(path.join(root, 'custom/config.json'), 'utf8'));
const source = path.join(root, 'fluxer_app/dist');
const finalOutput = path.join(root, 'fluxer_desktop/embedded-client');
const output = await mkdtemp(path.join(root, 'fluxer_desktop/embedded-client-stage-'));
await cp(source, output, {recursive: true});
const response = await fetch(config.instance + '/.well-known/fluxer', {signal: AbortSignal.timeout(15000)});
if (!response.ok) throw new Error('Instance discovery failed: ' + response.status);
const instance = await response.json();
if (!instance.features?.self_hosted || instance.endpoints?.api !== config.instance + '/api') {
	throw new Error('Unexpected instance discovery; refusing to embed.');
}
if (instance.captcha?.provider !== 'none') throw new Error('Review captcha CSP before publishing this instance.');
const runtime = {releaseChannel: 'canary', bootstrapApiEndpoint: config.instance + '/api', bootstrapApiPublicEndpoint: config.instance + '/api'};
const escape = (value) => JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
const bootstrap = '<script>window.__FLUXER_BOOTSTRAP__=' + escape({config: runtime, instance, geoip: {country_code: 'FR'}}) +
	';window.__FLUXER_CONFIG__=' + escape({PUBLIC_RELEASE_CHANNEL: 'canary', PUBLIC_BOOTSTRAP_API_ENDPOINT: runtime.bootstrapApiEndpoint, PUBLIC_BOOTSTRAP_API_PUBLIC_ENDPOINT: runtime.bootstrapApiEndpoint}) + ';</script>';
let html = await readFile(path.join(output, 'index.html'), 'utf8');
if (!html.includes('<head>') || !html.includes('<div id="root"></div>')) throw new Error('Upstream app shell changed; review required.');
// Rspack removes HTML comments; match the fallback used by upstream app-proxy.
html = (html.includes('<!--{{FLUXER_BOOTSTRAP}}-->')
	? html.replace('<!--{{FLUXER_BOOTSTRAP}}-->', bootstrap)
	: html.replace('<head>', '<head>' + bootstrap))
	.replaceAll('{{STATIC_CDN_ENDPOINT}}', instance.endpoints.static_cdn)
	.replaceAll('{{MEDIA_ENDPOINT}}', instance.endpoints.media)
	.replaceAll(' nonce="{{CSP_NONCE_PLACEHOLDER}}"', '')
	.replace('<title>Fluxer</title>', '<title>Fluxer LePast</title>');
// A fresh dedicated profile gets a gaming-oriented default. Explicit preferences are preserved.
html = html.replace('</head>', '<script src="/assets/lepast-defaults.js"></script></head>');
await writeFile(path.join(output, 'assets/lepast-defaults.js'), `try{const key='VoiceSettings';const old=JSON.parse(localStorage.getItem(key)||'{}');if(!old.screenShareContentHintPrefV2||old.screenShareContentHintPrefV2==='auto'){old.screenShareContentHintPrefV2='motion';localStorage.setItem(key,JSON.stringify(old));}}catch{}\nwindow.addEventListener('DOMContentLoaded',()=>{const badge=document.createElement('div');badge.textContent='LePast · chat.lepast.fr · client non officiel';badge.style.cssText='position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:2147483647;font:12px system-ui;color:#ccc;pointer-events:none';document.body.append(badge);});\n`);
await writeFile(path.join(output, 'index.html'), html);
const hashes = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
	.filter((m) => m[1].trim()).map((m) => "'sha256-" + createHash('sha256').update(m[1]).digest('base64') + "'");
const csp = [
	"default-src 'self'", "base-uri 'none'", "object-src 'none'",
	"script-src 'self' 'wasm-unsafe-eval' " + hashes.join(' '),
	"style-src 'self' 'unsafe-inline' https:", "font-src 'self' https: data:",
	"img-src 'self' https: data: blob:", "media-src 'self' https: blob: data:",
	"connect-src 'self' https: wss: blob:", "worker-src 'self' blob:",
	"frame-src 'none'", "form-action 'none'", "frame-ancestors 'none'",
].join('; ');
const files = {};
async function visit(dir, prefix = '') {
	for (const item of await readdir(dir, {withFileTypes: true})) {
		const relative = prefix + item.name;
		if (item.isSymbolicLink()) throw new Error('Symlink in embedded assets');
		if (item.isDirectory()) await visit(path.join(dir, item.name), relative + '/');
		else if (item.name !== 'manifest-integrity.json') files[relative] = createHash('sha256').update(await readFile(path.join(dir, item.name))).digest('hex');
	}
}
await visit(output);
await writeFile(path.join(output, 'manifest-integrity.json'), JSON.stringify({version: config.version, upstreamCommit: config.upstreamCommit, csp, files}, null, 2));
await mkdir(path.join(root, 'custom/backups'), {recursive: true});
try { await rename(finalOutput, path.join(root, 'custom/backups/embedded-' + Date.now())); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await rename(output, finalOutput);
console.log('Embedded client prepared: ' + Object.keys(files).length + ' assets; API ' + runtime.bootstrapApiEndpoint);

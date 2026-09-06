// SPDX-License-Identifier: AGPL-3.0-or-later
// E2E harness for our built app only; never attaches to the user's Chrome/Fluxer.
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {mkdir, writeFile} from 'node:fs/promises';
const require = createRequire(new URL('./test-tools/package.json', import.meta.url));
const {_electron} = require('playwright-core');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const requests = [];
const launchEnv = {...process.env, LEPAST_TEST_PROFILE: 'smoke'};
delete launchEnv.ELECTRON_RUN_AS_NODE;
const packaged = process.argv.includes('--packaged');
const installed = process.argv.includes('--installed');
const instance = await _electron.launch({
	executablePath: installed ? path.join(process.env.LOCALAPPDATA, 'FluxerLePast/current/Fluxer LePast.exe') : packaged ? path.join(root, 'fluxer_desktop/dist-electron/win-unpacked/Fluxer LePast.exe') : path.join(root, 'fluxer_desktop/node_modules/electron/dist/electron.exe'),
	args: packaged || installed ? [] : [path.join(root, 'fluxer_desktop')],
	env: launchEnv,
	timeout: 45000,
});
try {
	const page = await instance.firstWindow({timeout: 30000});
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('requestfailed', (req) => errors.push(req.url() + ': ' + req.failure()?.errorText));
	page.on('request', (req) => requests.push({url: req.url(), type: req.resourceType()}));
	await page.waitForURL('https://client.fluxer.invalid/**', {timeout: 30000});
	await page.waitForFunction(() => document.querySelector('#root')?.childElementCount > 0, {timeout: 30000});
	await page.waitForFunction(() => !!document.querySelector('input[type="password"]'), {timeout: 30000});
	const state = await page.evaluate(async () => ({
		origin: location.origin,
		title: document.title,
		loginVisible: !!document.querySelector('input[type="password"]'),
		api: window.__FLUXER_BOOTSTRAP__?.config?.bootstrapApiEndpoint,
		bridge: typeof window.electron === 'object',
		sources: [...document.scripts].filter((s) => s.src).map((s) => s.src),
		apiReachable: await fetch('https://chat.lepast.fr/.well-known/fluxer').then((r) => r.ok),
		missingScriptStatus: await fetch('/assets/missing-test.js').then((r) => r.status),
		capture: await window.electron.nativeScreenCapture.getAvailability(),
		encoders: await window.electron.voiceEngine.getHardwareEncoderCapabilities(),
	}));
	assert.equal(state.api, 'https://chat.lepast.fr/api');
	assert.equal(state.origin, 'https://client.fluxer.invalid');
	assert.equal(state.bridge, true);
	assert.equal(state.apiReachable, true);
	assert.equal(state.missingScriptStatus, 404);
	assert.ok(state.sources.every((src) => src.startsWith(state.origin + '/')));
	const prefs = await instance.evaluate(({BrowserWindow}) => {
		const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
		return {nodeIntegration: p.nodeIntegration, contextIsolation: p.contextIsolation, webSecurity: p.webSecurity};
	});
	assert.equal(prefs.nodeIntegration, false);
	assert.equal(prefs.contextIsolation, true);
	assert.equal(prefs.webSecurity, true);
	assert.deepEqual(errors, [], 'Runtime errors: ' + errors.join('\n'));
	const dir = path.join(root, 'custom/reports');
	await mkdir(dir, {recursive: true});
	await page.screenshot({path: path.join(dir, 'login.png')});
	await writeFile(path.join(dir, 'smoke.json'), JSON.stringify({passed: true, state, prefs, errors, requests}, null, 2));
	console.log(JSON.stringify({passed: true, state, prefs, errors}));
} finally {
	await instance.close();
}

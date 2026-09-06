// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import vm from 'node:vm';
const require = createRequire(new URL('../fluxer_desktop/package.json', import.meta.url));
const esbuild = require('esbuild');
const load = (relative) => readFileSync(new URL('../fluxer_desktop/' + relative, import.meta.url), 'utf8');
const module = {exports: {}};
vm.runInNewContext(esbuild.transformSync(load('src/main/EmbeddedClientPolicy.ts'), {loader: 'ts', format: 'cjs'}).code,
	{module, exports: module.exports, require, URL});
const p = module.exports;

test('only our embedded HTTPS origin is privileged', () => {
	assert.equal(p.isEmbeddedUrl('https://client.fluxer.invalid/channels/@me'), true);
	for (const url of ['https://chat.lepast.fr/', 'https://web.fluxer.app/', 'https://client.fluxer.invalid.evil.test/', 'https://user@client.fluxer.invalid/', 'http://client.fluxer.invalid/', 'file:///C:/secrets', 'https://client.fluxer.invalid:8443/']) {
		assert.equal(p.isEmbeddedUrl(url), false, url);
	}
});
test('invalid paths never reach the filesystem', () => {
	for (const tail of ['/assets/%2e%2e%2fsecret', '/assets/%5csecret', '/C%3A/secret', '/assets/%00secret', '/assets/%zz']) {
		assert.equal(p.embeddedRelativePath('https://client.fluxer.invalid' + tail), null, tail);
	}
	assert.equal(p.embeddedRelativePath('https://client.fluxer.invalid/assets/app.js?v=1'), 'assets/app.js');
	assert.throws(() => p.resolveEmbeddedFile('C:/client', '../secret'));
});
test('missing scripts do not fall back to HTML', () => {
	assert.equal(p.isClientRoute('channels/@me'), true);
	for (const file of ['assets/missing.js', 'api/users/@me', '.env', 'arbitrary.html']) assert.equal(p.isClientRoute(file), false);
});
test('updater has no upstream fallback', () => {
	const source = load('src/main/Updater.ts');
	assert.ok(source.includes('https://chat.lepast.fr/fluxer-custom/updates/'));
	assert.ok(!source.includes('https://api.fluxer.app'));
	assert.ok(!source.includes('https://api.canary.fluxer.app'));
	assert.ok(!source.includes('https://canary.fluxer.app/download'));
});
test('official profiles and deep-link scheme stay untouched', () => {
	const identity = load('src/common/DesktopIdentity.ts');
	const storage = load('src/common/UserDataPath.ts');
	assert.ok(identity.includes("'FluxerLePast'"));
	assert.ok(storage.includes("stable: 'fluxer-lepast'"));
	assert.ok(storage.includes("canary: 'fluxer-lepast'"));
	assert.ok(load('src/common/Constants.ts').includes("APP_PROTOCOL = 'fluxer-lepast'"));
	assert.ok(load('src/common/DesktopConfig.ts').includes('only loads its embedded client'));
});

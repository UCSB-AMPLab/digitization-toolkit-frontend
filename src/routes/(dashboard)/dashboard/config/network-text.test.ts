// NEH-253: the join form's checks before sending (joinFormProblems) refuse
// what the backend's join_problems refuses (app/core/network.py), with the
// same code and in the same order: the SSID by its UTF-8 length and line
// breaks; a WPA2/WPA3 password by any ASCII control character and by its
// UTF-8 length; an institutional password, username and outer identity by
// line breaks only; the sign-in server name by the backend's host-name rule.
//
// Version: 0.3.3

import { describe, expect, it } from 'vitest';
import { joinFormProblems, type JoinForm } from './network-text';

function form(over: Partial<JoinForm>): JoinForm {
	return {
		ssid: 'Reading-Room-2',
		security: 'password',
		password: 'Secret-Pa55word',
		identity: '',
		serverName: '',
		anonymousIdentity: '',
		...over
	};
}

const ENTERPRISE: Partial<JoinForm> = {
	security: 'enterprise',
	identity: 'jdoe@example.edu',
	password: 'Secret-Pa55word',
	serverName: 'radius.example.edu'
};

describe('joinFormProblems: the SSID', () => {
	it.each([
		['', ['ssid_invalid']],
		['a'.repeat(32), []],
		['a'.repeat(33), ['ssid_invalid']],
		// 16 two-byte letters are 32 bytes; 17 are 34.
		['é'.repeat(16), []],
		['é'.repeat(17), ['ssid_invalid']],
		['Room\n2', ['ssid_invalid']],
		['Room\r2', ['ssid_invalid']],
		['Room\u00002', ['ssid_invalid']],
		// A tab is not a line break: the backend accepts it in an SSID.
		['Room\t2', []]
	])('%j: %j', (ssid, codes) => {
		expect(joinFormProblems(form({ ssid, security: 'open', password: '' }))).toEqual(codes);
	});

	it('comes before the password codes', () => {
		expect(joinFormProblems(form({ ssid: '', password: '' }))).toEqual(['ssid_invalid', 'password_required']);
	});
});

describe('joinFormProblems: a WPA2/WPA3 password', () => {
	it.each([
		['', ['password_required']],
		['abc\tdefgh', ['password_invalid']],
		['\tabcdefgh', ['password_invalid']],
		['abcdefgh\u001b', ['password_invalid']],
		['abcdefgh\u007f', ['password_invalid']],
		['abcd\nefgh', ['password_invalid']],
		['abcdefg', ['password_length']],
		['abcdefgh', []],
		['a'.repeat(63), []],
		['a'.repeat(64), ['password_length']],
		// Four two-byte letters are 8 bytes, though 4 characters.
		['éééé', []],
		// 32 two-byte letters are 64 bytes; 16 emoji are 64 bytes in 32 UTF-16 units.
		['é'.repeat(32), ['password_length']],
		['😀'.repeat(16), ['password_length']],
		['😀'.repeat(15) + 'abc', []],
		// A control character is reported, not the length.
		['\t', ['password_invalid']]
	])('%j: %j', (password, codes) => {
		expect(joinFormProblems(form({ password }))).toEqual(codes);
	});
});

describe('joinFormProblems: an institutional network', () => {
	it('accepts a tab in the password, the username and the outer identity', () => {
		expect(joinFormProblems(form({ ...ENTERPRISE, password: '\tpass', identity: 'j\tdoe', anonymousIdentity: 'any\tone' }))).toEqual([]);
	});

	it('has no length rule for the password', () => {
		expect(joinFormProblems(form({ ...ENTERPRISE, password: 'x' }))).toEqual([]);
		expect(joinFormProblems(form({ ...ENTERPRISE, password: 'x'.repeat(200) }))).toEqual([]);
	});

	it('refuses line breaks and NUL, field by field, in the backend order', () => {
		expect(
			joinFormProblems(form({ ...ENTERPRISE, password: 'a\nb', identity: 'j\rdoe', anonymousIdentity: 'any\u0000one', serverName: '10.0.0.1' }))
		).toEqual(['password_invalid', 'identity_invalid', 'anonymous_identity_invalid', 'server_name_invalid']);
	});

	it('missing fields', () => {
		expect(joinFormProblems(form({ security: 'enterprise', password: '', identity: '', serverName: '' }))).toEqual([
			'password_required',
			'identity_required',
			'server_name_required'
		]);
	});

	it.each([
		['radius.example.edu', []],
		['radius', ['server_name_invalid']],
		['radius.example.123', ['server_name_invalid']],
		['-radius.example.edu', ['server_name_invalid']],
		['radius..example.edu', ['server_name_invalid']],
		['rádius.example.edu', ['server_name_invalid']],
		['radius.example.edu\n', ['server_name_invalid']]
	])('server name %j: %j', (serverName, codes) => {
		expect(joinFormProblems(form({ ...ENTERPRISE, serverName }))).toEqual(codes);
	});
});

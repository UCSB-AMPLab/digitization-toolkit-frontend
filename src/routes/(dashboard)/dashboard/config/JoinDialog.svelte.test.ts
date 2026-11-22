// NEH-253: the join dialog. Its three forms and what each sends, the checks
// made before sending, every refusal code of POST /network/wifi/join shown
// beside its field or in the dialog, and the polling of GET
// /network/wifi/join to joined, to each failure, through failed requests
// while the unit changes network, giving up at 240 s and polling quietly
// after that. No password or user name goes into a URL or a console call.
//
// Version: 0.3.3
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';

vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import type { WifiJoinState, WifiSecurity } from '$lib/api';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { networkState, resetNetworkStatus } from '$lib/stores/network';
import { get } from 'svelte/store';
import '../../../../app.css';
import JoinDialog from './JoinDialog.svelte';

const PASSWORD = 'Secret-Pa55word';
const USERNAME = 'jdoe@example.edu';

type Call = { method: string; url: string; body: string | null; afterPost: boolean };

function json(code: number, body: unknown) {
	return new Response(code === 204 ? null : JSON.stringify(body), {
		status: code,
		headers: { 'Content-Type': 'application/json' }
	});
}

// The unit's time for the join these tests start; the polling tests set the
// browser's fake clock to it before sending.
const STARTED = '2026-11-11T12:00:00+00:00';

function joinState(
	state: WifiJoinState['state'],
	over: Partial<WifiJoinState> = {}
): WifiJoinState {
	return {
		state,
		ssid: 'Reading-Room-2',
		startedAt: STARTED,
		finishedAt: null,
		problem: null,
		restored: null,
		...over
	};
}

const IDLE = joinState('idle', { ssid: null, startedAt: null });

function refused(...codes: string[]) {
	return json(409, {
		detail: {
			message: 'English text',
			problems: codes.map((code) => ({ code, message: `English ${code}` }))
		}
	});
}

/**
 * POST /network/wifi/join answers `post` ('fail': no response at all;
 * 'hang': no answer until the request is aborted). A GET /network/wifi/join
 * made before the POST (the dialog's read of the last join) answers
 * `before`; each one after it takes the next of `polls` (a Response, or
 * 'fail' for a request that never gets through) and repeats the last one.
 * GET /network/status answers 500.
 */
function serve(
	post: () => Response | 'fail' | 'hang',
	polls: (Response | 'fail')[] = [json(200, joinState('joined'))],
	before: Response | 'fail' = json(200, IDLE)
) {
	const calls: Call[] = [];
	let i = 0;
	let posted = false;
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = String(input instanceof Request ? input.url : input);
		const method = (init?.method ?? 'GET').toUpperCase();
		calls.push({
			method,
			url,
			body: typeof init?.body === 'string' ? init.body : null,
			afterPost: posted
		});
		if (url.endsWith('/network/wifi/join') && method === 'POST') {
			posted = true;
			const answer = post();
			if (answer === 'fail') throw new TypeError('Failed to fetch');
			if (answer === 'hang') {
				return new Promise<Response>((_, reject) => {
					init?.signal?.addEventListener('abort', () =>
						reject(new DOMException('Aborted', 'AbortError'))
					);
				});
			}
			return answer;
		}
		if (url.endsWith('/network/wifi/join')) {
			if (!posted) {
				if (before === 'fail') throw new TypeError('Failed to fetch');
				return before.clone();
			}
			const next = polls[Math.min(i, polls.length - 1)];
			i += 1;
			if (next === 'fail') throw new TypeError('Failed to fetch');
			return next.clone();
		}
		return json(500, { detail: 'not in this test' });
	});
	return calls;
}

const consoleCalls: unknown[][] = [];

// Captured before any test fakes timers. A body read (response.json()) needs
// a real turn of the event loop, which advancing the fake clock does not give.
const realSetTimeout = globalThis.setTimeout.bind(globalThis);
async function settle() {
	for (let i = 0; i < 3; i++) await new Promise((r) => realSetTimeout(r, 10));
}

function open(
	security: WifiSecurity,
	ssid = security === 'enterprise' ? 'eduroam' : 'Reading-Room-2'
) {
	const onClose = vi.fn();
	const onChanged = vi.fn();
	const screen = render(JoinDialog, { network: { ssid, security }, onClose, onChanged });
	return { screen, onClose, onChanged };
}

const dialog = () => page.getByRole('dialog');
const joinButton = () => dialog().getByRole('button', { name: en.network_join, exact: true });
const passwordInput = () => dialog().getByLabelText(en.common_password_label, { exact: true });

async function fillEnterprise(server = 'radius.example.edu') {
	await userEvent.fill(
		dialog().getByLabelText(en.common_username_label, { exact: true }),
		USERNAME
	);
	await userEvent.fill(passwordInput(), PASSWORD);
	await userEvent.fill(dialog().getByLabelText(en.network_server_label, { exact: true }), server);
}

function posts(calls: Call[]) {
	return calls.filter((c) => c.method === 'POST');
}

function polls(calls: Call[]) {
	return calls.filter(
		(c) => c.method === 'GET' && c.url.endsWith('/network/wifi/join') && c.afterPost
	);
}

function noSecretsLeaked(calls: Call[]) {
	for (const c of calls) {
		expect(c.url).not.toContain(PASSWORD);
		expect(c.url).not.toContain(encodeURIComponent(PASSWORD));
		expect(c.url).not.toContain(encodeURIComponent(USERNAME));
	}
	for (const args of consoleCalls) {
		const text = args
			.map((a) => (typeof a === 'string' ? a : (JSON.stringify(a) ?? String(a))))
			.join(' ');
		expect(text).not.toContain(PASSWORD);
		expect(text).not.toContain(USERNAME);
	}
}

beforeEach(() => {
	locale.set('en');
	consoleCalls.length = 0;
	for (const name of ['log', 'info', 'warn', 'error', 'debug'] as const) {
		const original = console[name].bind(console);
		vi.spyOn(console, name).mockImplementation((...args: unknown[]) => {
			consoleCalls.push(args);
			original(...args);
		});
	}
});
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	resetNetworkStatus();
});

describe('join dialog: the three forms', () => {
	it('an open network asks for nothing and sends the SSID and the kind', async () => {
		const calls = serve(() => json(202, joinState('joining')));
		open('open', 'Library-Guest');
		await expect.element(dialog().getByText(en.network_join_open_body)).toBeVisible();
		expect(dialog().getByLabelText(en.common_password_label).elements()).toHaveLength(0);
		await joinButton().click();
		await expect.poll(() => posts(calls).length).toBe(1);
		expect(JSON.parse(posts(calls)[0].body!)).toEqual({ ssid: 'Library-Guest', security: 'open' });
	});

	it('a password network sends the password, in the body only, with the note under the field', async () => {
		const calls = serve(() => json(202, joinState('joining')));
		open('password');
		await expect.element(dialog().getByText(en.network_join_password_body)).toBeVisible();
		await expect.element(dialog().getByText(en.network_password_note)).toBeVisible();
		await expect.element(passwordInput()).toHaveAttribute('type', 'password');
		await userEvent.fill(passwordInput(), PASSWORD);
		await joinButton().click();
		await expect.poll(() => posts(calls).length).toBe(1);
		expect(posts(calls)[0].url).toMatch(/\/network\/wifi\/join$/);
		expect(JSON.parse(posts(calls)[0].body!)).toEqual({
			ssid: 'Reading-Room-2',
			security: 'password',
			password: PASSWORD
		});
		await expect.poll(() => polls(calls).length).toBeGreaterThan(0);
		noSecretsLeaked(calls);
	});

	it('an institutional network sends PEAP with MSCHAPv2 by default and no outer identity when blank', async () => {
		const calls = serve(() => json(202, joinState('joining')));
		open('enterprise');
		await expect.element(dialog().getByText(en.network_join_enterprise_body)).toBeVisible();
		await expect.element(dialog().getByText(en.network_password_note)).toBeVisible();
		await fillEnterprise();
		await joinButton().click();
		await expect.poll(() => posts(calls).length).toBe(1);
		expect(JSON.parse(posts(calls)[0].body!)).toEqual({
			ssid: 'eduroam',
			security: 'enterprise',
			identity: USERNAME,
			password: PASSWORD,
			serverName: 'radius.example.edu',
			method: 'peap',
			innerMethod: 'mschapv2'
		});
		await expect.poll(() => polls(calls).length).toBeGreaterThan(0);
		noSecretsLeaked(calls);
	});

	it.each([
		[en.network_method_ttls_pap, 'ttls', 'pap'],
		[en.network_method_ttls_mschapv2, 'ttls', 'mschapv2'],
		[en.network_method_peap, 'peap', 'mschapv2']
	])(
		'More options: "%s" and the outer identity go in the body',
		async (label, method, innerMethod) => {
			const calls = serve(() => json(202, joinState('joining')));
			open('enterprise');
			await fillEnterprise();
			const more = dialog().getByRole('button', { name: en.network_more_options });
			await expect.element(more).toHaveAttribute('aria-expanded', 'false');
			await more.click();
			await expect.element(more).toHaveAttribute('aria-expanded', 'true');
			await userEvent.fill(
				dialog().getByLabelText(en.network_outer_identity, { exact: true }),
				'anonymous@example.edu'
			);
			await userEvent.selectOptions(
				dialog().getByLabelText(en.network_method, { exact: true }),
				label
			);
			await joinButton().click();
			await expect.poll(() => posts(calls).length).toBe(1);
			const body = JSON.parse(posts(calls)[0].body!);
			expect(body.method).toBe(method);
			expect(body.innerMethod).toBe(innerMethod);
			expect(body.anonymousIdentity).toBe('anonymous@example.edu');
		}
	);
});

describe('join dialog: checks before sending', () => {
	it('a password network: an empty password and a short one are refused without a request', async () => {
		const calls = serve(() => json(202, joinState('joining')));
		open('password');
		await joinButton().click();
		await expect.element(dialog().getByText(en.network_refusal_password_required)).toBeVisible();
		await userEvent.fill(passwordInput(), 'short');
		await joinButton().click();
		await expect.element(dialog().getByText(en.network_refusal_password_length)).toBeVisible();
		await expect.element(passwordInput()).toHaveAttribute('aria-invalid', 'true');
		expect(posts(calls)).toHaveLength(0);
	});

	it('an institutional network: missing fields and a server given as an IP address', async () => {
		const calls = serve(() => json(202, joinState('joining')));
		open('enterprise');
		await joinButton().click();
		await expect.element(dialog().getByText(en.network_refusal_identity_required)).toBeVisible();
		await expect.element(dialog().getByText(en.network_refusal_password_required)).toBeVisible();
		await expect.element(dialog().getByText(en.network_refusal_server_name_required)).toBeVisible();
		await fillEnterprise('10.0.0.1');
		await joinButton().click();
		await expect.element(dialog().getByText(en.network_refusal_server_name_invalid)).toBeVisible();
		expect(posts(calls)).toHaveLength(0);
	});
});

describe('join dialog: refusals of POST /network/wifi/join (409)', () => {
	const FIELD: [string, string, () => string][] = [
		['password_required', 'password', () => en.network_refusal_password_required],
		['password_invalid', 'password', () => en.network_refusal_password_invalid],
		['password_length', 'password', () => en.network_refusal_password_length],
		['identity_required', 'identity', () => en.network_refusal_identity_required],
		['identity_invalid', 'identity', () => en.network_refusal_identity_invalid],
		[
			'anonymous_identity_invalid',
			'anonymousIdentity',
			() => en.network_refusal_anonymous_identity_invalid
		],
		['method_required', 'method', () => en.network_refusal_method_required],
		['inner_method_invalid', 'method', () => en.network_refusal_inner_method_invalid],
		['server_name_required', 'serverName', () => en.network_refusal_server_name_required],
		['server_name_invalid', 'serverName', () => en.network_refusal_server_name_invalid]
	];

	it.each(FIELD)('%s is shown beside the %s field', async (code, field, text) => {
		serve(() => refused(code));
		const { screen } = open('enterprise');
		await fillEnterprise();
		await joinButton().click();
		await expect
			.poll(() => document.querySelector(`[data-field-error="${field}"]`)?.textContent?.trim())
			.toBe(text());
		expect(document.body.textContent).not.toContain('English');
		expect(screen.container).toBeTruthy();
	});

	const DIALOG: [string, () => string][] = [
		['ssid_invalid', () => en.network_refusal_ssid_invalid],
		['no_wifi_device', () => en.network_no_wifi_device],
		['not_permitted', () => en.network_refusal_not_permitted],
		['join_in_progress', () => en.network_refusal_join_in_progress],
		['something_new', () => en.network_refusal_other]
	];

	it.each(DIALOG)('%s is shown in the dialog', async (code, text) => {
		serve(() => refused(code));
		open('password');
		await userEvent.fill(passwordInput(), PASSWORD);
		await joinButton().click();
		await expect
			.poll(() => document.querySelector('[data-dialog-error]')?.textContent?.trim())
			.toBe(text());
		expect(document.body.textContent).not.toContain('English');
		// The form stays, with what was typed, so the person can correct it.
		await expect.element(passwordInput()).toHaveValue(PASSWORD);
	});

	it('several codes at once each go to their place', async () => {
		serve(() => refused('identity_required', 'server_name_invalid'));
		open('enterprise');
		await fillEnterprise();
		await joinButton().click();
		await expect
			.poll(() => document.querySelector('[data-field-error="identity"]')?.textContent?.trim())
			.toBe(en.network_refusal_identity_required);
		expect(document.querySelector('[data-field-error="serverName"]')?.textContent?.trim()).toBe(
			en.network_refusal_server_name_invalid
		);
	});
});

describe('join dialog: polling the join', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
		vi.setSystemTime(Date.parse(STARTED));
	});

	async function startPasswordJoin(pollAnswers: (Response | 'fail')[]) {
		const calls = serve(
			() => json(202, joinState('joining', { ssid: 'Reading-Room-2' })),
			pollAnswers
		);
		const opened = open('password');
		await userEvent.fill(passwordInput(), PASSWORD);
		await joinButton().click();
		await expect
			.element(dialog().getByText(en.network_joining_title('Reading-Room-2')))
			.toBeVisible();
		return { calls, ...opened };
	}

	it('polls about once a second until joined', async () => {
		const { calls, onChanged } = await startPasswordJoin([
			json(200, joinState('joining')),
			json(200, joinState('joining')),
			json(200, joinState('joined'))
		]);
		expect(polls(calls)).toHaveLength(0);
		await vi.advanceTimersByTimeAsync(1000);
		await settle();
		expect(polls(calls)).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(1000);
		await settle();
		expect(polls(calls)).toHaveLength(2);
		await vi.advanceTimersByTimeAsync(1000);
		await expect
			.element(dialog().getByText(en.network_joined_title('Reading-Room-2')))
			.toBeVisible();
		await expect.element(dialog().getByText(en.network_joined_saved)).toBeVisible();
		expect(onChanged).toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(5000);
		expect(polls(calls)).toHaveLength(3);
		await expect.element(passwordInput()).not.toBeInTheDocument();
		noSecretsLeaked(calls);
	});

	it.each([
		['wrong_password', () => en.network_fail_wrong_password],
		['wrong_credentials', () => en.network_fail_wrong_credentials],
		['server_name_mismatch', () => en.network_fail_server_name_mismatch],
		['server_not_trusted', () => en.network_fail_server_not_trusted],
		['timeout', () => en.network_fail_timeout],
		['not_permitted', () => en.network_fail_not_permitted],
		['failed', () => en.network_fail_failed]
	])('a failed join with %s says so in a sentence', async (code, text) => {
		await startPasswordJoin([
			json(200, joinState('failed', { problem: { code, detail: 'English detail', server: null } }))
		]);
		await vi.advanceTimersByTimeAsync(1000);
		await expect
			.element(dialog().getByText(en.network_failed_title('Reading-Room-2')))
			.toBeVisible();
		await expect.element(dialog().getByText(text())).toBeVisible();
		expect(document.body.textContent).not.toContain('English detail');
		await expect.element(dialog().getByRole('button', { name: en.common_retry })).toBeVisible();
	});

	it("a server name mismatch lists the server's names", async () => {
		await startPasswordJoin([
			json(
				200,
				joinState('failed', {
					problem: {
						code: 'server_name_mismatch',
						detail: null,
						server: {
							subject: 'CN=wifi.example.edu',
							names: ['wifi.example.edu', 'radius2.example.edu'],
							hash: 'ab'
						}
					}
				})
			)
		]);
		await vi.advanceTimersByTimeAsync(1000);
		await expect
			.element(
				dialog().getByText(en.network_fail_server_names('wifi.example.edu, radius2.example.edu'))
			)
			.toBeVisible();
	});

	it.each([
		[true, () => en.network_restored_true],
		[false, () => en.network_restored_false]
	])('says whether the earlier Wi-Fi came back (restored %s)', async (restored, text) => {
		await startPasswordJoin([
			json(
				200,
				joinState('failed', { problem: { code: 'timeout', detail: null, server: null }, restored })
			)
		]);
		await vi.advanceTimersByTimeAsync(1000);
		await expect.element(dialog().getByText(text())).toBeVisible();
	});

	it('"Retry" goes back to the form with what was typed', async () => {
		await startPasswordJoin([
			json(
				200,
				joinState('failed', { problem: { code: 'wrong_password', detail: null, server: null } })
			)
		]);
		await vi.advanceTimersByTimeAsync(1000);
		await dialog().getByRole('button', { name: en.common_retry }).click();
		await expect.element(passwordInput()).toHaveValue(PASSWORD);
	});

	it('keeps polling through failed requests while the unit changes network', async () => {
		const answers: (Response | 'fail')[] = [
			...Array(30).fill('fail'),
			json(200, joinState('joined'))
		];
		const { calls } = await startPasswordJoin(answers);
		await vi.advanceTimersByTimeAsync(5000);
		await expect.element(dialog().getByText(en.network_joining_no_answer)).toBeVisible();
		await vi.advanceTimersByTimeAsync(27_000);
		expect(polls(calls).length).toBeGreaterThanOrEqual(30);
		await expect
			.element(dialog().getByText(en.network_joined_title('Reading-Room-2')))
			.toBeVisible();
	});

	it('gives up after 240 s without an answer and says the unit may be on another network', async () => {
		await startPasswordJoin(['fail']);
		await vi.advanceTimersByTimeAsync(239_000);
		await expect
			.element(dialog().getByText(en.network_joining_title('Reading-Room-2')))
			.toBeVisible();
		await vi.advanceTimersByTimeAsync(2_000);
		await expect.element(dialog().getByText(en.network_lost_title)).toBeVisible();
		await expect.element(dialog().getByText(en.network_lost_body)).toBeVisible();
		// No duration is stated: a stated one goes wrong when the timing changes.
		expect(dialog().element().textContent).not.toMatch(/\d/);
	});

	it('after "cannot reach", an outcome for this join that arrives later replaces it', async () => {
		const answers: (Response | 'fail')[] = [
			...Array(250).fill('fail'),
			json(
				200,
				joinState('failed', {
					problem: { code: 'timeout', detail: null, server: null },
					restored: true
				})
			)
		];
		await startPasswordJoin(answers);
		await run(242_000);
		await expect.element(dialog().getByText(en.network_lost_title)).toBeVisible();
		await run(20_000);
		await expect
			.element(dialog().getByText(en.network_failed_title('Reading-Room-2')))
			.toBeVisible();
		await expect.element(dialog().getByText(en.network_restored_true)).toBeVisible();
	}, 60_000);

	it('after "cannot reach", polls quietly for 120 s more, then stops', async () => {
		const { calls } = await startPasswordJoin(['fail']);
		await run(362_000);
		await expect.element(dialog().getByText(en.network_lost_title)).toBeVisible();
		const made = polls(calls).length;
		expect(made).toBeGreaterThan(340);
		await run(20_000);
		expect(polls(calls).length).toBe(made);
	}, 60_000);

	it('after "cannot reach", an answer about another join replaces it with "cannot tell", not that join\'s outcome', async () => {
		const other = joinState('failed', {
			startedAt: '2026-11-11T11:00:00+00:00',
			problem: { code: 'wrong_password', detail: null, server: null }
		});
		await startPasswordJoin([...Array(250).fill('fail'), json(200, other)]);
		await run(242_000);
		await expect.element(dialog().getByText(en.network_lost_title)).toBeVisible();
		await run(20_000);
		await expect.element(dialog().getByText(en.network_unknown_title)).toBeVisible();
		expect(dialog().element().textContent).not.toContain(en.network_lost_title);
		expect(dialog().element().textContent).not.toContain(en.network_fail_wrong_password);
	}, 60_000);

	it('after "cannot reach", an answer that this join is still running replaces it', async () => {
		const { calls } = await startPasswordJoin([
			...Array(250).fill('fail'),
			json(200, joinState('joining'))
		]);
		await run(242_000);
		await expect.element(dialog().getByText(en.network_lost_title)).toBeVisible();
		await run(20_000);
		expect(dialog().element().textContent).not.toContain(en.network_lost_title);
		await expect.element(dialog().getByText(en.network_unknown_title)).toBeVisible();
		expect(dialog().element().textContent).not.toContain(en.network_not_received_title);
		const made = polls(calls).length;
		await run(5_000);
		expect(polls(calls).length).toBeGreaterThan(made);
	}, 60_000);
});

describe('join dialog: closing', () => {
	it('Cancel and Escape close it', async () => {
		serve(() => json(202, joinState('joining')));
		const { onClose } = open('password');
		await dialog().getByRole('button', { name: en.common_cancel }).click();
		expect(onClose).toHaveBeenCalledTimes(1);
		await userEvent.keyboard('{Escape}');
		expect(onClose).toHaveBeenCalledTimes(2);
	});

	// onClose here leaves the dialog mounted, so what close() did to the
	// component's own state is still visible in its fields.
	it('Cancel clears the password, username, server name and outer identity, and none is kept elsewhere', async () => {
		serve(() => json(202, joinState('joining')));
		const { onClose } = open('enterprise');
		await fillEnterprise();
		await dialog().getByRole('button', { name: en.network_more_options }).click();
		const outer = dialog().getByLabelText(en.network_outer_identity, { exact: true });
		await userEvent.fill(outer, 'anonymous@example.edu');
		await dialog().getByRole('button', { name: en.common_cancel }).click();
		expect(onClose).toHaveBeenCalledTimes(1);
		await expect.element(passwordInput()).toHaveValue('');
		await expect
			.element(dialog().getByLabelText(en.common_username_label, { exact: true }))
			.toHaveValue('');
		await expect
			.element(dialog().getByLabelText(en.network_server_label, { exact: true }))
			.toHaveValue('');
		await expect.element(outer).toHaveValue('');
		const kept = [
			JSON.stringify(get(networkState)),
			JSON.stringify({ ...localStorage }),
			JSON.stringify({ ...sessionStorage }),
			document.cookie
		];
		for (const text of kept) {
			expect(text).not.toContain(PASSWORD);
			expect(text).not.toContain(USERNAME);
		}
	});
});

function statusReads(calls: Call[]) {
	return calls.filter((c) => c.url.endsWith('/network/status'));
}

describe('join dialog: the POST gets no HTTP answer (fix round)', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
		vi.setSystemTime(Date.parse(STARTED));
	});

	async function send(post: () => Response | 'fail' | 'hang', pollAnswers: (Response | 'fail')[]) {
		const calls = serve(post, pollAnswers);
		const opened = open('password');
		await userEvent.fill(passwordInput(), PASSWORD);
		await joinButton().click();
		return { calls, ...opened };
	}

	it('a network error: polls, and a join of this SSID that started after the POST is this one: joined', async () => {
		await send(() => 'fail', [json(200, joinState('joined'))]);
		await expect
			.element(dialog().getByText(en.network_joining_title('Reading-Room-2')))
			.toBeVisible();
		await vi.advanceTimersByTimeAsync(1000);
		await expect
			.element(dialog().getByText(en.network_joined_title('Reading-Room-2')))
			.toBeVisible();
	});

	it('a network error: polls, and a failed join of this SSID is this one: failed', async () => {
		await send(
			() => 'fail',
			[
				json(
					200,
					joinState('failed', { problem: { code: 'wrong_password', detail: null, server: null } })
				)
			]
		);
		await vi.advanceTimersByTimeAsync(1000);
		await expect.element(dialog().getByText(en.network_fail_wrong_password)).toBeVisible();
	});

	it('a POST with no answer in 10 s is given up and the join is polled', async () => {
		const { calls } = await send(() => 'hang', [json(200, joinState('joined'))]);
		await vi.advanceTimersByTimeAsync(9_999);
		await settle();
		expect(polls(calls)).toHaveLength(0);
		await expect.element(dialog().getByRole('button', { name: en.config_sending })).toBeDisabled();
		await vi.advanceTimersByTimeAsync(1);
		await expect
			.element(dialog().getByText(en.network_joining_title('Reading-Room-2')))
			.toBeVisible();
		await vi.advanceTimersByTimeAsync(1000);
		await expect
			.element(dialog().getByText(en.network_joined_title('Reading-Room-2')))
			.toBeVisible();
	});
});

describe('join dialog: whose join a poll reports (fix round)', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
		vi.setSystemTime(Date.parse(STARTED));
	});

	async function startWith(pollAnswers: (Response | 'fail')[]) {
		const calls = serve(() => json(202, joinState('joining')), pollAnswers);
		const opened = open('password');
		await userEvent.fill(passwordInput(), PASSWORD);
		await joinButton().click();
		await expect
			.element(dialog().getByText(en.network_joining_title('Reading-Room-2')))
			.toBeVisible();
		return { calls, ...opened };
	}

	it('an answer about another SSID is not "Joined": cannot tell, and the status is read again', async () => {
		const { calls } = await startWith([json(200, joinState('joined', { ssid: 'Library-Guest' }))]);
		await vi.advanceTimersByTimeAsync(1000);
		await expect.element(dialog().getByText(en.network_unknown_title)).toBeVisible();
		await expect.poll(() => statusReads(calls).length).toBeGreaterThan(0);
	});

	it('an answer about another join of the same SSID (another start time) is not "Joined"', async () => {
		await startWith([json(200, joinState('joined', { startedAt: '2026-11-11T12:00:07+00:00' }))]);
		await vi.advanceTimersByTimeAsync(1000);
		await expect.element(dialog().getByText(en.network_unknown_title)).toBeVisible();
	});
});

describe('join dialog: a POST answered with an error status (fix round)', () => {
	it.each([
		[
			'422',
			() => json(422, { detail: [{ loc: ['body', 'ssid'], type: 'string_type', msg: 'x' }] }),
			() => en.network_refusal_other
		],
		['500', () => json(500, { detail: 'boom' }), () => en.network_refusal_other],
		[
			'501',
			() => json(501, { detail: 'Network settings are not available on this device.' }),
			() => en.network_not_available
		],
		[
			'503',
			() =>
				json(503, {
					detail: { message: 'x', problems: [{ code: 'network_manager_unavailable' }] }
				}),
			() => en.network_service_unavailable
		],
		[
			'409 with no problems',
			() => json(409, { detail: { message: 'x', problems: [] } }),
			() => en.network_refusal_other
		]
	])('%s: the form stays with a message, and nothing is polled', async (_name, answer, text) => {
		const calls = serve(answer);
		open('password');
		await userEvent.fill(passwordInput(), PASSWORD);
		await joinButton().click();
		await expect
			.poll(() => document.querySelector('[data-dialog-error]')?.textContent?.trim())
			.toBe(text());
		await expect.element(passwordInput()).toHaveValue(PASSWORD);
		await new Promise((r) => setTimeout(r, 1200));
		expect(polls(calls)).toHaveLength(0);
		expect(document.body.textContent).not.toContain(en.network_err_request);
	});
});

describe('join dialog: password managers (fix round)', () => {
	it('password fields are new passwords; username and outer identity are not login fields', async () => {
		serve(() => json(202, joinState('joining')));
		open('enterprise');
		await dialog().getByRole('button', { name: en.network_more_options }).click();
		const pw = passwordInput().element() as HTMLInputElement;
		expect(pw.getAttribute('autocomplete')).toBe('new-password');
		for (const label of [en.common_username_label, en.network_outer_identity]) {
			const input = dialog().getByLabelText(label, { exact: true }).element() as HTMLInputElement;
			expect(input.getAttribute('autocomplete')).toBe('off');
			expect(input.getAttribute('autocapitalize')).toBe('none');
			expect(input.getAttribute('spellcheck')).toBe('false');
			expect(input.name).not.toBe('');
			for (const value of [input.id, input.name]) expect(value).not.toMatch(/user|login|email/i);
		}
	});

	it('the password field of a password network is a new password too', async () => {
		serve(() => json(202, joinState('joining')));
		open('password');
		await expect.element(passwordInput()).toHaveAttribute('autocomplete', 'new-password');
	});
});

// Advances the fake clock a second at a time, with real turns of the event
// loop between steps, so that every poll's answer body is read before the
// next poll is due (advancing it in one jump would leave them unread).
async function run(ms: number) {
	for (let done = 0; done < ms; done += 1000) {
		await vi.advanceTimersByTimeAsync(Math.min(1000, ms - done));
		await new Promise((r) => realSetTimeout(r, 0));
		await new Promise((r) => realSetTimeout(r, 0));
	}
}

const HOUR = 3_600_000;
const YEAR = 365 * 24 * HOUR;
const unitTime = (offset: number) => new Date(Date.parse(STARTED) + offset).toISOString();

describe('join dialog: no 202, and whose join it is without the browser clock (last round)', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
		vi.setSystemTime(Date.parse(STARTED));
	});

	async function send(
		pollAnswers: (Response | 'fail')[],
		before: Response | 'fail' = json(200, IDLE)
	) {
		const calls = serve(() => 'fail', pollAnswers, before);
		const opened = open('password');
		await userEvent.fill(passwordInput(), PASSWORD);
		await joinButton().click();
		await expect
			.element(dialog().getByText(en.network_joining_title('Reading-Room-2')))
			.toBeVisible();
		return { calls, ...opened };
	}

	it.each([
		['one hour', HOUR],
		['one year', YEAR]
	])("the unit's clock %s behind: a joined join is shown as joined", async (_name, behind) => {
		await send([json(200, joinState('joined', { startedAt: unitTime(-behind) }))]);
		await run(1000);
		await expect
			.element(dialog().getByText(en.network_joined_title('Reading-Room-2')))
			.toBeVisible();
	});

	it.each([
		['one hour', HOUR],
		['one year', YEAR]
	])("the unit's clock %s behind: a wrong password is shown as such", async (_name, behind) => {
		await send([
			json(
				200,
				joinState('failed', {
					startedAt: unitTime(-behind),
					problem: { code: 'wrong_password', detail: null, server: null }
				})
			)
		]);
		await run(1000);
		await expect.element(dialog().getByText(en.network_fail_wrong_password)).toBeVisible();
	});

	it('the read before the POST fails: the first finished answer for this SSID is taken', async () => {
		const { calls } = await send(
			[
				json(
					200,
					joinState('failed', {
						startedAt: unitTime(-YEAR),
						problem: { code: 'timeout', detail: null, server: null }
					})
				)
			],
			'fail'
		);
		expect(
			calls.filter(
				(c) => c.method === 'GET' && !c.afterPost && c.url.endsWith('/network/wifi/join')
			)
		).toHaveLength(1);
		await run(1000);
		await expect.element(dialog().getByText(en.network_fail_timeout)).toBeVisible();
	});

	it('only the join from before the POST is reported: after 15 s, the unit did not receive the request', async () => {
		const older = joinState('failed', {
			startedAt: unitTime(-60_000),
			problem: { code: 'wrong_password', detail: null, server: null }
		});
		await send([json(200, older)], json(200, older));
		await run(14_000);
		await expect
			.element(dialog().getByText(en.network_joining_title('Reading-Room-2')))
			.toBeVisible();
		expect(document.body.textContent).not.toContain(en.network_fail_wrong_password);
		await run(2_000);
		await expect.element(dialog().getByText(en.network_not_received_title)).toBeVisible();
		await expect.element(dialog().getByText(en.network_not_received_body)).toBeVisible();
		await expect.element(dialog().getByRole('button', { name: en.common_close })).toBeVisible();
		await dialog().getByRole('button', { name: en.common_retry }).click();
		await expect.element(passwordInput()).toHaveValue(PASSWORD);
	});

	it('after "cannot reach", the join from before the POST: the unit did not receive the request, with Retry', async () => {
		const older = joinState('failed', {
			startedAt: unitTime(-60_000),
			problem: { code: 'wrong_password', detail: null, server: null }
		});
		await send([...Array(250).fill('fail'), json(200, older)], json(200, older));
		await run(242_000);
		await expect.element(dialog().getByText(en.network_lost_title)).toBeVisible();
		await run(12_000);
		await expect.element(dialog().getByText(en.network_not_received_title)).toBeVisible();
		await expect.element(dialog().getByRole('button', { name: en.common_retry })).toBeVisible();
		expect(dialog().element().textContent).not.toContain(en.network_fail_wrong_password);
	}, 60_000);

	it('idle after the POST: the unit did not receive the request', async () => {
		await send([json(200, IDLE)]);
		await run(16_000);
		await expect.element(dialog().getByText(en.network_not_received_title)).toBeVisible();
	});

	it('another SSID once failed polls recover: the unit did not receive the request', async () => {
		await send(['fail', 'fail', 'fail', json(200, joinState('joined', { ssid: 'Library-Guest' }))]);
		await run(3000);
		await expect
			.element(dialog().getByText(en.network_joining_title('Reading-Room-2')))
			.toBeVisible();
		await run(17_000);
		await expect.element(dialog().getByText(en.network_not_received_title)).toBeVisible();
	});

	it('a newer join that appears within 15 s is this one', async () => {
		const older = joinState('failed', {
			startedAt: unitTime(-60_000),
			problem: { code: 'wrong_password', detail: null, server: null }
		});
		const newer = joinState('joined', { startedAt: unitTime(-YEAR) });
		await send(
			[json(200, older), json(200, older), json(200, older), json(200, newer)],
			json(200, older)
		);
		await run(4000);
		await expect
			.element(dialog().getByText(en.network_joined_title('Reading-Room-2')))
			.toBeVisible();
	});

	it('Retry seconds after a failed attempt, with no 202: the earlier failure is not taken for the new one', async () => {
		const first = joinState('failed', {
			startedAt: unitTime(-YEAR),
			problem: { code: 'wrong_password', detail: null, server: null }
		});
		const second = joinState('failed', {
			startedAt: unitTime(-YEAR + 5000),
			problem: { code: 'timeout', detail: null, server: null }
		});
		const gets = [
			json(200, IDLE),
			json(200, first),
			json(200, first),
			json(200, first),
			json(200, first),
			json(200, second)
		];
		const posts = [
			() => json(202, joinState('joining', { startedAt: first.startedAt })),
			() => 'fail' as const
		];
		let g = 0;
		let p = 0;
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
			const url = String(input instanceof Request ? input.url : input);
			const method = (init?.method ?? 'GET').toUpperCase();
			if (url.endsWith('/network/wifi/join') && method === 'POST') {
				const answer = posts[Math.min(p++, posts.length - 1)]();
				if (answer === 'fail') throw new TypeError('Failed to fetch');
				return answer;
			}
			if (url.endsWith('/network/wifi/join')) return gets[Math.min(g++, gets.length - 1)].clone();
			return json(500, { detail: 'not in this test' });
		});
		open('password');
		await userEvent.fill(passwordInput(), PASSWORD);
		await joinButton().click();
		await run(1000);
		await expect.element(dialog().getByText(en.network_fail_wrong_password)).toBeVisible();

		await dialog().getByRole('button', { name: en.common_retry }).click();
		await joinButton().click();
		await expect
			.element(dialog().getByText(en.network_joining_title('Reading-Room-2')))
			.toBeVisible();
		await run(2000);
		// Still the earlier failure: not shown as the outcome of this attempt.
		await expect
			.element(dialog().getByText(en.network_joining_title('Reading-Room-2')))
			.toBeVisible();
		await run(3000);
		await expect.element(dialog().getByText(en.network_fail_timeout)).toBeVisible();
		expect(document.body.textContent).not.toContain(en.network_fail_wrong_password);
	});
});

describe('join dialog: the 240 s cap and the quiet polling after it (last round)', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
		vi.setSystemTime(Date.parse(STARTED));
	});

	async function startWith(pollAnswers: (Response | 'fail')[]) {
		const calls = serve(() => json(202, joinState('joining')), pollAnswers);
		open('password');
		await userEvent.fill(passwordInput(), PASSWORD);
		await joinButton().click();
		await expect
			.element(dialog().getByText(en.network_joining_title('Reading-Room-2')))
			.toBeVisible();
		return calls;
	}

	it('stops after 240 s of "joining" answers: cannot tell, with the status read again', async () => {
		const calls = await startWith([json(200, joinState('joining'))]);
		await run(239_000);
		await expect
			.element(dialog().getByText(en.network_joining_title('Reading-Room-2')))
			.toBeVisible();
		await run(2_000);
		await expect.element(dialog().getByText(en.network_unknown_title)).toBeVisible();
		await expect.poll(() => statusReads(calls).length).toBeGreaterThan(0);
	}, 60_000);

	it('an outcome for this join that arrives within 120 s after "cannot tell" replaces it', async () => {
		const answers = [
			...Array(255).fill(json(200, joinState('joining'))),
			json(
				200,
				joinState('failed', {
					problem: { code: 'timeout', detail: null, server: null },
					restored: true
				})
			)
		];
		await startWith(answers);
		await run(245_000);
		await expect.element(dialog().getByText(en.network_unknown_title)).toBeVisible();
		await run(20_000);
		await expect.element(dialog().getByText(en.network_fail_timeout)).toBeVisible();
		await expect.element(dialog().getByText(en.network_restored_true)).toBeVisible();
	}, 60_000);

	it('polls quietly for 120 s more, then stops', async () => {
		const calls = await startWith([json(200, joinState('joining'))]);
		await run(362_000);
		await expect.element(dialog().getByText(en.network_unknown_title)).toBeVisible();
		const made = polls(calls).length;
		expect(made).toBeGreaterThan(340);
		await run(20_000);
		expect(polls(calls).length).toBe(made);
	}, 60_000);
});

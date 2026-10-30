<script lang="ts">
	// One dashboard shell for every role (admin, operator, reviewer). It
	// validates the stored session against the backend before rendering any
	// protected content, and `NAV_ITEMS` decides both which sidebar links each
	// role sees and which routes it may open: admin sees Overview, Projects,
	// Queue, To retake, Users and Settings; operator and reviewer see all but
	// Users and Settings. To retake carries a badge with the number of records
	// waiting (GET /records/to-retake/count), reloaded on every navigation so
	// that it follows a retake; badge and label are in the recapture sand
	// while any is waiting (0.2.0).
	// A new section needs its route under `src/routes/(dashboard)/` and an
	// entry in `NAV_ITEMS` listing the roles allowed to open it.
	//
	// Version: 0.2.0

	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { authStore } from '$lib/stores/auth';
	import { tour } from '$lib/tour';
	import { usersApi, recordsApi } from '$lib/api';
	import { waitForSession, sessionRetryDelay } from '$lib/session-check';
	import { m, roleLabel, type StringMessageKey } from '$lib/i18n';
	import logo from '$lib/assets/captua-logo.svg';
	import favicon from '$lib/assets/favicon-light.svg';
	import BugReportButton from '$lib/bug-report/BugReportButton.svelte';
	import CatalogueBackupIndicator from '$lib/components/CatalogueBackupIndicator.svelte';
	import AccountMenu from '$lib/components/AccountMenu.svelte';

	let { children } = $props();

	let expanded = $state(true);

	let currentPath = $derived($page.url.pathname);

	let currentUser = $state<any>(null);

	// true while the session is being validated against the backend on mount;
	// protected content is not rendered until this is false (NEH-63).
	let isValidatingSession = $state(true);

	// true while the backend does not respond (network down, or Nginx returning
	// 502/503/504 while the backend starts). The stored session is kept and the
	// validation is retried automatically (NEH-219).
	let isWaitingForBackend = $state(false);

	onMount(() => {
		// Reactive guard: if the session is cleared WHILE the app is in use (e.g.
		// `apiRequest` intercepted a 401 on a later call), leave.
		const unsub = authStore.subscribe((s) => {
			currentUser = s.user;
			if (!s.token && !isValidatingSession) goto('/login');
			// First sign-in for this account: offer the tour (NEH-95). The flag is
			// stored when the tour opens, not when it ends — someone who closes it
			// straight away does not want it on every start, and the help button
			// reopens it whenever they want.
			if (s.user) tour.startIfFirstTime(s.user.id);
		});

		// Validation on mount: a token in localStorage does not guarantee the
		// backend still accepts it (it may have expired, or the user may have
		// been deactivated), so it is checked with `/users/me` before any
		// protected content is shown (NEH-63).
		//
		// Only a 401/403 invalidates the session. Any other error must not send
		// the user to /login with the session still set: /login, seeing the
		// token, redirects to /, and / back to /dashboard, an endless loop while
		// the backend does not respond — which is what happens on the kiosk at
		// boot (NEH-219). An unresponsive backend keeps the waiting screen up and
		// the validation is retried with a growing delay (2 s to 10 s).
		const controller = new AbortController();
		(async () => {
			const token = authStore.getToken();
			if (!token) {
				goto('/login');
				return;
			}
			const outcome = await waitForSession(() => usersApi.me(), {
				signal: controller.signal,
				delay: sessionRetryDelay,
				onWaiting: (waiting) => (isWaitingForBackend = waiting)
			});
			if (outcome.kind === 'cancelled') return;
			if (outcome.kind === 'valid') {
				// Refresh the user in the store (the role may have changed on the
				// backend since the last login) before rendering.
				authStore.setSession(token, outcome.user);
			} else {
				// `apiRequest` clears the session on a 401 but not on a 403. If
				// the session stayed set, /login would redirect back here and the
				// loop would return, so it is cleared in both cases.
				authStore.clearSession();
				goto('/login');
			}
			isValidatingSession = false;
		})();

		return () => {
			controller.abort();
			unsub();
		};
	});

	let userInitials = $derived(currentUser?.username?.slice(0, 2).toUpperCase() ?? '?');

	// `labelKey` is a key in the i18n catalogue (`$lib/i18n`); `icon` picks the
	// inline SVG below; `roles` lists the roles that may see and open the
	// route, and an empty `roles` means every role.
	const NAV_ITEMS: {
		sectionKey: StringMessageKey;
		items: {
			id: string;
			labelKey: StringMessageKey;
			icon: string;
			path: string;
			roles: string[];
			badge?: number | null;
		}[];
	}[] = [
		{
			sectionKey: 'nav_section_main',
			items: [
				{
					id: 'dashboard',
					labelKey: 'nav_overview',
					icon: 'grid',
					path: '/dashboard',
					roles: ['admin', 'operator', 'reviewer']
				},
				{
					id: 'projects',
					labelKey: 'nav_projects',
					icon: 'folder',
					path: '/dashboard/projects',
					roles: ['admin', 'operator', 'reviewer'],
					// Always null, so no badge is shown.
					// TODO: connect to a real count from the backend.
					badge: null as number | null
				},
				{
					id: 'queue',
					labelKey: 'nav_queue',
					icon: 'queue',
					path: '/dashboard/queue',
					roles: ['admin', 'operator', 'reviewer']
				},
				{
					id: 'retakes',
					labelKey: 'nav_retakes',
					icon: 'retake',
					path: '/dashboard/retakes',
					roles: ['admin', 'operator', 'reviewer']
				},
				{
					id: 'users',
					labelKey: 'nav_users',
					icon: 'users',
					path: '/dashboard/users',
					roles: ['admin']
				}
			]
		},
		{
			sectionKey: 'nav_section_system',
			items: [
				{
					id: 'config',
					labelKey: 'nav_settings',
					icon: 'settings',
					path: '/dashboard/config',
					roles: ['admin']
				}
			]
		}
	];

	// Records waiting to be retaken, for the To retake badge; null until the
	// count arrives, and when it cannot be loaded, so no badge is shown then.
	let retakeCount = $state<number | null>(null);

	$effect(() => {
		currentPath;
		if (isValidatingSession || !currentUser) return;
		let cancelled = false;
		recordsApi
			.toRetakeCount()
			.then((n) => {
				if (!cancelled) retakeCount = typeof n === 'number' ? n : null;
			})
			.catch(() => {
				if (!cancelled) retakeCount = null;
			});
		return () => {
			cancelled = true;
		};
	});

	// A user without a recognized role sees no restricted item.
	let visibleNav = $derived(
		NAV_ITEMS.map((section) => ({
			...section,
			items: section.items
				.filter((item) => item.roles.length === 0 || item.roles.includes(currentUser?.role ?? ''))
				.map((item) => (item.id === 'retakes' ? { ...item, badge: retakeCount } : item))
		})).filter((section) => section.items.length > 0)
	);

	// Route role guard (NEH-65). Hiding the nav links is not enough: any
	// signed-in user can reach /dashboard/users or /dashboard/config by typing
	// the URL. `NAV_ITEMS` already declares which roles may see each route, so
	// it is the single source of truth for access control rather than a
	// separate list of admin-only routes.

	// Exact or sub-route match; the most specific item wins if several match.
	function findNavItem(path: string) {
		return NAV_ITEMS.flatMap((section) => section.items)
			.filter((item) => path === item.path || path.startsWith(item.path + '/'))
			.sort((a, b) => b.path.length - a.path.length)[0];
	}

	// true if the route has no role restriction or the current user's role is
	// among the allowed ones. Both the guard and the off-site copy indicator's
	// link use it, so they cannot give different answers.
	function canAccess(path: string): boolean {
		const item = findNavItem(path);
		if (!item) return true;
		return item.roles.length === 0 || item.roles.includes(currentUser?.role ?? '');
	}

	let hasRoleAccess = $derived(canAccess(currentPath));

	// Whether the current role may open Settings decides whether the off-site
	// copy indicator links there.
	let canOpenConfig = $derived(canAccess('/dashboard/config'));

	// Redirects away from restricted routes as soon as the user's role is known
	// (on mount, or on client-side navigation to another restricted route).
	$effect(() => {
		if (!isValidatingSession && currentUser && !hasRoleAccess) {
			goto('/dashboard');
		}
	});

	// /dashboard needs strict equality, or /dashboard/projects would also mark
	// the Overview item active.
	function isActive(path: string): boolean {
		if (path === '/dashboard') return currentPath === '/dashboard';
		return currentPath.startsWith(path);
	}
</script>

<!-- Splash while the session is validated with /users/me. No protected
     content is rendered until it finishes (NEH-63). -->
{#if isValidatingSession || !currentUser || !hasRoleAccess}
	<div class="session-splash" role="status" aria-live="polite">
		<div class="spinner"></div>
		{#if isWaitingForBackend}
			<p class="splash-text">{$m.session_backend_waiting}</p>
			<p class="splash-detail">{$m.session_backend_waiting_detail}</p>
		{:else}
			<p class="splash-text">{$m.session_validating}</p>
		{/if}
	</div>
{:else}
<div class="shell">
	<!-- ══════════════════════ SIDEBAR ══════════════════════ -->
	<aside class="sidebar" class:expanded>
		<div class="s-header">
			<div class="logo-wrap">
				<div class="logo-circle">
				<img src={favicon} alt="icon" class="logo-icon" />
				</div>
				{#if expanded}
					<div class="logo-text">
							<img src={logo} alt="Captua" class="brand-logo-xs" />
					</div>
				{/if}
			</div>

			<button
				class="collapse-btn"
				onclick={() => (expanded = !expanded)}
				aria-label={expanded ? $m.nav_collapse_sidebar : $m.nav_expand_sidebar}
			>
				<svg
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					style="transform: rotate({expanded ? 0 : 180}deg); transition: transform 0.3s ease"
				>
					<polyline points="15 18 9 12 15 6" />
				</svg>
			</button>
		</div>

		<nav class="s-nav">
			{#each visibleNav as section}
				{#if expanded}
					<p class="s-section-title">{$m[section.sectionKey]}</p>
				{:else}
					<div style="height:8px"></div>
				{/if}

				{#each section.items as item}
					<a
						href={item.path}
						class="s-item"
						class:active={isActive(item.path)}
						class:is-retake={item.id === 'retakes' && !!item.badge}
						title={!expanded ? $m[item.labelKey] : undefined}
					>
						{#if isActive(item.path)}
							<div class="active-bar"></div>
						{/if}

						<span class="s-icon" class:active-icon={isActive(item.path)}>
							{#if item.icon === 'grid'}
								<svg
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
								>
									<rect x="3" y="3" width="7" height="7" />
									<rect x="14" y="3" width="7" height="7" />
									<rect x="14" y="14" width="7" height="7" />
									<rect x="3" y="14" width="7" height="7" />
								</svg>
							{:else if item.icon === 'folder'}
								<svg
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
								>
									<path
										d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
									/>
								</svg>
							{:else if item.icon === 'queue'}
								<svg
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
								>
									<line x1="10" y1="6" x2="21" y2="6" />
									<line x1="10" y1="12" x2="21" y2="12" />
									<line x1="10" y1="18" x2="21" y2="18" />
									<path d="M4 6h1v4" />
									<path d="M4 10h2" />
									<path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
								</svg>
							{:else if item.icon === 'retake'}
								<svg
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
								>
									<path d="M3 12a9 9 0 1 0 3-6.7" />
									<polyline points="3 3 3 9 9 9" />
								</svg>
							{:else if item.icon === 'users'}
								<svg
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
								>
									<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
									<circle cx="9" cy="7" r="4" />
									<path d="M23 21v-2a4 4 0 0 0-3-3.87" />
									<path d="M16 3.13a4 4 0 0 1 0 7.75" />
								</svg>
							{:else if item.icon === 'settings'}
								<svg
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
								>
									<circle cx="12" cy="12" r="3" />
									<path
										d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
									/>
								</svg>
							{/if}
						</span>

						{#if expanded}
							<span class="s-label">{$m[item.labelKey]}</span>
							{#if item.badge}
								<span class="s-badge" class:s-badge-retake={item.id === 'retakes'} aria-hidden={item.id === 'retakes' ? 'true' : undefined}>{item.badge}</span>
							{/if}
						{:else if item.badge}
							<span class="s-badge-dot" class:s-badge-retake={item.id === 'retakes'}></span>
						{/if}
						{#if item.id === 'retakes' && item.badge}
							<span class="visually-hidden">{$m.nav_retakes_count(item.badge)}</span>
						{/if}
					</a>
				{/each}
			{/each}
		</nav>

		<!-- Status of the catalogue's off-site copy (NEH-266). Visible to every
		     role; it links to Settings only for roles that may open it. -->
		<CatalogueBackupIndicator
			{expanded}
			href={canOpenConfig ? '/dashboard/config#offsite-copy' : null}
		/>

		<div class="s-footer">
			<BugReportButton {expanded} />

			<!-- The account menu holds Help, shut down, restart and sign out, so
			     the footer stays two rows tall: at 800x480 anything taller would
			     push the navigation out of its scroll area (NEH-189). It opens
			     upward over the content area. -->
			<AccountMenu placement="above-start" fill>
				{#snippet trigger({ open, toggle })}
					{#if expanded}
						<button
							class="user-row"
							aria-haspopup="menu"
							aria-expanded={open}
							onclick={toggle}
						>
							<div class="user-av">{userInitials}</div>
							<div class="user-text">
								<span class="user-name">{currentUser?.username ?? '—'}</span>
								<span class="user-role">{$roleLabel(currentUser?.role)}</span>
							</div>
							<svg class="user-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
								<polyline points="18 15 12 9 6 15" />
							</svg>
						</button>
					{:else}
						<button
							class="user-av-sm"
							aria-haspopup="menu"
							aria-expanded={open}
							aria-label={$m.tb_current_user}
							title={$m.tb_current_user}
							onclick={toggle}
						>
							{userInitials}
						</button>
					{/if}
				{/snippet}
			</AccountMenu>
		</div>
	</aside>

	<main class="content">
		{@render children()}
	</main>
</div>
{/if}

<style>
	.session-splash {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 14px;
		width: 100vw;
		height: 100vh;
		background-color: var(--color-bg);
	}

	.session-splash .spinner {
		width: 40px;
		height: 40px;
		border: 3px solid var(--border-color);
		border-top-color: var(--color-light);
		border-radius: 50%;
		animation: splash-spin 0.8s linear infinite;
	}

	.splash-text {
		font-size: var(--text-sm);
		color: var(--color-light-grey);
		margin: 0;
	}

	.splash-detail {
		font-size: var(--text-sm);
		color: var(--color-light-grey);
		max-width: 420px;
		text-align: center;
		line-height: 1.5;
		margin: 0;
		padding: 0 16px;
	}

	@keyframes splash-spin {
		to {
			transform: rotate(360deg);
		}
	}

	.shell {
		display: flex;
		width: 100vw;
		height: 100vh;
		background-color: var(--color-bg);
		overflow: hidden;
	}

	/* ── Sidebar ── */
	.sidebar {
		width: 72px; /* collapsed width; `.expanded` widens it */
		flex-shrink: 0;
		background-color: var(--color-surface);
		display: flex;
		flex-direction: column;
		transition: width 0.3s ease;
		overflow: hidden;
		border-radius: 0 var(--radius-xl) var(--radius-xl) 0;
		margin: 10px 0 10px 10px;
		height: calc(100vh - 20px);
		box-shadow: var(--shadow-md);
		z-index: 20;
	}

	.sidebar.expanded {
		width: 216px;
	}

	/* Header */
	.s-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 10px;
		border-bottom: 1px solid var(--border-color);
		flex-shrink: 0;
		min-height: 60px;
		gap: 8px;
	}

	.logo-wrap {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
		overflow: hidden;
	}

	.logo-circle {
		width: 40px;
		height: 40px;
		border-radius: var(--radius-md);
		background-color: var(--color-primary);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		box-shadow: 0 4px 12px rgba(90, 140, 98, 0.3);
	}
	.logo-icon {
		width: 25px;
		height: 25px;
	}
	.logo-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
		overflow: hidden;
	}

	.collapse-btn {
		width: 26px;
		height: 26px;
		border-radius: var(--radius-sm);
		background: none;
		border: 1px solid var(--border-color);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-light-grey);
		cursor: pointer;
		transition: all var(--transition-fast);
		flex-shrink: 0;
	}

	.collapse-btn:hover {
		color: var(--color-light);
		background-color: rgba(255, 255, 255, 0.05);
	}

	.sidebar:not(.expanded) .s-item {
		justify-content: center;
		padding: 10px 0;
	}

	/* Nav */
	.s-nav {
		flex: 1;
		padding: 8px 6px;
		display: flex;
		flex-direction: column;
		gap: 1px;
		overflow-y: auto;
		overflow-x: hidden;
	}

	.sidebar:not(.expanded) .s-header {
		flex-direction: column;
		justify-content: center;
		padding: 10px 6px;
		gap: 6px;
	}

	.sidebar:not(.expanded) .collapse-btn {
		width: 20px;
		height: 20px;
		border: none;
		opacity: 0.4;
	}

	.sidebar:not(.expanded) .collapse-btn:hover {
		opacity: 1;
		background: none;
	}

	.s-nav::-webkit-scrollbar {
		width: 0;
	}

	.s-section-title {
		font-size: 10px;
		font-weight: var(--fw-bold);
		color: var(--color-light-grey);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		padding: 10px 10px 4px;
		margin: 0;
		white-space: nowrap;
		opacity: 0.7;
	}

	.s-item {
		position: relative;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 10px;
		border-radius: var(--radius-md);
		text-decoration: none;
		color: var(--color-light-grey);
		transition: all var(--transition-fast);
		min-height: var(--touch-target-min);
		white-space: nowrap;
		overflow: hidden;
	}

	.s-item:hover {
		color: var(--color-light);
		background-color: rgba(255, 255, 255, 0.04);
	}
	.s-item.active {
		color: var(--color-light);
		background-color: rgba(90, 140, 98, 0.15);
	}

	.active-bar {
		position: absolute;
		left: 0;
		top: 50%;
		transform: translateY(-50%);
		width: 3px;
		height: 60%;
		background-color: var(--color-primary);
		border-radius: 0 3px 3px 0;
	}

	.s-icon {
		width: 22px;
		height: 22px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		color: var(--color-light-grey);
	}

	.s-icon.active-icon {
		color: var(--color-primary);
	}

	.s-label {
		font-size: 13px;
		font-weight: var(--fw-semibold);
		flex: 1;
		color: inherit;
	}

	.s-badge {
		background-color: var(--color-primary);
		color: white;
		font-size: 10px;
		font-weight: var(--fw-bold);
		padding: 1px 6px;
		border-radius: var(--radius-full);
		flex-shrink: 0;
	}

	/* Recaptures waiting (0.2.0): sand, with dark text on the badge. */
	.s-item.is-retake,
	.s-item.is-retake .s-icon { color: var(--color-highlight); }
	.s-item.is-retake .s-label { font-weight: var(--fw-bold); }
	.s-badge.s-badge-retake {
		background-color: var(--color-highlight);
		color: var(--color-bg);
		font-weight: var(--fw-extrabold);
	}
	.s-badge-dot.s-badge-retake { background-color: var(--color-highlight); }

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
		border: 0;
	}

	.s-badge-dot {
		position: absolute;
		top: 8px;
		right: 8px;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background-color: var(--color-primary);
	}

	/* Footer */
	.s-footer {
		padding: 10px 6px;
		border-top: 1px solid var(--border-color);
		display: flex;
		flex-direction: column;
		gap: 8px;
		flex-shrink: 0;
		align-items: center;
	}

	/* The user row and the collapsed avatar tile are the account menu's
	   triggers: buttons restyled to look like the plain row they replace. */
	.user-row {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 4px 4px;
		border: none;
		border-radius: var(--radius-md);
		background: none;
		font-family: var(--font-family);
		text-align: left;
		cursor: pointer;
		transition: background-color var(--transition-fast);
	}
	.user-row:hover,
	.user-row[aria-expanded='true'] { background-color: rgba(255, 255, 255, 0.05); }
	.user-chevron { flex-shrink: 0; margin-left: auto; color: var(--color-light-grey); }

	.user-av {
		width: 40px;
		height: 40px;
		border-radius: var(--radius-md);
		background-color: var(--color-primary);
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		font-weight: var(--fw-extrabold);
		font-size: 13px;
		flex-shrink: 0;
	}

	.user-av-sm {
		width: 40px;
		height: 40px;
		border-radius: var(--radius-md);
		background-color: var(--color-primary);
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		font-weight: var(--fw-extrabold);
		font-size: 13px;
		font-family: var(--font-family);
		border: none;
		padding: 0;
		cursor: pointer;
	}
	.user-av-sm:hover,
	.user-av-sm[aria-expanded='true'] { background-color: var(--color-primary-hover); }

	.user-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
		overflow: hidden;
	}
	.user-name {
		font-size: 13px;
		font-weight: var(--fw-semibold);
		color: var(--color-light);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.user-role {
		font-size: 11px;
		color: var(--color-light-grey);
		text-transform: capitalize;
	}

	.content {
		flex: 1;
		overflow-y: auto;
		overflow-x: hidden;
		min-width: 0;
		background-color: var(--color-bg);
	}

	.content::-webkit-scrollbar {
		width: 4px;
	}
	.content::-webkit-scrollbar-thumb {
		background: var(--border-color);
		border-radius: 999px;
	}
</style>

<script lang="ts">
	// ============================================================================
	// LAYOUT: Dashboard unificado
	//
	// Un solo layout para todos los roles (admin, operator, reviewer).
	// La visibilidad de secciones se controla por el rol del usuario:
	//
	//   admin    → Resumen, Proyectos, Usuarios, Configuración
	//   operator → Resumen, Proyectos
	//   reviewer → Resumen, Proyectos
	//
	// Para agregar una sección nueva:
	//   1. Crear la ruta en src/routes/(dashboard)/nueva-seccion/+page.svelte
	//   2. Agregar el item en NAV_ITEMS con los roles que pueden verlo
	//   3. Crear la ruta en SvelteKit
	// ============================================================================

	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { authStore } from '$lib/stores/auth';
	import { tour } from '$lib/tour';
	import { usersApi } from '$lib/api';
	import { waitForSession, sessionRetryDelay } from '$lib/session-check';
	import { m, roleLabel, type StringMessageKey } from '$lib/i18n';
	import logo from '$lib/assets/captua-logo.svg';
	import favicon from '$lib/assets/favicon-light.svg';
	import BugReportButton from '$lib/bug-report/BugReportButton.svelte';
	import CatalogueBackupIndicator from '$lib/components/CatalogueBackupIndicator.svelte';

	let { children } = $props();

	// ---------------------------------------------------------------------------
	// ESTADO DE LA SIDEBAR
	// ---------------------------------------------------------------------------
	let expanded = $state(true);

	let currentPath = $derived($page.url.pathname);

	// ---------------------------------------------------------------------------
	// USUARIO ACTUAL
	// ---------------------------------------------------------------------------
	let currentUser = $state<any>(null);

	// true mientras se valida la sesión contra el backend al montar el layout;
	// el contenido protegido no se renderiza hasta que esto sea false (NEH-63).
	let isValidatingSession = $state(true);

	// true mientras el backend no responde (red caída, 502/503/504 de Nginx
	// mientras el backend arranca). La sesión guardada se conserva y la
	// validación se repite sola (NEH-219).
	let isWaitingForBackend = $state(false);

	onMount(() => {
		// Guard reactivo: si la sesión se limpia MIENTRAS se usa la app (p. ej.
		// apiRequest interceptó un 401 en algún llamado posterior), salir.
		const unsub = authStore.subscribe((s) => {
			currentUser = s.user;
			if (!s.token && !isValidatingSession) goto('/login');
			// Primera vez que esta cuenta entra: se ofrece el recorrido (NEH-95).
			// La marca se guarda al abrirlo, no al terminarlo — quien lo cierra
			// enseguida no quiere verlo en cada arranque, y el botón de ayuda
			// lo reabre cuando quiera.
			if (s.user) tour.startIfFirstTime(s.user.id);
		});

		// Validación al montar: un token en localStorage no garantiza que el
		// backend todavía lo acepte (pudo expirar, o el usuario fue
		// desactivado), así que se valida con /users/me antes de mostrar
		// cualquier contenido protegido (NEH-63).
		//
		// Solo un 401/403 invalida la sesión. Antes, cualquier error mandaba a
		// /login sin limpiar la sesión; /login, al ver el token, mandaba a /,
		// y / de vuelta a /dashboard: un ciclo sin fin mientras el backend no
		// respondía, que es lo que pasa en el kiosco durante el arranque
		// (NEH-219). Ahora un backend que no responde deja la pantalla de
		// espera y la validación se reintenta con espera creciente (2 s a 10 s).
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
				// Refresca el usuario en el store (por si el rol cambió del
				// lado del backend desde el último login) antes de renderizar.
				authStore.setSession(token, outcome.user);
			} else {
				// apiRequest ya limpia la sesión ante un 401, pero no ante un
				// 403. Si la sesión quedara puesta, /login mandaría de vuelta
				// aquí y el ciclo volvería, así que se limpia en ambos casos.
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

	// ---------------------------------------------------------------------------
	// DEFINICIÓN DE NAVEGACIÓN
	//
	// Cada item tiene:
	//   labelKey → clave del catálogo i18n ($lib/i18n) con el texto visible
	//   icon     → clave del ícono SVG a renderizar
	//   path     → ruta SvelteKit
	//   roles    → array de roles que pueden ver este item
	//              si roles está vacío → visible para todos los roles
	//
	// Para restringir a solo admin: roles: ['admin']
	// Para todos: roles: ['admin', 'operator', 'reviewer']
	// ---------------------------------------------------------------------------
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
					// Visible para todos los roles
					roles: ['admin', 'operator', 'reviewer']
				},
				{
					id: 'projects',
					labelKey: 'nav_projects',
					icon: 'folder',
					path: '/dashboard/projects',
					// Visible para todos los roles
					roles: ['admin', 'operator', 'reviewer'],
					// El badge se muestra solo si el usuario tiene proyectos asignados
					// TODO: conectar con conteo real desde el backend
					badge: null as number | null
				},
				{
					id: 'users',
					labelKey: 'nav_users',
					icon: 'users',
					path: '/dashboard/users',
					// Solo admin puede ver y gestionar usuarios
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
					// Solo admin puede acceder a la configuración del sistema
					roles: ['admin']
				}
			]
		}
	];

	// Filtra los items de navegación según el rol del usuario actual
	// Si el usuario no tiene rol reconocido, no se muestra ningún item restringido
	let visibleNav = $derived(
		NAV_ITEMS.map((section) => ({
			...section,
			items: section.items.filter(
				(item) => item.roles.length === 0 || item.roles.includes(currentUser?.role ?? '')
			)
		})).filter((section) => section.items.length > 0)
	);

	// ---------------------------------------------------------------------------
	// GUARD DE ROL POR RUTA (NEH-65)
	//
	// Ocultar los links de navegación no basta: cualquier usuario logueado
	// puede llegar a /dashboard/users o /dashboard/config escribiendo la URL
	// directamente. NAV_ITEMS ya declara qué roles pueden ver cada ruta, así
	// que la reusamos como única fuente de verdad para el control de acceso
	// en vez de mantener una lista de rutas admin-only por separado.
	// ---------------------------------------------------------------------------

	// Busca el item de navegación que corresponde a una ruta dada, usando
	// coincidencia exacta o de subruta (el más específico, si hay varios)
	function findNavItem(path: string) {
		return NAV_ITEMS.flatMap((section) => section.items)
			.filter((item) => path === item.path || path.startsWith(item.path + '/'))
			.sort((a, b) => b.path.length - a.path.length)[0];
	}

	// true si la ruta no tiene restricción de rol, o si el rol del usuario
	// actual está entre los permitidos. La usan el guard y el enlace del
	// indicador de la copia externa, para que no puedan dar respuestas distintas.
	function canAccess(path: string): boolean {
		const item = findNavItem(path);
		if (!item) return true;
		return item.roles.length === 0 || item.roles.includes(currentUser?.role ?? '');
	}

	let hasRoleAccess = $derived(canAccess(currentPath));

	// Si el rol actual puede abrir Configuración: decide si el indicador de la
	// copia externa enlaza allí.
	let canOpenConfig = $derived(canAccess('/dashboard/config'));

	// Redirige fuera de rutas admin-only en cuanto sabemos el rol del usuario
	// (al montar, o si navega del lado del cliente a otra ruta restringida)
	$effect(() => {
		if (!isValidatingSession && currentUser && !hasRoleAccess) {
			goto('/dashboard');
		}
	});

	// ---------------------------------------------------------------------------
	// HELPERS
	// ---------------------------------------------------------------------------

	// Determina si una ruta está activa
	// Para /dashboard exacto usamos igualdad estricta para evitar que
	// /dashboard/projects también active el item "Resumen"
	function isActive(path: string): boolean {
		if (path === '/dashboard') return currentPath === '/dashboard';
		return currentPath.startsWith(path);
	}

	function handleLogout() {
		authStore.clearSession();
		goto('/');
	}
</script>

<!-- ============================================================
     SPLASH: se muestra mientras se valida la sesión con /users/me.
     Ningún contenido protegido se renderiza hasta que termine (NEH-63).
     ============================================================ -->
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
<!-- ============================================================
     SHELL: sidebar + contenido
     ============================================================ -->
<div class="shell">
	<!-- ══════════════════════ SIDEBAR ══════════════════════ -->
	<aside class="sidebar" class:expanded>
		<!-- Header: logo + botón colapsar -->
		<div class="s-header">
			<div class="logo-wrap">
				<!-- Círculo verde con asterisco/estrella — logo del sistema -->
				<div class="logo-circle">
				<img src={favicon} alt="icon" class="logo-icon" />
				</div>
				{#if expanded}
					<div class="logo-text">
						<!-- Nombre del sistema — para cambiarlo, edita este texto -->
							<img src={logo} alt="Captua" class="brand-logo-xs" />
						<!-- Rol del usuario en minúsculas con capitalize por CSS -->
						<!-- <p class="logo-role">{currentUser?.role ?? '—'}</p> -->
					</div>
				{/if}
			</div>

			<!-- Botón colapsar / expandir -->
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

		<!-- Navegación: se renderizan solo los items visibles para el rol actual -->
		<nav class="s-nav">
			{#each visibleNav as section}
				<!-- Título de sección (solo en modo expandido) -->
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
						title={!expanded ? $m[item.labelKey] : undefined}
					>
						<!-- Barra indicadora de ruta activa -->
						{#if isActive(item.path)}
							<div class="active-bar"></div>
						{/if}

						<!-- Ícono del item -->
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

						<!-- Label y badge (solo en modo expandido) -->
						{#if expanded}
							<span class="s-label">{$m[item.labelKey]}</span>
							{#if item.badge}
								<span class="s-badge">{item.badge}</span>
							{/if}
						{:else if item.badge}
							<!-- Punto de notificación en modo colapsado -->
							<span class="s-badge-dot"></span>
						{/if}
					</a>
				{/each}
			{/each}
		</nav>

		<!-- Estado de la copia externa del catálogo (NEH-266). Visible para
		     todos los roles; enlaza a Configuración solo para quien puede
		     abrirla. -->
		<CatalogueBackupIndicator
			{expanded}
			href={canOpenConfig ? '/dashboard/config#offsite-copy' : null}
		/>

		<!-- Footer: avatar del usuario + botón salir -->
		<div class="s-footer">
			{#if expanded}
				<div class="user-row">
					<div class="user-av">{userInitials}</div>
					<div class="user-text">
						<span class="user-name">{currentUser?.username ?? '—'}</span>
						<span class="user-role">{$roleLabel(currentUser?.role)}</span>
					</div>
				</div>
			{:else}
				<div class="user-av-sm">{userInitials}</div>
			{/if}
			
			<!-- Ayuda encima del botón de fallos. En captura y en la vista de
			     volumen no hay barra lateral: allí vive en el menú del avatar. -->
			<button class="help-btn" onclick={() => tour.start()} title={$m.nav_help} aria-label={$m.nav_help}>
				<!-- SVG y no material-symbols: la fuente de iconos va empaquetada
				     como subconjunto de los que el proyecto ya usaba, y "help" no
				     está en él --- se dibujaba la palabra en mayúsculas. Mismo icono
				     que el de Ayuda en el menú del avatar. -->
				<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
					<circle cx="12" cy="12" r="10" />
					<path d="M9.09 9a3 3 0 1 1 5.83 1c0 2-3 3-3 3" />
					<line x1="12" y1="17" x2="12.01" y2="17" />
				</svg>
				{#if expanded}<span class="help-btn-label">{$m.nav_help}</span>{/if}
			</button>

			<BugReportButton {expanded} />

			<!-- Botón salir: siempre visible, ícono en colapsado + texto en expandido -->
			<button class="logout-btn" onclick={handleLogout} title={$m.nav_logout}>
				<svg
					width="15"
					height="15"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
					<polyline points="16 17 21 12 16 7" />
					<line x1="21" y1="12" x2="9" y2="12" />
				</svg>
				{#if expanded}<span>{$m.nav_logout}</span>{/if}
			</button>
		</div>
	</aside>

	<!-- ══════════════════════ CONTENIDO ══════════════════════ -->
	<main class="content">
		{@render children()}
	</main>
</div>
{/if}

<style>
	/* ── Splash de validación de sesión ── */
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
		width: 72px; /* colapsado por defecto */
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
	.logo-name {
		font-size: var(--text-base);
		font-weight: var(--fw-black);
		color: var(--color-light);
		margin: 0;
		white-space: nowrap;
	}
	.logo-role {
		font-size: 11px;
		color: var(--color-light-grey);
		margin: 0;
		text-transform: capitalize;
		white-space: nowrap;
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

	/* Centrar los íconos de navegación cuando la sidebar está colapsada */
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

	/* Cuando la sidebar está colapsada: header en columna con logo centrado */
	.sidebar:not(.expanded) .s-header {
		flex-direction: column;
		justify-content: center;
		padding: 10px 6px;
		gap: 6px;
	}

	/* Botón colapsar más pequeño y discreto cuando está colapsado */
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

	/* Barra verde izquierda cuando el item está activo */
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

	.user-row {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 4px 4px;
	}

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
	}

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

	.help-btn {
		display: flex; align-items: center; justify-content: center; gap: 7px;
		width: 100%; padding: 8px 10px; min-height: 40px;
		border-radius: var(--radius-md);
		background: none; border: 1px solid var(--border-color);
		color: var(--color-light-grey); font-family: var(--font-family);
		font-size: var(--text-sm); font-weight: var(--fw-semibold);
		cursor: pointer; transition: all var(--transition-fast); white-space: nowrap;
		margin-bottom: 8px;
	}
	.help-btn:hover { color: var(--color-light); background-color: rgba(255,255,255,0.05); }
	.help-btn-label { flex: 1; text-align: left; }

	.logout-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		width: 100%;
		padding: 8px 10px;
		min-height: 40px;
		border-radius: var(--radius-md);
		background-color: rgba(214, 103, 74, 0.1);
		border: 1px solid rgba(214, 103, 74, 0.2);
		color: var(--color-error);
		font-family: var(--font-family);
		font-size: var(--text-sm);
		font-weight: var(--fw-semibold);
		cursor: pointer;
		transition: all var(--transition-fast);
		white-space: nowrap;
	}

	.logout-btn:hover {
		background-color: rgba(214, 103, 74, 0.2);
	}

	/* Contenido principal */
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

// ============================================================================
// CATÁLOGO DE MENSAJES — INGLÉS
//
// Tipado contra las claves de `es.ts` (ver `Messages` en `index.ts`): una
// clave faltante o sobrante aquí es un error de compilación en `npm run check`.
// ============================================================================

import type { Messages } from './index';

export const en: Messages = {
	// ── Common (shared across screens) ───────────────────────────────────────
	common_username_label: 'Username',
	common_password_label: 'Password',
	common_show_password: 'Show password',
	common_hide_password: 'Hide password',
	common_close: 'Close',
	common_loading: 'Loading',

	// ── Login ────────────────────────────────────────────────────────────────
	login_username_placeholder: 'Enter your username',
	login_password_placeholder: 'Enter your password',
	login_remember_me: 'Remember me',
	login_forgot_link: 'Forgot your password?',
	login_forgot_dialog_aria: 'Password recovery',
	login_forgot_title: 'Recover password',
	login_forgot_message: 'To recover your password, contact the project lead.',
	login_submit: 'Log in',
	login_submit_loading: 'LOG IN',
	login_connected: 'Connected',
	login_offline: 'Offline',
	login_error_fill_all_fields: 'Please fill in all fields',
	login_error_user_fetch: 'Could not load your user details',
	login_error_bad_credentials: 'Incorrect username or password',

	// ── Navigation (dashboard) ───────────────────────────────────────────────
	nav_section_main: 'MAIN',
	nav_section_system: 'SYSTEM',
	nav_overview: 'Overview',
	nav_projects: 'Projects',
	nav_users: 'Users',
	nav_settings: 'Settings',
	nav_collapse_sidebar: 'Collapse sidebar',
	nav_expand_sidebar: 'Expand sidebar',
	nav_logout: 'Log out',

	// ── Record statuses ──────────────────────────────────────────────────────
	status_captured: 'Captured',
	status_in_review: 'In review',
	status_rejected: 'Rejected',
	status_approved: 'Approved'
};

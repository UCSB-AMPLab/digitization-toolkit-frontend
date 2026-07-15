// ============================================================================
// CATÁLOGO DE MENSAJES — ESPAÑOL (idioma fuente)
//
// Este archivo es la fuente de verdad del catálogo: `en.ts` se tipa contra
// las claves de este objeto, así que agregar, renombrar o eliminar una clave
// aquí obliga (vía `npm run check`) a mantener el inglés sincronizado.
//
// Convenciones:
//   - Claves con el patrón `area_elemento` (p. ej. `login_remember_me`,
//     `nav_overview`, `status_captured`).
//   - Mensajes completos por clave: nunca concatenar fragmentos en los
//     componentes. Si el mensaje necesita parámetros, la entrada es una
//     función: `cameras_detected: (n: number) => n === 1 ? '1 cámara' : `${n} cámaras``.
//   - La lógica que depende del idioma (plurales, concordancia) vive aquí
//     dentro de la entrada, nunca en el componente.
//   - Texto invariable entre idiomas (marcas, siglas, unidades) no se
//     cataloga: queda en el componente.
// ============================================================================

export const es = {
	// ── Comunes (usados en varias pantallas) ─────────────────────────────────
	common_username_label: 'Usuario',
	common_password_label: 'Contraseña',
	common_show_password: 'Mostrar contraseña',
	common_hide_password: 'Ocultar contraseña',
	common_close: 'Cerrar',
	common_loading: 'Cargando',

	// ── Login ────────────────────────────────────────────────────────────────
	login_username_placeholder: 'Ingresa tu usuario',
	login_password_placeholder: 'Ingresa tu contraseña',
	login_remember_me: 'Recuérdame',
	login_forgot_link: '¿Olvidaste tu contraseña?',
	login_forgot_dialog_aria: 'Recuperación de contraseña',
	login_forgot_title: 'Recuperar contraseña',
	login_forgot_message: 'Para recuperar tu contraseña, comunícate con el responsable del proyecto.',
	login_submit: 'Iniciar sesión',
	login_submit_loading: 'INICIAR SESIÓN',
	login_connected: 'Conectado',
	login_offline: 'Sin conexión',
	login_error_fill_all_fields: 'Por favor completa todos los campos',
	login_error_user_fetch: 'No se pudo obtener los datos del usuario',
	login_error_bad_credentials: 'Usuario o contraseña incorrectos',

	// ── Navegación (dashboard) ───────────────────────────────────────────────
	nav_section_main: 'PRINCIPAL',
	nav_section_system: 'SISTEMA',
	nav_overview: 'Resumen',
	nav_projects: 'Proyectos',
	nav_users: 'Usuarios',
	nav_settings: 'Configuración',
	nav_collapse_sidebar: 'Colapsar sidebar',
	nav_expand_sidebar: 'Expandir sidebar',
	nav_logout: 'Salir',

	// ── Estados de registro ──────────────────────────────────────────────────
	status_captured: 'Capturado',
	status_in_review: 'En revisión',
	status_rejected: 'Rechazado',
	status_approved: 'Aprobado'
};

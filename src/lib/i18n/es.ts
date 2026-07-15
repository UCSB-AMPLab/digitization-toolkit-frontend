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
	common_loading_ellipsis: 'Cargando…',
	common_cancel: 'Cancelar',
	common_save_changes: 'Guardar cambios',
	common_edit: 'Editar',
	common_delete: 'Eliminar',
	common_actions: 'Acciones',
	common_status: 'Estado',
	common_retry: 'Reintentar',
	common_user: 'Usuario',
	common_irreversible: 'Esta acción no se puede deshacer.',
	common_capture: 'Capturar',
	common_email: 'Correo electrónico',
	common_confirm_password: 'Confirmar contraseña',
	common_saving: 'Guardando...',
	common_deleting: 'Eliminando...',

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
	status_approved: 'Aprobado',

	// ── Roles ────────────────────────────────────────────────────────────────
	role_admin: 'Administrador',
	role_operator: 'Operario',
	role_reviewer: 'Revisor',
	role_admin_desc: 'Gestión completa del sistema',
	role_operator_desc: 'Digitalización de documentos',
	role_reviewer_desc: 'Control de calidad',

	// ── Estados de cámara (compartidos) ──────────────────────────────────────
	camera_not_detected: 'No detectada',

	// ── Dashboard (resumen) ──────────────────────────────────────────────────
	dash_greeting: (name: string) => `¡Hola ${name}!`,
	dash_greeting_fallback: 'bienvenido',
	dash_subtitle_admin: 'Panel de administración — Resumen general del sistema',
	dash_subtitle_operator: 'Panel de operario — Tus proyectos asignados',
	dash_subtitle_reviewer: 'Panel de revisión — Colecciones pendientes de revisión',
	// Alerta de almacenamiento: fragmentos alrededor del <strong> y el enlace
	// a Configuración (el texto del enlace reutiliza nav_settings).
	dash_storage_alert_p1: 'El almacenamiento está al ',
	dash_storage_alert_p2: (used: string, total: string) => ` (${used} / ${total}). Revisa la `,
	dash_storage_alert_p3: ' para liberar espacio.',
	dash_kpi_active_projects: 'Proyectos activos',
	dash_kpi_collections: 'Colecciones',
	dash_kpi_total_records: 'Total registros',
	dash_test_cameras: 'Probar cámaras',
	dash_camera_left: 'Cámara izquierda',
	dash_camera_right: 'Cámara derecha',
	dash_camera_not_active: 'No activa',
	dash_camera_stop: 'Detener',
	dash_camera_test: 'Probar',
	dash_camera_focus: 'Enfocar',
	dash_two_cameras: '2 cámaras',

	// ── Configuración ────────────────────────────────────────────────────────
	config_subtitle: 'Parámetros del sistema de digitalización',
	config_section_storage: 'Almacenamiento',
	// Fragmentos alrededor del <strong>{porcentaje}%</strong>
	config_storage_alert_pre: 'El almacenamiento está al ',
	config_storage_alert_post: '. Se recomienda liberar espacio o expandir la capacidad.',
	config_storage_used: 'Almacenamiento usado',
	config_storage_primary: 'Almacenamiento primario',
	config_storage_primary_desc: 'Ruta donde se guardan las imágenes',
	config_badge_external: 'externo',
	config_badge_experimental: 'experimental',
	config_badge_active: 'activo',
	config_storage_device: 'Unidad de almacenamiento',
	config_storage_device_desc: 'Conectar un disco USB o tarjeta SD como almacenamiento adicional',
	config_external_active_pre: 'Usando almacenamiento externo. Las imágenes nuevas se guardan en ',
	config_restore_progress: 'Restaurando…',
	config_restore_default: 'Restaurar predeterminado',
	config_experimental_lead: 'Función experimental.',
	config_experimental_body:
		'La compatibilidad depende del formato del dispositivo (exFAT, ext4). Discos formateados para Windows (NTFS) o macOS (APFS) pueden no funcionar correctamente. No usar como única copia de seguridad.',
	config_new_projects_note:
		'Solo los proyectos nuevos se guardarán en la unidad seleccionada. Los proyectos existentes permanecen donde están.',
	config_detecting_devices: 'Detectando dispositivos…',
	config_no_partitions: 'No se detectaron particiones disponibles.',
	config_not_mounted: 'no montado',
	config_activating: 'Activando…',
	config_activate: 'Activar',
	config_in_use: '✓ En uso',
	config_unmount_tooltip: 'Desmontar de forma segura antes de desconectar',
	config_unmounting: 'Desmontando…',
	config_unmount: 'Desmontar',
	config_mounting: 'Montando…',
	config_mount: 'Montar',
	config_refresh_list: 'Actualizar lista',
	config_err_read_devices: 'No se pudieron leer los dispositivos.',
	config_mounted_at: (mountpoint: string) => `Montado correctamente en ${mountpoint}.`,
	config_unknown_location: 'directorio desconocido',
	config_err_mount: 'Error al montar el dispositivo.',
	config_storage_active: (path: string) => `Almacenamiento activo: ${path}`,
	config_err_activate: 'Error al activar el almacenamiento.',
	config_err_unmount: 'Error al desmontar el dispositivo.',
	config_restored_default: 'Restaurado al almacenamiento predeterminado.',
	config_err_restore: 'Error al restaurar.',
	config_section_diagnostics: 'Diagnóstico',
	config_system_logs: 'Logs del sistema',
	config_system_logs_desc: 'Actividad reciente — última hora',
	config_logs_loading: 'Cargando actividad reciente…',
	config_logs_empty: 'Sin actividad registrada todavía.',
	config_err_logs: 'No se pudieron cargar los logs del sistema.',
	// Plantillas de mensajes del log de actividad (fragmentos alrededor del
	// actor/sujeto en negrita; el género concuerda con el sustantivo en ES)
	log_user_prefix: 'Usuario ',
	log_login_success_suffix: ' inició sesión exitosamente.',
	log_login_failed_prefix: 'Acceso fallido. Usuario: ',
	log_login_failed_detail: (detail: string) => ` (${detail}).`,
	log_created_by_m: (actor: string) => ` creado por ${actor}.`,
	log_created_by_f: (actor: string) => ` creada por ${actor}.`,
	log_deleted_by_m: (actor: string) => ` eliminado por ${actor}.`,
	log_project_prefix: 'Proyecto ',
	log_collection_prefix: 'Colección ',
	log_detail_suffix: (detail: string) => ` — ${detail}`,
	log_actor_system: 'sistema',
	config_section_maintenance: 'Mantenimiento',
	config_tmp_files: 'Archivos temporales de previsualización',
	// Fragmentos alrededor de los <code> (dtk_preview_c*.jpg y /tmp)
	config_tmp_files_desc_p1: 'Elimina los archivos ',
	config_tmp_files_desc_p2: ' de ',
	config_tmp_files_desc_p3: ' que pueden quedar si el servidor se reinicia inesperadamente',
	config_cleaning: 'Limpiando…',
	config_clean_tmp: 'Limpiar /tmp',
	config_tmp_none: 'No había archivos temporales pendientes.',
	config_tmp_deleted: (n: number) =>
		n === 1 ? '1 archivo eliminado correctamente.' : `${n} archivos eliminados correctamente.`,
	config_err_clean: 'Error al limpiar los archivos.',
	config_section_power: 'Energía',
	config_shutdown_label: 'Apagar el equipo',
	config_shutdown_desc:
		'Apaga el equipo de forma segura. Úsalo siempre antes de desconectar la corriente para no dañar la tarjeta de memoria.',
	config_shutdown_btn: 'Apagar',
	config_reboot_label: 'Reiniciar el equipo',
	config_reboot_desc:
		'Reinicia el equipo. La aplicación se recargará automáticamente cuando vuelva a estar disponible.',
	config_reboot_btn: 'Reiniciar',
	config_offline_note:
		'Este sistema opera completamente offline. Los datos se almacenan localmente en el dispositivo.',
	config_confirm_reboot_title: '¿Reiniciar el equipo?',
	config_confirm_shutdown_title: '¿Apagar el equipo?',
	config_confirm_reboot_desc:
		'El equipo se reiniciará y la aplicación volverá en un momento. No desconectes la corriente durante el reinicio.',
	config_confirm_shutdown_desc:
		'Espera a que la pantalla se apague antes de desconectar la corriente. Cualquier captura en curso debe terminar primero.',
	config_sending: 'Enviando…',
	config_confirm_reboot_btn: 'Sí, reiniciar',
	config_confirm_shutdown_btn: 'Sí, apagar',
	config_shutting_down: 'Apagando el equipo…',
	config_shutdown_overlay_desc: 'Ya puedes desconectar la corriente cuando la pantalla se apague.',
	config_rebooting: 'Reiniciando el equipo…',
	config_reboot_overlay_desc: 'La aplicación volverá en un momento. No desconectes la corriente.',
	config_err_power_unavailable: 'El control de energía no está disponible en este equipo.',
	config_err_session_expired: 'Tu sesión expiró. Vuelve a iniciar sesión para apagar o reiniciar.',
	config_err_operation: 'No se pudo completar la operación.',

	// ── Usuarios ─────────────────────────────────────────────────────────────
	users_title: 'Gestión de Usuarios',
	users_subtitle: 'Control de acceso y roles del personal',
	users_new: 'Nuevo Usuario',
	users_search_placeholder: 'Buscar usuario...',
	users_filter_role: 'Rol',
	users_status_active: 'Activo',
	users_status_inactive: 'Inactivo',
	users_loading: 'Cargando usuarios...',
	users_err_load: 'Error al cargar usuarios',
	users_empty_filtered: 'Sin resultados para los filtros aplicados',
	users_empty: 'No hay usuarios aún',
	users_col_registered: 'Registrado',
	users_modal_edit_title: 'Editar usuario',
	users_modal_create_title: 'Crear nuevo usuario',
	users_modal_edit_subtitle: 'Modifica los datos del usuario',
	users_modal_create_subtitle: 'Agregar usuario al sistema',
	users_field_username: 'Nombre de usuario',
	users_ph_username: 'Ej: maria.garcia',
	users_ph_email: 'Ej: maria@archivo.org',
	users_ph_password: 'Ingrese contraseña',
	users_ph_confirm: 'Confirme contraseña',
	users_field_account_status: 'Estado de la cuenta',
	users_field_assign_role: 'Asignar rol',
	users_create_btn: 'Crear usuario',
	users_err_create: 'Error al crear usuario',
	users_err_save: 'Error al guardar',
	users_val_username_required: 'El nombre de usuario es obligatorio.',
	users_val_email_required: 'El email es obligatorio.',
	users_val_password_required: 'La contraseña es obligatoria.',
	users_val_password_mismatch: 'Las contraseñas no coinciden.',
	users_delete_title: '¿Eliminar usuario?',
	// Fragmento antes del <strong>{usuario}</strong> ({email})?
	users_delete_confirm_pre: '¿Estás seguro que quieres eliminar a ',
	users_delete_btn: 'Sí, eliminar'
};

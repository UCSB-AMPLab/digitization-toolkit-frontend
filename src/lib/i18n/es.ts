// ============================================================================
// CATÁLOGO DE MENSAJES — ESPAÑOL (idioma fuente)
//
// Este archivo es la fuente de verdad del catálogo: `en.ts` se tipa contra
// las claves de este objeto, así que agregar, renombrar o eliminar una clave
// aquí obliga (vía `npm run check`) a mantener el inglés sincronizado.
//
// Convenciones:
//   - Claves con el patrón `area_elemento` (p. ej. `login_remember_me`,
//     `nav_overview`, `status_approved`).
//   - Mensajes completos por clave: nunca concatenar fragmentos en los
//     componentes. Si el mensaje necesita parámetros, la entrada es una
//     función: `cameras_detected: (n: number) => n === 1 ? '1 cámara' : `${n} cámaras``.
//   - La lógica que depende del idioma (plurales, concordancia) vive aquí
//     dentro de la entrada, nunca en el componente.
//   - Texto invariable entre idiomas (marcas, siglas, unidades) no se
//     cataloga: queda en el componente.
// ============================================================================

import { formatCount } from '../format-count';
import { formatBytes } from '../format-bytes';

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
	record_fallback_title: (id: number | string) => `Registro #${id}`,
	common_filters: 'Filtros',
	common_saving: 'Guardando…',
	common_deleting: 'Eliminando…',
	common_creating: 'Creando…',
	common_confirm: 'Confirmar',
	common_save: 'Guardar',

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
	login_connected: 'Servidor conectado',
	login_offline: 'Sin conexión con el servidor',
	login_error_fill_all_fields: 'Por favor completa todos los campos',
	login_error_bad_credentials: 'Usuario o contraseña incorrectos',
	login_error_unknown_role: 'Tu cuenta tiene un rol que la aplicación no reconoce. Avisa a quien administra el equipo.',
	login_error_backend_unavailable: 'No se pudo conectar con el servidor. Puede que todavía no esté listo: espera unos segundos e intenta de nuevo.',
	login_error_locked_out: (minutes: number) =>
		minutes === 1
			? 'Demasiados intentos fallidos. Espera 1 minuto e intenta de nuevo.'
			: `Demasiados intentos fallidos. Espera ${minutes} minutos e intenta de nuevo.`,
	login_error_locked_out_unknown: 'Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo.',

	// ── Sesión ───────────────────────────────────────────────────────────────
	session_validating: 'Verificando sesión…',
	session_backend_waiting: 'Esperando respuesta del servidor…',
	session_backend_waiting_detail: 'Si acabas de encender el equipo, el servidor puede tardar unos segundos en responder. Captua seguirá intentando conectarse y continuará en cuanto lo logre.',

	// ── Navegación (dashboard) ───────────────────────────────────────────────
	nav_section_main: 'PRINCIPAL',
	nav_section_system: 'SISTEMA',
	nav_overview: 'Resumen',
	nav_projects: 'Proyectos',
	nav_users: 'Usuarios',
	nav_settings: 'Configuración',
	nav_collapse_sidebar: 'Colapsar sidebar',
	nav_expand_sidebar: 'Expandir sidebar',
	// ── Recorrido guiado de primer arranque (NEH-95) ──────────────────────────
	// Los textos están en usted: el personal del archivo se trata de usted, y
	// así está escrita la tarjeta del operador de Rionegro. El resto del
	// catálogo todavía está en tú — ver NEH-38.
	nav_help: 'Ayuda',
	tour_aria: 'Recorrido guiado',
	tour_skip: 'Saltar el recorrido',
	tour_next: 'Paso siguiente',
	tour_prev: 'Paso anterior',
	tour_finish: 'Terminar',

	tour_s1_title: 'Crear un proyecto',
	tour_s1_where: 'Pulse en Proyectos › Nuevo Proyecto.',
	tour_s1_body:
		'Un proyecto agrupa lo que se va a digitalizar de un mismo fondo. Agrupa uno o varios volúmenes.',
	tour_s2_title: 'Crear un volumen',
	tour_s2_where: 'Pulse en Proyectos › su proyecto › Nuevo volumen.',
	tour_s2_body:
		'Cada libro, caja o legajo es un volumen que hace parte de un proyecto. Las imágenes se guardan dentro.',
	tour_s3_title: 'Capturar',
	tour_s3_where: 'Pulse en Proyectos › su proyecto › su volumen › Capturar.',
	tour_s3_body: 'Desde aquí se abre la pantalla de captura de este volumen.',
	tour_s4_title: 'Pasar a revisión',
	tour_s4_where: 'Pulse en Proyectos › su proyecto › su volumen › Enviar a revisión.',
	tour_s4_body:
		'Al terminar de capturar, envíe el volumen a revisión. Antes de eso es posible hacer correcciones de captura y de nomenclatura.',
	tour_s5_title: 'Revisar y aprobar',
	tour_s5_where: 'Pulse en Proyectos › su proyecto › su volumen › Aprobar.',
	tour_s5_body:
		'Apruebe que las páginas estén bien. Las que haya que repetir se rechazan indicando el motivo.',
	tour_s6_title: 'Exportar',
	tour_s6_where: 'Pulse en Proyectos › su proyecto › su volumen › Exportar BagIt.',
	tour_s6_body:
		'Con todo aprobado, el volumen se empaqueta y queda disponible para descargarlo.',

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
	dash_subtitle_reviewer: 'Panel de revisión — volúmenes pendientes de revisión',
	// Alerta de almacenamiento: fragmentos alrededor del <strong> y el enlace
	// a Configuración (el texto del enlace reutiliza nav_settings).
	dash_storage_alert_p1: 'El almacenamiento está al ',
	dash_storage_alert_p2: (used: string, total: string) => ` (${used} / ${total}). Revisa la `,
	dash_storage_alert_p3: ' para liberar espacio.',
	dash_kpi_active_projects: 'Proyectos activos',
	dash_kpi_collections: 'Volúmenes',
	dash_kpi_total_records: 'Total registros',
	dash_in_progress: 'Digitalizaciones en curso',
	dash_col_volume: 'Volumen',
	dash_col_project: 'Proyecto',
	dash_col_last_activity: 'Última modificación',
	dash_col_actions: 'Acciones',
	// Vista de tablero o tabla del bloque "en curso"
	dash_view_label: 'Vista',
	dash_view_board: 'Tablero',
	dash_view_table: 'Tabla',
	dash_col_progress: 'Avance',
	dash_records_count: (n: number) => (n === 1 ? '1 registro' : `${formatCount(n, 'es')} registros`),
	dash_stage_capture: 'En captura',
	dash_stage_capture_desc: 'Volúmenes con registros que todavía no están en revisión.',
	dash_stage_recapture: 'Por recapturar',
	dash_stage_recapture_desc: 'Volúmenes con imágenes rechazadas que hay que volver a capturar.',
	dash_stage_review: 'En revisión',
	dash_stage_review_desc: 'Volúmenes con registros pendientes de revisión.',
	dash_stage_approved: 'Aprobado',
	dash_stage_approved_desc: 'Volúmenes con todos los registros aprobados, listos para exportar.',
	dash_progress_load_error: 'No se pudo cargar el avance de los volúmenes',
	dash_test_cameras: 'Probar cámaras',
	dash_camera_left: 'Cámara izquierda',
	dash_camera_right: 'Cámara derecha',
	dash_camera_not_active: 'No activa',
	dash_camera_stop: 'Detener',
	dash_camera_test: 'Probar',
	dash_camera_focus: 'Enfocar',
	dash_camera_capture_ok: 'Captura de prueba realizada',
	dash_camera_capture_took: (s: string) => `en ${s} s`,
	dash_camera_capture_error: 'No se pudo hacer la captura de prueba',
	// Detalle tras dash_camera_capture_error y dos puntos, por eso en minúscula.
	dash_camera_capture_not_connected: 'la cámara no está conectada',
	dash_camera_capture_timeout: 'la cámara no entregó la imagen a tiempo',
	dash_two_cameras: '2 cámaras',
	dash_camera_missing_hint: (side: string) =>
		`${side}: no se detecta. Presiona el disparador hasta la mitad para despertarla o vuelve a conectar el cable USB, y luego presiona "Reconectar cámaras".`,
	dash_camera_reconnect: 'Reconectar cámaras',
	dash_camera_reconnect_error: 'No se pudo reconectar',

	// ── Calendario de actividad ──────────────────────────────────────────────
	dash_cal_title: 'Calendario de actividad',
	dash_cal_view: 'Vista',
	dash_cal_view_captures: 'Capturas',
	dash_cal_view_reviews: 'Revisiones',
	dash_cal_subtitle_captures: 'Imágenes capturadas por día en los últimos seis meses',
	dash_cal_subtitle_reviews: 'Registros aprobados o rechazados por día en los últimos seis meses',
	dash_cal_map_captures: 'Imágenes capturadas por día',
	dash_cal_map_reviews: 'Registros revisados por día',
	dash_cal_weekday_mon: 'lun',
	dash_cal_weekday_wed: 'mié',
	dash_cal_weekday_fri: 'vie',
	dash_cal_less: 'Menos',
	dash_cal_more: 'Más',
	dash_cal_day_captures: (n: number, date: string) =>
		n === 1 ? `1 imagen capturada el ${date}` : `${formatCount(n, 'es')} imágenes capturadas el ${date}`,
	dash_cal_day_reviews: (n: number, date: string) =>
		n === 1 ? `1 registro revisado el ${date}` : `${formatCount(n, 'es')} registros revisados el ${date}`,
	dash_cal_days_captures: 'Días con capturas',
	dash_cal_total_captures: 'Imágenes capturadas',
	dash_cal_days_reviews: 'Días con revisiones',
	dash_cal_total_reviews: 'Registros revisados',
	dash_cal_error: 'No se pudo cargar el calendario de actividad.',

	// ── Configuración ────────────────────────────────────────────────────────
	config_subtitle: 'Parámetros del sistema de digitalización',
	config_section_language: 'Idioma',
	config_language_label: 'Idioma de la interfaz',
	config_language_desc: 'Cambia el idioma de toda la aplicación. La página se recarga para aplicarlo; la sesión no se cierra.',
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
	config_storage_override_invalid: 'La configuración de almacenamiento externo no era válida y no se pudo leer; usando almacenamiento interno.',
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
	config_camera_backend: 'Backend de cámara',
	config_camera_backend_desc:
		'Qué sistema de captura está activo en este equipo. Se define al instalarlo; cambiarlo exige reconfigurar el equipo.',
	config_camera_backend_unknown: 'No disponible',
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
	log_collection_prefix: 'Volumen ',
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
		n === 1 ? '1 archivo eliminado correctamente.' : `${formatCount(n, 'es')} archivos eliminados correctamente.`,
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
	users_search_placeholder: 'Buscar usuario…',
	users_filter_role: 'Rol',
	users_status_active: 'Activo',
	users_status_inactive: 'Inactivo',
	users_loading: 'Cargando usuarios…',
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
	users_val_password_required: 'La contraseña es obligatoria.',
	users_val_password_mismatch: 'Las contraseñas no coinciden.',
	users_val_email_format: 'Formato de correo no válido',
	users_delete_title: '¿Eliminar usuario?',
	// Fragmento antes del <strong>{usuario}</strong>; luego va " ({email})" solo
	// si la cuenta tiene correo, y al final el "?".
	users_delete_confirm_pre: '¿Estás seguro que quieres eliminar a ',
	users_delete_btn: 'Sí, eliminar',

	// ── Proyectos (lista) ────────────────────────────────────────────────────
	proj_title: 'Gestión de Proyectos',
	proj_subtitle: 'Fondos, series, secciones',
	proj_new: 'Nuevo Proyecto',
	proj_search_placeholder: 'Buscar por nombre, código…',
	proj_loading: 'Cargando proyectos…',
	proj_empty_search: 'Sin resultados para tu búsqueda',
	proj_empty: 'No hay proyectos aún',
	proj_create_first: 'Crear primer proyecto',
	proj_col_project: 'Proyecto',
	proj_col_reference: 'Referencia',
	proj_col_start_date: 'Fecha Inicio',
	proj_status_in_progress: 'En Progreso',
	proj_status_started: 'Iniciado',
	proj_status_review: 'Revisión',
	proj_status_paused: 'Pausado',
	proj_status_completed: 'Completado',
	proj_modal_edit_title: 'Editar Proyecto',
	proj_field_name: 'NOMBRE DEL PROYECTO',
	proj_ph_name: 'Ej: Fondo Colonial 2024',
	proj_field_description: 'DESCRIPCIÓN',
	proj_ph_description: 'Breve descripción del contenido',
	proj_field_fonds: 'FONDO',
	proj_ph_fonds: 'Ej: Archivo Anexo: Grupo I',
	proj_field_series: 'SERIE / SECCIÓN',
	proj_ph_series: 'Ej: Aduanas',
	proj_field_refcode: 'SIGNATURA ARCHIVÍSTICA',
	proj_ph_refcode: 'Ej: CO.AGN.SAA-I.1.1.1',
	proj_create_btn: 'Crear proyecto',
	proj_err_create: (msg: string) => `No se pudo crear el proyecto: ${msg}`,
	proj_err_delete: (msg: string) => `No se pudo eliminar el proyecto: ${msg}`,
	proj_delete_title: 'Eliminar proyecto',
	proj_checking_contents: 'Verificando contenido…',
	proj_not_empty: 'Este proyecto no está vacío',
	proj_contains_pre: 'Contiene ',
	proj_collections_count: (n: number) => (n === 1 ? '1 volumen' : `${formatCount(n, 'es')} volúmenes`),
	proj_contains_mid: ' con ',
	proj_images_count: (n: number) => (n === 1 ? '1 imagen' : `${formatCount(n, 'es')} imágenes`),
	proj_delete_warning:
		'Si lo eliminas sin mover, todo el contenido se perderá de forma permanente.',
	proj_move_label: 'MOVER VOLÚMENES A OTRO PROYECTO (OPCIONAL)',
	proj_move_none: '— Eliminar sin mover —',
	proj_move_hint: (n: number) =>
		n === 1
			? 'El volumen se moverá antes de eliminar el proyecto.'
			: `Los ${formatCount(n, 'es')} volúmenes se moverán antes de eliminar el proyecto.`,
	proj_delete_confirm_pre: '¿Estás seguro de que deseas eliminar ',
	proj_deleting_moving: 'Moviendo y eliminando…',
	proj_move_and_delete: 'Mover y eliminar',
	proj_delete_without_moving: 'Eliminar sin mover',

	// ── Detalle de proyecto (volúmenes) ──────────────────────────
	pd_subtitle: 'Gestión de volúmenes del proyecto',
	pd_new_collection: 'Nuevo volumen',
	pd_back: 'Volver a Proyectos',
	pd_kpi_total_records: 'Total registros',
	pd_members: 'Colaboradores',
	pd_loading: 'Cargando volúmenes…',
	pd_empty_search: 'Sin resultados',
	pd_empty: 'No hay volúmenes aún',
	pd_create_first: 'Crear primer volumen',
	pd_col_collection: 'Volumen',
	pd_col_records: 'Núm. Registros',
	pd_col_date: 'Fecha',
	pd_status_active: 'Activa',
	pd_status_completed: 'Completada',
	pd_modal_edit_title: 'Editar volumen',
	pd_modal_create_title: 'Nuevo volumen',
	pd_modal_project: (name: string) => `Proyecto: ${name}`,
	pd_field_title: 'TÍTULO',
	pd_ph_title: 'Ej: Misiones Religiosas',
	pd_field_refcode: 'SIGNATURA',
	pd_ph_refcode: 'Ej: CO.AGN.SAA-I.1.1.2',
	pd_field_creator: 'NOMBRE DEL CREADOR',
	pd_ph_creator: 'Persona o institución que creó los documentos',
	pd_field_dates: 'FECHAS DE CREACIÓN',
	pd_date_from: 'DESDE',
	pd_date_to: 'HASTA (opcional)',
	pd_ph_date_from: 'Ej: 1987, 1987-04 o 1987-04-15',
	pd_ph_date_to: 'Ej: 1990, 1990-12 o 1990-12-31',
	pd_field_notes: 'NOTAS / DESCRIPCIÓN',
	pd_ph_notes: 'Descripción breve u observaciones…',
	pd_create_btn: 'Crear volumen',
	pd_val_start_date:
		'Fecha de inicio inválida. Acepta año (AAAA), año-mes (AAAA-MM) o fecha completa (AAAA-MM-DD).',
	pd_val_end_date:
		'Fecha de fin inválida. Acepta año (AAAA), año-mes (AAAA-MM) o fecha completa (AAAA-MM-DD).',
	pd_val_date_range: 'La fecha de fin no puede ser anterior a la fecha de inicio.',
	pd_err_create_collection: 'No se pudo guardar el volumen. Intenta de nuevo.',
	pd_err_delete_collection: 'No se pudo eliminar el volumen. Intenta de nuevo.',
	pd_err_delete_has_subvolumes: 'Este volumen no se puede eliminar porque todavía contiene otros volúmenes.',
	pd_err_move_under_review: (n: number) =>
		n === 1
			? 'Un registro de este volumen está en revisión, así que no se puede mover. Primero retira el volumen con "Retirar de revisión".'
			: `Hay ${formatCount(n, 'es')} registros de este volumen en revisión, así que no se pueden mover. Primero retira el volumen con "Retirar de revisión".`,
	pd_err_delete_not_empty: 'Este volumen todavía tiene registros. Muévelos a otro volumen antes de eliminarlo.',
	// Rechazos de un cambio de archivos mientras otro proceso los lee
	// (volume-refusals.ts).
	vol_err_volume_busy:
		'En el momento en que pediste el cambio, se estaban agregando o quitando registros en este volumen, así que Captua no cambió nada. Intenta de nuevo en un momento.',
	vol_err_files_being_read:
		'Captua está preparando un archivo de este volumen para la copia externa. Intenta de nuevo en un momento.',
	vol_err_files_being_read_project:
		'Captua está preparando un archivo de un volumen de este proyecto para la copia externa. Intenta de nuevo en un momento.',
	vol_err_export_running:
		'Captua está exportando este volumen. Espera a que termine la exportación y vuelve a intentarlo.',
	vol_err_export_in_subtree:
		'Captua está exportando este volumen o uno de los volúmenes que contiene. Espera a que termine la exportación y vuelve a intentarlo.',
	vol_err_export_in_project:
		'Captua está exportando un volumen de este proyecto. Espera a que termine la exportación y vuelve a intentarlo.',
	vol_err_files_changing:
		'Captua está moviendo, renombrando o eliminando archivos de este volumen. Vuelve a intentar la exportación en un momento.',
	vol_err_stored_offsite: (n: number): string =>
		n === 1
			? 'Un registro tiene archivos que ya están guardados en la copia externa como parte de este volumen, así que no se puede mover a otro volumen.'
			: `Hay ${formatCount(n, 'es')} registros con archivos que ya están guardados en la copia externa como parte de este volumen, así que no se pueden mover a otro volumen.`,
	pd_member_implicit: 'Acceso implícito (no se puede eliminar)',
	pd_member_remove: 'Eliminar colaborador',
	pd_member_add: 'Añadir colaborador',
	pd_member_select: '— Elige un usuario —',
	pd_member_adding: 'Añadiendo…',
	pd_member_add_btn: 'Añadir',
	pd_err_member_add: 'Error al añadir colaborador',
	pd_err_member_remove: 'Error al eliminar colaborador',
	pd_delete_collection_title: 'Eliminar volumen',
	pd_delete_loading: 'Cargando información…',
	pd_col_not_empty: 'Este volumen no está vacío',
	pd_records_count: (n: number) => (n === 1 ? '1 registro' : `${formatCount(n, 'es')} registros`),
	pd_delete_warning: 'Para eliminarlo, primero muévelos a otro volumen.',
	pd_move_label: 'MOVER LOS REGISTROS A',
	pd_move_none: '— Elige un volumen —',
	pd_move_hint_none: 'Elige un volumen de destino para poder eliminar este.',
	pd_move_hint_selected: 'Los registros se moverán al volumen seleccionado antes de eliminar este volumen.',
	pd_delete_confirm_pre: '¿Estás seguro de que quieres eliminar el volumen ',
	pd_field_stem: 'RAÍZ',
	pd_ph_stem: 'Ej: co-ahrb-aht-003',
	pd_stem_help:
		'El nombre de cada archivo de este volumen empieza con la raíz. Por lo general, es el código de referencia del volumen en Fisqua. No se puede cambiar después de capturar imágenes.',
	pd_stem_locked:
		'Ya se capturaron imágenes de este volumen con esta raíz, así que ya no se puede cambiar.',
	pd_val_stem_required: 'La raíz es obligatoria.',
	pd_val_stem_too_long: (max: number) => `La raíz no puede tener más de ${max} caracteres.`,
	pd_val_stem_pattern:
		'Usa solo minúsculas sin tildes ni eñe (a–z) y números. Puedes separar partes con un guion, pero sin dos guiones seguidos ni guion al comienzo o al final.',
	pd_err_stem_taken: 'Otro volumen ya usa esta raíz.',
	pd_err_stem_fixed: 'Ya se capturaron imágenes de este volumen, así que ya no se puede cambiar la raíz.',
	pd_no_stem_badge: 'Sin raíz',
	pd_no_stem_title: 'Este volumen no tiene raíz. Asígnale una antes de capturar.',
	pd_delete_stem_reserved:
		'Este volumen no se puede eliminar porque tiene raíz y ya tiene imágenes capturadas. Captua lo conserva para que esa raíz nunca se le asigne a otro volumen.',

	// ── Espacio de trabajo de volumen (revisión) ───────────────────
	col_back_to_project: 'Volver al proyecto',
	col_breadcrumb_nav: 'Navegación',
	col_open_in_camera: 'Abrir la pantalla de captura para este volumen',
	col_live_preview: 'Capturar',
	col_current_user: 'Usuario actual',
	col_loading_images: 'Cargando imágenes…',
	status_captured_plural: 'Capturados',
	status_rejected_plural: 'Rechazados',
	status_approved_plural: 'Aprobados',
	col_no_records: 'Sin registros',
	col_approve: 'Aprobar',
	col_reject: 'Rechazar',
	col_mark_error_btn: 'Marcar error',
	col_add_note: 'Agregar nota',
	col_reason_done: 'Listo',
	col_reject_error: 'No se pudo rechazar el registro. Intenta de nuevo.',
	col_reject_needs_reason: 'Debes seleccionar al menos un error.',
	col_reject_other_needs_note: 'Para rechazar por "Otro" hace falta una nota. Describe el problema en Agregar nota.',
	col_reject_other_note_error: 'No se pudo rechazar el registro: para rechazar por "Otro" hace falta una nota que describa el problema.',
	col_review_approve_error: 'No se pudo aprobar el registro. Intenta de nuevo.',
	// ── Envío a revisión (NEH-260) ──────────────────────────────────
	col_handover_send: 'Enviar a revisión',
	col_handover_send_new: (n: number) => (n === 1 ? 'Enviar 1 registro nuevo' : `Enviar ${formatCount(n, 'es')} registros nuevos`),
	col_handover_take_back: 'Retirar de revisión',
	col_handover_confirm_title: '¿Enviar el volumen a revisión?',
	col_handover_confirm_body: (n: number) =>
		n === 1
			? 'El registro capturado quedará en revisión. Mientras lo esté, no podrás moverlo a otro volumen.'
			: `Los ${formatCount(n, 'es')} registros capturados quedarán en revisión. Mientras lo estén, no podrás moverlos a otro volumen.`,
	col_handover_confirm_undo: (n: number): string =>
		n === 1
			? 'Si te equivocas, puedes retirarlo con "Retirar de revisión".'
			: 'Si te equivocas, puedes retirarlos con "Retirar de revisión".',
	col_handover_confirm_submit: 'Enviar',
	col_handover_refused_title: 'No se pudo enviar el volumen',
	col_handover_refused_body: (n: number) =>
		n === 1
			? 'Hay un registro que todavía no se puede enviar porque le falta la imagen o la que tiene fue rechazada. Vuelve a capturar su imagen y envía el volumen de nuevo.'
			: `Hay ${formatCount(n, 'es')} registros que todavía no se pueden enviar porque les falta la imagen o la que tienen fue rechazada. Vuelve a capturar sus imágenes y envía el volumen de nuevo.`,
	col_handover_refused_unchanged: 'No se cambió el estado de ningún registro.',
	col_handover_sent: (n: number) => (n === 1 ? 'Se envió 1 registro a revisión.' : `Se enviaron ${formatCount(n, 'es')} registros a revisión.`),
	col_handover_nothing_to_send: 'No había registros capturados para enviar.',
	col_handover_send_error: 'No se pudo enviar el volumen a revisión. Intenta de nuevo.',
	col_takeback_confirm_title: '¿Retirar el volumen de revisión?',
	col_takeback_confirm_body: (n: number) =>
		n === 1
			? 'El registro en revisión quedará otra vez en estado Capturado y podrás seguir trabajando en él.'
			: `Los ${formatCount(n, 'es')} registros en revisión quedarán otra vez en estado Capturado y podrás seguir trabajando en ellos.`,
	// Aprobados (a) y rechazados (r) que el retiro no toca. Con a = r = 0 no
	// se muestra; el componente no la llama en ese caso.
	col_takeback_confirm_kept: (a: number, r: number) => {
		if (a > 0 && r > 0) {
			const ap = a === 1 ? 'El registro aprobado' : `Los ${formatCount(a, 'es')} registros aprobados`;
			const rp = r === 1 ? 'el rechazado' : `los ${formatCount(r, 'es')} rechazados`;
			return `${ap} y ${rp} se quedan como están, porque ya se revisaron.`;
		}
		const n = a > 0 ? a : r;
		const word = a > 0 ? 'aprobado' : 'rechazado';
		return n === 1
			? `El registro ${word} se queda como está, porque ya se revisó.`
			: `Los ${formatCount(n, 'es')} registros ${word}s se quedan como están, porque ya se revisaron.`;
	},
	col_takeback_confirm_submit: 'Retirar',
	col_takeback_done: (n: number) => (n === 1 ? 'Se retiró 1 registro de revisión.' : `Se retiraron ${formatCount(n, 'es')} registros de revisión.`),
	col_takeback_nothing: 'No había registros en revisión para retirar.',
	col_takeback_error: 'No se pudo retirar el volumen de revisión. Intenta de nuevo.',
	col_review_not_sent_hint: 'Este registro no está en revisión. Podrás aprobarlo o rechazarlo cuando se envíe a revisión.',
	// Solo después de un envío o retiro que salió bien.
	col_records_reload_error: 'El cambio se guardó, pero no se pudo actualizar la lista de registros. Recarga la página para ver el estado actual de los registros.',
	col_recapture_btn: 'Recapturar imagen',
	col_annotation_comment_placeholder: 'Agrega un comentario (opcional)...',
	col_annotation_note_required_placeholder: 'Describe el problema (obligatorio para "Otro")...',
	col_review_confirm_approve: '¿Confirmas que quieres aprobar esta imagen?',
	col_review_confirm_reject: '¿Confirmas que quieres rechazar esta imagen?',
	col_review_confirm_undo_approve: '¿Confirmas que quieres deshacer la aprobación de esta imagen?',
	col_review_confirm_undo_reject: '¿Confirmas que quieres deshacer el rechazo de esta imagen?',
	col_pending_recapture: 'Pendiente de recaptura',
	col_approved_badge: 'Aprobada',
	col_renumber: 'Renumerar',
	col_reorder_done: 'Listo',
	col_reorder: 'Reordenar',
	col_thumb_size: 'Tamaño de thumbnails',
	col_columns_aria: 'Número de columnas',
	col_filter_by_status: 'Filtrar por estado:',
	col_clear_filter: '× Limpiar',
	col_filters_disabled_reorder: 'Los filtros se desactivan durante el reordenamiento para no alterar la secuencia',
	col_image_n: (i: number) => `Imagen ${i}`,
	col_renumber_modal_title: '¿Renumerar los registros?',
	col_renumber_desc:
		'Captua numerará los registros de este volumen a partir de 1, en el orden en que aparecen ahora, sin cambiar el nombre de ningún archivo.',
	col_renumbering: 'Renumerando…',
	col_renumber_error: 'Captua no pudo renumerar los registros de este volumen. Intenta de nuevo.',
	col_reorder_stale:
		'Mientras reordenabas, se agregaron o se quitaron registros en este volumen, así que Captua no guardó el orden nuevo. Captua volvió a cargar el orden guardado.',
	col_reorder_error: 'Captua no pudo guardar el orden nuevo. Captua volvió a cargar el orden guardado.',
	col_delete_record_error_title: 'No se pudo eliminar el registro',
	col_delete_record_retry: 'Intenta de nuevo en un momento.',
	col_finalize_title: '¿Finalizar Proyecto?',
	col_finalize_subtitle: 'Esta acción marcará el proyecto como terminado',
	// Fragmentos alrededor del <strong> del modal de finalización
	col_finalize_p1: 'Al finalizar el proyecto se asume que ',
	col_finalize_bold: 'todas las correcciones y revisiones fueron completadas',
	col_finalize_p2: '. Las imágenes se guardarán automáticamente en la tarjeta de memoria.',
	col_finalizing: 'Finalizando…',
	col_finalize_btn: 'Sí, Finalizar',
	col_prev: 'Anterior',
	col_next: 'Siguiente',
	col_left_page_short: 'Página izq.',
	col_right_page_short: 'Página der.',
	col_left_page: 'Página izquierda',
	col_right_page: 'Página derecha',
	col_image_alt: (id: number | string) => `Imagen ${id}`,
	col_record_locked: (statusLabel: string) => `Registro bloqueado (${statusLabel})`,
	col_status_in_review_lc: 'en revisión',
	col_status_approved_lc: 'aprobado',
	col_retake: 'Volver a capturar',
	col_retake_confirm: '¿Volver a capturar este registro desde la pantalla de captura? Captua guardará las imágenes actuales como versiones anteriores.',
	col_delete_record_confirm: '¿Eliminar permanentemente este registro y todas sus imágenes?',
	badge_left: 'Izq',
	badge_right: 'Der',
	col_err_blurry: 'Imagen Borrosa',
	col_err_glare: 'Reflejo/Brillo',
	col_err_shadows: 'Sombras',
	col_err_focus: 'Fuera de Foco',
	col_err_exposure: 'Exposición',
	col_err_debris: 'Impurezas en superficie',
	col_err_framing: 'Encuadre',
	col_err_obstruction: 'Obstrucción',
	col_err_other: 'Otro',
	col_tab_info: 'Información de la imagen',
	col_tab_edit: 'Controles de previsualización',
	col_tab_comments: 'Anotaciones',
	col_no_images: 'Sin imágenes',
	col_info_format: 'Formato',
	col_info_dimensions: 'Dimensiones',
	col_info_size: 'Tamaño',
	col_info_sequence: 'Secuencia',
	col_info_file: 'Archivo',
	col_info_captured: 'Capturada',
	col_select_record: 'Selecciona un registro',
	col_rotate: 'Girar',
	col_rotate_left: 'Izquierda',
	col_rotate_right: 'Derecha',
	col_slider_reset: 'Volver a cero',
	col_brightness: 'Brillo',
	col_contrast: 'Contraste',
	col_saturation: 'Saturación',
	col_no_annotations: 'Sin anotaciones — agrega una nota o marca un error',
	col_delete_annotation: 'Eliminar anotación',
	col_annotation_load_error: 'No se pudieron cargar las anotaciones. Intenta de nuevo.',
	col_annotation_save_error: 'No se pudo guardar la anotación. Intenta de nuevo.',
	col_annotation_delete_error: 'No se pudo eliminar la anotación. Intenta de nuevo.',
	col_role_left: 'Imagen izquierda',
	col_role_right: 'Imagen derecha',
	col_role_overview: 'Vista general',
	col_empty_collection: 'Sin imágenes en este volumen',
	col_col_title: 'Título',
	col_col_images: 'Imágenes',
	col_col_captures: 'Capturas',
	col_view_list: 'Vista lista',
	col_view_spread: 'Vista libro',
	col_view_spread_aria: 'Vista libro abierto',
	col_view_grid: 'Vista cuadrícula',
	col_zoom_in: 'Acercar',
	col_zoom_out: 'Alejar',
	col_fit_screen: 'Ajustar pantalla',
	col_fit_screen_aria: 'Ajustar a pantalla',
	col_zoom_actual: 'Tamaño real (1:1)',
	col_zoom_actual_aria: 'Tamaño real (1:1)',
	col_export_available: 'Exportar BagIt (todos aprobados)',
	col_export_unavailable: 'Exportar BagIt (requiere todos aprobados)',
	col_export: 'Exportar BagIt',
	col_err_export: 'Error al exportar',
	col_export_generating: 'Generando BagIt…',
	col_export_copying: 'Copiando imágenes y calculando checksums',
	col_export_done: 'Exportación completada',
	col_download_zip: 'Descargar ZIP',
	col_download_image: 'Descargar imagen',
	// NEH-139: imágenes RAW en los visores de inspección
	raw_preview_badge: 'Vista previa (RAW)',
	raw_preview_hint: 'El navegador no puede mostrar archivos RAW. Esta es la vista previa JPEG guardada junto al original.',
	raw_thumbnail_badge: 'Miniatura (RAW)',
	raw_thumbnail_hint: 'El navegador no puede mostrar archivos RAW, y este archivo no tiene vista previa en tamaño completo. Esta es su miniatura, en baja resolución.',
	raw_unviewable_title: 'No se puede mostrar este formato',
	raw_unviewable_body: 'El navegador no puede mostrar archivos RAW, y este archivo no tiene vista previa.',
	image_original_stored: 'El archivo original está guardado en el equipo.',
	image_file_missing: 'No se encontró el archivo de esta imagen.',
	// NEH-139: imágenes que no son RAW y que el navegador no muestra (TIFF) o que no cargan
	image_thumbnail_badge: 'Miniatura',
	image_thumbnail_hint_format: (ext: string) =>
		`El navegador no puede mostrar archivos ${ext}. Esta es la miniatura de este archivo, en baja resolución.`,
	image_thumbnail_hint: 'No se pudo mostrar este archivo en tamaño completo. Esta es su miniatura, en baja resolución.',
	image_unviewable_title: 'No se puede mostrar esta imagen',
	image_unviewable_body_format: (ext: string) =>
		`El navegador no puede mostrar archivos ${ext}, y la miniatura de este archivo tampoco se pudo mostrar.`,
	image_unviewable_body: 'No se pudo mostrar este archivo ni su miniatura.',
	// NEH-248: una imagen liberada de la tarjeta (RecordImageDisplay.svelte)
	freed_title: 'Imagen guardada en la copia externa',
	freed_where: 'Este archivo está guardado fuera del equipo, en la copia externa, para liberar espacio en la tarjeta de memoria.',
	freed_nothing_lost: 'No se perdió nada: Captua verificó la copia externa antes de quitar el archivo de la tarjeta.',
	freed_restore_hint: 'Si necesitas verlo en tamaño completo, un administrador puede restaurar el volumen en la tarjeta.',
	freed_thumbnail_note: 'Lo que ves es la miniatura, que Captua conserva en el equipo.',
	col_export_blocked_title: 'Aún no se puede exportar',
	col_export_blocked_desc: 'Todos los registros deben estar aprobados antes de exportar. Los siguientes aún no lo están:',
	col_download_choose_title: 'Exportar o descargar',
	col_download_choose_desc: 'Elige qué quieres obtener de este volumen',
	col_bagit_option_title: 'Paquete de archivo (BagIt)',
	col_bagit_option_desc: 'Versión final certificada: imágenes, checksums y manifiesto.',
	col_bagit_requires_approval: 'Requiere todos aprobados',
	col_images_option_title: 'Imágenes (ZIP)',
	col_images_option_desc: 'Solo los archivos de imagen, sin metadatos de preservación.',
	col_images_always: 'Disponible en cualquier momento',
	col_zip_generating: 'Preparando ZIP de imágenes…',
	col_zip_error: 'No se pudo generar el ZIP',
	col_zip_freed:
		'Algunas imágenes de este volumen están guardadas en la copia externa y ya no están en la tarjeta, así que no se pueden incluir en el ZIP. Un administrador puede restaurar el volumen desde "Espacio en la tarjeta".',
	col_export_freed: (n: number): string =>
		`${n === 1 ? 'Un archivo de este volumen está guardado en la copia externa y ya no está' : `${formatCount(n, 'es')} archivos de este volumen están guardados en la copia externa y ya no están`} en la tarjeta, así que Captua no puede armar el paquete. Para exportar el volumen, primero un administrador debe restaurarlo desde "Espacio en la tarjeta", junto a la línea de la copia externa.`,
	// ── Manifiesto de captura para Fisqua ───────────────────────────────────
	col_manifest_option_title: 'Manifiesto de captura (Fisqua)',
	col_manifest_option_desc: 'Un archivo JSON que le indica a Fisqua qué páginas de este volumen están en la copia externa.',
	col_manifest_requires: 'Requiere envío a revisión y copia externa completa',
	col_manifest_preparing: 'Preparando el manifiesto de captura…',
	col_manifest_refused_title: 'Todavía no se puede exportar el manifiesto de captura',
	col_manifest_refused_body: 'Fisqua rechazaría este archivo. Corrige lo siguiente y vuelve a exportarlo.',
	col_manifest_records: (ids: number[]): string => {
		const shown = ids.slice(0, 20).join(', ');
		const rest = ids.length - 20;
		return `${ids.length === 1 ? 'Registro' : 'Registros'} ${shown}${rest > 0 ? ` y ${formatCount(rest, 'es')} más` : ''}`;
	},
	col_manifest_rule_tenant_missing:
		'Este equipo no tiene configurada la carpeta de su institución en la copia externa, así que el manifiesto no puede indicar dónde está el volumen. Avisa a quien administra el equipo: tiene que definir DTK_OFFSITE_TENANT y reiniciar Captua.',
	col_manifest_rule_tenant_invalid:
		'La carpeta de la institución configurada en este equipo para la copia externa no es válida. Avisa a quien administra el equipo: tiene que corregir DTK_OFFSITE_TENANT y reiniciar Captua.',
	col_manifest_rule_no_stem:
		'El volumen no tiene raíz, así que sus imágenes no tienen nombres que Fisqua pueda leer. Asígnale una raíz al volumen: su código de referencia en Fisqua.',
	col_manifest_rule_no_project: 'El volumen no pertenece a ningún proyecto, y el manifiesto tiene que indicar a cuál pertenece. Mueve el volumen a un proyecto.',
	col_manifest_rule_records_captured:
		'Algunos registros siguen en estado Capturado, así que el volumen todavía no está en revisión. Envíalo a revisión cuando termines de capturarlo.',
	col_manifest_rule_sequence_missing: 'Algunos registros no tienen número de secuencia. Renumera el volumen.',
	col_manifest_rule_sequence_repeated: 'Algunos registros tienen el mismo número de secuencia. Renumera el volumen.',
	col_manifest_rule_roles_invalid:
		'Algunos registros no tienen una imagen única, ni tampoco una imagen izquierda, una derecha o las dos. Vuelve a capturarlos para que cada uno tenga una imagen única o un par de imágenes izquierda y derecha.',
	col_manifest_rule_capture_id_missing:
		'Algunas imágenes no tienen identificador de captura, así que el manifiesto de captura no tiene el checksum de esas imágenes. Vuelve a capturar esos registros.',
	col_manifest_rule_not_uploaded:
		'Algunas imágenes todavía no están verificadas en la copia externa. Espera a que Captua termine de copiarlas y verificarlas, y vuelve a exportar.',
	col_manifest_rule_preview_not_uploaded:
		'Las vistas previas de algunas imágenes RAW todavía no están verificadas en la copia externa. Espera a que Captua termine de copiarlas y verificarlas, y vuelve a exportar.',
	col_manifest_rule_raw_without_preview:
		'Algunas imágenes RAW no tienen vista previa, ni en la copia externa ni en la tarjeta. Fisqua no puede leer un archivo RAW, así que hay que volver a capturar esos registros.',
	col_manifest_rule_upload_refused:
		'Captua no pudo subir algunos archivos a la copia externa: aparecen como "requieren atención" en la línea de la copia externa del volumen. Resuélvelos y vuelve a exportar.',
	col_manifest_rule_key_outside:
		'Algunos archivos están guardados en la copia externa fuera de las carpetas de este volumen. Captua nunca cambia el nombre de un archivo en la copia externa, así que hay que volver a capturar esos registros.',
	col_manifest_rule_filename_form:
		'Algunas imágenes están guardadas en la copia externa con nombres que no corresponden a los nombres de archivo de este volumen. Captua nunca cambia el nombre de un archivo en la copia externa, así que hay que volver a capturar esos registros.',
	col_manifest_rule_page_key_repeated:
		'Hay más de una imagen guardada con el mismo nombre, y Fisqua usa ese nombre para identificar cada página. Hay que volver a capturar los registros de esas imágenes.',
	col_manifest_rule_sha256_missing:
		'El manifiesto de captura no tiene un checksum SHA-256 válido para algunas imágenes. Avisa a quien administra el equipo: tiene que ejecutar en el equipo la verificación de integridad del volumen y resolver lo que encuentre.',
	col_manifest_rule_preview_sha256_missing:
		'Las vistas previas de algunas imágenes RAW no tienen checksum SHA-256 registrado, porque esas imágenes se capturaron antes de que Captua empezara a registrarlo. Avisa a quien administra el equipo: tiene que ejecutar backfill-preview-digests para este volumen en el equipo. Después, vuelve a exportar.',
	col_manifest_rule_no_pages:
		'Ningún registro en revisión o aprobado tiene imágenes, así que Fisqua no tiene páginas que registrar. Envía a revisión registros con imágenes.',
	col_manifest_rule_other: 'Fisqua rechazaría el archivo por otro motivo.',
	col_manifest_err_title: 'No se pudo descargar el manifiesto de captura',
	col_manifest_err_not_found: 'Captua no encontró este volumen. Vuelve al proyecto y ábrelo de nuevo.',
	col_manifest_err: 'Captua no pudo preparar el manifiesto de captura. Intenta de nuevo.',
	bug_report_button: 'Reportar un problema',
	bug_report_title: 'Reportar un problema',
	bug_report_desc: 'Cuéntanos qué pasó. Se abrirá GitHub con un reporte prellenado.',
	bug_field_what: '¿Qué pasó?',
	bug_field_what_ph: 'Describe el problema (mínimo 10 caracteres)',
	bug_field_expected: '¿Qué esperabas que pasara?',
	bug_field_steps: 'Pasos para reproducirlo',
	bug_field_optional: 'Opcional',
	bug_attach_title: 'Qué vamos a adjuntar',
	bug_attach_context: 'Información del entorno (ruta, versión, navegador, etc.)',
	bug_attach_errors: 'Errores recientes (con datos sensibles ocultos)',
	bug_min_chars: 'Escribe al menos 10 caracteres.',
	bug_submit: 'Abrir reporte en GitHub',
	bug_crash_title: 'Algo salió mal',
	bug_crash_desc: 'Puedes reportar este problema para que lo revisemos.',
	bug_report_this: 'Reportar este problema',

	// ── Primera instalación ──────────────────────────────────────────────────
	setup_title: 'Primera instalación',
	setup_subtitle: 'Crea cuenta del administrador.',
	setup_ph_username: 'ej. admin',
	setup_ph_email: 'admin@ejemplo.com',
	setup_ph_password: 'Mínimo 8 caracteres',
	setup_ph_confirm: 'Repite la contraseña',
	setup_submit: 'Crear cuenta de administrador',
	setup_submit_loading: 'CREANDO CUENTA',
	setup_creating: 'Creando cuenta',
	setup_success: '¡Cuenta creada! Redirigiendo al inicio de sesión…',
	setup_err_exists: 'Ese usuario o correo ya existe',
	setup_err_create: 'No se pudo crear la cuenta. Verifica la conexión al servidor.',
	setup_token_label: 'Token de arranque',
	setup_ph_token: 'Pega el token de arranque del dispositivo',
	setup_token_hint: 'Requerido en un dispositivo aprovisionado; déjalo vacío en desarrollo.',
	setup_err_token: 'Token de arranque inválido o faltante. Verifica el token en el dispositivo.',
	setup_err_unavailable: 'La instalación no está disponible: esta unidad no tiene token de arranque configurado.',
	setup_val_username_required: 'El nombre de usuario es obligatorio',
	setup_val_username_short: 'El usuario debe tener al menos 3 caracteres',
	setup_val_email_format: 'Formato de correo no válido',
	setup_val_password_required: 'La contraseña es obligatoria',
	setup_val_password_short: 'La contraseña debe tener al menos 8 caracteres',
	setup_val_password_mismatch: 'Las contraseñas no coinciden',

	// ── Bienvenida ───────────────────────────────────────────────────────────
	welcome_title: 'Bienvenido/a',
	welcome_start: 'Comenzar',

	// ── Controles de cámara ──────────────────────────────────────────────────
	cam_panel_title: 'Controles de cámara',
	cam_panel_expand_aria: 'Control de cámara',
	cam_panel_collapse: 'Colapsar panel',
	cam_mode_single: 'Una cámara',
	cam_mode_double: 'Dos cámaras',
	cam_calibrated: 'Calibrada',
	cam_none_detected: 'Sin cámaras detectadas',
	cam_connected: 'Conectada',
	cam_fallback_name: 'Cámara',
	cam_reconnect: 'Reconectar cámaras',
	cam_reconnect_error: 'No se pudo reconectar',
	cam_section_basic: 'Ajustes básicos',
	cam_section_focus: 'Enfoque',
	cam_section_settings: 'Ajustes',
	cam_orientation: 'Orientación',
	cam_rotate_ccw: 'Girar 90° a la izquierda',
	cam_rotate_cw: 'Girar 90° a la derecha',
	cam_shutter: 'Velocidad de obturación',
	cam_aperture: 'Apertura',
	cam_format: 'Formato',
	cam_focusing: 'Enfocando…',
	cam_autofocus: 'Enfocar auto',
	cam_manual_focus: 'Foco manual',
	cam_focus_slider_aria: 'Posición de foco (dioptrías)',
	cam_focus_infinity: 'Infinito (lejos)',
	cam_focus_macro: 'Macro (10 cm)',
	cam_zoom_reset_aria: 'Restablecer zoom a 1×',
	cam_zoom_reset: 'restablecer',
	cam_zoom_slider_aria: 'Zoom de cámara (ScalerCrop)',
	// Nota DSLR: fragmentos alrededor del <strong>MF</strong>
	cam_dslr_note_p1: 'Pon el interruptor del objetivo en ',
	cam_dslr_note_p2: ' antes de capturar.',
	cam_dslr_note_p3: 'El enfoque automático (AF) bloquea las DSLR de Canon unos 12 segundos.',
	cam_dslr_af_warning: (mode: string) => `El objetivo está en ${mode}. La captura puede quedarse bloqueada hasta que el interruptor del objetivo esté en MF.`,
	cam_wb: 'Balance de blancos',
	cam_wb_calibrate_aria: 'Calibrar white balance automáticamente (AWB convergencia)',
	cam_wb_cancel_aria: 'Cancelar muestreo de white balance',
	cam_wb_sample_aria: 'Muestrear white balance: toca un área blanca en el preview (experimental)',
	cam_wb_hint: 'Toca un área blanca o gris neutro en el preview.',
	cam_temperature: 'Temperatura',
	cam_tint: 'Tinte',
	cam_exposure: 'Exposición',
	cam_histogram: 'Histograma',
	cam_focus_result: (dpt: string) => `Foco: ${dpt} dpt`,
	cam_af_failed: 'Autofocus falló',
	cam_af_error: 'Error en autofocus',
	cam_wb_calibrated: (temp: string) => `WB calibrado${temp}`,
	cam_wb_failed: 'Calibración WB falló',
	cam_wb_error: 'Error calibrando WB',
	cam_wb_invalid_pixel: 'Pixel inválido — elige un área con luz',
	cam_wb_sampled: (r: string, b: string) => `WB muestreado (R=${r}, B=${b})`,
	cam_wb_save_error: 'Error al guardar WB',
	cam_wb_apply_error: 'Error aplicando WB',

	// ── Vista en vivo ────────────────────────────────────────────────────────
	lv_reconnecting: 'Reconectando con la cámara…',
	lv_camera_left_alt: 'Cámara izquierda',
	lv_camera_right_alt: 'Cámara derecha',
	lv_wb_click_hint: 'Haz clic en un área blanca o gris neutro',
	lv_no_signal_left: 'Sin señal — Izquierda',
	lv_no_signal_right: 'Sin señal — Derecha',
	lv_check_hw: 'Verifica conexión del hardware',
	lv_camera_missing: 'Cámara no detectada. Presiona el disparador hasta la mitad o vuelve a conectar el cable USB, y luego presiona "Reconectar cámaras".',
	lv_rotate_ccw: 'Girar a la izquierda',
	lv_rotate_cw: 'Girar a la derecha',
	lv_controls_collapse: 'Ocultar controles',
	lv_controls_expand: 'Mostrar controles',
	lv_grid_settings: 'Ajustes de cuadrícula',
	lv_swap_orientation: 'Cambiar orientación de cámaras',
	lv_orientation_swapped: 'Orientación invertida (cámara 1 = izquierda)',
	lv_orientation_normal: 'Orientación normal (cámara 0 = izquierda)',
	lv_grid_modal_title: 'Cuadrícula y Guías',
	lv_grid_modal_subtitle: 'Activa las ayudas visuales de encuadre.',
	lv_grid: 'Cuadrícula',
	lv_grid_desc: 'Mostrar grid 3×3 de captura',
	lv_guides: 'Líneas de Guía',
	lv_guides_desc: 'Guías arrastrables (rojo)',
	// Tecla de captura (pedal)
	lv_capture_key_current: (chord: string) => `Tecla de captura: ${chord}`,
	lv_capture_key_desc: 'El pedal o la tecla que dispara una captura en esta pantalla.',
	lv_capture_key_learn: 'Asignar la tecla del pedal',
	lv_capture_key_learning: 'Presiona el pedal o la tecla ahora…',
	lv_capture_key_reset: 'Restaurar predeterminada',
	lv_capture_key_note: 'Mientras esta tecla esté asignada a la captura, deja de activar el botón que esté seleccionado en esta pantalla. Verifica que el pedal esté en modo de tecla única, no en modo macro ni de repetición.',
	lv_capture_key_modifier_only: (modifier: string) => `El dispositivo solo envió ${modifier}. Presiona la tecla del pedal, no solo un modificador.`,
	lv_capture_key_unbindable: 'El dispositivo envió una tecla que no se puede asignar a la captura. Intenta de nuevo.',
	lv_capture_key_space: 'Espacio',
	lv_capture_error: 'Error al capturar',
	lv_capture_not_ready: 'Cargando el volumen…',
	lv_needs_stem: 'Para capturar imágenes de este volumen, primero hay que asignarle una raíz.',
	lv_needs_stem_link: 'Asignar la raíz',
	// Errores de una captura o una retoma que el backend rechazó
	// (capture-errors.ts). Sin punto final, como lv_capture_error en el
	// aviso de la pantalla; lvm_retake_error se lo agrega.
	lv_err_no_volume: 'Elige un volumen antes de capturar',
	lv_err_volume_not_found: 'Este volumen ya no está en el catálogo',
	lv_err_record_not_found: 'Este registro ya no está en el catálogo',
	lv_err_retake_volume: 'Un registro solo se puede volver a capturar desde el volumen al que pertenece',
	lv_err_retake_mode: (mode: 'single' | 'dual'): string =>
		mode === 'dual'
			? 'Este registro se capturó con dos cámaras; para volver a capturarlo, elige "Dos cámaras"'
			: 'Este registro se capturó con una cámara; para volver a capturarlo, elige "Una cámara"',
	lv_err_camera_not_connected: (n: number) => `La cámara ${n} no está conectada`,
	lv_err_numbers_taken:
		'Captua no hizo la captura: ya hay archivos en el disco con los próximos números de captura de este volumen; avisa a quien administra el equipo',
	lv_err_retake_status: 'Solo se puede volver a capturar un registro en estado Capturado o Rechazado',
	lv_err_resolution_in_name: 'Captua no puede incluir la resolución en el nombre de archivo de las capturas',
	lv_err_name_too_long: 'Captua no hizo la captura: el nombre de archivo tendría más de 36 caracteres',
	lv_err_capture_limit: 'Captua no hizo la captura: este volumen llegó al límite de 9999 capturas; hace falta un volumen nuevo',
	lv_capture_btn: 'Capturar',
	lv_zoom_in: 'Acercar',
	lv_zoom_out: 'Alejar',
	lv_thumb_empty: 'Sin capturas aún — usa el botón de captura',
	tb_go_to_review: 'Revisar',
	tb_go_to_review_title: 'Volver a la revisión de este volumen',
	tb_breadcrumb_nav: 'Proyecto y volumen en curso',
	tb_back: 'Volver',
	tb_current_user: 'Usuario actual',
	lvm_retake: 'Volver a capturar',
	lvm_retake_confirm: '¿Volver a capturar este registro? Captua guardará las imágenes actuales como versiones anteriores.',
	lvm_retaking: 'Capturando imagen de reemplazo…',
	// `message` es una frase propia, con o sin punto final.
	lvm_retake_error: (message: string) =>
		`No se pudo volver a capturar el registro. ${message.endsWith('.') ? message : `${message}.`} Se conservaron las imágenes originales.`,

	// ── Copia externa del catálogo (NEH-266) ─────────────────────────────────
	// `day` dice si la copia es de hoy, de ayer o anterior, en la hora local;
	// `date` es la fecha ya formateada y solo se usa en el último caso.
	backup_ind_current: (day: 'today' | 'yesterday' | 'earlier', date: string) =>
		day === 'today'
			? 'Catálogo copiado hoy'
			: day === 'yesterday'
				? 'Catálogo copiado ayer'
				: `Catálogo copiado el ${date}`,
	// Una copia con más de 36 horas nunca es de hoy.
	backup_ind_stale: (day: 'today' | 'yesterday' | 'earlier', date: string) =>
		day === 'yesterday' ? 'Catálogo sin copia desde ayer' : `Catálogo sin copia desde el ${date}`,
	backup_ind_never: 'Catálogo sin copia verificada',
	backup_ind_off: 'Copia externa sin configurar',
	backup_ind_unknown: 'No se pudo consultar el estado de la copia externa',
	backup_section_title: 'Copia externa',
	backup_section_desc:
		'Una vez al día, el equipo copia el catálogo al destino que se configuró al instalarlo, y comprueba que el destino la recibió completa. El catálogo es la base de datos que relaciona cada imagen con su proyecto, su volumen y el lugar que ocupa en él.',
	backup_section_scope: 'Esta copia no incluye los archivos de imagen.',
	backup_cfg_current: (day: 'today' | 'yesterday' | 'earlier', date: string, time: string) => {
		const at = `${time.startsWith('01:') ? 'a la' : 'a las'} ${time}`;
		if (day === 'today') return `Copia verificada hoy ${at}.`;
		if (day === 'yesterday') return `Copia verificada ayer ${at}.`;
		return `Copia verificada el ${date} ${at}.`;
	},
	backup_cfg_stale: (day: 'today' | 'yesterday' | 'earlier', date: string) =>
		day === 'yesterday' ? 'La última copia verificada es de ayer.' : `La última copia verificada es del ${date}.`,
	backup_cfg_never: 'Todavía no se ha verificado ninguna copia.',
	backup_cfg_retry: 'El equipo vuelve a intentar la copia cada cierto tiempo mientras está encendido.',
	backup_cfg_off: 'La copia externa no está configurada en este equipo.',
	backup_cfg_unknown: 'No se pudo consultar el estado de la copia externa.',
	backup_cfg_last_file: 'Archivo de la última copia',
	backup_cfg_locked: 'Esta configuración se define al instalar el equipo y no se puede cambiar desde aquí.',

	// ── Copia externa de las imágenes (NEH-248, offsite-state.ts) ─────────
	offsite_vol_label: 'Copia externa de este volumen',
	offsite_vol_received: (verified: number, total: number) =>
		`Copia externa completa: ${formatCount(verified, 'es')} de ${formatCount(total, 'es')} archivos verificados`,
	offsite_vol_uploading: (verified: number, total: number, pending: number) =>
		`Copia externa en curso: ${formatCount(verified, 'es')} de ${formatCount(total, 'es')} archivos verificados, ${formatCount(pending, 'es')} ${pending === 1 ? 'pendiente' : 'pendientes'}`,
	offsite_vol_attention: (refused: number, verified: number, total: number, pending: number) =>
		`${refused === 1 ? '1 archivo requiere' : `${formatCount(refused, 'es')} archivos requieren`} atención · ${formatCount(verified, 'es')} de ${formatCount(total, 'es')} verificados, ${formatCount(pending, 'es')} ${pending === 1 ? 'pendiente' : 'pendientes'}`,
	offsite_attention_help: 'En la copia externa ya hay otro archivo con el mismo nombre. Avisa a quien administra el equipo.',
	offsite_vol_empty: 'Copia externa: todavía no hay archivos para copiar',
	offsite_vol_no_stem: 'Sin copia externa: este volumen no tiene raíz',
	offsite_vol_off: 'Copia externa de imágenes sin configurar',
	offsite_vol_misconfigured: 'Copia externa de imágenes mal configurada',
	offsite_vol_unknown: 'No se pudo consultar la copia externa de este volumen',
	offsite_last_verified: (day: 'today' | 'yesterday' | 'earlier', date: string, time: string): string => {
		const at = `${time.startsWith('01:') ? 'a la' : 'a las'} ${time}`;
		if (day === 'today') return `última verificación: hoy ${at}`;
		if (day === 'yesterday') return `última verificación: ayer ${at}`;
		return `última verificación: el ${date} ${at}`;
	},
	offsite_unit_title: 'Archivos de imagen',
	offsite_unit_off: 'La copia externa de los archivos de imagen no está configurada en este equipo.',
	offsite_unit_misconfigured:
		'La copia externa de los archivos de imagen no está bien configurada en este equipo. Avisa a quien administra el equipo.',
	offsite_unit_empty: 'Todavía no hay archivos de imagen para copiar.',
	offsite_unit_volumes: (received: number, volumes: number) =>
		`${formatCount(received, 'es')} de ${formatCount(volumes, 'es')} ${volumes === 1 ? 'volumen' : 'volúmenes'} con copia externa completa.`,
	offsite_unit_files: (verified: number, total: number, pending: number) =>
		`${formatCount(verified, 'es')} de ${formatCount(total, 'es')} archivos verificados, ${formatCount(pending, 'es')} ${pending === 1 ? 'pendiente' : 'pendientes'}.`,
	offsite_unit_refused: (refused: number): string =>
		refused === 1 ? '1 archivo requiere atención.' : `${formatCount(refused, 'es')} archivos requieren atención.`,
	offsite_cfg_last_verified: (day: 'today' | 'yesterday' | 'earlier', date: string, time: string): string => {
		const at = `${time.startsWith('01:') ? 'a la' : 'a las'} ${time}`;
		if (day === 'today') return `Último archivo verificado hoy ${at}.`;
		if (day === 'yesterday') return `Último archivo verificado ayer ${at}.`;
		return `Último archivo verificado el ${date} ${at}.`;
	},
	offsite_cfg_never: 'Todavía no se ha verificado ningún archivo.',

	// ── Liberar espacio en la tarjeta y restaurar (NEH-248, offsite-free.ts) ─
	offsite_vol_stored: 'Copia externa completa',
	offsite_vol_freed: (files: number, bytes: number): string =>
		`${files === 1 ? '1 archivo liberado' : `${formatCount(files, 'es')} archivos liberados`} de la tarjeta (${formatBytes(bytes, 'es')})`,
	offsite_manage_open: 'Espacio en la tarjeta',
	offsite_manage_intro:
		'Al liberar espacio, Captua quita de la tarjeta de memoria las imágenes y vistas previas de este volumen que ya están verificadas en la copia externa. Conserva las miniaturas, así que el volumen se puede seguir consultando.',
	offsite_free_action: 'Liberar espacio en la tarjeta',
	offsite_restore_action: 'Restaurar en la tarjeta',
	offsite_planning: 'Captua está revisando qué se puede liberar…',
	offsite_free_confirm_title: '¿Liberar espacio en la tarjeta?',
	offsite_plan_will_free: (files: number, bytes: number): string =>
		files === 1
			? `Captua quitará 1 archivo (${formatBytes(bytes, 'es')}) de la tarjeta. Seguirá guardado en la copia externa.`
			: `Captua quitará ${formatCount(files, 'es')} archivos (${formatBytes(bytes, 'es')}) de la tarjeta. Seguirán guardados en la copia externa.`,
	offsite_plan_restore_later: 'Un administrador puede restaurar el volumen más adelante con "Restaurar en la tarjeta".',
	offsite_free_check_note:
		'Antes de quitar cada archivo, Captua vuelve a comparar su checksum con el de la copia externa. Puede tardar varios minutos.',
	offsite_plan_nothing: 'Captua no encontró archivos que se puedan liberar en este volumen.',
	offsite_plan_left: (n: number): string =>
		n === 1 ? 'Captua dejará 1 archivo en la tarjeta:' : `Captua dejará ${formatCount(n, 'es')} archivos en la tarjeta:`,
	offsite_free_confirm: 'Liberar espacio',
	offsite_running_free: 'Captua está liberando espacio en la tarjeta…',
	offsite_running_close_note:
		'Puedes cerrar esta ventana: Captua seguirá trabajando y verás el resultado en la línea de la copia externa del volumen.',
	offsite_free_done_title: 'Captua terminó de liberar espacio',
	offsite_free_done: (files: number, bytes: number): string =>
		files === 0
			? 'Captua no quitó ningún archivo de la tarjeta.'
			: files === 1
				? `Captua quitó 1 archivo (${formatBytes(bytes, 'es')}) de la tarjeta.`
				: `Captua quitó ${formatCount(files, 'es')} archivos (${formatBytes(bytes, 'es')}) de la tarjeta.`,
	offsite_done_left: (n: number): string =>
		n === 1 ? 'Captua dejó 1 archivo en la tarjeta:' : `Captua dejó ${formatCount(n, 'es')} archivos en la tarjeta:`,
	offsite_restore_confirm_title: '¿Restaurar el volumen en la tarjeta?',
	offsite_restore_confirm_body: (files: number, bytes: number): string =>
		files === 1
			? `Captua traerá de la copia externa el archivo liberado (${formatBytes(bytes, 'es')}), comprobará su checksum y lo pondrá de nuevo en su lugar en la tarjeta.`
			: `Captua traerá de la copia externa los ${formatCount(files, 'es')} archivos liberados (${formatBytes(bytes, 'es')}), comprobará el checksum de cada uno y los pondrá de nuevo en su lugar en la tarjeta.`,
	offsite_restore_space_note:
		'Asegúrate de que la tarjeta tenga ese espacio libre. Puede tardar bastante, según la conexión.',
	offsite_restore_confirm: 'Restaurar',
	offsite_running_restore: 'Captua está restaurando los archivos en la tarjeta…',
	offsite_restore_done_title: 'Captua terminó de restaurar el volumen',
	offsite_restore_done: (files: number, bytes: number): string =>
		files === 0
			? 'Captua no restauró ningún archivo.'
			: files === 1
				? `Captua restauró 1 archivo (${formatBytes(bytes, 'es')}) en la tarjeta.`
				: `Captua restauró ${formatCount(files, 'es')} archivos (${formatBytes(bytes, 'es')}) en la tarjeta.`,
	offsite_restore_left: (n: number): string =>
		n === 1 ? 'Captua no pudo restaurar 1 archivo:' : `Captua no pudo restaurar ${formatCount(n, 'es')} archivos:`,
	offsite_err_no_stem:
		'Este volumen no tiene raíz, así que ninguno de sus archivos está en la copia externa y no hay nada que liberar ni restaurar.',
	offsite_err_not_received:
		'Todavía hay archivos de este volumen sin verificar en la copia externa. Espera a que Captua termine de copiarlos.',
	offsite_err_listing:
		'Captua no pudo consultar la copia externa, así que no comprobó ni quitó ningún archivo. Intenta de nuevo más tarde.',
	offsite_err_no_read_remote:
		'Este equipo no está configurado para restaurar: necesita acceso de lectura a la copia externa. Pide a quien instaló el equipo que lo configure.',
	offsite_err_not_in_own_folder:
		'Algunos archivos de este volumen todavía no están en la carpeta propia del volumen, así que Captua no puede liberarlos ni restaurarlos. Captua los mueve allí al arrancar el equipo: reinicia el equipo y vuelve a intentarlo. Si después del reinicio Captua sigue sin poder liberarlos ni restaurarlos, avísale a un administrador.',
	offsite_err_job_running: 'Captua ya está liberando o restaurando archivos de este volumen. Espera a que termine.',
	offsite_err_drive_unavailable:
		'El disco configurado para los proyectos no está disponible. Conéctalo y actívalo, o vuelve al almacenamiento interno, y después intenta de nuevo.',
	offsite_err_drive_not_directory:
		'La ruta de almacenamiento configurada para los proyectos no es una carpeta. Activa el disco de nuevo, o vuelve al almacenamiento interno, y después intenta de nuevo.',
	offsite_err_drive_not_mounted:
		'La ruta de almacenamiento configurada para los proyectos no está en un disco conectado. Conecta y activa el disco, o vuelve al almacenamiento interno, y después intenta de nuevo.',
	offsite_err_plan: 'Captua no pudo revisar qué se puede liberar. Intenta de nuevo en un momento.',
	offsite_err_free: 'Captua no pudo empezar a liberar espacio. Intenta de nuevo en un momento.',
	offsite_err_restore: 'Captua no pudo empezar a restaurar el volumen. Intenta de nuevo en un momento.',
	offsite_err_job_free:
		'Captua se detuvo antes de terminar de liberar espacio. Revisa la línea de la copia externa del volumen y vuelve a intentarlo.',
	offsite_err_job_restore:
		'Captua se detuvo antes de terminar de restaurar el volumen. Revisa la línea de la copia externa del volumen y vuelve a intentarlo.',
	offsite_err_job_lost:
		'Captua perdió el rastro de esta tarea, quizá por un reinicio. Revisa la línea de la copia externa del volumen antes de volver a intentarlo.',
	offsite_err_poll:
		'No fue posible comunicarse con Captua mientras trabajaba. Puede que siga trabajando: revisa la línea de la copia externa del volumen en unos minutos.',
	offsite_reason_no_preview_digest: (n: number): string =>
		n === 1
			? '1 vista previa todavía no tiene checksum SHA-256 registrado. Captua la conserva en la tarjeta porque ese checksum solo se puede calcular a partir del archivo en el equipo.'
			: `${formatCount(n, 'es')} vistas previas todavía no tienen checksum SHA-256 registrado. Captua las conserva en la tarjeta porque ese checksum solo se puede calcular a partir del archivo en el equipo.`,
	offsite_reason_not_in_bucket: (n: number): string =>
		n === 1 ? '1 archivo no está en la copia externa.' : `${formatCount(n, 'es')} archivos no están en la copia externa.`,
	offsite_reason_listed_without_sha1: (n: number): string =>
		n === 1
			? '1 archivo aparece en la copia externa sin checksum para compararlo.'
			: `${formatCount(n, 'es')} archivos aparecen en la copia externa sin checksum para compararlos.`,
	offsite_reason_bucket_sha1_differs: (n: number): string =>
		n === 1
			? 'En la copia externa, 1 archivo no coincide con el de la tarjeta.'
			: `En la copia externa, ${formatCount(n, 'es')} archivos no coinciden con los de la tarjeta.`,
	offsite_reason_local_file_missing: (n: number): string =>
		n === 1 ? '1 archivo no está en la tarjeta.' : `${formatCount(n, 'es')} archivos no están en la tarjeta.`,
	offsite_reason_local_file_unreadable: (n: number): string =>
		n === 1 ? 'Captua no pudo leer 1 archivo de la tarjeta.' : `Captua no pudo leer ${formatCount(n, 'es')} archivos de la tarjeta.`,
	offsite_reason_local_sha1_differs: (n: number): string =>
		n === 1
			? '1 archivo de la tarjeta ya no coincide con su copia externa.'
			: `${formatCount(n, 'es')} archivos de la tarjeta ya no coinciden con su copia externa.`,
	offsite_reason_changed: (n: number): string =>
		n === 1
			? '1 archivo se modificó o se eliminó mientras Captua trabajaba.'
			: `${formatCount(n, 'es')} archivos se modificaron o se eliminaron mientras Captua trabajaba.`,
	offsite_reason_could_not_remove: (n: number): string =>
		n === 1 ? 'Captua no pudo quitar 1 archivo de la tarjeta.' : `Captua no pudo quitar ${formatCount(n, 'es')} archivos de la tarjeta.`,
	offsite_reason_outside_storage: (n: number): string =>
		n === 1
			? '1 archivo tiene una ruta fuera del almacenamiento del equipo.'
			: `${formatCount(n, 'es')} archivos tienen una ruta fuera del almacenamiento del equipo.`,
	offsite_reason_local_file_differs: (n: number): string =>
		n === 1
			? '1 archivo tiene el mismo nombre que otro, distinto, que ya está en la tarjeta; Captua no tocó el de la tarjeta.'
			: `${formatCount(n, 'es')} archivos tienen el mismo nombre que otros, distintos, que ya están en la tarjeta; Captua no tocó los de la tarjeta.`,
	offsite_reason_copy_failed: (n: number): string =>
		n === 1
			? 'Captua no pudo traer 1 archivo de la copia externa.'
			: `Captua no pudo traer ${formatCount(n, 'es')} archivos de la copia externa.`,
	offsite_reason_sha1_differs: (n: number): string =>
		n === 1
			? '1 archivo traído de la copia externa no coincidió con su checksum; Captua lo descartó.'
			: `${formatCount(n, 'es')} archivos traídos de la copia externa no coincidieron con su checksum; Captua los descartó.`,
	offsite_reason_could_not_write: (n: number): string =>
		n === 1 ? 'Captua no pudo escribir 1 archivo en la tarjeta.' : `Captua no pudo escribir ${formatCount(n, 'es')} archivos en la tarjeta.`,
	offsite_reason_other: (n: number): string =>
		n === 1 ? '1 archivo, por otro motivo.' : `${formatCount(n, 'es')} archivos, por otros motivos.`,

	// ── Mensajes del cliente API ─────────────────────────────────────────────
	api_power_ack: 'Orden recibida. El equipo la ejecutará en unos segundos.',
	api_request_failed: 'Error en la solicitud'
};

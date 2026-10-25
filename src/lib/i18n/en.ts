// ============================================================================
// CATÁLOGO DE MENSAJES — INGLÉS
//
// Tipado contra las claves de `es.ts` (ver `Messages` en `index.ts`): una
// clave faltante o sobrante aquí es un error de compilación en `npm run check`.
// ============================================================================

import type { Messages } from './index';

import { formatCount } from '../format-count';
import { formatBytes } from '../format-bytes';

export const en: Messages = {
	// ── Common (shared across screens) ───────────────────────────────────────
	common_username_label: 'Username',
	common_password_label: 'Password',
	common_show_password: 'Show password',
	common_hide_password: 'Hide password',
	common_close: 'Close',
	common_loading: 'Loading',
	common_loading_ellipsis: 'Loading…',
	common_cancel: 'Cancel',
	common_save_changes: 'Save changes',
	common_edit: 'Edit',
	common_delete: 'Delete',
	common_actions: 'Actions',
	common_status: 'Status',
	common_retry: 'Retry',
	common_user: 'User',
	common_irreversible: 'This action cannot be undone.',
	common_capture: 'Capture',
	common_email: 'Email',
	common_confirm_password: 'Confirm password',
	record_fallback_title: (id: number | string) => `Record #${id}`,
	common_filters: 'Filters',
	common_saving: 'Saving…',
	common_deleting: 'Deleting…',
	common_creating: 'Creating…',
	common_confirm: 'Confirm',
	common_save: 'Save',

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
	login_connected: 'Server connected',
	login_offline: 'Server unreachable',
	login_error_fill_all_fields: 'Please fill in all fields',
	login_error_bad_credentials: 'Incorrect username or password',
	login_error_unknown_role: 'Your account has a role this app does not recognize. Let whoever administers the device know.',
	login_error_backend_unavailable: 'Could not reach the server. It may not be ready yet: wait a few seconds and try again.',
	login_error_locked_out: (minutes: number) =>
		minutes === 1
			? 'Too many failed attempts. Wait 1 minute before trying again.'
			: `Too many failed attempts. Wait ${minutes} minutes before trying again.`,
	login_error_locked_out_unknown: 'Too many failed attempts. Wait a few minutes before trying again.',

	// ── Session ──────────────────────────────────────────────────────────────
	session_validating: 'Verifying session…',
	session_backend_waiting: 'Waiting for the server to respond…',
	session_backend_waiting_detail: 'If you have just switched the device on, the server can take a few seconds to respond. Captua will keep trying to connect and continue as soon as it can.',

	// ── Navigation (dashboard) ───────────────────────────────────────────────
	nav_section_main: 'MAIN',
	nav_section_system: 'SYSTEM',
	nav_overview: 'Overview',
	nav_projects: 'Projects',
	nav_users: 'Users',
	nav_settings: 'Settings',
	nav_collapse_sidebar: 'Collapse sidebar',
	nav_expand_sidebar: 'Expand sidebar',
	// ── First-run guided tour (NEH-95) ────────────────────────────────────────
	nav_help: 'Help',
	tour_aria: 'Guided tour',
	tour_skip: 'Skip the tour',
	tour_next: 'Next step',
	tour_prev: 'Previous step',
	tour_finish: 'Finish',

	tour_s1_title: 'Create a project',
	tour_s1_where: 'Go to Projects › New Project.',
	tour_s1_body:
		'A project groups what will be digitized from a single fonds. It holds one or more volumes.',
	tour_s2_title: 'Create a volume',
	tour_s2_where: 'Go to Projects › your project › New volume.',
	tour_s2_body:
		'Each book, box or bundle is a volume belonging to a project. The images are stored inside it.',
	tour_s3_title: 'Capture',
	tour_s3_where: 'Go to Projects › your project › your volume › Capture.',
	tour_s3_body: 'This opens the capture screen for this volume.',
	tour_s4_title: 'Send for review',
	tour_s4_where: 'Go to Projects › your project › your volume › Send for review.',
	tour_s4_body:
		'When capture is finished, send the volume for review. Until then, capture and naming can still be corrected.',
	tour_s5_title: 'Review and approve',
	tour_s5_where: 'Go to Projects › your project › your volume.',
	tour_s5_body:
		'Review each page: approve the ones that are right and reject, with a reason, those that need retaking. To find Approve, open the spread view (the open-book icon in the right-hand bar) and tap Annotations (the speech bubble in the left-hand bar). Only reviewers and administrators can approve.',
	tour_s6_title: 'Export',
	tour_s6_where: 'Go to Projects › your project › your volume, then tap the box icon, the last one in the right-hand bar.',
	tour_s6_body:
		'With everything approved, the volume is packaged and becomes available to download.',

	nav_logout: 'Log out',

	// ── Record statuses ──────────────────────────────────────────────────────
	status_captured: 'Captured',
	status_in_review: 'In review',
	status_rejected: 'Rejected',
	status_approved: 'Approved',

	// ── Roles ────────────────────────────────────────────────────────────────
	role_admin: 'Administrator',
	role_operator: 'Operator',
	role_reviewer: 'Reviewer',
	role_admin_desc: 'Full system management',
	role_operator_desc: 'Document digitization',
	role_reviewer_desc: 'Quality control',

	// ── Camera statuses (shared) ─────────────────────────────────────────────
	camera_not_detected: 'Not detected',

	// ── Dashboard (overview) ─────────────────────────────────────────────────
	dash_greeting: (name: string) => `Hello, ${name}!`,
	dash_greeting_fallback: 'there',
	dash_subtitle_admin: 'Admin panel — System overview',
	dash_subtitle_operator: 'Operator panel — Your assigned projects',
	dash_subtitle_reviewer: 'Review panel — volumes awaiting review',
	dash_storage_alert_p1: 'Storage is at ',
	dash_storage_alert_p2: (used: string, total: string) => ` (${used} / ${total}). See `,
	dash_storage_alert_p3: ' to free up space.',
	dash_kpi_active_projects: 'Active projects',
	dash_kpi_collections: 'Volumes',
	dash_kpi_total_records: 'Total records',
	dash_in_progress: 'Digitizations in progress',
	dash_col_volume: 'Volume',
	dash_col_project: 'Project',
	dash_col_last_activity: 'Last modified',
	dash_col_actions: 'Actions',
	// Board or table view of the "in progress" block
	dash_view_label: 'View',
	dash_view_board: 'Board',
	dash_view_table: 'Table',
	dash_col_progress: 'Progress',
	dash_records_count: (n: number) => (n === 1 ? '1 record' : `${formatCount(n, 'en')} records`),
	dash_stage_capture: 'Capturing',
	dash_stage_capture_desc: 'Volumes with records not yet in review.',
	dash_stage_recapture: 'To recapture',
	dash_stage_recapture_desc: 'Volumes with rejected images that need to be captured again.',
	dash_stage_review: 'In review',
	dash_stage_review_desc: 'Volumes with records awaiting review.',
	dash_stage_approved: 'Approved',
	dash_stage_approved_desc: 'Volumes with every record approved, ready to export.',
	dash_progress_load_error: "Could not load the volumes' progress",
	dash_test_cameras: 'Test cameras',
	dash_camera_left: 'Left Scanner Camera',
	dash_camera_right: 'Right Scanner Camera',
	dash_camera_not_active: 'Not active',
	dash_camera_stop: 'Stop',
	dash_camera_test: 'Test',
	dash_camera_focus: 'Focus',
	dash_camera_capture_ok: 'Test capture taken',
	dash_camera_capture_took: (s: string) => `in ${s}s`,
	dash_camera_capture_error: 'Test capture failed',
	dash_camera_capture_not_connected: 'the camera is not connected',
	dash_camera_capture_timeout: 'the camera did not deliver the image in time',
	dash_camera_focus_error: 'Could not focus',
	dash_camera_preview_error: 'Could not get the live preview',
	dash_two_cameras: '2 cameras',
	dash_camera_missing_hint: (side: string) =>
		`${side}: not detected. Half-press its shutter button to wake it, or reseat its USB cable, then press "Reconnect cameras".`,
	dash_camera_reconnect: 'Reconnect cameras',
	dash_camera_reconnect_error: 'Could not reconnect',

	// ── Activity calendar ────────────────────────────────────────────────────
	dash_cal_title: 'Activity calendar',
	dash_cal_view: 'View',
	dash_cal_view_captures: 'Captures',
	dash_cal_view_reviews: 'Reviews',
	dash_cal_subtitle_captures: 'Images captured per day over the last six months',
	dash_cal_subtitle_reviews: 'Records approved or rejected per day over the last six months',
	dash_cal_map_captures: 'Images captured per day',
	dash_cal_map_reviews: 'Records reviewed per day',
	dash_cal_weekday_mon: 'Mon',
	dash_cal_weekday_wed: 'Wed',
	dash_cal_weekday_fri: 'Fri',
	dash_cal_less: 'Less',
	dash_cal_more: 'More',
	dash_cal_day_captures: (n: number, date: string) =>
		n === 1 ? `1 image captured on ${date}` : `${formatCount(n, 'en')} images captured on ${date}`,
	dash_cal_day_reviews: (n: number, date: string) =>
		n === 1 ? `1 record reviewed on ${date}` : `${formatCount(n, 'en')} records reviewed on ${date}`,
	dash_cal_days_captures: 'Days with captures',
	dash_cal_total_captures: 'Images captured',
	dash_cal_days_reviews: 'Days with reviews',
	dash_cal_total_reviews: 'Records reviewed',
	dash_cal_error: 'Could not load the activity calendar.',

	// ── Settings ─────────────────────────────────────────────────────────────
	config_subtitle: 'Digitization system settings',
	config_section_language: 'Language',
	config_language_label: 'Interface language',
	config_language_desc: 'Changes the language across the whole app. The page reloads to apply it; your session stays open.',
	config_section_storage: 'Storage',
	config_storage_alert_pre: 'Storage is at ',
	config_storage_alert_post: '. Consider freeing up space or expanding capacity.',
	config_storage_used: 'Storage used',
	config_storage_primary: 'Primary storage',
	config_storage_primary_desc: 'Where images are saved',
	config_badge_external: 'external',
	config_badge_experimental: 'experimental',
	config_badge_active: 'active',
	config_storage_device: 'Storage drive',
	config_storage_device_desc: 'Connect a USB drive or SD card as additional storage',
	config_external_active_pre: 'Using external storage. New images are saved to ',
	config_storage_override_invalid: 'The external storage setting was invalid and could not be read; using internal storage.',
	config_restore_progress: 'Restoring…',
	config_restore_default: 'Restore default',
	config_experimental_lead: 'Experimental feature.',
	config_experimental_body:
		'Compatibility depends on the drive’s format (exFAT, ext4). Drives formatted for Windows (NTFS) or macOS (APFS) may not work correctly. Do not use it as your only backup.',
	config_new_projects_note:
		'Only new projects will be saved to the selected drive. Existing projects stay where they are.',
	config_detecting_devices: 'Detecting drives…',
	config_no_partitions: 'No available partitions detected.',
	config_not_mounted: 'not mounted',
	config_activating: 'Activating…',
	config_activate: 'Activate',
	config_in_use: '✓ In use',
	config_unmount_tooltip: 'Unmount safely before unplugging',
	config_unmounting: 'Unmounting…',
	config_unmount: 'Unmount',
	config_mounting: 'Mounting…',
	config_mount: 'Mount',
	config_refresh_list: 'Refresh list',
	config_err_read_devices: 'Could not read storage devices.',
	config_mounted_at: (mountpoint: string) => `Mounted at ${mountpoint}.`,
	config_unknown_location: 'unknown location',
	config_err_mount: 'Could not mount the device.',
	config_storage_active: (path: string) => `Active storage: ${path}`,
	config_err_activate: 'Could not activate storage.',
	config_err_unmount: 'Could not unmount the device.',
	config_restored_default: 'Restored default storage.',
	config_err_restore: 'Could not restore default storage.',
	config_camera_backend: 'Camera backend',
	config_camera_backend_desc:
		'Which capture system is active on this unit. It is set at install time; changing it requires reconfiguring the unit.',
	config_camera_backend_unknown: 'Unavailable',
	config_section_diagnostics: 'Diagnostics',
	config_system_logs: 'System logs',
	config_system_logs_desc: 'Recent activity — last hour',
	config_logs_loading: 'Loading recent activity…',
	config_logs_empty: 'No activity recorded yet.',
	config_err_logs: 'Could not load system logs.',
	log_user_prefix: 'User ',
	log_login_success_suffix: ' logged in successfully.',
	log_login_failed_prefix: 'Failed login attempt. User: ',
	log_login_failed_detail: (detail: string) => ` (${detail}).`,
	log_created_by_m: (actor: string) => ` created by ${actor}.`,
	log_created_by_f: (actor: string) => ` created by ${actor}.`,
	log_deleted_by_m: (actor: string) => ` deleted by ${actor}.`,
	log_project_prefix: 'Project ',
	log_collection_prefix: 'Volume ',
	log_detail_suffix: (detail: string) => ` — ${detail}`,
	log_actor_system: 'system',
	config_section_maintenance: 'Maintenance',
	config_tmp_files: 'Temporary preview files',
	config_tmp_files_desc_p1: 'Deletes ',
	config_tmp_files_desc_p2: ' files from ',
	config_tmp_files_desc_p3: ' that can be left behind if the server restarts unexpectedly',
	config_cleaning: 'Cleaning…',
	config_clean_tmp: 'Clean /tmp',
	config_tmp_none: 'There were no leftover temporary files.',
	config_tmp_deleted: (n: number) => (n === 1 ? '1 file deleted.' : `${formatCount(n, 'en')} files deleted.`),
	config_err_clean: 'Could not delete the files.',
	config_section_power: 'Power',
	config_shutdown_label: 'Shut down the scanner',
	config_shutdown_desc:
		'Shuts the scanner down safely. Always use this before unplugging the power, to avoid damaging the SD card.',
	config_shutdown_btn: 'Shut down',
	config_reboot_label: 'Restart the scanner',
	config_reboot_desc: 'Restarts the scanner. The app will reload automatically once it is back.',
	config_reboot_btn: 'Restart',
	config_offline_note: 'This system runs fully offline. Data is stored locally on the device.',
	config_confirm_reboot_title: 'Restart the scanner?',
	config_confirm_shutdown_title: 'Shut down the scanner?',
	config_confirm_reboot_desc:
		'The scanner will restart and the app will be back in a moment. Do not unplug the power during the restart.',
	config_confirm_shutdown_desc:
		'Wait for the screen to go dark before unplugging the power. Any capture in progress must finish first.',
	config_sending: 'Sending…',
	config_confirm_reboot_btn: 'Yes, restart',
	config_confirm_shutdown_btn: 'Yes, shut down',
	config_shutting_down: 'Shutting down the scanner…',
	config_shutdown_overlay_desc: 'You can unplug the power once the screen goes dark.',
	config_rebooting: 'Restarting the scanner…',
	config_reboot_overlay_desc: 'The app will be back in a moment. Do not unplug the power.',
	config_err_power_unavailable: 'Power control is not available on this scanner.',
	config_err_session_expired: 'Your session expired. Log in again to shut down or restart.',
	config_err_operation: 'The operation could not be completed.',

	// ── Users ────────────────────────────────────────────────────────────────
	users_title: 'User Management',
	users_subtitle: 'Access control and staff roles',
	users_new: 'New User',
	users_search_placeholder: 'Search users…',
	users_filter_role: 'Role',
	users_status_active: 'Active',
	users_status_inactive: 'Inactive',
	users_loading: 'Loading users…',
	users_err_load: 'Could not load users',
	users_empty_filtered: 'No results for the current filters',
	users_empty: 'No users yet',
	users_col_registered: 'Registered',
	users_modal_edit_title: 'Edit user',
	users_modal_create_title: 'Create new user',
	users_modal_edit_subtitle: 'Edit the user’s details',
	users_modal_create_subtitle: 'Add a user to the system',
	users_field_username: 'Username',
	users_ph_username: 'e.g. maria.garcia',
	users_ph_email: 'e.g. maria@archive.org',
	users_ph_password: 'Enter password',
	users_ph_confirm: 'Confirm password',
	users_field_account_status: 'Account status',
	users_field_assign_role: 'Assign role',
	users_create_btn: 'Create user',
	users_err_create: 'Could not create user',
	users_err_save: 'Could not save',
	users_val_username_required: 'Username is required.',
	users_val_password_required: 'Password is required.',
	users_val_password_mismatch: 'Passwords do not match.',
	users_val_email_format: 'Invalid email format',
	users_delete_title: 'Delete user?',
	users_delete_confirm_pre: 'Are you sure you want to delete ',
	users_delete_btn: 'Yes, delete',

	// ── Projects (list) ──────────────────────────────────────────────────────
	proj_title: 'Project Management',
	proj_subtitle: 'Fonds, series, sections',
	proj_new: 'New Project',
	proj_search_placeholder: 'Search by name or code…',
	proj_loading: 'Loading projects…',
	proj_empty_search: 'No results for your search',
	proj_empty: 'No projects yet',
	proj_create_first: 'Create your first project',
	proj_col_project: 'Project',
	proj_col_reference: 'Reference',
	proj_col_start_date: 'Start Date',
	proj_status_in_progress: 'In Progress',
	proj_status_started: 'Started',
	proj_status_review: 'Review',
	proj_status_paused: 'Paused',
	proj_status_completed: 'Completed',
	proj_modal_edit_title: 'Edit Project',
	proj_field_name: 'PROJECT NAME',
	proj_ph_name: 'e.g. Colonial Fonds 2024',
	proj_field_description: 'DESCRIPTION',
	proj_ph_description: 'Brief description of the contents',
	proj_field_fonds: 'FONDS',
	proj_ph_fonds: 'e.g. Archivo Anexo: Grupo I',
	proj_field_series: 'SERIES / SECTION',
	proj_ph_series: 'e.g. Customs',
	proj_field_refcode: 'ARCHIVAL REFERENCE CODE',
	proj_ph_refcode: 'e.g. CO.AGN.SAA-I.1.1.1',
	proj_create_btn: 'Create project',
	proj_err_create: (msg: string) => `Could not create the project: ${msg}`,
	proj_err_delete: (msg: string) => `Could not delete the project: ${msg}`,
	proj_delete_title: 'Delete project',
	proj_checking_contents: 'Checking contents…',
	proj_not_empty: 'This project is not empty',
	proj_contains_pre: 'It contains ',
	proj_collections_count: (n: number) => (n === 1 ? '1 volume' : `${formatCount(n, 'en')} volumes`),
	proj_contains_mid: ' with ',
	proj_images_count: (n: number) => (n === 1 ? '1 image' : `${formatCount(n, 'en')} images`),
	proj_delete_warning:
		'If you delete it without moving them, all its contents will be permanently lost.',
	proj_move_label: 'MOVE VOLUMES TO ANOTHER PROJECT (OPTIONAL)',
	proj_move_none: '— Delete without moving —',
	proj_move_hint: (n: number) =>
		n === 1
			? 'The volume will be moved before the project is deleted.'
			: `The ${formatCount(n, 'en')} volumes will be moved before the project is deleted.`,
	proj_delete_confirm_pre: 'Are you sure you want to delete ',
	proj_deleting_moving: 'Moving and deleting…',
	proj_move_and_delete: 'Move and delete',
	proj_delete_without_moving: 'Delete without moving',

	// ── Project detail (volumes) ───────────────────────────────────
	pd_subtitle: 'Manage this project’s volumes',
	pd_new_collection: 'New volume',
	pd_back: 'Back to Projects',
	pd_kpi_total_records: 'Total records',
	pd_members: 'Collaborators',
	pd_loading: 'Loading volumes…',
	pd_empty_search: 'No results',
	pd_empty: 'No volumes yet',
	pd_create_first: 'Create the first volume',
	pd_col_collection: 'Volume',
	pd_col_records: 'No. of Records',
	pd_col_date: 'Date',
	pd_status_active: 'Active',
	pd_status_completed: 'Completed',
	pd_modal_edit_title: 'Edit Volume',
	pd_modal_create_title: 'New Volume',
	pd_modal_project: (name: string) => `Project: ${name}`,
	pd_field_title: 'TITLE',
	pd_ph_title: 'e.g. Religious Missions',
	pd_field_refcode: 'REFERENCE CODE',
	pd_ph_refcode: 'e.g. CO.AGN.SAA-I.1.1.2',
	pd_field_creator: 'CREATOR NAME',
	pd_ph_creator: 'Person or institution that created the documents',
	pd_field_dates: 'CREATION DATES',
	pd_date_from: 'FROM',
	pd_date_to: 'TO (optional)',
	pd_ph_date_from: 'e.g. 1987, 1987-04 or 1987-04-15',
	pd_ph_date_to: 'e.g. 1990, 1990-12 or 1990-12-31',
	pd_field_notes: 'NOTES / DESCRIPTION',
	pd_ph_notes: 'Brief description or remarks…',
	pd_create_btn: 'Create Volume',
	pd_val_start_date:
		'Invalid start date. Use a year (YYYY), year-month (YYYY-MM), or full date (YYYY-MM-DD).',
	pd_val_end_date:
		'Invalid end date. Use a year (YYYY), year-month (YYYY-MM), or full date (YYYY-MM-DD).',
	pd_val_date_range: 'The end date cannot be earlier than the start date.',
	pd_err_create_collection: 'Could not save the volume. Try again.',
	pd_err_delete_collection: 'Could not delete the volume. Try again.',
	pd_err_delete_has_subvolumes: 'This volume cannot be deleted because it still contains other volumes.',
	pd_err_move_under_review: (n: number) =>
		n === 1
			? 'One record in this volume is under review, so it cannot be moved. First withdraw the volume from review with "Withdraw from review".'
			: `${formatCount(n, 'en')} records in this volume are under review, so they cannot be moved. First withdraw the volume from review with "Withdraw from review".`,
	pd_err_delete_not_empty: 'This volume still has records. Move them to another volume before deleting it.',
	// Refusals of a file change while another process reads the files
	// (volume-refusals.ts).
	vol_err_volume_busy:
		'Records were being added to or removed from this volume when you asked for the change, so Captua changed nothing. Try again in a moment.',
	vol_err_files_being_read:
		'Captua is preparing a file of this volume for the offsite copy. Try again in a moment.',
	vol_err_files_being_read_project:
		'Captua is preparing a file of a volume in this project for the offsite copy. Try again in a moment.',
	vol_err_export_running: 'Captua is exporting this volume. Wait until the export is finished, then try again.',
	vol_err_export_in_subtree:
		'Captua is exporting this volume or a volume inside it. Wait until the export is finished, then try again.',
	vol_err_export_in_project:
		'Captua is exporting a volume of this project. Wait until the export is finished, then try again.',
	vol_err_files_changing:
		'Captua is moving, renaming or deleting files of this volume. Try the export again in a moment.',
	vol_err_stored_offsite: (n: number): string =>
		n === 1
			? 'One record has files already stored offsite under this volume, so it cannot be moved to another volume.'
			: `${formatCount(n, 'en')} records have files already stored offsite under this volume, so they cannot be moved to another volume.`,
	pd_member_implicit: 'Implicit access (cannot be removed)',
	pd_member_remove: 'Remove collaborator',
	pd_member_add: 'Add collaborator',
	pd_member_select: '— Select a user —',
	pd_member_adding: 'Adding…',
	pd_member_add_btn: 'Add',
	pd_err_member_add: 'Could not add collaborator',
	pd_err_member_remove: 'Could not remove collaborator',
	pd_delete_collection_title: 'Delete volume',
	pd_delete_loading: 'Loading details…',
	pd_col_not_empty: 'This volume is not empty',
	pd_records_count: (n: number) => (n === 1 ? '1 record' : `${formatCount(n, 'en')} records`),
	pd_delete_warning: 'To delete it, first move its records to another volume.',
	pd_move_label: 'MOVE THE RECORDS TO',
	pd_move_none: '— Choose a volume —',
	pd_move_hint_none: 'Choose a target volume to delete this one.',
	pd_move_hint_selected: 'The records will be moved to the selected volume before deleting.',
	pd_delete_confirm_pre: 'Are you sure you want to delete the volume ',
	pd_field_stem: 'FILE NAME STEM',
	pd_ph_stem: 'e.g. co-ahrb-aht-003',
	pd_stem_help:
		"The start of every file name in this volume, normally the volume's Fisqua reference code. It cannot be changed once images have been captured.",
	pd_stem_locked:
		'Images have been captured into this volume under this stem, so the stem cannot be changed.',
	pd_val_stem_required: 'The stem is required.',
	pd_val_stem_too_long: (max: number) => `The stem can be at most ${max} characters long.`,
	pd_val_stem_pattern:
		'Use only lowercase letters a to z and digits, separated by single hyphens, with no hyphen at the start or end.',
	pd_err_stem_differs_from_reference_code: (externalId: string, stem: string): string =>
		`The stem has to be the volume's Fisqua reference code, "${externalId}"; "${stem}" is different. Use "${externalId}" as the stem.`,
	pd_err_stem_taken: 'Another volume already uses this stem.',
	pd_err_stem_fixed: 'Images have already been captured into this volume, so its stem cannot be changed.',
	pd_no_stem_badge: 'No stem',
	pd_no_stem_title: 'This volume has no stem. Give it one before capturing.',
	pd_delete_stem_reserved:
		'This volume cannot be deleted: it has a stem and images have been captured into it. Captua keeps it so that the stem is never given to another volume.',

	// ── Volume workspace (review) ──────────────────────────────────
	col_back_to_project: 'Back to project',
	col_breadcrumb_nav: 'Navigation',
	col_open_in_camera: 'Open the capture screen for this volume',
	col_live_preview: 'Capture',
	col_current_user: 'Current user',
	col_loading_images: 'Loading images…',
	status_captured_plural: 'Captured',
	status_rejected_plural: 'Rejected',
	status_approved_plural: 'Approved',
	col_no_records: 'No records',
	col_approve: 'Approve',
	col_reject: 'Reject',
	col_mark_error_btn: 'Mark error',
	col_add_note: 'Add note',
	col_reason_done: 'Done',
	col_reject_error: 'Could not reject the record. Please try again.',
	col_reject_needs_reason: 'You must select at least one error.',
	col_reject_other_needs_note: 'A rejection for "Other" needs a note. Describe the problem in Add note.',
	col_reject_comment_too_long: (max: number): string =>
		`Could not reject the record: the note can be at most ${formatCount(max, 'en')} characters long, which is what Fisqua keeps. Shorten it and try again.`,
	col_annotation_note_count: (n: number, max: number): string =>
		`${formatCount(n, 'en')} of ${formatCount(max, 'en')} characters`,
	col_reject_other_note_error: 'Could not reject the record: a rejection for "Other" needs a note that describes the problem.',
	col_review_approve_error: 'Could not approve the record. Please try again.',
	// ── Send for review (NEH-260) ───────────────────────────────────
	col_handover_send: 'Send for review',
	col_handover_send_new: (n: number) => (n === 1 ? 'Send 1 new record' : `Send ${formatCount(n, 'en')} new records`),
	col_handover_take_back: 'Withdraw from review',
	col_handover_confirm_title: 'Send the volume for review?',
	col_handover_confirm_body: (n: number) =>
		n === 1
			? 'The captured record will be in review. While it is, you cannot move it to another volume.'
			: `The ${formatCount(n, 'en')} captured records will be in review. While they are, you cannot move them to another volume.`,
	col_handover_confirm_undo: (n: number) =>
		n === 1
			? 'If you make a mistake, you can withdraw it with "Withdraw from review".'
			: 'If you make a mistake, you can withdraw them with "Withdraw from review".',
	col_handover_confirm_submit: 'Send',
	col_handover_refused_title: 'Could not send the volume',
	col_handover_refused_body: (n: number) =>
		n === 1
			? 'One record cannot be sent yet because it has no image or its image was rejected. Capture its image again and send the volume again.'
			: `${formatCount(n, 'en')} records cannot be sent yet because they have no image or their image was rejected. Capture their images again and send the volume again.`,
	col_handover_refused_unchanged: 'No records were changed.',
	col_handover_sent: (n: number) => (n === 1 ? '1 record was sent for review.' : `${formatCount(n, 'en')} records were sent for review.`),
	col_handover_nothing_to_send: 'There were no captured records to send.',
	col_handover_send_error: 'Could not send the volume for review. Please try again.',
	col_takeback_confirm_title: 'Withdraw the volume from review?',
	col_takeback_confirm_body: (n: number) =>
		n === 1
			? 'The record in review will be Captured again, and you can keep working on it.'
			: `The ${formatCount(n, 'en')} records in review will be Captured again, and you can keep working on them.`,
	col_takeback_confirm_kept: (a: number, r: number) => {
		if (a > 0 && r > 0) {
			const ap = a === 1 ? 'The approved record' : `The ${formatCount(a, 'en')} approved records`;
			const rp = r === 1 ? 'the rejected one' : `the ${formatCount(r, 'en')} rejected ones`;
			return `${ap} and ${rp} stay as they are, because they have already been reviewed.`;
		}
		const n = a > 0 ? a : r;
		const word = a > 0 ? 'approved' : 'rejected';
		return n === 1
			? `The ${word} record stays as it is, because it has already been reviewed.`
			: `The ${formatCount(n, 'en')} ${word} records stay as they are, because they have already been reviewed.`;
	},
	col_takeback_confirm_submit: 'Withdraw',
	col_takeback_done: (n: number) => (n === 1 ? '1 record was withdrawn from review.' : `${formatCount(n, 'en')} records were withdrawn from review.`),
	col_takeback_nothing: 'There were no records in review to withdraw.',
	col_takeback_error: 'Could not withdraw the volume from review. Please try again.',
	col_review_not_sent_hint: 'This record is not in review. You can approve or reject it once it is sent for review.',
	col_records_reload_error: 'The change was saved, but the list of records could not be refreshed. Reload the page to see the records’ current state.',
	col_recapture_btn: 'Recapture image',
	col_annotation_comment_placeholder: 'Add a comment (optional)...',
	col_annotation_note_required_placeholder: 'Describe the problem (required for "Other")...',
	col_review_confirm_approve: 'Are you sure you want to approve this image?',
	col_review_confirm_reject: 'Are you sure you want to reject this image?',
	col_review_confirm_undo_approve: 'Are you sure you want to undo the approval of this image?',
	col_review_confirm_undo_reject: 'Are you sure you want to undo the rejection of this image?',
	col_pending_recapture: 'Pending recapture',
	col_approved_badge: 'Approved',
	col_renumber: 'Renumber',
	col_reorder_done: 'Done',
	col_reorder: 'Reorder',
	col_thumb_size: 'Thumbnail size',
	col_columns_aria: 'Number of columns',
	col_filter_by_status: 'Filter by status:',
	col_clear_filter: '× Clear',
	col_filters_disabled_reorder: 'Filters are disabled while reordering to avoid corrupting the sequence',
	col_image_n: (i: number) => `Image ${i}`,
	col_renumber_modal_title: 'Renumber the records?',
	col_renumber_desc:
		"Captua will number this volume's records from 1, in the order they appear now, without renaming any file.",
	col_renumbering: 'Renumbering…',
	col_renumber_error: 'Captua could not renumber the records of this volume. Try again.',
	col_renumber_done: (n: number) =>
		n === 0
			? 'This volume has no records to renumber.'
			: n === 1
				? '1 record renumbered.'
				: `${formatCount(n, 'en')} records renumbered.`,
	col_reorder_stale:
		'Records were added to or removed from this volume while you were reordering it, so Captua did not save the new order. Captua has loaded the saved order again.',
	col_reorder_error: 'Captua could not save the new order. Captua has loaded the saved order again.',
	col_delete_record_error_title: 'Could not delete the record',
	col_delete_record_retry: 'Try again in a moment.',
	col_prev: 'Previous',
	col_next: 'Next',
	col_left_page_short: 'Left page',
	col_right_page_short: 'Right page',
	col_left_page: 'Left page',
	col_right_page: 'Right page',
	col_image_alt: (id: number | string) => `Image ${id}`,
	col_record_locked: (statusLabel: string) => `Record locked (${statusLabel})`,
	col_status_in_review_lc: 'in review',
	col_status_approved_lc: 'approved',
	col_retake: 'Retake',
	col_retake_confirm: 'Retake this record from the capture screen? Captua keeps the current images as earlier versions.',
	col_delete_record_confirm: 'Permanently delete this record and all its images?',
	badge_left: 'L',
	badge_right: 'R',
	col_err_blurry: 'Motion blur',
	col_err_glare: 'Glare/reflection',
	col_err_shadows: 'Shadows',
	col_err_focus: 'Out of focus',
	col_err_exposure: 'Exposure',
	col_err_debris: 'Debris on surface',
	col_err_framing: 'Framing',
	col_err_obstruction: 'Obstruction',
	col_err_other: 'Other',
	// One line beneath each reason in "Mark error", saying what it covers.
	col_err_blurry_gloss: 'The camera or the page moved during the shot, so the image is smeared.',
	col_err_glare_gloss: 'Light reflects off the page or the glass and hides part of it.',
	col_err_shadows_gloss: 'A shadow falls across the page and darkens or hides part of it.',
	col_err_focus_gloss: 'The camera focused in front of or behind the page, so the text is soft.',
	col_err_exposure_gloss: 'The whole image is too dark or too bright to read.',
	col_err_debris_gloss: 'Dust, hair or dirt on the page, the glass or the lens shows in the image.',
	col_err_framing_gloss: 'Part of the page is cut off, or the page sits badly in the frame.',
	col_err_obstruction_gloss: 'A finger, a weight or another object covers part of the page.',
	col_err_other_gloss: 'Any other problem. Describe it in the note.',
	col_tab_info: 'Image info',
	col_tab_edit: 'Preview controls',
	col_tab_comments: 'Annotations',
	col_no_images: 'No images',
	col_info_format: 'Format',
	col_info_dimensions: 'Dimensions',
	col_info_size: 'Size',
	col_info_sequence: 'Sequence',
	col_info_file: 'File',
	col_info_captured: 'Captured',
	col_select_record: 'Select a record',
	col_rotate: 'Rotate',
	col_rotate_left: 'Left',
	col_rotate_right: 'Right',
	col_slider_reset: 'Reset to zero',
	col_brightness: 'Brightness',
	col_contrast: 'Contrast',
	col_saturation: 'Saturation',
	col_no_annotations: 'No annotations — add a note or flag an error',
	col_delete_annotation: 'Delete annotation',
	col_annotation_load_error: 'Could not load annotations. Please try again.',
	col_annotation_save_error: 'Could not save the annotation. Please try again.',
	col_annotation_delete_error: 'Could not delete the annotation. Please try again.',
	col_role_left: 'Left image',
	col_role_right: 'Right image',
	col_role_overview: 'Overview',
	col_empty_collection: 'No images in this volume',
	col_col_title: 'Title',
	col_col_images: 'Images',
	col_col_captures: 'Captures',
	col_view_list: 'List view',
	col_view_spread: 'Spread view',
	col_view_spread_aria: 'Open-book view',
	col_view_grid: 'Grid view',
	col_zoom_in: 'Zoom in',
	col_zoom_out: 'Zoom out',
	col_fit_screen: 'Fit to screen',
	col_fit_screen_aria: 'Fit to screen',
	col_zoom_actual: 'Actual size (1:1)',
	col_zoom_actual_aria: 'Actual size (1:1)',
	col_export_available: 'Export BagIt (all approved)',
	col_export_unavailable: 'Export BagIt (requires all records approved)',
	col_export: 'Export BagIt',
	col_err_export: 'Export failed',
	col_export_generating: 'Generating BagIt…',
	col_export_copying: 'Copying images and computing checksums',
	col_export_done: 'Export complete',
	col_download_zip: 'Download ZIP',
	col_download_image: 'Download image',
	// NEH-139: RAW images in the inspection viewers
	raw_preview_badge: 'Preview (RAW)',
	raw_preview_hint: 'The browser cannot display RAW files. This is the JPEG preview stored beside the original.',
	raw_thumbnail_badge: 'Thumbnail (RAW)',
	raw_thumbnail_hint: 'The browser cannot display RAW files, and this file has no full-size preview. This is its low-resolution thumbnail.',
	raw_unviewable_title: 'This format cannot be displayed',
	raw_unviewable_body: 'The browser cannot display RAW files, and this file has no preview.',
	image_original_stored: 'The original file is stored on the device.',
	image_file_missing: 'The file for this image was not found.',
	// NEH-139: non-RAW images the browser cannot display (TIFF) or that fail to load
	image_thumbnail_badge: 'Thumbnail',
	image_thumbnail_hint_format: (ext: string) =>
		`The browser cannot display ${ext} files. This is the file's low-resolution thumbnail.`,
	image_thumbnail_hint: 'This file could not be displayed at full size. This is its low-resolution thumbnail.',
	image_unviewable_title: 'This image cannot be displayed',
	image_unviewable_body_format: (ext: string) =>
		`The browser cannot display ${ext} files, and this file's thumbnail could not be displayed either.`,
	image_unviewable_body: 'Neither this file nor its thumbnail could be displayed.',
	// NEH-248: an image freed from the card (RecordImageDisplay.svelte)
	freed_title: 'Image stored offsite',
	freed_where: 'This file is kept outside the scanner, in the offsite copy, to leave room on the SD card.',
	freed_nothing_lost: 'Nothing is lost: Captua verified the offsite copy before it removed the file from the SD card.',
	freed_restore_hint: 'To see it at full size, an administrator can restore the volume to the SD card.',
	freed_thumbnail_note: 'What you see is the thumbnail, which Captua keeps on the scanner.',
	col_export_blocked_title: 'Cannot export yet',
	col_export_blocked_desc: 'All records must be approved before exporting. The following are not approved yet:',
	col_download_choose_title: 'Export or download',
	col_download_choose_desc: 'Choose what to get from this volume',
	col_bagit_option_title: 'Archive package (BagIt)',
	col_bagit_option_desc: 'Certified final version: images, checksums, and manifest.',
	col_bagit_requires_approval: 'Requires all approved',
	col_images_option_title: 'Images (ZIP)',
	col_images_option_desc: 'Just the image files, no preservation metadata.',
	col_images_always: 'Available anytime',
	col_zip_generating: 'Preparing images ZIP…',
	col_zip_error: 'Could not generate the ZIP',
	col_zip_freed:
		'Some images of this volume are stored offsite and are not on the SD card, so they cannot be included in the ZIP. An administrator can restore the volume from "Space on the SD card".',
	col_export_freed: (n: number): string =>
		`${n === 1 ? 'One file of this volume is stored offsite and is not' : `${formatCount(n, 'en')} files of this volume are stored offsite and are not`} on the SD card, so Captua cannot build the package. To export the volume, an administrator must first restore it from "Space on the SD card", next to the offsite copy line.`,
	// ── Capture manifest for Fisqua ─────────────────────────────────────────
	col_manifest_option_title: 'Capture manifest (Fisqua)',
	col_manifest_option_desc: 'A JSON file that tells Fisqua which pages of this volume are in the offsite copy.',
	col_manifest_requires: 'Requires sending for review and a complete offsite copy',
	col_manifest_preparing: 'Preparing the capture manifest…',
	col_manifest_refused_title: 'The capture manifest cannot be exported yet',
	col_manifest_refused_body: 'Fisqua would refuse this file. Resolve the following, then export it again.',
	col_manifest_records: (ids: number[]): string => {
		const shown = ids.slice(0, 20).join(', ');
		const rest = ids.length - 20;
		return `${ids.length === 1 ? 'Record' : 'Records'} ${shown}${rest > 0 ? ` and ${formatCount(rest, 'en')} more` : ''}`;
	},
	col_manifest_rule_tenant_missing:
		'No tenant is configured on this scanner, so the manifest has no place in the offsite copy. Ask whoever manages the scanner to set DTK_OFFSITE_TENANT and restart Captua.',
	col_manifest_rule_tenant_invalid:
		'The tenant configured on this scanner is not valid. Ask whoever manages the scanner to correct DTK_OFFSITE_TENANT and restart Captua.',
	col_manifest_rule_no_stem:
		'The volume has no file name stem, so its images have no names Fisqua can read. Give the volume its stem (its Fisqua reference code).',
	col_manifest_rule_no_project: 'The volume is not in a project, and the manifest names its project. Move the volume into a project.',
	col_manifest_rule_records_captured:
		'Some records are still captured, so the volume has not been sent for review. Send it for review when its capture is finished.',
	col_manifest_rule_sequence_missing: 'Some records have no sequence number. Renumber the volume.',
	col_manifest_rule_sequence_repeated: 'Some records share a sequence number. Renumber the volume.',
	col_manifest_rule_roles_invalid:
		'Some records have neither one single image nor a left image, a right image or both. Retake them so each has one single image or a left and right pair.',
	col_manifest_rule_capture_id_missing:
		'Some images have no capture id, so the capture manifest holds no checksum for them. Retake those records.',
	col_manifest_rule_not_uploaded:
		'Some images are not yet verified in the offsite copy. Wait for Captua to finish copying and verifying them, then export again.',
	col_manifest_rule_preview_not_uploaded:
		'The previews of some RAW images are not yet verified in the offsite copy. Wait for Captua to finish copying and verifying them, then export again.',
	col_manifest_rule_raw_without_preview:
		'Some RAW images have no preview, in the offsite copy or on the SD card. Fisqua cannot read a RAW file, so those records have to be captured again.',
	col_manifest_rule_upload_refused:
		'Captua could not upload some files to the offsite copy: they are shown as "need attention" in the volume\'s offsite copy line. Resolve them, then export again.',
	col_manifest_rule_key_outside:
		"Some files are stored offsite outside this volume's folders. Captua never renames a file in the offsite copy, so those records have to be captured again.",
	col_manifest_rule_filename_form:
		"Some images are stored offsite under names that do not follow this volume's file names. Captua never renames a file in the offsite copy, so those records have to be captured again.",
	col_manifest_rule_page_key_repeated:
		'More than one image is stored under the same name, and Fisqua names each page by it. Those records have to be captured again.',
	col_manifest_rule_sha256_missing:
		'The capture manifest holds no valid SHA-256 checksum for some images. Ask whoever manages the scanner to run the integrity check on the volume and resolve what it reports.',
	col_manifest_rule_preview_sha256_missing:
		'No SHA-256 checksum is recorded for the previews of some RAW images, which were captured before Captua recorded it. Ask whoever manages the scanner to run backfill-preview-digests for this volume on the scanner, then export again.',
	col_manifest_rule_no_pages:
		'No record sent for review or approved has an image, so Fisqua has no page to register. Send records with images for review.',
	col_manifest_rule_reference_code_differs:
		"The volume's Fisqua reference code differs from its stem, so Captua does not send it to Fisqua. The reference code cannot be changed here: ask whoever manages the scanner to make the reference code and the stem agree, then withdraw the volume from review and send it for review again.",
	col_manifest_rule_other: 'Fisqua would refuse the file for another reason.',
	col_manifest_err_title: 'Could not download the capture manifest',
	col_manifest_err_not_found: 'Captua could not find this volume. Go back to the project and open it again.',
	col_manifest_err: 'Captua could not prepare the capture manifest. Try again.',
	bug_report_button: 'Report a problem',
	bug_report_title: 'Report a problem',
	bug_report_desc: 'Tell us what happened. GitHub will open with a prefilled report.',
	bug_field_what: 'What happened?',
	bug_field_what_ph: 'Describe the problem (at least 10 characters)',
	bug_field_expected: 'What did you expect to happen?',
	bug_field_steps: 'Steps to reproduce',
	bug_field_optional: 'Optional',
	bug_attach_title: 'What we will attach',
	bug_attach_context: 'Environment info (route, build, browser, etc.)',
	bug_attach_errors: 'Recent errors (with sensitive data hidden)',
	bug_min_chars: 'Write at least 10 characters.',
	bug_submit: 'Open report on GitHub',
	bug_crash_title: 'Something went wrong',
	bug_crash_desc: 'You can report this problem so we can look into it.',
	bug_report_this: 'Report this problem',

	// ── First-time setup ─────────────────────────────────────────────────────
	setup_title: 'First-time setup',
	setup_subtitle: 'Create the administrator account.',
	setup_ph_username: 'e.g. admin',
	setup_ph_email: 'admin@example.com',
	setup_ph_password: 'At least 8 characters',
	setup_ph_confirm: 'Repeat the password',
	setup_submit: 'Create administrator account',
	setup_submit_loading: 'CREATING ACCOUNT',
	setup_creating: 'Creating account',
	setup_success: 'Account created! Redirecting to login…',
	setup_err_exists: 'That username or email already exists',
	setup_err_create: 'Could not create the account. Check the server connection.',
	setup_token_label: 'Bootstrap token',
	setup_ph_token: 'Paste the device bootstrap token',
	setup_token_hint: 'Required on a provisioned device; leave blank in development.',
	setup_err_token: 'Invalid or missing bootstrap token. Check the token on the device.',
	setup_err_unavailable: 'Setup is unavailable: this unit has no bootstrap token configured.',
	setup_val_username_required: 'Username is required',
	setup_val_username_short: 'Username must be at least 3 characters',
	setup_val_email_format: 'Invalid email format',
	setup_val_password_required: 'Password is required',
	setup_val_password_short: 'Password must be at least 8 characters',
	setup_val_password_mismatch: 'Passwords do not match',

	// ── Welcome ──────────────────────────────────────────────────────────────
	welcome_title: 'Welcome',
	welcome_start: 'Get started',

	// ── Camera controls ──────────────────────────────────────────────────────
	cam_panel_title: 'Camera Controls',
	cam_panel_expand_aria: 'Camera controls',
	cam_panel_collapse: 'Collapse panel',
	cam_mode_single: 'Single Camera',
	cam_mode_double: 'Double Camera',
	cam_calibrated: 'Calibrated',
	cam_none_detected: 'No cameras detected',
	cam_connected: 'Connected',
	cam_fallback_name: 'Camera',
	cam_reconnect: 'Reconnect cameras',
	cam_reconnect_error: 'Could not reconnect',
	cam_section_basic: 'Basic',
	cam_section_basic_info: 'How the page is oriented, how much light comes in, and the format it is saved in.',
	cam_section_focus: 'Focus',
	cam_section_focus_info: 'Adjust so the image comes out sharp.',
	cam_section_settings: 'Colour and exposure',
	cam_section_settings_info: 'Adjust so the document looks the colour it really is.',
	cam_live_controls_unavailable: 'Appear when a connected camera supports them.',
	cam_capabilities_failed: 'The capture system is not available, so these controls cannot be shown. Tap Reconnect cameras; if nothing changes, restart the unit.',
	cam_orientation: 'Orientation',
	cam_rotate_ccw: 'Rotate 90° CCW',
	cam_rotate_cw: 'Rotate 90° CW',
	cam_shutter: 'Shutter Speed',
	cam_aperture: 'Aperture',
	cam_format: 'Format',
	cam_focusing: 'Focusing…',
	cam_autofocus: 'Auto focus',
	cam_manual_focus: 'Manual focus',
	cam_focus_slider_aria: 'Focus position (diopters)',
	cam_focus_infinity: 'Infinity (far)',
	cam_focus_macro: 'Macro (10 cm)',
	cam_zoom_reset_aria: 'Reset zoom to 1×',
	cam_zoom_reset: 'reset',
	cam_zoom_slider_aria: 'Camera zoom (ScalerCrop)',
	cam_dslr_note_p1: 'Set the lens barrel switch to ',
	cam_dslr_note_p2: ' before capturing.',
	cam_dslr_note_p3: 'AF causes ~12 s PTP hangs on Canon DSLRs.',
	cam_dslr_af_warning: (mode: string) => `Lens reports ${mode}. Captures can hang until the lens switch is on MF.`,
	cam_wb: 'White Balance',
	cam_wb_calibrate_aria: 'Calibrate white balance automatically (AWB convergence)',
	cam_wb_cancel_aria: 'Cancel white balance sampling',
	cam_wb_sample_aria: 'Sample white balance: tap a white area in the preview (experimental)',
	cam_wb_hint: 'Tap a white or neutral gray area in the preview.',
	cam_temperature: 'Temperature',
	cam_tint: 'Tint',
	cam_exposure: 'Exposure',
	cam_histogram: 'Histogram',
	cam_histogram_info: 'Check that no detail is lost in the light or the dark areas.',
	cam_histogram_empty: 'Appears when the preview is showing an image.',
	cam_focus_result: (dpt: string) => `Focus: ${dpt} dpt`,
	cam_af_failed: 'Autofocus failed',
	cam_af_error: 'Autofocus error',
	cam_wb_calibrated: (temp: string) => `WB calibrated${temp}`,
	cam_wb_failed: 'WB calibration failed',
	cam_wb_error: 'WB calibration error',
	cam_wb_invalid_pixel: 'Invalid pixel — pick a lit area',
	cam_wb_sampled: (r: string, b: string) => `WB sampled (R=${r}, B=${b})`,
	cam_wb_save_error: 'Could not save WB',
	cam_wb_apply_error: 'Could not apply WB',

	// ── Live view ────────────────────────────────────────────────────────────
	lv_reconnecting: 'Reconnecting to the camera…',
	lv_camera_left_alt: 'Left camera',
	lv_camera_right_alt: 'Right camera',
	lv_wb_click_hint: 'Click a white or neutral gray area',
	lv_no_signal_left: 'No signal — Left',
	lv_no_signal_right: 'No signal — Right',
	lv_check_hw: 'Check the hardware connection',
	lv_camera_missing: 'Camera not detected. Half-press its shutter button or reseat the USB cable, then press "Reconnect cameras".',
	lv_rotate_ccw: 'Rotate left',
	lv_rotate_cw: 'Rotate right',
	lv_controls_collapse: 'Hide controls',
	lv_controls_expand: 'Show controls',
	lv_grid_settings: 'Grid settings',
	lv_swap_orientation: 'Swap left and right',
	lv_orientation_swapped: 'Swap left and right (camera [1] is now on the left)',
	lv_orientation_normal: 'Swap left and right (camera [0] is now on the left)',
	lv_grid_modal_title: 'Grid and Guides',
	lv_grid_modal_subtitle: 'Turn on visual framing aids.',
	lv_grid: 'Grid',
	lv_grid_desc: 'Show 3×3 capture grid',
	lv_guides: 'Guide lines',
	lv_guides_desc: 'Draggable guides (red)',
	lv_capture_key_current: (chord: string) => `Capture key: ${chord}`,
	lv_capture_key_desc: 'The pedal or key that starts a capture on this page.',
	lv_capture_key_learn: 'Learn from pedal',
	lv_capture_key_learning: 'Press the pedal or key now…',
	lv_capture_key_reset: 'Reset to default',
	lv_capture_key_note: 'While bound to capture, this key stops activating whatever button has focus on this page. Make sure the pedal is in ordinary single-key mode, not a macro or repeat mode.',
	lv_capture_key_modifier_only: (modifier: string) => `That device only sent ${modifier}. Press the pedal's actual key, not just a modifier.`,
	lv_capture_key_unbindable: 'That device sent a key this page cannot bind. Try pressing it again.',
	lv_capture_key_space: 'Space',
	lv_capture_error: 'Capture failed',
	lv_capture_not_ready: 'Loading the volume…',
	lv_needs_stem: 'This volume needs a stem before you can capture into it.',
	lv_needs_stem_link: 'Assign the stem',
	lv_err_no_volume: 'Choose a volume before capturing',
	lv_err_volume_not_found: 'This volume is no longer in the catalogue',
	lv_err_record_not_found: 'This record is no longer in the catalogue',
	lv_err_retake_volume: 'A record can be retaken only in its own volume',
	lv_err_retake_mode: (mode: 'single' | 'dual') =>
		mode === 'dual'
			? 'This record was captured with two cameras; to retake it, choose "Double Camera"'
			: 'This record was captured with one camera; to retake it, choose "Single Camera"',
	lv_err_camera_not_connected: (n: number) => `Camera ${n} is not connected`,
	lv_err_numbers_taken:
		"Captua captured nothing: files on disk already carry this volume's next capture numbers; let whoever administers the device know",
	lv_err_retake_status: 'Only a captured or rejected record can be retaken',
	lv_err_resolution_in_name: "Captua cannot put the resolution in a capture's file name",
	lv_err_name_too_long: "Captua captured nothing: this capture's file name would be longer than 36 characters",
	lv_err_capture_limit: 'Captua captured nothing: this volume has reached the limit of 9,999 captures; a new volume is needed',
	lv_capture_btn: 'Capture',
	lv_zoom_in: 'Zoom in',
	lv_zoom_out: 'Zoom out',
	lv_thumb_empty: 'No captures yet — use the capture button',
	tb_go_to_review: 'Review',
	tb_go_to_review_title: 'Back to reviewing this volume',
	tb_breadcrumb_nav: 'Current project and volume',
	tb_back: 'Back',
	tb_current_user: 'Current user',
	lvm_retake: 'Retake',
	lvm_retake_confirm: 'Retake this record? Captua keeps the current images as earlier versions.',
	lvm_retaking: 'Capturing replacement image…',
	lvm_retake_error: (message: string) =>
		`Retake failed. ${message.endsWith('.') ? message : `${message}.`} The original images were kept.`,

	// ── Offsite catalogue copy (NEH-266) ─────────────────────────────────────
	backup_ind_current: (day: 'today' | 'yesterday' | 'earlier', date: string) =>
		day === 'today'
			? 'Catalogue copied today'
			: day === 'yesterday'
				? 'Catalogue copied yesterday'
				: `Catalogue copied on ${date}`,
	backup_ind_stale: (day: 'today' | 'yesterday' | 'earlier', date: string) =>
		day === 'yesterday' ? 'No catalogue copy since yesterday' : `No catalogue copy since ${date}`,
	backup_ind_never: 'No verified catalogue copy',
	backup_ind_off: 'Offsite copy not configured',
	backup_ind_unknown: 'Could not check the state of the offsite copy',
	backup_section_title: 'Offsite copy',
	backup_section_desc:
		'Once a day, the scanner copies the catalogue to the destination configured when it was installed, and checks that the destination received it complete. The catalogue is the database that links each image to its project, its volume and its place in that volume.',
	backup_section_scope: 'This copy does not include the image files.',
	backup_cfg_current: (day: 'today' | 'yesterday' | 'earlier', date: string, time: string) => {
		if (day === 'today') return `Copy verified today at ${time}.`;
		if (day === 'yesterday') return `Copy verified yesterday at ${time}.`;
		return `Copy verified on ${date} at ${time}.`;
	},
	backup_cfg_stale: (day: 'today' | 'yesterday' | 'earlier', date: string) =>
		day === 'yesterday' ? 'The last verified copy is from yesterday.' : `The last verified copy is from ${date}.`,
	backup_cfg_never: 'No copy has been verified yet.',
	backup_cfg_retry: 'The scanner tries the copy again from time to time while it is on.',
	backup_cfg_off: 'The offsite copy is not configured on this scanner.',
	backup_cfg_unknown: 'Could not check the state of the offsite copy.',
	backup_cfg_last_file: 'File of the last copy',
	backup_cfg_locked: 'This is set up when the scanner is installed and cannot be changed here.',

	// ── Offsite copy of the images (NEH-248, offsite-state.ts) ─────────────
	offsite_vol_label: 'Offsite copy of this volume',
	offsite_vol_received: (verified: number, total: number) =>
		`Stored offsite: ${formatCount(verified, 'en')} of ${formatCount(total, 'en')} files verified`,
	offsite_vol_uploading: (verified: number, total: number, pending: number) =>
		`Uploading: ${formatCount(verified, 'en')} of ${formatCount(total, 'en')} files verified, ${formatCount(pending, 'en')} pending`,
	offsite_vol_attention: (refused: number, verified: number, total: number, pending: number) =>
		`${refused === 1 ? '1 file needs' : `${formatCount(refused, 'en')} files need`} attention · ${formatCount(verified, 'en')} of ${formatCount(total, 'en')} verified, ${formatCount(pending, 'en')} pending`,
	offsite_attention_help:
		'The offsite copy already holds a different file with the same name. Let whoever administers the scanner know.',
	offsite_vol_empty: 'Offsite copy: no files to copy yet',
	offsite_vol_no_stem: 'Not stored offsite: this volume has no stem',
	offsite_vol_off: 'Offsite copy of images not configured',
	offsite_vol_misconfigured: 'Offsite copy of images configured incorrectly',
	offsite_vol_unknown: 'Could not check the offsite copy of this volume',
	offsite_last_verified: (day: 'today' | 'yesterday' | 'earlier', date: string, time: string): string => {
		if (day === 'today') return `last verified today at ${time}`;
		if (day === 'yesterday') return `last verified yesterday at ${time}`;
		return `last verified on ${date} at ${time}`;
	},
	offsite_unit_title: 'Image files',
	offsite_unit_off: 'The offsite copy of the image files is not configured on this scanner.',
	offsite_unit_misconfigured:
		'The offsite copy of the image files is not configured correctly on this scanner. Let whoever administers it know.',
	offsite_unit_empty: 'There are no image files to copy yet.',
	offsite_unit_volumes: (received: number, volumes: number) =>
		`${formatCount(received, 'en')} of ${formatCount(volumes, 'en')} ${volumes === 1 ? 'volume' : 'volumes'} stored offsite in full.`,
	offsite_unit_files: (verified: number, total: number, pending: number) =>
		`${formatCount(verified, 'en')} of ${formatCount(total, 'en')} files verified, ${formatCount(pending, 'en')} pending.`,
	offsite_unit_refused: (refused: number): string =>
		refused === 1 ? '1 file needs attention.' : `${formatCount(refused, 'en')} files need attention.`,
	offsite_cfg_last_verified: (day: 'today' | 'yesterday' | 'earlier', date: string, time: string): string => {
		if (day === 'today') return `Last file verified today at ${time}.`;
		if (day === 'yesterday') return `Last file verified yesterday at ${time}.`;
		return `Last file verified on ${date} at ${time}.`;
	},
	offsite_cfg_never: 'No file has been verified yet.',

	// ── Delivery to Fisqua (fisqua-state.ts) ──────────────────────────────
	// `day`, `date` and `time` as in offsite_last_verified.
	fisqua_vol_label: 'Delivery of this volume to Fisqua',
	fisqua_when: (day: 'today' | 'yesterday' | 'earlier', date: string, time: string): string => {
		if (day === 'today') return `today at ${time}`;
		if (day === 'yesterday') return `yesterday at ${time}`;
		return `on ${date} at ${time}`;
	},
	fisqua_out_none: 'Not sent to Fisqua yet',
	fisqua_out_waiting: 'Waiting for the complete offsite copy before sending to Fisqua',
	fisqua_out_sending: 'Captua is sending the capture manifest to Fisqua',
	fisqua_out_failed: (day: 'today' | 'yesterday' | 'earlier', date: string, time: string): string => {
		const when = day === 'today' ? `today at ${time}` : day === 'yesterday' ? `yesterday at ${time}` : `on ${date} at ${time}`;
		return `Captua could not send the capture manifest to Fisqua; it will try again ${when}`;
	},
	fisqua_out_failed_no_time: 'Captua could not send the capture manifest to Fisqua; it will try again',
	fisqua_out_not_exportable: 'Not sent to Fisqua: Captua cannot build the capture manifest',
	fisqua_out_refused_by_fisqua: 'Fisqua refused the capture manifest',
	fisqua_out_delivered: 'Sent to Fisqua; waiting for its status',
	fisqua_out_superseded: 'Not sent: a later send for review replaced it',
	fisqua_out_withdrawn: 'Not sent: the volume was withdrawn from review',
	fisqua_st_received: 'Fisqua received the volume',
	fisqua_st_registered: 'Fisqua registered the volume',
	fisqua_st_preparing_review: 'Fisqua is preparing the volume for capture QC',
	fisqua_st_in_capture_qc: "Fisqua is reviewing the volume's capture",
	fisqua_st_retakes_requested: 'Fisqua asks for some records to be captured again',
	fisqua_st_approved: 'Fisqua approved the capture of every record',
	fisqua_st_queued: 'Queued in Fisqua',
	fisqua_st_running: 'Fisqua is processing the volume',
	fisqua_st_review_pending: 'The processed images are waiting for review in Fisqua',
	fisqua_st_published: 'Published in Fisqua',
	fisqua_st_refused: 'Fisqua refused the volume',
	fisqua_st_superseded: 'Fisqua replaced this manifest with a later one',
	fisqua_st_failed: 'Fisqua could not process the volume',
	fisqua_st_unknown: 'Fisqua does not know this volume yet',
	fisqua_st_other: 'Fisqua reports a status this version of Captua does not know',
	fisqua_checked: (day: 'today' | 'yesterday' | 'earlier', date: string, time: string): string => {
		if (day === 'today') return `checked today at ${time}`;
		if (day === 'yesterday') return `checked yesterday at ${time}`;
		return `checked on ${date} at ${time}`;
	},
	fisqua_problems: (n: number): string => (n === 1 ? '1 problem' : `${formatCount(n, 'en')} problems`),
	// Fisqua's own text, as it sent it.
	fisqua_notes: (n: number): string => (n === 1 ? '1 note' : `${formatCount(n, 'en')} notes`),
	fisqua_more: (n: number): string => `and ${formatCount(n, 'en')} more`,
	fisqua_note_unlisted_object: (key: string): string =>
		`The offsite copy holds a file the capture manifest does not name: ${key}`,
	fisqua_note_missing_object: (key: string): string =>
		`The capture manifest names a file the offsite copy does not hold; Fisqua does not read it to process the volume: ${key}`,
	fisqua_rule_bad_request: 'Fisqua refused the capture manifest as malformed, without naming a problem.',
	fisqua_rule_payload_too_large: 'Fisqua refused the capture manifest as too large, without naming a problem.',
	fisqua_problem_from_fisqua: (message: string): string => `From Fisqua: ${message}`,
	fisqua_incident_object_missing:
		'Fisqua could not find some files in the offsite copy that Captua had already verified there. This needs investigating: ask whoever manages the scanner to check the offsite copy. The missing files are listed below.',
	fisqua_role_single: 'Single image',
	fisqua_kind_capture: 'Master file',
	fisqua_kind_preview: 'Preview',
	fisqua_history: (n: number): string => `Earlier sends (${formatCount(n, 'en')})`,
	fisqua_cfg_token:
		'Fisqua does not accept the token configured on this scanner, so Captua has stopped sending volumes to Fisqua and checking their status. Ask whoever manages the scanner to correct DTK_FISQUA_TOKEN and restart Captua.',
	fisqua_cfg_not_found:
		'Fisqua does not recognise the address configured on this scanner, so Captua has stopped sending volumes to Fisqua and checking their status. Ask whoever manages the scanner to correct DTK_FISQUA_ENV, DTK_FISQUA_BASE_URL or DTK_OFFSITE_TENANT and restart Captua.',
	fisqua_cfg_redirect:
		'The Fisqua address configured on this scanner redirects to another address. Captua does not follow it, so that the token is not sent elsewhere, and has stopped sending volumes to Fisqua and checking their status. Ask whoever manages the scanner to correct DTK_FISQUA_ENV or DTK_FISQUA_BASE_URL and restart Captua.',
	fisqua_cfg_version:
		'Fisqua does not read the capture manifests this version of Captua writes, so Captua has stopped sending volumes to Fisqua and checking their status. Ask whoever manages the scanner to update Captua or Fisqua.',
	fisqua_cfg_other:
		"Fisqua does not accept this scanner's configuration, so Captua has stopped sending volumes to Fisqua and checking their status. Ask whoever manages the scanner to check its Fisqua settings and restart Captua.",
	fisqua_unit_title: 'Fisqua',
	fisqua_unit_off: 'Sending to Fisqua is not configured on this scanner.',
	fisqua_unit_env_production:
		"Captua sends each volume's capture manifest to Fisqua once the volume is in review and its offsite copy is complete.",
	fisqua_unit_env_staging:
		"Captua sends each volume's capture manifest to Fisqua's test service (staging) once the volume is in review and its offsite copy is complete.",
	fisqua_unit_send_none: 'Captua has not sent anything to Fisqua since the last restart.',
	fisqua_unit_send_done: (delivered: number, refused: number, failed: number, waiting: number): string =>
		`Last send: ${formatCount(delivered, 'en')} delivered, ${formatCount(refused, 'en')} refused, ${formatCount(failed, 'en')} to try again, ${formatCount(waiting, 'en')} waiting for the offsite copy.`,
	fisqua_unit_send_config_error: 'Last send: stopped by the configuration error below.',
	fisqua_unit_send_error: 'Captua could not finish the last send. It tries again after the next image upload to the offsite copy.',
	fisqua_unit_send_stopped: 'Captua stopped the last send before it finished, and continues after the next image upload to the offsite copy.',
	fisqua_unit_send_other: 'Captua sent nothing to Fisqua on its last run.',
	fisqua_unit_poll_none: 'Captua has not asked Fisqua for a status since the last restart.',
	fisqua_unit_poll_done: (asked: number, answered: number): string =>
		`Last status check: Captua asked about ${asked === 1 ? '1 volume' : `${formatCount(asked, 'en')} volumes`}, and Fisqua answered for ${formatCount(answered, 'en')}.`,
	fisqua_unit_poll_config_error: 'Last status check: stopped by the configuration error below.',
	fisqua_unit_poll_error: 'Captua could not finish the last status check. It asks again later.',
	fisqua_unit_poll_other: 'On its last check, Captua asked Fisqua about no volumes.',

	// ── Freeing space on the card and restoring (NEH-248, offsite-free.ts) ──
	offsite_vol_stored: 'Stored offsite',
	offsite_vol_freed: (files: number, bytes: number): string =>
		`${files === 1 ? '1 file' : `${formatCount(files, 'en')} files`} freed from the SD card (${formatBytes(bytes, 'en')})`,
	offsite_manage_open: 'Space on the SD card',
	offsite_manage_intro:
		"When you free space, Captua removes from the SD card this volume's images and previews that are already verified in the offsite copy. It keeps the thumbnails, so the volume can still be browsed.",
	offsite_free_action: 'Free space on the SD card',
	offsite_restore_action: 'Restore to the SD card',
	offsite_planning: 'Captua is checking what it can free…',
	offsite_free_confirm_title: 'Free space on the SD card?',
	offsite_plan_will_free: (files: number, bytes: number): string =>
		files === 1
			? `Captua will remove 1 file (${formatBytes(bytes, 'en')}) from the SD card. It will still be stored in the offsite copy.`
			: `Captua will remove ${formatCount(files, 'en')} files (${formatBytes(bytes, 'en')}) from the SD card. They will still be stored in the offsite copy.`,
	offsite_plan_restore_later: 'An administrator can restore the volume later with "Restore to the SD card".',
	offsite_free_check_note:
		"Before it removes each file, Captua compares its checksum with the offsite copy's again. This can take several minutes.",
	offsite_plan_nothing: 'Captua found no files it can free on this volume.',
	offsite_plan_left: (n: number): string =>
		n === 1 ? 'Captua will leave 1 file on the SD card:' : `Captua will leave ${formatCount(n, 'en')} files on the SD card:`,
	offsite_free_confirm: 'Free space',
	offsite_running_free: 'Captua is freeing space on the SD card…',
	offsite_running_close_note:
		"You can close this window: Captua will keep working, and you will see the result in the volume's offsite copy line.",
	offsite_free_done_title: 'Captua finished freeing space',
	offsite_free_done: (files: number, bytes: number): string =>
		files === 0
			? 'Captua removed no file from the SD card.'
			: files === 1
				? `Captua removed 1 file (${formatBytes(bytes, 'en')}) from the SD card.`
				: `Captua removed ${formatCount(files, 'en')} files (${formatBytes(bytes, 'en')}) from the SD card.`,
	offsite_done_left: (n: number): string =>
		n === 1 ? 'Captua left 1 file on the SD card:' : `Captua left ${formatCount(n, 'en')} files on the SD card:`,
	offsite_restore_confirm_title: 'Restore the volume to the SD card?',
	offsite_restore_confirm_body: (files: number, bytes: number): string =>
		files === 1
			? `Captua will copy the freed file (${formatBytes(bytes, 'en')}) back to the SD card from the offsite copy, and check its checksum before it puts the file in place.`
			: `Captua will copy the ${formatCount(files, 'en')} freed files (${formatBytes(bytes, 'en')}) back to the SD card from the offsite copy, and check each one's checksum before it puts the file in place.`,
	offsite_restore_space_note:
		'Make sure the SD card has that much free space. This can take a long time, depending on the connection.',
	offsite_restore_confirm: 'Restore',
	offsite_running_restore: 'Captua is restoring the files to the SD card…',
	offsite_restore_done_title: 'Captua finished restoring the volume',
	offsite_restore_done: (files: number, bytes: number): string =>
		files === 0
			? 'Captua restored no file.'
			: files === 1
				? `Captua restored 1 file (${formatBytes(bytes, 'en')}) to the SD card.`
				: `Captua restored ${formatCount(files, 'en')} files (${formatBytes(bytes, 'en')}) to the SD card.`,
	offsite_restore_left: (n: number): string =>
		n === 1 ? 'Captua could not restore 1 file:' : `Captua could not restore ${formatCount(n, 'en')} files:`,
	offsite_err_no_stem:
		'This volume has no stem, so none of its files are stored offsite, and there is nothing to free or restore.',
	offsite_err_not_received:
		'Not every file of this volume is verified in the offsite copy yet. Wait for Captua to finish copying them.',
	offsite_err_listing: 'Captua could not reach the offsite copy, so it checked and removed nothing. Try again later.',
	offsite_err_no_read_remote:
		'This scanner is not set up to restore: it needs read access to the offsite copy. Ask whoever installed the scanner to set it up.',
	offsite_err_not_in_own_folder:
		"Some of this volume's files are not yet in the volume's own folder, so Captua cannot free or restore them. Captua moves them there at startup: restart the scanner and try again. If Captua still cannot free or restore them after the restart, tell an administrator.",
	offsite_err_job_running: 'Captua is already freeing or restoring files of this volume. Wait for it to finish.',
	offsite_err_drive_unavailable:
		'The storage drive set for projects is not available. Connect and activate it, or go back to internal storage, then try again.',
	offsite_err_drive_not_directory:
		'The storage path set for projects is not a folder. Activate the drive again, or go back to internal storage, then try again.',
	offsite_err_drive_not_mounted:
		'The storage path set for projects is not on a connected drive. Connect and activate the drive, or go back to internal storage, then try again.',
	offsite_err_plan: 'Captua could not check what it can free. Try again in a moment.',
	offsite_err_free: 'Captua could not start freeing space. Try again in a moment.',
	offsite_err_restore: 'Captua could not start restoring the volume. Try again in a moment.',
	offsite_err_job_free:
		"Captua stopped before it finished freeing space. Check the volume's offsite copy line and try again.",
	offsite_err_job_restore:
		"Captua stopped before it finished restoring the volume. Check the volume's offsite copy line and try again.",
	offsite_err_job_lost:
		"Captua lost track of this task, perhaps after a restart. Check the volume's offsite copy line before you try again.",
	offsite_err_poll:
		"Captua could not be reached while it worked. It may still be working: check the volume's offsite copy line in a few minutes.",
	offsite_reason_no_preview_digest: (n: number): string =>
		n === 1
			? '1 preview has no SHA-256 checksum recorded yet. Captua keeps it on the SD card, because that checksum can only be computed from the file on the scanner.'
			: `${formatCount(n, 'en')} previews have no SHA-256 checksum recorded yet. Captua keeps them on the SD card, because that checksum can only be computed from the file on the scanner.`,
	offsite_reason_not_in_bucket: (n: number): string =>
		n === 1 ? '1 file is not in the offsite copy.' : `${formatCount(n, 'en')} files are not in the offsite copy.`,
	offsite_reason_listed_without_sha1: (n: number): string =>
		n === 1
			? '1 file is listed in the offsite copy without a checksum to compare.'
			: `${formatCount(n, 'en')} files are listed in the offsite copy without a checksum to compare.`,
	offsite_reason_bucket_sha1_differs: (n: number): string =>
		n === 1
			? 'For 1 file, the offsite copy does not match the file on the SD card.'
			: `For ${formatCount(n, 'en')} files, the offsite copy does not match the file on the SD card.`,
	offsite_reason_local_file_missing: (n: number): string =>
		n === 1 ? '1 file is not on the SD card.' : `${formatCount(n, 'en')} files are not on the SD card.`,
	offsite_reason_local_file_unreadable: (n: number): string =>
		n === 1 ? 'Captua could not read 1 file on the SD card.' : `Captua could not read ${formatCount(n, 'en')} files on the SD card.`,
	offsite_reason_local_sha1_differs: (n: number): string =>
		n === 1
			? '1 file on the SD card does not match its offsite copy.'
			: `${formatCount(n, 'en')} files on the SD card do not match their offsite copy.`,
	offsite_reason_changed: (n: number): string =>
		n === 1
			? '1 file was changed or deleted while Captua was working.'
			: `${formatCount(n, 'en')} files were changed or deleted while Captua was working.`,
	offsite_reason_could_not_remove: (n: number): string =>
		n === 1 ? 'Captua could not remove 1 file from the SD card.' : `Captua could not remove ${formatCount(n, 'en')} files from the SD card.`,
	offsite_reason_outside_storage: (n: number): string =>
		n === 1
			? "1 file has a path outside the scanner's storage."
			: `${formatCount(n, 'en')} files have a path outside the scanner's storage.`,
	offsite_reason_local_file_differs: (n: number): string =>
		n === 1
			? 'For 1 file, the SD card already holds a different file with the same name; Captua left it as it was.'
			: `For ${formatCount(n, 'en')} files, the SD card already holds different files with the same names; Captua left them as they were.`,
	offsite_reason_copy_failed: (n: number): string =>
		n === 1
			? 'Captua could not copy 1 file from the offsite copy.'
			: `Captua could not copy ${formatCount(n, 'en')} files from the offsite copy.`,
	offsite_reason_sha1_differs: (n: number): string =>
		n === 1
			? '1 file copied from the offsite copy did not match its checksum; Captua discarded it.'
			: `${formatCount(n, 'en')} files copied from the offsite copy did not match their checksums; Captua discarded them.`,
	offsite_reason_could_not_write: (n: number): string =>
		n === 1 ? 'Captua could not write 1 file to the SD card.' : `Captua could not write ${formatCount(n, 'en')} files to the SD card.`,
	offsite_reason_other: (n: number): string =>
		n === 1 ? '1 file, for another reason.' : `${formatCount(n, 'en')} files, for other reasons.`,

	// ── API client messages ──────────────────────────────────────────────────
	api_power_ack: 'Command received. The scanner will run it in a few seconds.',
	api_request_failed: 'Request failed'
};

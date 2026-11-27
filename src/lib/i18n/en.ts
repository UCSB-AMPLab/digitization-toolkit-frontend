// English message catalogue. Typed against the keys of `es.ts` (see
// `Messages` in `index.ts`): a missing or extra key here is a type error in
// `npm run check`.
//
// Version: 0.4.0

import type { Messages } from './index';

import { formatCount } from '../format-count';
import { formatBytes } from '../format-bytes';

// The ordinal of Cola's sections (0.3.1): 1 to 3.
const ORDINALS_EN = ['First', 'Second', 'Third'];
const ordinalEn = (n: number) => ORDINALS_EN[n - 1] ?? String(n);

// Counts of the adoption messages (NEH-419), singular and plural.
const adoptRecordsEn = (n: number) => (n === 1 ? '1 record' : `${formatCount(n, 'en')} records`);
const adoptImagesEn = (n: number) => (n === 1 ? '1 image' : `${formatCount(n, 'en')} images`);
const adoptGroupsEn = (n: number) => (n === 1 ? '1 group' : `${formatCount(n, 'en')} groups`);

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
	common_password_too_short: (min: number) => `The password needs at least ${min} characters.`,
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
	login_language_title: 'Choose your language',
	login_language_desc:
		'Captua uses it whenever you sign in, on any device. You can change it in Settings › Language.',
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
	login_error_unknown_role:
		'Your account has a role this app does not recognize. Let whoever administers the device know.',
	login_error_backend_unavailable:
		'Could not reach the server. It may not be ready yet: wait a few seconds and try again.',
	login_error_locked_out: (minutes: number) =>
		minutes === 1
			? 'Too many failed attempts. Wait 1 minute before trying again.'
			: `Too many failed attempts. Wait ${minutes} minutes before trying again.`,
	login_error_locked_out_unknown:
		'Too many failed attempts. Wait a few minutes before trying again.',
	login_error_account_locked: (minutes: number) =>
		minutes === 1
			? 'Too many failed attempts for this account. Wait 1 minute before trying again.'
			: `Too many failed attempts for this account. Wait ${minutes} minutes before trying again.`,
	login_error_account_locked_unknown:
		'Too many failed attempts for this account. Wait a few minutes before trying again.',
	login_error_device_locked: (minutes: number) =>
		minutes === 1
			? 'Too many failed attempts from this device. Wait 1 minute before trying again. Until then, no one can sign in here.'
			: `Too many failed attempts from this device. Wait ${minutes} minutes before trying again. Until then, no one can sign in here.`,
	login_error_device_locked_unknown:
		'Too many failed attempts from this device. Wait a few minutes before trying again. Until then, no one can sign in here.',

	// ── Session ──────────────────────────────────────────────────────────────
	session_validating: 'Verifying session…',
	session_backend_waiting: 'Waiting for the server to respond…',
	session_backend_waiting_detail:
		'If you have just switched the device on, the server can take a few seconds to respond. Captua will keep trying to connect and continue as soon as it can.',

	// ── Navigation (dashboard) ───────────────────────────────────────────────
	nav_section_main: 'MAIN',
	nav_section_system: 'SYSTEM',
	nav_overview: 'Overview',
	nav_projects: 'Projects',
	nav_users: 'Users',
	nav_settings: 'Settings',
	nav_collapse_sidebar: 'Collapse sidebar',
	nav_expand_sidebar: 'Expand sidebar',
	nav_queue: 'Queue',
	nav_retakes: 'To retake',
	nav_retakes_count: (n: number) =>
		n === 1 ? '1 record to retake' : `${formatCount(n, 'en')} records to retake`,
	// ── First-run guided tour (NEH-95) ────────────────────────────────────────
	nav_help: 'Help',
	tour_aria: 'Guided tour',
	tour_skip: 'Skip the tour',
	tour_next: 'Next step',
	tour_prev: 'Previous step',
	tour_finish: 'Finish',

	tour_s1_title: 'Create a project',
	tour_s1_where: 'Go to Projects › New project.',
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
		'Approve the pages that are right and reject, with a reason, those that need retaking. To approve, open the spread view (the open-book icon in the right-hand bar), then Annotations (the speech bubble in the left-hand bar). Only the Reviewer and Administrator roles can approve.',
	tour_s6_title: 'Export',
	tour_s6_where:
		'Go to Projects › your project › your volume, then press the archive-box icon, the last one in the right-hand bar.',
	tour_s6_body:
		'With everything approved, the volume is packaged and becomes available to download.',
	// Without projects (NEH-318): no project step, and every route from Volumes.
	tour_s2_vol_title: 'Create a volume',
	tour_s2_vol_where: 'Go to Volumes › New volume.',
	tour_s2_vol_body: 'Each book, box or bundle is a volume. The images are stored inside it.',
	// Fisqua mode: volumes come from Fisqua's queue, so the step points at Queue.
	// Then capture from Queue, and Fisqua's review in place of approve and export.
	tour_s2_fisqua_title: 'Choose a volume',
	tour_s2_fisqua_where: 'Go to Queue.',
	tour_s2_fisqua_body: "Volumes come from Fisqua's queue. Choose a volume in Queue.",
	tour_s3_fisqua_title: 'Capture',
	tour_s3_fisqua_body:
		'In Queue, press Capture beside the volume you chose. You go straight to the capture screen, without going through the volume page.',
	tour_s5_fisqua_title: 'Follow the review',
	tour_s5_fisqua_body:
		'Fisqua does the review. In the top bar of the volume page you can see its state, for example: "Fisqua is reviewing the volume\'s capture". If Fisqua asks for some records to be captured again, you will find them in To retake.',
	tour_s3_where_vol: 'Go to Volumes › your volume › Capture.',
	tour_s4_where_vol: 'Go to Volumes › your volume › Send for review.',
	tour_s5_where_vol: 'Go to Volumes › your volume.',
	tour_s6_where_vol:
		'Go to Volumes › your volume, then press the archive-box icon, the last one in the right-hand bar.',

	nav_logout: 'Log out',

	// ── Record statuses ──────────────────────────────────────────────────────
	status_captured: 'Captured',
	status_in_review: 'In review',
	status_rejected: 'Rejected',
	status_approved: 'Approved',
	// Fisqua's third QC decision (contract 1.6).
	status_excluded: 'Excluded',
	status_excluded_hint:
		'Fisqua excluded this record: it is not a page of the volume, and no retake is asked for.',
	excluded_note_label: 'Reason:',

	// ── Roles ────────────────────────────────────────────────────────────────
	role_admin: 'Administrator',
	role_operator: 'Operator',
	role_reviewer: 'Reviewer',
	role_testing: 'Testing',
	testing_badge: 'Testing',
	role_admin_desc: 'Full system management',
	role_operator_desc: 'Document digitization',
	role_reviewer_desc: 'Quality control',

	// ── Camera statuses (shared) ─────────────────────────────────────────────
	camera_not_detected: 'Not detected',

	// ── Dashboard (overview) ─────────────────────────────────────────────────
	dash_greeting: (name: string) => `Hello, ${name}!`,
	dash_greeting_fallback: 'there',
	dash_subtitle_cameras: 'The state of the unit, the volumes in progress, and activity.',
	// For a role without the camera block (the reviewer).
	dash_subtitle_no_cameras: 'Volumes in progress and activity.',
	dash_attention_title: 'Needs attention',
	dash_storage_alert_p1: 'Storage is at ',
	dash_storage_alert_p2: (used: string, total: string) => ` (${used} / ${total}). See `,
	dash_storage_alert_p3: ' to free up space.',
	dash_storage_alert_ask_admin: (used: string, total: string) =>
		` (${used} / ${total}). Ask an administrator or an operator to free up space.`,
	// After the storage sentence, admin and operator: the total of GET /system/storage/freeable.
	dash_storage_can_free: (bytes: number) => `You can free ${formatBytes(bytes, 'en')}.`,
	dash_kpi_active_projects: 'Active projects',
	dash_kpi_collections: 'Volumes',
	dash_kpi_total_records: 'Total records',
	dash_kpi_failed: 'Could not load this figure.',
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
	// The camera by its confirmed role (`left` is the right camera), and by
	// its number when no role is confirmed.
	dash_camera_left: 'Right camera',
	dash_camera_right: 'Left camera',
	dash_camera_n: (n: number) => `Camera ${n}`,
	dash_camera_capture_not_connected: 'the camera is not connected',
	dash_camera_capture_timeout: 'the camera did not deliver the image in time',
	dash_camera_missing_hint: (side: string) =>
		`${side}: not detected. Half-press its shutter button to wake it, or reseat its USB cable, then press "Reconnect cameras".`,
	dash_camera_missing_title: 'Captua cannot detect one of the cameras.',
	dash_cameras_none_title: 'Captua cannot detect either camera.',
	dash_cameras_none_hint:
		'Check that both cameras are switched on and connected, then press "Reconnect cameras".',
	// A listed camera the unit cannot capture with (the device list's `error`).
	dash_camera_unusable_badge: 'Cannot capture',
	dash_camera_unusable_title: 'Captua cannot capture with one of the cameras.',
	dash_camera_unusable_title_both: 'Captua cannot capture with either camera.',
	dash_camera_unusable_body:
		'The camera is connected, but Captua cannot capture with it. To see why, press "Check cameras".',
	dash_camera_unusable_body_both:
		'Both cameras are connected, but Captua cannot capture with them. To see why, press "Check cameras".',
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
		n === 1
			? `1 record reviewed on ${date}`
			: `${formatCount(n, 'en')} records reviewed on ${date}`,
	dash_cal_days_captures: 'Days with captures',
	dash_cal_total_captures: 'Images captured',
	dash_cal_days_reviews: 'Days with reviews',
	dash_cal_total_reviews: 'Records reviewed',
	dash_cal_error: 'Could not load the activity calendar.',

	// ── Settings ─────────────────────────────────────────────────────────────
	config_subtitle: 'Digitization system settings',
	config_section_language: 'Language',
	config_section_capture_key: 'Capture key',
	config_capture_key_error: 'Could not save the capture key. Try again.',
	config_language_mine_label: 'Your language',
	config_language_mine_desc:
		'The language Captua uses for you, on any device you sign in from. Captua reloads the page to apply it; your session stays open.',
	config_language_unit_label: "The unit's language",
	config_language_unit_desc:
		'The language of the sign-in page. Each person chooses their own the first time they sign in.',
	config_language_error: 'Could not save the language. Try again.',
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
	config_storage_device_desc: 'Connect a USB drive or SD card to save images on it',
	config_external_active_pre: 'Using external storage. New images are saved to ',
	config_storage_override_invalid:
		'The external storage setting was invalid and could not be read; using internal storage.',
	config_restore_progress: 'Restoring…',
	config_restore_default: 'Restore default',
	config_experimental_lead: 'Experimental feature.',
	config_experimental_body:
		'Compatibility depends on the drive’s format (exFAT, ext4). Drives formatted for Windows (NTFS) or macOS (APFS) may not work correctly. Do not use it as your only backup.',
	config_new_projects_note:
		'While an external drive is active, Captua saves every new image to it, including new images for volumes you started on internal storage. Activate a drive or restore internal storage only between volumes; if you switch while a volume is in progress, its images are split across two disks.',
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
	// NEH-380: the storage reserve (CAPTUA_STORAGE_RESERVE_GB) and the list of
	// volumes that can be freed, in Settings > Storage.
	config_storage_reserve: (gb: string) =>
		`Captua always keeps ${gb} GB free so it can keep working.`,
	config_freeable_title: 'Volumes with space to free',
	config_freeable_intro:
		'Every file of these volumes is already verified in the offsite copy, so you can remove them from the card without losing them. The list goes from the most space to free to the least.',
	config_freeable_space: (bytes: number): string => `${formatBytes(bytes, 'en')} to free`,
	config_freeable_total: (volumes: number, bytes: number): string =>
		volumes === 1
			? `1 volume, ${formatBytes(bytes, 'en')} to free in all`
			: `${formatCount(volumes, 'en')} volumes, ${formatBytes(bytes, 'en')} to free in all`,
	config_freeable_free: 'Free space',
	config_freeable_free_aria: (name: string) => `Free space: ${name}`,
	config_freeable_empty:
		"No volume has space to free for now. A volume's space can be freed once every one of its files is verified in the offsite copy.",
	config_freeable_error:
		'Captua could not check which volumes have space to free. Try again in a moment.',
	config_freeable_mode_off:
		"In the current mode, Captua keeps the image files only on this unit, so no volume's space can be freed.",
	config_err_activate: 'Could not activate storage.',
	config_err_unmount: 'Could not unmount the device.',
	config_restored_default: 'Restored default storage.',
	config_err_restore: 'Could not restore default storage.',
	config_camera_backend: 'Capture system',
	config_camera_backend_desc:
		'The camera driver Captua is using on this unit. An administrator chooses the kind of camera in Settings › Cameras.',
	config_camera_backend_unknown: 'Unavailable',
	// NEH-186: the banner while the unit is not answering (UnitNotAnswering).
	unit_not_answering: 'This unit is not answering. What is on screen may be out of date.',
	unit_not_answering_reload: 'Reload',
	// NEH-252/348: the kind of camera the unit drives (Settings > Cameras,
	// Diagnostics, the capture screen's camera panel). Driver names
	// (picamera2, gphoto2, chdk) appear only in Diagnostics, beside these.
	config_section_cameras: 'Cameras',
	camera_kind_picamera2: 'Pi cameras',
	camera_kind_gphoto2: 'Canon DSLR cameras',
	camera_kind_chdk: 'Canon A2500 cameras (CHDK)',
	camera_kind_count_picamera2: (n: number) => (n === 1 ? '1 Pi camera' : `${n} Pi cameras`),
	camera_kind_count_gphoto2: (n: number) =>
		n === 1 ? '1 Canon DSLR camera' : `${n} Canon DSLR cameras`,
	camera_kind_count_chdk: (n: number) =>
		n === 1 ? '1 Canon A2500 camera (CHDK)' : `${n} Canon A2500 cameras (CHDK)`,
	camera_kind_mismatch: (set: string, connected: string, n: number) =>
		`This unit is set for ${set}, and ${connected} ${n === 1 ? 'is' : 'are'} connected.`,
	camera_kind_no_driver: (connected: string, n: number) =>
		`${connected} ${n === 1 ? 'is' : 'are'} connected, and this unit lacks the driver for ${n === 1 ? 'it' : 'them'}.`,
	camera_kind_mixed: (parts: string[]) =>
		`Cameras of ${parts.length === 2 ? 'two' : 'three'} kinds are connected: ${
			parts.length === 2
				? `${parts[0]} and ${parts[1]}`
				: `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
		}. Captua uses one kind at a time.`,
	camera_kind_notice_link: 'Choose the kind of camera in Settings',
	camera_kind_notice_tell_admin: 'Tell the administrator.',
	camera_kind_desc:
		'Which kind of camera Captua uses on this unit, and which cameras are connected now.',
	camera_kind_in_use: 'In use',
	camera_kind_source_stored: 'An administrator chose this kind.',
	camera_kind_source_environment: "The unit's installation settings name this kind.",
	camera_kind_source_detected:
		'Captua chose this kind from the cameras that were connected at the last start.',
	camera_kind_source_last_used:
		'At the last start, Captua could not tell from the connected cameras which kind to use, so it kept the kind it used before.',
	camera_kind_source_default:
		'At the last start, Captua could not tell from the connected cameras which kind to use, and had used none before, so it uses Pi cameras.',
	camera_kind_connected: 'Connected now',
	camera_kind_count_unknown: 'not known',
	camera_kind_err_load:
		'Captua could not read which kind of camera this unit uses. Try again in a moment.',
	camera_kind_choose_legend: 'Kind of camera',
	camera_kind_follow: 'By the cameras that are connected',
	camera_kind_follow_desc: 'At each start, Captua uses the kind of the cameras connected then.',
	camera_kind_lacks_driver: 'This unit lacks the driver for these cameras.',
	camera_kind_confirm_title: 'Restart Captua?',
	camera_kind_confirm_body:
		'Captua has to be restarted to apply the change. No one can capture for about a minute.',
	camera_kind_confirm_btn: 'Restart Captua',
	camera_kind_pending: (name: string) => `A restart is pending. After it, Captua will use ${name}.`,
	camera_kind_pending_follow:
		'A restart is pending. After it, Captua will use the kind of the cameras that are connected.',
	camera_kind_restart_now: 'Restart now',
	camera_kind_restart_needed:
		'The change is saved, but Captua could not be restarted. Restart the unit to apply it.',
	camera_kind_refused_busy_capturing: 'A capture is in progress. Try again when it ends.',
	camera_kind_refused_offsite_job_running:
		'A volume is being freed or restored. Try again when that ends.',
	camera_kind_refused_backend_restarting:
		'A restart of Captua is in progress. Try again in a minute.',
	camera_kind_refused_driver_unavailable: 'This unit lacks the driver for these cameras.',
	camera_kind_refused_other: 'Captua could not save the change. Try again in a moment.',
	diag_camera_kind: 'Camera kind in effect',
	diag_camera_kind_source: 'Why',
	diag_camera_kind_stored: 'Stored choice',
	diag_camera_kind_stored_none: 'None: Captua uses the kind of the cameras that are connected',
	diag_camera_kind_connected: 'Connected cameras',
	diag_camera_kind_available: 'Camera drivers installed on this unit',
	diag_camera_kind_available_none: 'None',
	config_section_diagnostics: 'Diagnostics',
	config_system_logs: 'System activity',
	config_system_logs_desc: 'Recent activity — last hour',
	config_logs_loading: 'Loading recent activity…',
	config_logs_empty: 'No activity recorded yet.',
	config_err_logs: 'Could not load the system activity.',
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
	config_tmp_deleted: (n: number) =>
		n === 1 ? '1 file deleted.' : `${formatCount(n, 'en')} files deleted.`,
	config_err_clean: 'Could not delete the files.',
	config_section_power: 'Power',
	config_shutdown_label: 'Shut down the scanner',
	config_shutdown_desc:
		'Shuts the scanner down safely. Always use this before unplugging the power, to avoid damaging the SD card.',
	config_shutdown_btn: 'Shut down',
	config_reboot_label: 'Restart the scanner',
	config_reboot_desc: 'Restarts the scanner. The app will reload automatically once it is back.',
	config_reboot_btn: 'Restart',
	config_offline_note:
		'Capturing and reviewing need no internet connection. The external copy and sending to Fisqua do.',
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
	users_password_action: 'Set password',
	users_password_title: (name: string) => `New password for ${name}`,
	users_password_new_label: 'New password',
	users_password_repeat_label: 'Confirm new password',
	users_password_signout_note: 'When you save, Captua signs this person out on every screen.',
	users_password_done: (name: string) =>
		`${name} has a new password. Captua signed them out on every screen.`,
	users_password_err_user_not_found: 'This user no longer exists. Reload the list.',
	users_password_err_testing_account:
		'This is the testing account. You set its password in Settings, under Testing.',
	users_password_err_own_account:
		'This is your own account. To change your password, open your account menu and choose Change password. You will need your current password.',
	users_password_err_not_permitted: 'Only an administrator can set another person’s password.',
	users_password_err_invalid: 'Captua did not accept this password. Try another one.',
	users_password_err_generic: 'The password could not be saved. Try again.',
	account_password_action: 'Change password',
	account_password_title: 'Change your password',
	account_password_current_label: 'Current password',
	account_password_new_label: 'New password',
	account_password_repeat_label: 'Confirm new password',
	account_password_signout_note:
		'When you save, Captua signs you out on every screen, this one included.',
	account_password_val_current_required: 'Enter your current password.',
	account_password_done_title: 'You have a new password',
	account_password_done:
		'Captua signed you out on every screen. Log in again with the new password.',
	account_password_err_wrong_current: 'The current password is not correct.',
	account_password_err_testing_account:
		'An administrator sets the testing account’s password, in Settings, under Testing.',
	account_password_err_invalid: 'Captua did not accept this password. Try another one.',
	account_password_err_generic: 'Your password could not be changed. Try again.',

	// ── Projects (list) ──────────────────────────────────────────────────────
	proj_title: 'Project Management',
	proj_subtitle: 'Fonds, series, sections',
	proj_new: 'New project',
	proj_search_placeholder: 'Search by name or code…',
	proj_loading: 'Loading projects…',
	proj_empty_search: 'No results for your search',
	proj_empty: 'No projects yet',
	proj_create_first: 'Create your first project',
	proj_col_project: 'Project',
	proj_col_reference: 'Reference',
	proj_col_start_date: 'Start Date',
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
	// The sentence after proj_err_delete's colon, for each coded refusal of a delete.
	// A part whose count is 0 is left out; the caller never passes 0 for both.
	proj_err_delete_not_empty: (collections: number, records: number) => {
		const volumes = collections === 1 ? '1 volume' : `${formatCount(collections, 'en')} volumes`;
		const recs = records === 1 ? '1 record' : `${formatCount(records, 'en')} records`;
		if (collections > 0 && records > 0)
			return `it still has ${volumes} and ${recs}. Move or delete them first.`;
		const count = collections > 0 ? collections : records;
		return `it still has ${collections > 0 ? volumes : recs}. ${count === 1 ? 'Move or delete it first.' : 'Move or delete them first.'}`;
	},
	proj_err_delete_files_held:
		'Captua still keeps files in this project that belong to other records. Move those records first.',
	proj_err_delete_manifest_foreign:
		'its directory holds a capture manifest that does not belong to this project. Move it out of that directory first.',
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
	pd_err_delete_has_subvolumes:
		'This volume cannot be deleted because it still contains other volumes.',
	pd_err_move_under_review: (n: number) =>
		n === 1
			? 'One record in this volume is under review, so it cannot be moved. First withdraw the volume from review with "Withdraw from review".'
			: `${formatCount(n, 'en')} records in this volume are under review, so they cannot be moved. First withdraw the volume from review with "Withdraw from review".`,
	pd_err_delete_not_empty:
		'This volume still has records. Move them to another volume before deleting it.',
	// A records move between a volume Captua keeps on the unit and one it does not (NEH-320).
	pd_err_move_kept_line:
		'Captua keeps one of these two volumes on this unit and not the other, so it cannot move the records from one to the other. Choose a volume that Captua keeps the same way, or include the kept volume in the current mode first.',
	// Refusals of a file change while another process reads the files
	// (volume-refusals.ts).
	vol_err_volume_busy:
		'Records were being added to or removed from this volume when you asked for the change, so Captua changed nothing. Try again in a moment.',
	vol_err_files_being_read:
		'Captua is preparing a file of this volume for the offsite copy. Try again in a moment.',
	vol_err_files_being_read_project:
		'Captua is preparing a file of a volume in this project for the offsite copy. Try again in a moment.',
	vol_err_export_running:
		'Captua is exporting this volume. Wait until the export is finished, then try again.',
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
	pd_err_stem_fixed:
		'Images have already been captured into this volume, so its stem cannot be changed.',
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
	col_reject_other_needs_note:
		'A rejection for "Other" needs a note. Describe the problem in Add note.',
	col_reject_comment_too_long: (max: number): string =>
		`Could not reject the record: the note can be at most ${formatCount(max, 'en')} characters long, which is what Fisqua keeps. Shorten it and try again.`,
	col_annotation_note_count: (n: number, max: number): string =>
		`${formatCount(n, 'en')} of ${formatCount(max, 'en')} characters`,
	col_reject_other_note_error:
		'Could not reject the record: a rejection for "Other" needs a note that describes the problem.',
	col_review_approve_error: 'Could not approve the record. Please try again.',
	// ── Send for review (NEH-260) ───────────────────────────────────
	col_handover_send: 'Send for review',
	col_handover_send_new: (n: number) =>
		n === 1 ? 'Send 1 new record' : `Send ${formatCount(n, 'en')} new records`,
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
	col_handover_sent: (n: number) =>
		n === 1
			? '1 record was sent for review.'
			: `${formatCount(n, 'en')} records were sent for review.`,
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
	col_takeback_done: (n: number) =>
		n === 1
			? '1 record was withdrawn from review.'
			: `${formatCount(n, 'en')} records were withdrawn from review.`,
	col_takeback_nothing: 'There were no records in review to withdraw.',
	col_takeback_error: 'Could not withdraw the volume from review. Please try again.',
	col_review_not_sent_hint:
		'This record is not in review. You can approve or reject it once it is sent for review.',
	col_records_reload_error:
		'The change was saved, but the list of records could not be refreshed. Reload the page to see the records’ current state.',
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
	col_filters_disabled_reorder:
		'Filters are disabled while reordering to avoid corrupting the sequence',
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
	col_reorder_error:
		'Captua could not save the new order. Captua has loaded the saved order again.',
	col_delete_record_error_title: 'Could not delete the record',
	col_delete_record_retry: 'Try again in a moment.',
	col_prev: 'Previous',
	col_next: 'Next',
	col_left_page_short: 'Right camera · even/verso',
	col_right_page_short: 'Left camera · odd/recto',
	col_left_page: 'Even/verso page',
	col_right_page: 'Odd/recto page',
	col_image_alt: (id: number | string) => `Image ${id}`,
	col_record_locked: (statusLabel: string) => `Record locked (${statusLabel})`,
	col_status_in_review_lc: 'in review',
	col_status_approved_lc: 'approved',
	col_retake: 'Retake',
	col_retake_confirm:
		'Retake this record from the capture screen? Captua keeps the current images as earlier versions.',
	col_delete_record_confirm: 'Permanently delete this record and all its images?',
	// A picture of a page names the camera and the page. Role `right` is the
	// odd/recto page, photographed by the left camera; role `left` is the
	// even/verso page, photographed by the right camera.
	cam_page_odd: 'Left camera · odd/recto',
	cam_page_even: 'Right camera · even/verso',
	page_term_odd: 'odd/recto',
	page_term_even: 'even/verso',
	badge_cam_left: 'L',
	badge_cam_right: 'R',
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
	col_role_left: 'Image of the even/verso page',
	col_role_right: 'Image of the odd/recto page',
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
	raw_preview_hint:
		'The browser cannot display RAW files. This is the JPEG preview stored beside the original.',
	raw_thumbnail_badge: 'Thumbnail (RAW)',
	raw_thumbnail_hint:
		'The browser cannot display RAW files, and this file has no full-size preview. This is its low-resolution thumbnail.',
	raw_unviewable_title: 'This format cannot be displayed',
	raw_unviewable_body: 'The browser cannot display RAW files, and this file has no preview.',
	image_original_stored: 'The original file is stored on the device.',
	image_file_missing: 'The file for this image was not found.',
	// NEH-139: non-RAW images the browser cannot display (TIFF) or that fail to load
	image_thumbnail_badge: 'Thumbnail',
	image_thumbnail_hint_format: (ext: string) =>
		`The browser cannot display ${ext} files. This is the file's low-resolution thumbnail.`,
	image_thumbnail_hint:
		'This file could not be displayed at full size. This is its low-resolution thumbnail.',
	image_unviewable_title: 'This image cannot be displayed',
	image_unviewable_body_format: (ext: string) =>
		`The browser cannot display ${ext} files, and this file's thumbnail could not be displayed either.`,
	image_unviewable_body: 'Neither this file nor its thumbnail could be displayed.',
	// NEH-248: an image freed from the card (RecordImageDisplay.svelte)
	freed_title: 'Image stored offsite',
	freed_where:
		'This file is kept outside the scanner, in the offsite copy, to leave room on the SD card.',
	freed_nothing_lost:
		'Nothing is lost: Captua verified the offsite copy before it removed the file from the SD card.',
	freed_restore_hint:
		'To see it at full size, an administrator can restore the volume to the SD card.',
	// NEH-380: instead of freed_restore_hint on a unit that cannot restore (`restorable` false).
	freed_no_restore_hint:
		'This unit cannot read the offsite copy, so the full-size image cannot be seen here.',
	// NEH-380: the export, or the image ZIP, of a volume with freed files on a unit that cannot restore.
	export_freed_no_restore:
		"This volume's images are only in the offsite copy, which this unit cannot read, so the volume cannot be exported here.",
	freed_thumbnail_note: 'What you see is the thumbnail, which Captua keeps on the scanner.',
	col_export_blocked_title: 'Cannot export yet',
	col_export_blocked_desc:
		'All records must be approved before exporting. The following are not approved yet:',
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
	col_manifest_option_desc:
		'A JSON file that tells Fisqua which pages of this volume are in the offsite copy.',
	col_manifest_requires: 'Requires sending for review and a complete offsite copy',
	col_manifest_preparing: 'Preparing the capture manifest…',
	col_manifest_refused_title: 'The capture manifest cannot be exported yet',
	col_manifest_refused_body:
		'Fisqua would refuse this file. Resolve the following, then export it again.',
	col_manifest_records: (ids: number[]): string => {
		const shown = ids.slice(0, 20).join(', ');
		const rest = ids.length - 20;
		return `${ids.length === 1 ? 'Record' : 'Records'} ${shown}${rest > 0 ? ` and ${formatCount(rest, 'en')} more` : ''}`;
	},
	col_manifest_rule_tenant_missing:
		'No tenant is configured on this scanner, so the manifest has no place in the offsite copy. Ask whoever manages the scanner to set CAPTUA_OFFSITE_TENANT and restart Captua.',
	col_manifest_rule_tenant_invalid:
		'The tenant configured on this scanner is not valid. Ask whoever manages the scanner to correct CAPTUA_OFFSITE_TENANT and restart Captua.',
	col_manifest_rule_no_stem:
		'The volume has no file name stem, so its images have no names Fisqua can read. Give the volume its stem (its Fisqua reference code).',
	col_manifest_rule_no_project:
		'The volume is not in a project, and the manifest names its project. Move the volume into a project.',
	col_manifest_rule_records_captured:
		'Some records are still captured, so the volume has not been sent for review. Send it for review when its capture is finished.',
	col_manifest_rule_sequence_missing: 'Some records have no sequence number. Renumber the volume.',
	col_manifest_rule_sequence_repeated: 'Some records share a sequence number. Renumber the volume.',
	col_manifest_rule_roles_invalid:
		'Some records have neither one single image nor an image of the even/verso page, one of the odd/recto page or both. Retake them so each has one single image or two images: one of the even/verso page and one of the odd/recto page.',
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
	col_manifest_err_not_found:
		'Captua could not find this volume. Go back to the project and open it again.',
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
	setup_title: 'First-time set-up',
	setup_subtitle: 'Create the administrator account.',
	setup_ph_username: 'e.g. admin',
	setup_ph_email: 'admin@example.com',
	setup_ph_password: 'At least 8 characters',
	setup_ph_confirm: 'Repeat the password',
	setup_submit: 'Create administrator account',
	setup_submit_loading: 'CREATING ACCOUNT',
	setup_creating: 'Creating account',
	setup_step: (n: number, total: number) => `Step ${n} of ${total}`,
	setup_change_language: 'Change the language',
	setup_not_local:
		"Set-up is meant to be done at the unit's own screen. From another device, the bootstrap token is needed.",
	setup_err_signin: 'The account was created, but signing in failed. Sign in on the sign-in page.',
	setup_no_answer:
		'Captua did not get an answer from the unit, so the account may or may not have been created.',
	setup_check_account: 'Check whether the account was created',
	setup_check_failed: 'Captua could not check. Try again.',
	setup_other_account:
		'This unit already has an account, but it is not the one you entered. Ask the person who created it to add you as a user.',
	setup_go_to_login: 'Go to the sign-in page',
	setup_network_title: 'Connect to a network',
	setup_network_desc: 'Connect the unit to a network now, or later in Settings › Network.',
	setup_network_continue: 'Continue',
	setup_network_later: 'Set up later',
	setup_err_exists: 'That username or email already exists',
	setup_err_create: 'Could not create the account. Check the server connection.',
	setup_token_label: 'Bootstrap token',
	setup_ph_token: "Paste the unit's bootstrap token",
	setup_token_hint: 'Required on a provisioned unit; leave blank in development.',
	setup_err_token: 'Invalid or missing bootstrap token. Check the token on the unit.',
	setup_err_unavailable: 'Set-up is unavailable: this unit has no bootstrap token configured.',
	setup_val_username_required: 'Username is required',
	setup_val_username_short: 'Username must be at least 3 characters',
	setup_val_email_format: 'Invalid email format',
	setup_val_password_required: 'Password is required',
	setup_val_password_mismatch: 'Passwords do not match',

	// ── Welcome ──────────────────────────────────────────────────────────────

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
	cam_section_basic_info:
		'How the page is oriented, how much light comes in, and the format it is saved in.',
	cam_section_focus: 'Focus',
	cam_section_focus_info: 'Adjust so the image comes out sharp.',
	cam_section_settings: 'Color and exposure',
	cam_section_settings_info: 'Adjust so the document looks the color it really is.',
	cam_live_controls_unavailable: 'Appear when a connected camera supports them.',
	cam_capabilities_failed:
		'The capture system is not available, so these controls cannot be shown. Press "Reconnect cameras"; if nothing changes, restart the unit.',
	cam_orientation: 'Orientation',
	cam_rotate_ccw: 'Rotate 90° CCW',
	cam_rotate_cw: 'Rotate 90° CW',
	cam_shutter: 'Shutter Speed',
	cam_aperture: 'Aperture',
	cam_format: 'Format',
	// The line under the format selector. RAW+JPEG differs by camera type.
	cam_format_note_raw_dslr:
		'The camera saves a RAW file (CR2). The JPEG is inside it, and Captua copies it out for viewing.',
	cam_format_note_raw_chdk:
		'The camera sends a RAW file (DNG) and a JPEG of the same picture. Captua keeps both.',
	cam_format_note_jpeg: 'The camera saves a JPEG only.',
	cam_focusing: 'Focusing…',
	cam_autofocus: 'Autofocus',
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
	cam_dslr_af_warning: (mode: string) =>
		`Lens reports ${mode}. Captures can hang until the lens switch is on MF.`,
	cam_wb: 'White Balance',
	cam_wb_calibrate_aria: 'Calibrate white balance automatically',
	cam_wb_cancel_aria: 'Cancel white balance sampling',
	cam_wb_sample_aria: 'Sample white balance: tap a white area in the preview (experimental)',
	cam_wb_hint: 'Select a white or neutral gray area in the preview.',
	cam_temperature: 'Temperature',
	cam_tint: 'Tint',
	cam_exposure: 'Exposure',
	cam_histogram: 'Histogram',
	cam_histogram_info: 'Check that no detail is lost in the light or the dark areas.',
	cam_histogram_empty: 'Appears when the preview is showing an image.',
	cam_focus_result: (dpt: number) => `Focus: ${dpt.toFixed(2)} diopters`,
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
	lv_camera_left_alt: 'Right camera · even/verso',
	lv_camera_right_alt: 'Left camera · odd/recto',
	lv_wb_click_hint: 'Select a white or neutral gray area in the preview',
	lv_no_signal_left: 'No signal — Right camera',
	lv_no_signal_right: 'No signal — Left camera',
	lv_no_signal: 'No signal',
	lv_check_hw: 'Check the camera connection',
	lv_camera_missing:
		'Camera not detected. Half-press its shutter button or reseat the USB cable, then press "Reconnect cameras".',
	lv_camera_no_image:
		'The camera is connected but is not sending an image. Turn the camera off and on again. If that does not help, unplug its USB cable and plug it back in.',
	lv_rotate_ccw: 'Rotate left',
	lv_rotate_cw: 'Rotate right',
	// A camera named inside a sentence: by the page its role gives it (the
	// camera with role left photographs the even/verso page, on the right),
	// by its number, or, with one camera, plainly.
	lv_camera_in_sentence: (
		which: { role: 'left' | 'right' } | { number: number } | { single: true }
	): string =>
		'role' in which
			? `the ${which.role === 'left' ? 'right' : 'left'} camera`
			: 'number' in which
				? `camera ${which.number}`
				: 'the camera',
	lv_orientation_save_failed: (camera: string): string =>
		`Captua could not save the orientation of ${camera}. It uses this orientation for captures while this screen stays open, but if you reload or reopen the screen you will see the previous one. Press "Retry" to save this orientation.`,
	lv_controls_collapse: 'Hide controls',
	lv_controls_expand: 'Show controls',
	lv_grid_settings: 'Grid settings',
	lv_swap_orientation: 'Swap the pages of the two cameras',
	lv_orientation_swapped:
		'Swap the pages of the two cameras (camera 2 now photographs the even/verso page)',
	lv_orientation_normal:
		'Swap the pages of the two cameras (camera 1 now photographs the even/verso page)',
	lv_grid_modal_title: 'Grid and guides',
	lv_grid_modal_subtitle: 'Turn on visual framing aids.',
	lv_grid: 'Grid',
	lv_grid_desc: 'Show a 3×3 grid over the live preview',
	lv_guides: 'Guide lines',
	lv_guides_desc: 'Draggable guides (red)',
	lv_capture_key_current: (chord: string) => `Capture key: ${chord}`,
	lv_capture_key_desc:
		'The pedal or key that starts a capture on the capture screen. The unit keeps it for every browser.',
	lv_capture_key_learn: 'Press the key or pedal to assign',
	lv_capture_key_learning: 'Press the pedal or key now…',
	lv_capture_key_reset: 'Use the default',
	lv_capture_key_note:
		'While this key is assigned to capture, pressing it no longer activates the button selected on the capture screen. Make sure the pedal is in ordinary single-key mode, not a macro or repeat mode.',
	lv_capture_key_modifier_only: (modifier: string) =>
		`That device only sent ${modifier}. Press the pedal's actual key, not just a modifier.`,
	lv_capture_key_unbindable: 'That device sent a key this page cannot bind. Try pressing it again.',
	lv_capture_key_space: 'Space',
	lv_capture_error: 'Capture failed',
	lv_capture_not_ready: 'Loading the volume…',
	lv_capture_still_working:
		'The camera is taking longer than usual. Wait for Captua to finish this capture.',
	lv_capture_maybe_saved:
		'The camera did not answer in time. The capture may have been saved: wait while Captua checks.',
	lv_capture_found: 'The capture was saved.',
	lv_capture_not_saved: 'No capture was saved. Check the camera and capture again.',
	lv_capture_unknown: (attempt: 'new' | 'retake' | 'another', single: boolean) =>
		'Captua could not find out whether the capture was saved. ' +
		(attempt === 'new'
			? single
				? 'Check the last image in the volume before you capture again.'
				: 'Check the last opening in the volume before you capture again.'
			: attempt === 'retake'
				? single
					? 'Check this image before you capture it again.'
					: 'Check this opening before you capture it again.'
				: single
					? 'Check the images around this one before you capture again.'
					: 'Check the openings around this one before you capture again.'),
	// A capture refused because the backend could not list the cameras (NEH-427).
	lv_capture_camera_list_unreadable: (single: boolean) =>
		single
			? 'Captua could not read the list of cameras, so it captured nothing. Check that the camera is on and that its USB cable is connected. Then capture again.'
			: 'Captua could not read the list of cameras, so it captured nothing. Check that both cameras are on and that the USB cables are connected. Then capture again.',
	lv_records_unread: "Captua could not load this volume's records, so capture is not possible yet.",
	lv_needs_stem: 'This volume needs a stem before you can capture into it.',
	lv_needs_stem_link: 'Assign the stem',
	lv_err_no_volume: 'Choose a volume before capturing',
	lv_err_volume_not_found: 'This volume is no longer in the catalog',
	lv_err_record_not_found: 'This record is no longer in the catalog',
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
	lv_err_name_too_long:
		"Captua captured nothing: this capture's file name would be longer than 36 characters",
	lv_err_capture_limit:
		'Captua captured nothing: this volume has reached the limit of 9,999 captures; a new volume is needed',
	// NEH-380: the 507 `storage_reserve`, for whoever can free space and for everyone else.
	lv_err_storage_reserve_free:
		'Captua captured nothing: the storage is nearly full and Captua needs what is left to keep working; free space in Settings › Storage',
	lv_err_storage_reserve:
		'Captua captured nothing: the storage is nearly full and Captua needs what is left to keep working; ask an administrator or an operator to free space',
	lv_capture_btn: 'Capture',
	lv_zoom_in: 'Zoom in',
	lv_zoom_out: 'Zoom out',
	// NEH-334: units without a continuous preview show the last capture and
	// fetch a live frame only on request.
	lv_refresh_preview: 'Refresh preview',
	lv_last_capture: 'Last capture',
	lv_preview_unsaved: 'Preview (not saved)',
	lv_preview_failed: 'Could not get a preview. Press "Refresh preview" to try again.',
	lv_thumb_empty: 'No captures yet — use the capture button',
	lv_thumb_hint: (single: boolean) =>
		single
			? 'Press a thumbnail to see the image or retake it.'
			: 'Press a thumbnail to see the opening or retake it.',
	lv_thumb_name: (title: string, single: boolean) =>
		single ? `${title}: see the image or retake it` : `${title}: see the opening or retake it`,
	lv_retake_last: (single: boolean) =>
		single ? 'Retake the last image' : 'Retake the last opening',
	lv_retake_last_changed: (single: boolean) =>
		single
			? 'That image was changed on another screen. Nothing was captured.'
			: 'That opening was changed on another screen. Nothing was captured.',
	lv_setup_no_volume: 'To capture images, choose a volume first.',
	lv_upside_down:
		"An upside-down image usually means the two cameras' pages are swapped. Check which page each camera photographs.",
	// NEH-339: the focus check of a DSLR unit.
	focus_refocus: 'Refocus',
	focus_title: 'Check focus',
	focus_step: (n: number, total: number) => `Step ${n} of ${total}`,
	focus_af_title: 'Set the lenses to AF',
	focus_camera_left: 'Right camera · even/verso',
	focus_camera_right: 'Left camera · odd/recto',
	focus_mode_auto: 'AF',
	focus_mode_manual: 'MF',
	focus_mode_unknown: 'No reading',
	focus_test_title: 'Test captures',
	focus_take: 'Take test captures',
	focus_take_again: 'Take again',
	focus_taking: (s: number) => `Taking the test captures… ${s} s`,
	focus_test_failed: (detail?: string) =>
		detail ? `Could not take the test capture: ${detail}` : 'Could not take the test capture',
	focus_test_empty: 'No test capture yet',
	focus_mf_title: 'Set the lenses to MF',
	focus_mf_warning: (side: 'left' | 'right' | 'both') =>
		side === 'both'
			? 'Both cameras still read AF. Set both lenses to MF before you continue.'
			: `The ${side === 'left' ? 'right' : 'left'} camera still reads AF. Set its lens to MF before you continue.`,
	focus_mf_required: 'Both cameras must read MF before you can continue.',
	focus_next: 'Next',
	focus_back: 'Back',
	focus_skip: 'Skip',
	focus_continue: 'Continue',
	focus_af_step_light:
		'Switch the scanner light on, open the book where both pages have text and put it under the cameras. Do not use a blank page: the camera would focus on the glass and not on the book.',
	focus_af_step_switch:
		'On each lens, find the switch marked AF / MF on the side of the barrel and slide it to AF.',
	focus_af_step_tick: 'A tick appears here for each camera when Captua reads AF from it.',
	focus_test_step_hold:
		'Bring the page against the glass, as you do to capture, and hold it there.',
	focus_test_step_take:
		'Press the pedal or "Take test captures". Each camera focuses and then captures; this can take up to 20 seconds.',
	focus_test_step_zoom: 'Zoom in on both captures: the text on the page must be sharp.',
	focus_test_step_again: 'If it is not, take the captures again.',
	focus_test_not_saved: 'These captures are not saved.',
	// A camera on AF that found no focus (HTTP 504): a lead, four checks and a closing line.
	focus_no_focus_lead: 'The camera could not focus and did not capture. Check that:',
	focus_no_focus_cap: 'the lens cap is off',
	focus_no_focus_light: 'the scanner light is on',
	focus_no_focus_glass: 'the page is against the glass',
	focus_no_focus_page: 'there is a page with text under the camera',
	focus_no_focus_again: 'Then take the captures again.',
	focus_focal: (mm: number) => `${mm} mm`,
	focus_focal_mismatch: (left: number, right: number) =>
		`The two cameras are at different zoom settings (left ${right} mm, right ${left} mm). Turn the zoom ring on one lens until they match, then take the captures again.`,
	focus_steps_show: 'Show steps',
	focus_steps_hide: 'Hide steps',
	focus_mf_step_switch: 'Slide the switch on each lens back to MF.',
	focus_mf_step_ring: 'Do not touch the focus ring: turning it loses the focus you just set.',
	focus_mf_step_tick: 'A tick appears for each camera when Captua reads MF.',
	focus_continue_anyway: 'Continue anyway',
	// NEH-339: the camera check, opened from the capture screen with
	// "Check cameras". Side is the page a camera takes.
	camcheck_open: 'Check cameras',
	camcheck_title: 'Camera check',
	camcheck_back: 'Back to capturing',
	camcheck_left_page: 'Right camera · even/verso',
	camcheck_right_page: 'Left camera · odd/recto',
	camcheck_chip_aria: (side: 'left' | 'right') =>
		`${side === 'left' ? 'Right camera · even/verso' : 'Left camera · odd/recto'}: show details`,
	camcheck_not_reachable: 'not reachable',
	camcheck_no_capture: 'No test capture yet',
	camcheck_taking: 'Taking the test capture…',
	// The detail is dash_camera_capture_not_connected or _timeout, in lowercase.
	camcheck_test_failed: (detail?: string) =>
		detail
			? `Captua could not take the test capture: ${detail}`
			: 'Captua could not take the test capture',
	camcheck_frame_unreachable: 'Captua could not reach this camera.',
	camcheck_unreachable_title: (side: 'left' | 'right') =>
		`Captua could not reach the ${side === 'left' ? 'right' : 'left'} camera.`,
	camcheck_unreachable_body:
		'Check that the camera is switched on and that its USB cable is plugged in. Then take test captures again.',
	camcheck_devices_failed: 'Captua could not read the list of cameras.',
	camcheck_idle: 'Take test captures to check the zoom and the focus.',
	camcheck_zoom: 'Zoom',
	camcheck_zoom_both: 'Zoom · both cameras',
	camcheck_zoom_each: 'Zoom · each camera',
	camcheck_zoom_in: (who: 'both' | 'left' | 'right') =>
		who === 'both' ? 'Zoom in' : `Zoom in, ${who === 'left' ? 'right' : 'left'} camera`,
	camcheck_zoom_out: (who: 'both' | 'left' | 'right') =>
		who === 'both' ? 'Zoom out' : `Zoom out, ${who === 'left' ? 'right' : 'left'} camera`,
	// After the step shown: the last step, from the cameras' zoom_steps.
	camcheck_zoom_of: (last: number) => `of ${last}`,
	camcheck_adjust_separately: 'Adjust separately',
	camcheck_adjust_together: 'Adjust together',
	camcheck_match: 'Match',
	camcheck_zoom_first:
		'Take test captures first: Captua can set the zoom once both cameras have taken one.',
	// The detail is the backend's, in English.
	camcheck_zoom_failed: (side: 'left' | 'right', detail?: string) =>
		detail
			? `Captua could not set the zoom of the ${side === 'left' ? 'right' : 'left'} camera: ${detail}`
			: `Captua could not set the zoom of the ${side === 'left' ? 'right' : 'left'} camera.`,
	camcheck_stale: 'The zoom was changed after these captures. Take test captures again.',
	camcheck_focal_hint:
		"Captua reads each camera's focal length from the test captures. To change it, turn the zoom ring on the lens.",
	camcheck_focal_read: 'Read from the test captures.',
	camcheck_focal_value: (mm: number) => String(mm),
	camcheck_mm: 'mm',
	camcheck_focal_differ_title: 'The two cameras are at different focal lengths.',
	camcheck_focal_differ_body:
		'Turn one zoom ring until the two numbers match. Then take test captures again.',
	camcheck_focus: 'Focus',
	camcheck_focus_hint: 'Press 1:1 on a capture to see it at full size. The text must be sharp.',
	camcheck_full_size_aria: (side: 'left' | 'right') =>
		`${side === 'left' ? 'Right camera · even/verso' : 'Left camera · odd/recto'}: actual size (1:1)`,
	camcheck_discarded: 'Captua does not save test captures to the volume.',
	camcheck_right_page_hint:
		'The image labeled odd/recto must show the page on the right of the open volume.',
	camcheck_take: 'Take test captures',
	camcheck_viewer_title: 'Test captures at full size',
	camcheck_viewer_hint: 'Drag a capture to move both. Check that the text is sharp on both pages.',
	camcheck_details_title: 'Cameras',
	camcheck_details_camera: (side: 'left' | 'right'): string =>
		side === 'left' ? 'Right camera · even/verso' : 'Left camera · odd/recto',
	camcheck_connection: 'Connection',
	camcheck_connected: 'Connected',
	camcheck_cannot_reach: 'Captua cannot reach it',
	camcheck_model: 'Model',
	camcheck_turn_aria: (side: 'left' | 'right') =>
		`Turn the capture of the ${side === 'left' ? 'even/verso' : 'odd/recto'} page 90° clockwise`,
	camcheck_turn_title: 'Turn 90° clockwise',
	// ── "Which camera is this?" (NEH-343) ─────────────────────────────────────
	camwhich_open: 'Change the page of each camera',
	camwhich_ask_title: 'Which image is the odd/recto page?',
	camwhich_identity_title: 'Captua cannot identify one of the cameras',
	camwhich_identity_body:
		'Tell the administrator: this camera has to be set up so that Captua can identify it. Until then, no one can capture on this unit.',
	camwhich_one_title: 'Captua needs both cameras connected',
	camwhich_one_body:
		'Check that both cameras are on and that the USB cables are connected. Then press "Reconnect cameras".',
	camwhich_check_again: 'Reconnect cameras',
	camwhich_rescanning: 'Captua is reconnecting the cameras…',
	camwhich_rescan_failed: 'Captua could not reconnect the cameras.',
	camwhich_leave: 'Leave the capture screen',
	camwhich_loading: 'Captua is reading the list of cameras…',
	camwhich_lead_unconfirmed: 'Captua does not know which page each camera photographs.',
	camwhich_lead_conflict: 'Captua has both cameras on record for the same page.',
	camwhich_lead_pair_changed:
		'These cameras are not the pair that was last confirmed on this unit.',
	camwhich_lead_port:
		'A camera is plugged into a different USB socket than the one it used when its page was confirmed. Check that each image is of the page named on it.',
	camwhich_how:
		'Press the image of the odd/recto page. Turn an image that is sideways or upside down.',
	camwhich_needed: 'Captua needs this answer before you can capture.',
	camwhich_camera: (n: number) => `Camera ${n}`,
	camwhich_pick_aria: (n: number) => `Camera ${n} photographs the odd/recto page`,
	camwhich_turn_aria: (n: number) => `Turn camera ${n}'s image 90° clockwise`,
	camwhich_guess: (side: 'left' | 'right') =>
		`Captua's guess: ${side === 'left' ? 'even/verso' : 'odd/recto'} page`,
	camwhich_frame_busy: 'Asking the camera for an image…',
	camwhich_frame_failed: 'Captua could not get an image from this camera.',
	camwhich_refresh: 'Refresh',
	camwhich_confirm: 'Confirm',
	camwhich_err_not_connected:
		'Captua could not save the answer because a camera was no longer connected. Check that both cameras are connected and press the image of the odd/recto page again.',
	camwhich_err_identity:
		'Captua could not save the answer because it cannot identify one of the cameras. Tell the administrator.',
	camwhich_err_unavailable:
		'Captua could not save which page each camera photographs. Try again in a moment.',
	camwhich_err_failed: 'Captua could not save which page each camera photographs.',
	tb_go_to_review: 'Review',
	tb_go_to_review_title: 'Back to reviewing this volume',
	tb_breadcrumb_nav: 'Current project and volume',
	tb_back: 'Back',
	tb_current_user: 'Current user',
	lvm_retake: 'Retake',
	lvm_retake_confirm: 'Retake this record? Captua keeps the current images as earlier versions.',
	lvm_retaking: 'Capturing replacement image…',
	lvm_full_size: 'View full size',
	lvm_thumbnails: 'View thumbnails',
	lvm_retake_error: (message: string) =>
		`Retake failed. ${message.endsWith('.') ? message : `${message}.`} The original images were kept.`,

	// ── Offsite catalogue copy (NEH-266) ─────────────────────────────────────
	backup_ind_current: (day: 'today' | 'yesterday' | 'earlier', date: string) =>
		day === 'today'
			? 'Catalog copied today'
			: day === 'yesterday'
				? 'Catalog copied yesterday'
				: `Catalog copied on ${date}`,
	backup_ind_stale: (day: 'today' | 'yesterday' | 'earlier', date: string) =>
		day === 'yesterday' ? 'No catalog copy since yesterday' : `No catalog copy since ${date}`,
	backup_ind_never: 'No verified catalog copy',
	backup_ind_off: 'Offsite copy not configured',
	backup_ind_local: 'Catalog on the scanner only',
	backup_ind_unknown: 'Could not check the state of the offsite copy',
	backup_section_title: 'Offsite copy',
	backup_section_desc:
		'Once a day, Captua copies the catalog to the destination configured when the scanner was installed, and verifies that the copy is complete.',
	backup_section_catalogue:
		'The catalog is the database that links each image to its project, its volume and its place in that volume.',
	backup_section_scope: 'This copy does not include the image files.',
	backup_cfg_current: (day: 'today' | 'yesterday' | 'earlier', date: string, time: string) => {
		if (day === 'today') return `Copy verified today at ${time}.`;
		if (day === 'yesterday') return `Copy verified yesterday at ${time}.`;
		return `Copy verified on ${date} at ${time}.`;
	},
	backup_cfg_stale: (day: 'today' | 'yesterday' | 'earlier', date: string) =>
		day === 'yesterday'
			? 'The last verified copy is from yesterday.'
			: `The last verified copy is from ${date}.`,
	backup_cfg_never: 'No copy has been verified yet.',
	backup_cfg_retry: 'While the scanner is on, Captua retries the copy from time to time.',
	backup_cfg_off: 'The offsite copy is not configured on this scanner.',
	backup_cfg_local: 'In the current mode, Captua keeps the catalog only on this scanner.',
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
	offsite_vol_mode_off: "Scanner only: Captua keeps this volume's images on the scanner",
	// A volume Captua keeps on the unit (NEH-320).
	offsite_vol_kept: "Captua keeps this volume's images only on the unit",
	kept_release_action: 'Include in the current mode',
	kept_release_title: 'Include this volume in the current mode?',
	kept_release_body:
		"Captua will copy this volume's images offsite, like any other volume's. In Fisqua mode it will also check the volume's reference code with Fisqua and then send it to Fisqua.",
	kept_release_inside:
		'If this volume holds other volumes that Captua keeps on this unit, Captua will include them in the current mode too.',
	kept_keep_action: 'Keep on this unit',
	kept_keep_title: 'Keep this volume on this unit?',
	kept_keep_body:
		"Captua keeps this volume's images on this unit, and sends it to Fisqua only once an administrator includes it.",
	kept_keep_inside: 'If this volume holds other volumes, Captua keeps them on this unit too.',
	kept_err_already_left:
		'Captua has already copied files of this volume, or of a volume inside it, offsite, or sent one of these volumes to Fisqua. So it can no longer keep this volume on this unit alone.',
	kept_err_already_kept: 'Captua already keeps this volume on this unit.',
	kept_err_not_kept: 'Captua already includes this volume in the current mode.',
	kept_err_kept_parent:
		'Captua keeps the volume that holds this one on this unit. Include that volume in the current mode first, and Captua will include this one with it.',
	kept_err_other: "Captua couldn't make the change. Try again.",
	pd_kept_on_unit: 'Keep on this unit',
	pd_kept_on_unit_offline: 'In "Scanner only" mode, Captua keeps every new volume on this unit.',
	pd_kept_on_unit_help:
		'For test volumes: Captua keeps its images only on this unit and does not check its reference code with Fisqua until an administrator includes it.',
	offsite_vol_unknown: 'Could not check the offsite copy of this volume',
	offsite_last_verified: (
		day: 'today' | 'yesterday' | 'earlier',
		date: string,
		time: string
	): string => {
		if (day === 'today') return `last verified today at ${time}`;
		if (day === 'yesterday') return `last verified yesterday at ${time}`;
		return `last verified on ${date} at ${time}`;
	},
	offsite_unit_title: 'Image files',
	offsite_unit_off: 'The offsite copy of the image files is not configured on this scanner.',
	offsite_unit_mode_off: 'In the current mode, Captua keeps the image files only on this scanner.',
	offsite_unit_misconfigured:
		'The offsite copy of the image files is not configured correctly on this scanner. Let whoever administers it know.',
	offsite_unit_empty: 'There are no image files to copy yet.',
	offsite_unit_volumes: (received: number, volumes: number) =>
		`${formatCount(received, 'en')} of ${formatCount(volumes, 'en')} ${volumes === 1 ? 'volume' : 'volumes'} stored offsite in full.`,
	offsite_unit_files: (verified: number, total: number, pending: number) =>
		`${formatCount(verified, 'en')} of ${formatCount(total, 'en')} files verified, ${formatCount(pending, 'en')} pending.`,
	offsite_unit_refused: (refused: number): string =>
		refused === 1
			? '1 file needs attention.'
			: `${formatCount(refused, 'en')} files need attention.`,
	offsite_cfg_last_verified: (
		day: 'today' | 'yesterday' | 'earlier',
		date: string,
		time: string
	): string => {
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
	fisqua_out_failed: (
		day: 'today' | 'yesterday' | 'earlier',
		date: string,
		time: string
	): string => {
		const when =
			day === 'today'
				? `today at ${time}`
				: day === 'yesterday'
					? `yesterday at ${time}`
					: `on ${date} at ${time}`;
		return `Captua could not send the capture manifest to Fisqua; it will try again ${when}`;
	},
	fisqua_out_failed_no_time:
		'Captua could not send the capture manifest to Fisqua; it will try again',
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
	fisqua_problems: (n: number): string =>
		n === 1 ? '1 problem' : `${formatCount(n, 'en')} problems`,
	// Fisqua's own text, as it sent it.
	fisqua_notes: (n: number): string => (n === 1 ? '1 note' : `${formatCount(n, 'en')} notes`),
	fisqua_more: (n: number): string => `and ${formatCount(n, 'en')} more`,
	fisqua_note_unlisted_object: (key: string): string =>
		`The offsite copy holds a file the capture manifest does not name: ${key}`,
	fisqua_note_missing_object: (key: string): string =>
		`The capture manifest names a file the offsite copy does not hold; Fisqua does not read it to process the volume: ${key}`,
	fisqua_rule_bad_request:
		'Fisqua refused the capture manifest as malformed, without naming a problem.',
	fisqua_rule_payload_too_large:
		'Fisqua refused the capture manifest as too large, without naming a problem.',
	fisqua_problem_from_fisqua: (message: string): string => `From Fisqua: ${message}`,
	fisqua_incident_object_missing:
		'Fisqua could not find some files in the offsite copy that Captua had already verified there. This needs investigating: ask whoever manages the scanner to check the offsite copy. The missing files are listed below.',
	fisqua_role_single: 'Single image',
	fisqua_kind_capture: 'Master file',
	fisqua_kind_preview: 'Preview',
	fisqua_history: (n: number): string => `Earlier sends (${formatCount(n, 'en')})`,
	fisqua_cfg_token:
		'Fisqua does not accept the token configured on this scanner, so Captua has stopped sending volumes to Fisqua and checking their status. Ask whoever manages the scanner to correct CAPTUA_FISQUA_TOKEN and restart Captua.',
	fisqua_cfg_not_found:
		'Fisqua does not recognize the address configured on this scanner, so Captua has stopped sending volumes to Fisqua and checking their status. Ask whoever manages the scanner to correct CAPTUA_FISQUA_ENV, CAPTUA_FISQUA_BASE_URL or CAPTUA_OFFSITE_TENANT and restart Captua.',
	fisqua_cfg_redirect:
		'The Fisqua address configured on this scanner redirects to another address. Captua does not follow it, so that the token is not sent elsewhere, and has stopped sending volumes to Fisqua and checking their status. Ask whoever manages the scanner to correct CAPTUA_FISQUA_ENV or CAPTUA_FISQUA_BASE_URL and restart Captua.',
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
	fisqua_unit_send_done: (
		delivered: number,
		refused: number,
		failed: number,
		waiting: number
	): string =>
		`Last send: ${formatCount(delivered, 'en')} delivered, ${formatCount(refused, 'en')} refused, ${formatCount(failed, 'en')} to try again, ${formatCount(waiting, 'en')} waiting for the offsite copy.`,
	fisqua_unit_send_config_error: 'Last send: stopped by the configuration error below.',
	fisqua_unit_send_error:
		'Captua could not finish the last send. It tries again after the next image upload to the offsite copy.',
	fisqua_unit_send_stopped:
		'Captua stopped the last send before it finished, and continues after the next image upload to the offsite copy.',
	fisqua_unit_send_other: 'Captua sent nothing to Fisqua on its last run.',
	fisqua_unit_poll_none: 'Captua has not asked Fisqua for a status since the last restart.',
	fisqua_unit_poll_done: (asked: number, answered: number): string =>
		`Last status check: Captua asked about ${asked === 1 ? '1 volume' : `${formatCount(asked, 'en')} volumes`}, and Fisqua answered for ${formatCount(answered, 'en')}.`,
	fisqua_unit_poll_config_error: 'Last status check: stopped by the configuration error below.',
	fisqua_unit_poll_error: 'Captua could not finish the last status check. It asks again later.',
	fisqua_unit_poll_cooling:
		'Last status check: Fisqua asked Captua to wait. Captua asks again later.',
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
	// NEH-380: whether freed files can be brought back to this unit (`restorable`).
	offsite_free_restorable: 'An administrator can restore these files to the card later.',
	offsite_free_not_restorable:
		'The files will stay stored in the offsite copy, but this unit cannot read it: from here it will not be possible to restore them to the card or to export the volume.',
	offsite_free_check_note:
		"Before it removes each file, Captua compares its checksum with the offsite copy's again. This can take several minutes.",
	offsite_plan_nothing: 'Captua found no files it can free on this volume.',
	offsite_plan_left: (n: number): string =>
		n === 1
			? 'Captua will leave 1 file on the SD card:'
			: `Captua will leave ${formatCount(n, 'en')} files on the SD card:`,
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
		n === 1
			? 'Captua left 1 file on the SD card:'
			: `Captua left ${formatCount(n, 'en')} files on the SD card:`,
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
		n === 1
			? 'Captua could not restore 1 file:'
			: `Captua could not restore ${formatCount(n, 'en')} files:`,
	offsite_err_no_stem:
		'This volume has no stem, so none of its files are stored offsite, and there is nothing to free or restore.',
	offsite_err_not_received:
		'Not every file of this volume is verified in the offsite copy yet. Wait for Captua to finish copying them.',
	offsite_err_listing:
		'Captua could not reach the offsite copy, so it checked and removed nothing. Try again later.',
	offsite_err_no_read_remote:
		'This scanner is not set up to restore: it needs read access to the offsite copy. Ask whoever installed the scanner to set it up.',
	offsite_err_not_in_own_folder:
		"Some of this volume's files are not yet in the volume's own folder, so Captua cannot free or restore them. Captua moves them there at startup: restart the scanner and try again. If Captua still cannot free or restore them after the restart, tell an administrator.",
	offsite_err_job_running:
		'Captua is already freeing or restoring files of this volume. Wait for it to finish.',
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
		n === 1
			? '1 file is not in the offsite copy.'
			: `${formatCount(n, 'en')} files are not in the offsite copy.`,
	offsite_reason_listed_without_sha1: (n: number): string =>
		n === 1
			? '1 file is listed in the offsite copy without a checksum to compare.'
			: `${formatCount(n, 'en')} files are listed in the offsite copy without a checksum to compare.`,
	offsite_reason_bucket_sha1_differs: (n: number): string =>
		n === 1
			? 'For 1 file, the offsite copy does not match the file on the SD card.'
			: `For ${formatCount(n, 'en')} files, the offsite copy does not match the file on the SD card.`,
	offsite_reason_local_file_missing: (n: number): string =>
		n === 1
			? '1 file is not on the SD card.'
			: `${formatCount(n, 'en')} files are not on the SD card.`,
	offsite_reason_local_file_unreadable: (n: number): string =>
		n === 1
			? 'Captua could not read 1 file on the SD card.'
			: `Captua could not read ${formatCount(n, 'en')} files on the SD card.`,
	offsite_reason_local_sha1_differs: (n: number): string =>
		n === 1
			? '1 file on the SD card does not match its offsite copy.'
			: `${formatCount(n, 'en')} files on the SD card do not match their offsite copy.`,
	offsite_reason_changed: (n: number): string =>
		n === 1
			? '1 file was changed or deleted while Captua was working.'
			: `${formatCount(n, 'en')} files were changed or deleted while Captua was working.`,
	offsite_reason_could_not_remove: (n: number): string =>
		n === 1
			? 'Captua could not remove 1 file from the SD card.'
			: `Captua could not remove ${formatCount(n, 'en')} files from the SD card.`,
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
		n === 1
			? 'Captua could not write 1 file to the SD card.'
			: `Captua could not write ${formatCount(n, 'en')} files to the SD card.`,
	offsite_reason_other: (n: number): string =>
		n === 1 ? '1 file, for another reason.' : `${formatCount(n, 'en')} files, for other reasons.`,

	// ── Cola: imported digitisation lists (0.2.0) ────────────────────────────
	queue_title: 'Digitization queue',
	queue_subtitle: "The items of the imported digitization lists, in the list's order.",
	queue_import: 'Import list',
	queue_importing: 'Importing…',
	queue_import_file_label: 'Digitization list file',
	queue_list_label: 'List',
	queue_list_option: (name: string, date: string) => `${name}, imported ${date}`,
	queue_imported_at: (date: string) => `Imported ${date}`,
	queue_empty:
		'No lists have been imported yet. Import a digitization list to see its items here in order.',
	queue_list_file_missing:
		"Captua has no copy of this list's file, so it cannot show the list's items. Import the file again to see them.",
	queue_load_error: 'The queue could not be loaded.',
	queue_filter_label: 'Action',
	queue_filter_all: 'All',
	queue_action_spot_recapture: 'Spot recapture',
	queue_action_full_rescan: 'Full rescan',
	queue_action_full_digitisation: 'Full digitization',
	queue_action_complete: 'Completion',
	queue_next: 'Next',
	queue_done: 'Finished',
	queue_no_volume: 'No volume on this unit',
	queue_mark_done: 'Mark as finished',
	queue_unmark_done: 'Unmark',
	queue_done_by: (who: string, date: string) => `Marked finished by ${who} on ${date}`,
	queue_done_by_who: (who: string) => `Marked finished by ${who}`,
	queue_done_on: (date: string) => `Marked finished on ${date}`,
	queue_done_marked: 'Marked finished',
	queue_done_approved: 'Every record is approved.',
	queue_mark_error: "Captua could not change this item's mark.",
	queue_mark_error_busy: 'Captua could not save the change just now. Try again.',
	queue_refresh_error: 'The queue could not be refreshed; what you see may be out of date.',
	queue_next_hidden: 'The next item is hidden by the filter.',
	queue_order_label: (n: number) => `Order ${formatCount(n, 'en')}`,
	// Import report
	queue_report_title: (name: string) => `List imported: ${name}`,
	queue_report_created: (n: number) =>
		n === 1 ? 'Captua created 1 volume.' : `Captua created ${formatCount(n, 'en')} volumes.`,
	queue_report_skipped: (n: number) =>
		n === 1 ? 'Captua skipped 1 item.' : `Captua skipped ${formatCount(n, 'en')} items.`,
	queue_report_project_created: (name: string) => `Captua created the project ${name}.`,
	queue_report_list_not_stored:
		'Captua imported the list but could not keep a copy of the file, so the queue cannot show it.',
	queue_report_item: (position: number, code: string | null) =>
		code ? `Item ${formatCount(position, 'en')} (${code})` : `Item ${formatCount(position, 'en')}`,
	// Why an item was skipped, one per reason code in app/core/list_import.py.
	queue_reason_item_not_an_object: 'The item is not a JSON object.',
	queue_reason_missing_reference_code: 'The item has no reference code.',
	queue_reason_invalid_reference_code: 'The reference code is not text, or is too long.',
	queue_reason_reference_code_padded: 'The reference code begins or ends with spaces.',
	queue_reason_reference_code_duplicated_in_list:
		'An earlier item in this list has the same reference code.',
	queue_reason_missing_filename_stem: 'The item has no file name stem.',
	queue_reason_filename_stem_not_a_slug:
		'The file name stem may hold only lowercase letters a to z and digits, separated by single hyphens.',
	queue_reason_filename_stem_too_long: 'The file name stem is too long.',
	queue_reason_filename_stem_differs_from_reference_code:
		'The file name stem is not the same as the reference code.',
	queue_reason_filename_stem_duplicated_in_list:
		'An earlier item in this list has the same file name stem.',
	queue_reason_missing_title: 'The item has no title.',
	queue_reason_invalid_title: 'The title is not text, or is too long.',
	queue_reason_invalid_dates: 'The dates are not in the form YYYY-MM-DD.',
	queue_reason_end_date_before_start: 'The end date is before the start date.',
	queue_reason_invalid_sequence: 'The sequence is not a valid whole number.',
	queue_reason_reference_code_on_unit: 'A volume with this reference code is already on this unit.',
	queue_reason_filename_stem_on_unit: 'A volume with this file name stem is already on this unit.',
	queue_reason_refused_by_database: 'The database refused the volume.',
	queue_reason_filename_stem_is_project_directory:
		"The file name stem is the name of a project's folder on this unit.",
	queue_reason_filename_stem_directory_occupied:
		"A folder named as this file name stem already holds files on this unit, and Captua never merges two volumes' files.",
	queue_reason_filename_stem_held_offsite:
		'The offsite copy holds images under this file name stem, so Captua cannot give it to a new volume.',
	queue_reason_mode_changed:
		"Someone changed the unit's mode during the import, so Captua did not create this volume.",
	queue_reason_unknown: (code: string) => `Captua did not create this volume (${code}).`,
	// Why the whole file was refused, by the response's HTTP status.
	queue_import_err_unreadable: 'Captua could not read the file.',
	queue_import_err_needs_admin:
		"No project has this list's name. If Captua imported the list, it would create one, and only an admin can do that.",
	queue_import_err_list_reused:
		'A list with this id was already imported from a different file, or Captua could not check the earlier import, so Captua did not import this one.',
	queue_import_err_too_large: 'The file is larger than 10 MB.',
	queue_import_err_refused: 'The file is not a digitization list Captua can import.',
	queue_import_err_busy: 'Captua could not import the list just now. Try again.',
	queue_import_err_other: 'Captua could not import the list.',
	// ── The Fisqua queue in Cola (contract 1.7) ──────────────────────────────
	queue_fisqua_name: (name: string) => `Fisqua queue: ${name}`,
	queue_fisqua_option: (name: string, date: string) => `Fisqua queue: ${name}, updated ${date}`,
	queue_updated_at: (date: string) => `Updated ${date}`,
	queue_assignee: (who: string) => `Assigned to ${who}`,
	queue_unassigned: 'Unassigned',
	queue_assignee_filter_label: 'Assigned to',
	queue_assignee_mine: 'Mine',
	queue_assignee_everyone: 'Everyone',
	queue_assignee_empty: 'No item in the queue matches this filter.',
	queue_operator_empty: 'No item in the queue is assigned to you or unassigned.',
	queue_items_empty: 'The queue has no items to show.',
	queue_retake_record: (id: number) => `Record #${id}`,
	queue_mark_conflict:
		"This item has changed in Fisqua's queue. Captua has reloaded the queue: check the item and try again.",
	q_to_retake: (n: number) =>
		n === 1 ? '1 record to retake' : `${formatCount(n, 'en')} records to retake`,

	// ── Por recapturar: rejected records waiting for a retake (0.2.0) ──────────
	retakes_title: 'To retake',
	retakes_subtitle: "Openings to capture again, or for the first time, in each volume's order.",
	retakes_empty: 'Nothing is waiting to be retaken.',
	retakes_load_error: 'The records to retake could not be loaded.',
	retakes_retake: 'Retake',
	retakes_sequence: (n: number) => `Sequence ${formatCount(n, 'en')}`,
	retakes_rejected_by: (who: string, date: string) => `Rejected by ${who} on ${date}`,
	retakes_rejected_on: (date: string) => `Rejected on ${date}`,
	retakes_no_reason: 'No reason was recorded for this rejection.',
	retakes_comment_label: 'Note',
	retakes_no_volume: 'This record is in no volume.',
	retakes_filter_volume_label: 'Volume',
	retakes_filter_all_volumes: 'All volumes',
	retakes_filter_empty: 'This volume has no records to retake.',
	// ── An opening with a page never photographed (0.3.2) ───────────────────
	missing_page: 'This page was not captured',
	missing_page_reason: 'A page is missing: recapture the whole opening',
	// ── Openings and pages never captured: placeholders (NEH-317) ───────────
	pill_opening_missing: 'Opening not captured',
	pill_page_missing: 'Page not captured',
	pill_closed: 'Closed',
	legend_title: 'Legend',
	legend_rejected: 'Rejected in review: has images, needs a new capture',
	legend_never: 'Never captured: a page or a whole opening',
	legend_closed: 'Closed with a reason: no longer to retake',
	toolbar_mark_missing: 'Mark an opening missing',
	hover_missing_here: 'An opening is missing here',
	mark_pick_hint: 'Choose the record the missing opening goes after.',
	mark_title: 'Mark an opening missing',
	mark_body: (n: number, f: string | null) =>
		f
			? `After record ${formatCount(n, 'en')}, which ends at folio ${f}. Captua puts an empty opening in its place, and it is listed with the retakes.`
			: `After record ${formatCount(n, 'en')}. Captua puts an empty opening in its place, and it is listed with the retakes.`,
	mark_count_legend: 'How many openings are missing?',
	mark_count_unknown: 'Not known: the operator will see when the volume is open',
	mark_count_one: 'One',
	mark_count_more: 'More than one',
	mark_count_number_aria: 'Number of openings',
	mark_expected: 'What should be there (optional)',
	mark_note: 'Note for the operator',
	mark_cancel: 'Cancel',
	mark_submit: 'Mark missing',
	mark_error: 'The opening could not be marked missing. Try again.',
	cap_title: (f: string | null, n: number) =>
		f ? `Missing opening after folio ${f}` : `Missing opening after record ${formatCount(n, 'en')}`,
	cap_where: 'Where it goes',
	cap_from_review: 'From Fisqua review',
	cap_after: 'After a capture',
	cap_another_q: (f: string | null) =>
		f
			? `Captured. Is another opening missing before folio ${f}?`
			: 'Captured. Is another opening missing here?',
	cap_another: 'Capture another here',
	cap_last: 'That was the last one',
	cap_order_note: (n: number, img: string | null) =>
		img
			? `Order and file names are separate. This opening's place is after record ${formatCount(n, 'en')}. Its files take the volume's next capture number, ${img}.`
			: `Order and file names are separate. This opening's place is after record ${formatCount(n, 'en')}. Its files take the volume's next capture number.`,
	cap_refresh_error:
		"The opening was captured, but the volume's records could not be read again. Retry to see where the next one goes.",
	cap_nothing_link: 'There is no opening to capture here',
	close_title: 'No opening to capture here',
	close_body: (f: string | null) =>
		f
			? `The empty opening after folio ${f} is closed and stays in the volume with your reason, so reviewers can see what was checked.`
			: 'The empty opening is closed and stays in the volume with your reason, so reviewers can see what was checked.',
	close_legend: 'What did you find?',
	close_reason_skip: 'The foliation skips a number; no leaf is missing',
	close_reason_leaf_missing: 'The leaf is missing from the volume',
	close_reason_elsewhere: 'The pages are already captured elsewhere in the volume',
	close_reason_other: 'Something else',
	close_details: 'Details',
	close_back: 'Back to capture',
	close_submit: 'Close the opening',
	close_after_note:
		"A closed opening no longer counts as a retake, so it doesn't hold the volume back. It goes to Fisqua with the volume, carrying its reason.",
	close_note_required: 'For "Something else", write the details.',
	close_err_not_missing: 'This record is not missing anything, so there is nothing to close.',
	close_err_already_closed: 'This opening was already closed.',
	close_err_failed: 'The opening could not be closed. Try again.',
	close_page_title: 'No page to capture here',
	close_page_body:
		'The missing page is closed and stays in the volume with your reason, so reviewers can see what was checked.',
	close_page_reason_elsewhere: 'The page is already captured elsewhere in the volume',
	close_page_submit: 'Close the page',
	close_page_after_note:
		"A closed page no longer counts as a retake, so it doesn't hold the volume back. It goes to Fisqua with the volume, carrying its reason.",
	close_page_err_already_closed: 'This page was already closed.',
	close_page_err_failed: 'The page could not be closed. Try again.',
	retakes_no_opening: 'No opening here',
	retakes_no_page: 'No page here',
	retakes_capture: 'Capture',
	retakes_page_missing_row: (side: 'left' | 'right') =>
		`The ${side === 'left' ? 'even/verso' : 'odd/recto'} page was never photographed. A capture with both cameras replaces the opening.`,
	retakes_volume_pending: (n: number) => `${formatCount(n, 'en')} pending`,
	// ── Capture instruction band on the capture screen (0.2.0) ──────────────
	lv_instruction_label: 'From the list',
	lv_instruction_show_all: 'Show all',
	lv_instruction_show_less: 'Show less',

	// ── The recapture turn (0.2.0) ──────────────────────────────────────────
	// Resumen band and "Volumes with retakes".
	retake_band_title: (n: number, v: number) =>
		`${n === 1 ? '1 page pair' : `${formatCount(n, 'en')} page pairs`} to retake in ${v === 1 ? '1 volume' : `${formatCount(v, 'en')} volumes`}`,
	retake_band_body:
		"They were rejected in review or not captured in full. Finish one volume's retakes before starting a new one.",
	retake_band_most: (name: string, n: number) => `Most pending: ${name} (${formatCount(n, 'en')}).`,
	retake_band_cta: 'Start retakes',
	retake_vols_title: 'Volumes with retakes',
	retake_pending_of: (p: number, t: number) =>
		`${formatCount(p, 'en')} of ${formatCount(t, 'en')} pending`,
	retake_cta: 'Retake',
	// Cola.
	// Cola's sections (0.3.1), numbered by the sections shown.
	section_progress_title: (n: number) => `${ordinalEn(n)}: finish what's in progress`,
	section_progress_sub: 'Volumes whose capture has already started on this unit.',
	section_rework_title: (n: number) => `${ordinalEn(n)}: recaptures and rescans`,
	section_rework_sub:
		'Volumes with page pairs to recapture, then the ones to digitize again in full.',
	section_new_title: (n: number) => `${ordinalEn(n)}: new material`,
	section_new_sub: 'Volumes never digitized before.',
	q_new_locked: 'To start a new volume, first finish the retakes of one volume.',
	turn_recap_title: 'Retake turn',
	turn_recap_body: 'Finish the retakes of one volume and you can start a new one.',
	turn_new_title: 'New volume turn',
	turn_new_body: (name: string) =>
		`The retakes of volume ${name} are finished. You can start a new volume.`,
	// The volume page.
	vol_band_title: (n: number) =>
		n === 1 ? '1 page pair to retake' : `${formatCount(n, 'en')} page pairs to retake`,
	vol_band_cta: 'Retake now',
	vol_handover_disabled: (n: number) =>
		n === 1 ? '1 retake left' : `${formatCount(n, 'en')} retakes left`,
	vol_handover_hint: 'You can send the volume to review once the retakes are finished.',
	// The capture screen: the block, the unlock band and the guided retake.
	block_title: 'First, finish the retakes of one volume',
	block_body:
		'While this unit has retakes pending, a new volume can be started only after the retakes of one volume are finished. It is the retake turn now.',
	block_next: (name: string, n: number) =>
		`Next in the queue: ${name}, with ${n === 1 ? '1 page pair' : `${formatCount(n, 'en')} page pairs`} to retake.`,
	block_cta: (name: string) => `Retake ${name}`,
	block_back: 'Back to the queue',
	block_admin: 'Capture anyway (admin)',
	unlock_title: 'You can start this volume',
	unlock_body: (name: string) =>
		`The retakes of volume ${name} are finished. Once you start this volume you can capture it without limit; the next turn will be for retakes.`,
	unlock_cta: 'Start capturing',
	guide_header: (k: number, n: number, name: string) =>
		`Retake ${formatCount(k, 'en')} of ${formatCount(n, 'en')} · ${name}`,
	guide_skip: 'Skip for now',
	guide_next: (f: string) => `Next: folios ${f}`,
	guide_done: (turnNew: boolean) =>
		turnNew
			? 'You finished the retakes of this volume. You can now start a new volume.'
			: 'You finished the retakes of this volume.',
	guide_done_queue: 'Go to the queue',
	guide_done_more: 'Retake another volume',
	err_recapture_turn:
		'The volume could not be started: it is the retake turn. Finish the retakes of one volume and try again.',
	err_recaptures_pending: (n: number) =>
		`The volume could not be sent to review: ${n === 1 ? '1 retake left' : `${formatCount(n, 'en')} retakes left`}.`,
	vol_excluded_count: (n: number) => `${formatCount(n, 'en')} excluded`,
	err_upload_excluded: "Fisqua excluded this record, so images can't be added to it.",
	err_delete_excluded: 'Fisqua excluded this record, so only an administrator can delete it.',

	// ── The unit's mode and projects setting (NEH-311, NEH-313) ─────────────
	unit_mode_offline: 'Scanner only',
	unit_mode_backup: 'Offsite copy only',
	unit_mode_fisqua: 'Fisqua',
	unit_section_title: 'Unit mode',
	unit_section_desc:
		'Decides what leaves this unit and where its volumes come from. Changing it moves no volume or record.',
	unit_mode_legend: 'Mode',
	unit_mode_offline_desc:
		'Captua keeps the images and the catalog only on this unit. Volumes are created here.',
	unit_mode_backup_desc:
		'Images and the catalog are copied to the bucket. Volumes are created here.',
	unit_mode_fisqua_desc:
		"Volumes come from Fisqua's queue. Handovers, status and review decisions go over the link. Operators can't create volumes; an administrator can, and each change is logged.",
	unit_current: 'Current mode',
	unit_mode_set_by: (name: string, date: string) => `Chosen by ${name} on ${date}.`,
	unit_mode_set_by_unit: (date: string) =>
		`Captua chose it when the unit first started, on ${date}.`,
	unit_mode_set_before:
		'Chosen with a version of Captua before 0.4.0, which did not record who chose it or when.',
	unit_projects_title: 'Projects',
	unit_projects_desc: 'Only in "Scanner only" mode. Off: every volume is in one list.',
	unit_projects_toggle: 'Use projects',
	unit_try_again: 'Try again',
	unit_leave_fisqua_title: 'Leaving Fisqua mode',
	unit_leave_fisqua_body:
		'Handovers not yet sent wait on the unit, and go to Fisqua if the unit returns to Fisqua mode. Nothing is deleted.',
	unit_leave_fisqua_confirm: (label: string) => `Switch to "${label}"`,
	unit_refused_title: (target: string, current: string) =>
		`The unit can't switch to ${target === 'Fisqua' ? target : `"${target}"`} mode. It stays in "${current}".`,
	unit_problem_offsite_not_configured:
		'The offsite copy of the images is not configured on this unit. It is set when the unit is provisioned.',
	unit_problem_catalogue_dump_not_configured:
		"The catalog's offsite copy is not configured or has no encryption key. It is set when the unit is provisioned.",
	unit_problem_fisqua_not_configured:
		'The link to Fisqua is not configured on this unit. It is set when the unit is provisioned.',
	unit_problem_fisqua_unreachable:
		"Fisqua could not be reached. Check the unit's connection and try again.",
	unit_problem_offsite_held:
		'The offsite copy is on hold on this unit, so nothing can be sent to Fisqua until the hold is lifted.',
	unit_problem_mode_changed:
		"Someone else changed the unit's settings meanwhile. Captua has read them again: check the mode and try again.",
	unit_problem_other: "Captua couldn't change the mode, for a reason it doesn't recognize.",
	// Leaving "Scanner only" with volumes Captua keeps on the unit (NEH-320).
	unit_problem_kept_volumes_decision:
		'Captua keeps volumes made in "Scanner only" mode on this unit. Choose whether Captua includes them or keeps them here.',
	unit_kept_title: 'Volumes Captua keeps on this unit',
	unit_kept_body: (label: string) =>
		`Captua keeps these volumes, made in "Scanner only" mode, on this unit. Choose whether Captua includes them in "${label}" mode or keeps them here.`,
	unit_kept_catalogue:
		'If you choose to keep them here, Captua copies their records with the catalog and keeps their images only on this unit.',
	unit_kept_files: (n: number) => (n === 1 ? '1 file' : `${formatCount(n, 'en')} files`),
	unit_kept_include: 'Include them',
	unit_kept_keep: 'Keep them here',
	unit_err_save: "Captua couldn't save the unit mode. Try again.",
	unit_err_load: "Captua couldn't read the unit mode.",
	nav_volumes: 'Volumes',
	vols_count: (n: number) => (n === 1 ? '1 volume' : `${formatCount(n, 'en')} volumes`),
	vols_search_label: 'Search',
	vols_search_placeholder: 'Name, stem or reference code',
	vols_stage_label: 'Stage',
	vols_stage_all: 'All stages',
	vols_col_stem: 'Stem',
	vols_empty: 'There are no volumes on this unit.',
	vols_load_error: "Captua couldn't load the volumes.",
	col_back_to_volumes: 'Back to Volumes',
	pd_field_stem_fisqua: 'FILE NAME STEM (FISQUA REFERENCE CODE)',
	pd_fisqua_admin_note:
		"The unit is in Fisqua mode. Volumes normally come from Fisqua's queue. The stem must be a reference code that exists in Fisqua; it is checked when you save, and the change is recorded in the log.",
	pd_fisqua_codes_readonly:
		'The unit is in Fisqua mode: the stem comes from Fisqua, and only an administrator can change it.',
	pd_err_unknown_reference_code: (code: string) =>
		`Fisqua has no description with the code ${code}. Check the code in Fisqua.`,
	pd_err_stem_required_fisqua:
		"In Fisqua mode a volume's stem is its Fisqua reference code, so it can't be empty.",
	pd_fisqua_unreachable_title: "Fisqua couldn't be reached to check the code",
	pd_fisqua_no_lookup_title: "This Fisqua can't check reference codes",
	pd_fisqua_list_instead:
		"The volume can't be saved now. You can import a list file exported from Fisqua in Cola instead.",
	pd_err_volumes_from_fisqua:
		"In Fisqua mode, volumes come from Fisqua's queue. Only an administrator can create a volume or change its stem or reference code.",
	pd_search_list_label: 'Fisqua descriptions',
	pd_search_searching: 'Captua is searching Fisqua…',
	pd_search_none: 'Fisqua has no description that matches.',
	pd_search_count: (n: number) =>
		n === 1 ? '1 description' : `${formatCount(n, 'en')} descriptions`,
	pd_search_unavailable:
		"Captua can't search Fisqua right now. You can still type the full reference code.",
	pd_stem_search_help:
		'Type at least 3 characters of the reference code or of the title, and choose the Fisqua description that matches.',
	pd_level_fonds: 'Fonds',
	pd_level_subfonds: 'Subfonds',
	pd_level_series: 'Series',
	pd_level_subseries: 'Subseries',
	pd_level_file: 'File',
	pd_level_item: 'Item',
	pd_level_collection: 'Collection',
	pd_level_section: 'Section',
	pd_level_volume: 'Volume',
	queue_unit_mode: (label: string) => `Unit mode: ${label}`,
	queue_fisqua_volumes_line:
		"Volumes come from Fisqua's queue. To add a volume, ask for it to be added to the queue in Fisqua.",
	queue_import_err_volumes_from_fisqua:
		"In Fisqua mode only an administrator can import a list: volumes come from Fisqua's queue.",

	// ── Settings → Testing: the testing space (NEH-391) ──
	config_section_testing: 'Testing',
	testing_desc:
		'The testing space is one shared account for practice and tests. Its projects and volumes stay on this unit and are never sent to Fisqua or copied offsite. Testing volumes are removed after the term set here.',
	testing_state_label: 'Status',
	testing_state_on: 'On',
	testing_state_off: 'Off',
	testing_account_label: 'Testing account',
	testing_account_none: 'No testing account yet',
	testing_counts: (projects: number, volumes: number): string =>
		`${formatCount(projects, 'en')} testing ${projects === 1 ? 'project' : 'projects'} and ${formatCount(volumes, 'en')} testing ${volumes === 1 ? 'volume' : 'volumes'}`,
	testing_username_label: 'Username',
	testing_password_label: 'Password',
	testing_expiry_label: 'Days without a new capture before Captua removes a testing volume',
	testing_expiry_hint: 'A whole number from 1 to 365.',
	testing_switch_on: 'Switch on',
	testing_switch_off: 'Switch off',
	testing_off_confirm_text:
		'The testing account can no longer sign in and is signed out everywhere. Its projects and volumes stay until they expire.',
	testing_off_confirm: 'Switch off the testing space',
	testing_term_save: 'Save term',
	testing_new_username_label: 'New username',
	testing_rename: 'Rename account',
	testing_new_password_label: 'New password',
	testing_password_set: 'Set new password',
	testing_password_signout: 'Changing the password signs out everyone using the testing account.',
	testing_saved: 'Saved.',
	testing_err_username: 'Enter a username of 1 to 150 characters.',
	testing_err_password_empty: 'Enter a password.',
	testing_err_days: 'Enter a whole number of days from 1 to 365.',
	testing_err_account_required: 'Enter a username and a password to create the testing account.',
	testing_err_space_off: 'The testing space is off. Switch it on first.',
	testing_err_username_taken: 'That username is already in use. Choose another.',
	testing_err_account_exists: 'The testing account already exists.',
	testing_err_no_account: 'There is no testing account yet.',
	testing_err_password_invalid:
		'That password has characters that cannot be stored. Choose another.',
	testing_err_generic: 'The change could not be saved. Try again.',
	testing_err_load: 'Captua could not load the testing space. Reload the page to try again.',

	// ── The testing account's own screens (NEH-391) ──
	testing_expires_on: (date: string): string => `Captua will remove this volume on ${date}.`,
	testing_expires_due: 'Captua removes this volume at its next clean-up, within the hour.',
	testing_err_reserve:
		'Not enough free space is left to capture into testing volumes. What is left is kept for real work.',
	testing_err_project_directory_taken:
		'Another project already has a name like this one. Choose a name that differs by more than capital letters, accents or punctuation.',
	testing_err_project_name_invalid:
		'This name cannot be used. Choose a shorter name with at least one letter or digit.',
	testing_err_volume_codes:
		"The testing account does not set a volume's file name stem or reference code.",
	testing_err_not_found:
		'This is not in the testing space or no longer exists. Captua removes testing volumes when their term ends.',
	testing_err_other: 'Captua could not do this. Try again.',
	testing_err_project_not_empty:
		'This project still has volumes. Move or delete them first, then delete the project.',
	testing_err_project_files_held:
		'Captua still keeps files in this project that belong to other records. Tell an administrator, who has to move those records.',
	testing_err_project_storage:
		'Captua cannot read one of the drives that hold testing files right now. Tell an administrator, who has to check the drive.',
	testing_err_volume_busy:
		'Captua could not delete the volume: it is in use, or Captua cannot read its files. Try again later.',
	testing_delete_volume_confirm:
		'This removes the volume with its records and images. It cannot be undone.',
	testing_download_pictures: 'Download pictures',
	testing_cameras_not_set_up:
		'The cameras are not set up, so captures cannot be taken yet. Ask an administrator to set them up.',
	testing_overview_title: 'Testing space',
	testing_overview_body:
		'Practice here: create projects and volumes, capture into them and download the pictures. Everything stays on this unit, and Captua removes each testing volume a set number of days after its last capture.',
	testing_overview_go: 'Go to Projects',
	testing_reserve_label: 'Free space kept for real work, in GB',
	testing_reserve_hint:
		'A whole number from 1 to 10000. When free space falls below it, captures into testing volumes are refused.',
	testing_reserve_free: (gb: string): string => `Free now: ${gb} GB`,
	testing_reserve_free_unknown: 'Captua could not read the free space.',
	testing_reserve_save: 'Save reserve',
	testing_err_reserve_value: 'Enter a whole number of GB from 1 to 10000.',
	testing_clear: 'Clear the testing space',
	testing_clear_confirm_text:
		'Captua will remove every testing project and volume now, with their pictures. The testing account and these settings stay. This cannot be undone.',
	testing_clear_confirm: 'Clear now',
	testing_cleared: (projects: number, volumes: number): string =>
		`Captua removed ${formatCount(projects, 'en')} ${projects === 1 ? 'project' : 'projects'} and ${formatCount(volumes, 'en')} ${volumes === 1 ? 'volume' : 'volumes'}.`,
	testing_cleared_skipped: (n: number): string =>
		n === 1
			? `Captua did not remove ${formatCount(n, 'en')} volume because it was being captured into.`
			: `Captua did not remove ${formatCount(n, 'en')} volumes because they were being captured into.`,
	testing_format_jpeg: 'JPEG only',
	testing_format_raw: 'RAW and JPEG',
	testing_format_note: "RAW files are much larger and fill the unit's space sooner.",
	testing_format_applies: 'A change applies only to the captures made after it.',
	testing_format_current: (format: string): string => `Capture format: ${format}`,
	testing_err_capture_format_unavailable: "The unit's cameras do not offer this format.",
	testing_err_clear: 'Captua could not clear the testing space. Try again.',
	testing_err_purge_running:
		'Old testing work is being removed right now. Try again in a few minutes.',

	// ── Copy a testing volume's pictures to a USB drive (NEH-391) ──
	testing_usb_copy: 'Copy to USB drive',
	testing_usb_start: 'Copy',
	testing_usb_loading: 'Looking for USB drives…',
	testing_usb_refresh: 'Refresh',
	testing_usb_none:
		'No USB drive found. Plug in a USB drive formatted as FAT32 or exFAT and press Refresh.',
	testing_usb_list_label: 'USB drives',
	testing_usb_drive: (name: string, size: string, fileSystem: string): string =>
		`${name}, ${size}, ${fileSystem}`,
	testing_usb_err_list: 'Captua could not read the USB drives. Press Refresh to try again.',
	testing_usb_starting: 'Starting the copy…',
	testing_usb_files: (done: number, total: number): string =>
		`${formatCount(done, 'en')} of ${formatCount(total, 'en')} files copied`,
	testing_usb_bytes: (done: string, total: string): string => `${done} of ${total}`,
	testing_usb_progress_label: 'Copy progress',
	testing_usb_close_note: 'Closing this window does not stop the copy.',
	testing_usb_done: (folder: string): string =>
		`Captua copied the pictures to the folder ${folder} on the USB drive.`,
	testing_usb_safe: 'You can remove the USB drive.',
	testing_usb_err_not_eligible:
		'Captua cannot copy to this drive. It has to be a USB drive formatted as FAT32 or exFAT. Press Refresh and choose again.',
	testing_usb_err_copy_busy:
		'Captua is already copying to a USB drive. Wait for that copy to finish, then try again.',
	testing_usb_err_mount:
		'Captua could not open the USB drive. Pull it out, plug it in again and press Refresh.',
	testing_usb_err_full:
		'The USB drive does not have enough free space for these pictures. Use a drive with more space.',
	testing_usb_err_write: 'Captua could not write to the USB drive. Check the drive and try again.',
	testing_usb_err_name:
		'One of the picture files has a name that this kind of drive does not accept. Tell an administrator, who has to look into it.',
	testing_usb_err_unmount:
		'Captua copied the pictures, but could not release the USB drive. Ask an administrator before pulling it out.',
	testing_usb_err_volume_empty: 'This volume has no pictures to copy.',
	testing_usb_err_real_volume: 'Only a testing volume can be copied to a USB drive.',
	testing_usb_err_volume_busy:
		'Captua is working on this volume right now. Wait a moment and try again.',
	testing_usb_err_read:
		'Captua could not read one of the pictures on the unit. Tell an administrator, who has to look into it.',
	testing_usb_err_exists:
		'The USB drive already has a folder with the name Captua needs. Wait a minute and try again.',
	testing_usb_skipped: (n: number): string =>
		`${formatCount(n, 'en')} ${n === 1 ? 'picture' : 'pictures'} could not be copied. Tell an administrator.`,
	testing_usb_status_unreachable:
		'Captua cannot read the progress of the copy right now. The copy may still be running. Do not pull the drive out.',
	testing_usb_err_lost:
		'Captua lost track of this copy. Do not pull the drive out. Tell an administrator, who has to unmount it.',

	// ── Connect to Fisqua: linking the unit to a workspace by a code (NEH-345) ──
	fisqua_link_title: 'Connect to Fisqua',
	fisqua_link_desc:
		"Link this unit to a Fisqua workspace. An administrator of the workspace approves the code on Fisqua's Scanner page.",
	fisqua_link_restart_warning:
		'Linking restarts Captua, which takes about a minute. Do not start it during a capture.',
	fisqua_link_name_label: 'Unit name',
	fisqua_link_name_hint: 'For example the archive or the room, up to 64 characters.',
	fisqua_link_name_invalid: 'Enter a name of 1 to 64 characters.',
	fisqua_link_start: 'Get a code',
	fisqua_link_requesting: 'Captua is asking Fisqua for a code…',
	fisqua_link_code_label: 'Code',
	fisqua_link_device_label: 'Device id',
	fisqua_link_expires: (s: number) => `Expires in ${s} s`,
	fisqua_link_waiting: 'Waiting for approval in Fisqua…',
	fisqua_link_lapsed: 'The code has lapsed.',
	fisqua_link_new_code: 'Get a new code',
	fisqua_link_applying: 'Code approved. Captua is linking this unit…',
	fisqua_link_restarting: 'Unit linked. Captua is restarting, which takes about a minute.',
	fisqua_link_restart_manual: 'Unit linked. Restart the unit to finish.',
	fisqua_link_restart_btn: 'Restart the unit',
	fisqua_link_linked: (tenant: string, staging: boolean) =>
		`Unit linked to ${tenant}${staging ? " (Fisqua's test service)" : ''}.`,
	fisqua_link_current: (tenant: string) => `This unit is linked to ${tenant}.`,
	fisqua_link_mode_hint:
		'The unit is not in Fisqua mode. Captua sends volumes to Fisqua only in Fisqua mode.',
	fisqua_link_switch_mode: 'Switch to Fisqua mode',
	fisqua_link_busy: (s: number) => `Fisqua is busy. Captua tries again in ${s} s.`,
	fisqua_link_retry: (s: number) => `Captua tries again in ${s} s.`,
	fisqua_link_network: "Captua could not reach Fisqua. Check the unit's connection.",
	fisqua_link_cannot_pair: 'This Fisqua cannot link units by code. Ask whoever installed the unit.',
	fisqua_link_lost:
		'Fisqua issued the link, but it did not reach this unit. Get a new code and approve it again.',
	fisqua_link_unknown: 'Fisqua does not recognize this code. Get a new code.',
	fisqua_link_wrong_env: 'Fisqua answered from a different environment. Captua changed nothing.',
	fisqua_link_other_workspace: (tenant: string | null) =>
		`${tenant ? `This unit is linked to ${tenant}.` : 'This unit is already linked to a workspace.'} A linked unit can only be linked again to the workspace it already has. To move it to another workspace, ask whoever installed the unit.`,
	fisqua_link_bad_payload:
		"Captua could not read Fisqua's answer and changed nothing. Get a new code.",
	fisqua_link_failed: 'Captua could not write the link settings and changed nothing.',
	fisqua_link_unverified:
		'Captua wrote the link settings but could not confirm them. Restart the unit, then check this section again.',
	fisqua_link_overridden:
		"A setting in the unit's .env file overrides the link. Ask whoever installed the unit.",
	fisqua_link_not_eligible:
		'A unit can be linked when it is in "Fisqua" mode, or in "Scanner only" mode with no link yet.',
	fisqua_link_held:
		'The offsite copy is on hold on this unit. Link the unit once the hold is lifted.',
	fisqua_link_rclone_missing:
		'This unit lacks the program that uploads files to the offsite copy, so it cannot be linked by code. Ask whoever installed the unit.',
	fisqua_link_busy_capturing: 'A capture is in progress. Link the unit once it is finished.',
	fisqua_link_device_id_invalid:
		"This unit's device id is not valid. Ask whoever installed the unit.",
	fisqua_link_script_too_old:
		"This unit's installation is too old to link by code. Update Captua, or ask whoever installed the unit.",
	fisqua_link_script_missing:
		'This unit lacks the script that writes the link settings. Update Captua, or ask whoever installed the unit.',
	fisqua_link_finishing_uploads:
		'Code approved. Captua is finishing an upload in progress before it links the unit. This can take a few minutes.',
	fisqua_link_uploads_still_running:
		'The upload in progress did not finish, and Captua changed nothing. Uploads stay paused until you restart the unit. After that, get a new code.',
	fisqua_link_restart_required:
		'Restart the unit before you get a new code. Captua may have written a link, and a link takes effect only after the unit restarts.',
	fisqua_link_last_outcome: (text: string) => `Last attempt: ${text}`,
	fisqua_link_offsite_job_running:
		'Captua is freeing space on the SD card or restoring files to it. Link the unit once that has finished.',
	fisqua_link_finishing_offsite_jobs:
		'Code approved. Before it links the unit, Captua is finishing freeing space on the SD card or restoring files to it. This can take a few minutes.',
	fisqua_link_offsite_jobs_still_running:
		'Captua did not finish freeing space on the SD card or restoring files to it within ten minutes, so it changed nothing. Get a new code once that has finished.',
	fisqua_link_prepare_failed:
		'Captua could not prepare the link settings and changed nothing. Get a new code.',
	fisqua_link_shutting_down:
		'Captua was shutting down and changed nothing. Get a new code once it is running again.',
	fisqua_link_cancel_failed: 'Captua could not cancel the code. Try again.',
	fisqua_link_generic: 'Captua could not link the unit, for a reason it does not recognize.',
	fisqua_link_err_read:
		'Captua could not read the state of the link. It tries again every few seconds.',
	// ── Settings sections and Network (NEH-253) ─────────────────────────────
	config_section_network: 'Network',
	config_sections_label: 'Settings sections',
	config_group_unit: 'Unit',
	config_subtitle_personal: "Your settings and the unit's network",
	network_connections_title: 'Connections',
	network_wifi_title: 'Wi-Fi',
	network_card_ethernet: 'Ethernet',
	network_card_wifi: 'Wi-Fi',
	network_card_named: (kind: string, device: string) => `${kind} (${device})`,
	network_badge_connected: 'Connected',
	network_badge_attention: 'Needs attention',
	network_badge_connecting: 'Connecting',
	network_badge_no_cable: 'No cable',
	network_badge_not_connected: 'Not connected',
	network_badge_not_available: 'Not available',
	network_eth_empty:
		'Plug in a network cable to use a wired connection. When a cable is available it is the recommended option: it is steadier than Wi-Fi and needs no password.',
	network_wifi_empty_can: 'Join a network from the list below.',
	network_wifi_empty_ro: 'The unit is not connected to any Wi-Fi network.',
	network_fact_network: 'Network',
	network_fact_wired: 'Wired',
	network_fact_signal: 'Signal',
	network_fact_ip: 'IP address',
	network_fact_gateway: 'Gateway',
	network_fact_dns: 'DNS',
	network_fact_mac: 'MAC address',
	network_fact_none: 'None',
	network_signal_value: (percent: number, word: string) => `${percent}% (${word})`,
	network_signal_strong: 'strong',
	network_signal_good: 'good',
	network_signal_fair: 'fair',
	network_signal_weak: 'weak',
	network_signal_label: (percent: number) => `Signal ${percent}%`,
	network_warn_try: (text: string) => `What to try: ${text}`,
	network_warn_no_connection_title: 'No network connection.',
	network_warn_no_connection_body:
		'The unit is not connected by cable or by Wi-Fi. Capturing and reviewing still work.',
	network_warn_no_connection_try: 'Plug in a network cable, or join a Wi-Fi network below.',
	network_warn_no_address_title: 'Connected, but no IP address.',
	network_warn_no_address_body:
		'The network accepted the unit but did not give it an address, so nothing can reach it and it cannot reach anything.',
	network_warn_no_address_try: (wifi: boolean): string =>
		wifi
			? 'Forget the network and join it again. If that does not help, ask whoever manages the network whether it limits or registers devices, and give them the MAC address on this card.'
			: 'Unplug the cable and plug it in again. If that does not help, ask whoever manages the network whether it limits or registers devices, and give them the MAC address on this card.',
	network_warn_link_local_only_title: 'Only a local address.',
	network_warn_link_local_only_body:
		'No device on this network handed out an address, so the unit made one up (169.254…). Only a computer on the same local network can reach it.',
	network_warn_link_local_only_try: (wifi: boolean): string =>
		wifi
			? 'Forget the network and join it again. If that does not help, ask whoever manages the network.'
			: 'Check that the cable goes to a network socket or router that is switched on. If it does, ask whoever manages the network.',
	network_warn_no_gateway_title: 'No gateway.',
	network_warn_no_gateway_body:
		'The unit has an address but no route out of this network. Devices on the same network can open Captua; the unit cannot reach the internet.',
	network_warn_no_gateway_try: (wifi: boolean): string =>
		wifi
			? 'Forget the network and join it again. If the gateway is still missing, ask whoever manages the network.'
			: 'Unplug the cable and plug it in again. If the gateway is still missing, ask whoever manages the network.',
	network_warn_no_dns_title: 'No DNS server.',
	network_warn_no_dns_body:
		'The unit is on the network but cannot look up names such as github.com, so the offsite copy and sending to Fisqua cannot work.',
	network_warn_no_dns_try: (wifi: boolean): string =>
		wifi
			? 'Forget the network and join it again. If that does not help, ask whoever manages the network.'
			: 'Unplug the cable and plug it in again. If that does not help, ask whoever manages the network.',
	network_warn_other_title: 'The connection has a problem.',
	network_readonly:
		'You can see the network state. Administrators and operators can join and forget networks.',
	network_not_permitted_notice:
		"This unit's system does not allow Captua to change the network, so joining and forgetting networks are not offered. To fix this, update Captua, or ask whoever installed the unit.",
	network_not_available:
		'Network settings are not available on this device. They work only on a Captua unit, not on a development machine.',
	network_service_unavailable:
		"The unit's network service is not answering. Try again in a moment.",
	network_err_read: 'Captua could not read the network state.',
	network_err_wifi: 'Captua could not read the list of Wi-Fi networks.',
	network_no_wifi_device: 'This unit has no Wi-Fi device.',
	network_wifi_list_title: 'Wi-Fi networks',
	network_wifi_list_desc: 'Networks in range of the unit. Choose one to join it.',
	network_wifi_list_desc_ro: 'Networks in range of the unit.',
	network_refreshing: 'Refreshing…',
	network_not_rescanned:
		"This unit's system does not allow Captua to scan again, so the list shows the networks found last.",
	network_wifi_none: 'No Wi-Fi networks in range.',
	network_kind_open: 'Open',
	network_kind_password: 'Password',
	network_kind_enterprise: 'Institutional sign-in',
	network_saved_mark: 'Saved',
	network_connected_mark: '✓ Connected',
	network_join: 'Join',
	network_join_aria: (ssid: string) => `Join ${ssid}`,
	network_saved_title: 'Saved networks',
	network_saved_desc: 'The unit joins these by itself when they are in range.',
	network_saved_desc_forget:
		'The unit joins these by itself when they are in range. Forgetting a network deletes its password from the unit.',
	network_saved_none: 'No saved networks.',
	network_saved_active: 'Connected now',
	network_saved_in_range: 'In range',
	network_saved_out_of_range: 'Not in range',
	network_saved_meta: (kind: string, where: string) => `${kind} · ${where}`,
	network_forget: 'Forget',
	network_forget_aria: (ssid: string) => `Forget ${ssid}`,
	network_forgetting: 'Forgetting…',
	network_forget_active_title: (ssid: string) => `Forget ${ssid}?`,
	network_forget_active_body:
		'The unit is connected to this network now. Forgetting it disconnects the unit from it and deletes its password from the unit.',
	network_forget_active_confirm: 'Forget and disconnect',
	network_forget_not_permitted: "This unit's system did not allow Captua to forget the network.",
	network_forget_gone: 'This network had already been forgotten.',
	network_forget_failed: 'Captua could not forget the network. Try again.',
	network_join_title: (ssid: string) => `Join ${ssid}`,
	network_join_open_body: 'This network is open: it needs no password.',
	network_join_password_body: 'This network needs a password.',
	network_join_enterprise_body:
		"This network asks for your institution's sign-in. Your institution's instructions for this network give the details.",
	network_password_placeholder: 'Network password',
	network_enterprise_password_placeholder: 'Your institutional password',
	network_password_note:
		'The password is saved on this unit. Anyone with administrator access to the unit can read it.',
	network_username_hint: 'Usually your full institutional address.',
	network_server_label: 'Sign-in server name',
	network_server_hint:
		'The unit checks that the server it talks to has this name before it sends your password.',
	network_more_options: 'More options',
	network_outer_identity: 'Outer identity',
	network_outer_identity_hint: 'Leave blank unless your institution asks for one.',
	network_method: 'Method',
	network_method_peap: 'PEAP with MSCHAPv2 (most common)',
	network_method_ttls_pap: 'TTLS with PAP',
	network_method_ttls_mschapv2: 'TTLS with MSCHAPv2',
	network_joining_title: (ssid: string) => `Joining ${ssid}`,
	network_joining_body:
		'Connecting and asking the network for an address. This can take a few minutes.',
	network_joining_no_answer: 'The unit is not answering yet. It may be changing network.',
	network_joined_title: (ssid: string) => `Joined ${ssid}`,
	network_joined_body: 'The unit is connected.',
	network_joined_address: (address: string) =>
		`The unit is connected and has the address ${address}.`,
	network_joined_saved: 'The network is saved: the unit joins it by itself when it is in range.',
	network_failed_title: (ssid: string) => `Could not join ${ssid}`,
	network_fail_wrong_password:
		'The password was not accepted. Check it, including capital letters, and try again.',
	network_fail_wrong_credentials:
		'The username or password was not accepted. Check both; many institutions ask for the full address, such as name@example.edu.',
	network_fail_server_name_mismatch:
		"The sign-in server's name does not match the name you entered. Check the server name in your institution's instructions for this network.",
	network_fail_server_names: (names: string) => `The server gave these names: ${names}.`,
	network_fail_server_not_trusted:
		"This unit does not trust the sign-in server's certificate. Check the server name; if it is right, ask your institution's IT staff which certificate the network uses.",
	network_fail_timeout:
		'The network did not answer in time. Move the unit closer to the access point, or try again in a minute.',
	network_fail_not_permitted:
		'The unit\'s system did not allow the change. Restart the unit and try again; if it happens again, press "Report a problem". Sending the report needs an internet connection.',
	network_fail_failed:
		'The unit could not join the network. Try again; if it happens again, press "Report a problem". Sending the report needs an internet connection.',
	network_restored_true: 'The unit went back to the Wi-Fi network it was on before.',
	network_restored_false: 'The unit could not go back to the Wi-Fi network it was on before.',
	network_lost_title: 'Captua cannot reach the unit',
	network_lost_body:
		"The unit has stopped answering. It may now be on another network. On the unit's own screen, open Settings, then Network, to see which network it is on.",
	network_refusal_ssid_invalid:
		"This network's name cannot be used: it must be 1 to 32 characters long, without line breaks.",
	network_refusal_password_required: 'Enter the password.',
	network_refusal_password_invalid: 'The password cannot contain a line break.',
	network_refusal_password_length: 'A Wi-Fi password has 8 to 63 characters.',
	network_refusal_identity_required: 'Enter your username.',
	network_refusal_identity_invalid: 'The username cannot contain a line break.',
	network_refusal_anonymous_identity_invalid: 'The outer identity cannot contain a line break.',
	network_refusal_method_required: 'Choose a method.',
	network_refusal_server_name_required: 'Enter the sign-in server name.',
	network_refusal_server_name_invalid:
		'Enter a server name such as radius.example.edu, not an IP address.',
	network_refusal_inner_method_invalid: 'PEAP works only with MSCHAPv2. Choose another method.',
	network_refusal_not_permitted: "This unit's system does not allow Captua to change the network.",
	network_refusal_join_in_progress:
		'The unit is already joining a network. Wait until it finishes and try again.',
	network_refusal_other: 'The unit did not accept the request. Check the fields and try again.',
	network_err_request: 'Captua could not reach the unit. Check the connection and try again.',
	network_ind_connected: 'Connected',
	network_ind_problem: 'Network problem',
	network_ind_offline: 'Offline',
	network_ind_label: (state: string, name: string | null, signal: number | null) =>
		name === null
			? state
			: signal === null
				? `${state} · ${name}`
				: `${state} · ${name} · signal ${signal}%`,
	network_ind_unknown: 'Network state unknown',
	network_ind_connecting: 'Connecting',
	network_stale: (time: string) =>
		`The network state could not be refreshed. What is shown is from the last successful read, at ${time}.`,
	network_unknown_title: 'Captua cannot tell how the join ended',
	network_unknown_body: 'Check the network state on this page to see which network the unit is on.',
	network_not_received_title: 'The unit did not receive the request',
	network_not_received_body: 'Press "Retry" to send it again.',

	// ── Colour card shots (NEH-340) ──────────────────────────────────────────
	cc_title: 'Color card',
	cc_heading: 'Take the color card shots',
	cc_reason_start:
		'This volume has no pages yet. Before capturing the first, take a shot of the color card with each camera.',
	cc_reason_begun_without:
		'This volume already has pages, but no color card shots. Take them now with each camera.',
	cc_reason_settings_changed:
		'The camera settings were changed after the last color card shots. Take them again with each camera.',
	cc_how:
		'Place the card under each camera, under the same light as the pages, and take a shot of it.',
	cc_take: 'Take shot',
	cc_take_again: 'Take again',
	cc_taking: 'Taking the shot…',
	cc_no_shot: 'No shot yet',
	cc_shot_raw: 'The shot was saved. It is a RAW file and cannot be shown here.',
	cc_shot_unshown: 'The shot was saved, but Captua could not show it here.',
	cc_shot_alt: (camera: string) => `Color card shot from ${camera}`,
	cc_continue: 'Continue',
	cc_skip: 'Skip',
	cc_skip_title: 'Skip the color card shots?',
	cc_skip_body: 'Captua will put a mark on this volume saying that it has no color card shots.',
	cc_skip_confirm: 'Skip the shots',
	cc_opening: 'Captua is preparing the color card shots…',
	cc_needed: 'Take or skip the color card shots before capturing.',
	cc_err_camera_busy: 'This camera is taking another shot. Wait a moment and try again.',
	cc_err_not_connected: (camera: string) =>
		`Captua cannot reach ${camera}. Check its cable and try again.`,
	cc_err_capture_failed: (camera: string) =>
		`No shot was taken with ${camera}. Try that camera again.`,
	cc_err_set_gone:
		'These color card shots were already taken or skipped on another screen. This screen now shows what the unit holds.',
	cc_err_shots_missing: 'Before you continue, take a shot with each camera.',
	cc_err_volume_gone: 'This volume is no longer on the unit.',
	cc_err_timeout:
		'Captua did not get the result of the shot in time. This screen now shows what the unit holds.',
	cc_err_unread: 'Captua could not read the color card shots of this volume.',
	cc_err_failed: 'The request did not go through. Try again.',
	cc_err_busy: 'Wait for the capture in progress to finish, then try again.',
	cc_flag_none: 'No color card shots',
	cc_flag_skipped: 'Color card shots skipped',
	cc_flag_title:
		'Captua sends this volume to Fisqua with a mark saying that it has no color card shots.',
	cc_sets_open: 'Color card shots',
	cc_sets_title: 'Color card shots',
	cc_sets_empty: 'This volume has no color card shots.',
	cc_set_heading: (n: number, date: string) => `Set ${n} · ${date}`,
	cc_set_by: (name: string) => `By ${name}`,
	cc_outcome_taken: 'Taken',
	cc_outcome_skipped: 'Skipped',
	cc_outcome_open: 'Not finished',
	cc_shot_camera: (n: number) => `Camera ${n}`,
	cc_delivery_sent: 'Sent offsite',
	cc_delivery_waiting: 'Waiting to be sent offsite',
	cc_delivery_waiting_because: (reason: string) => `Waiting to be sent offsite: ${reason}`,
	cc_delivery_undeliverable: (reason: string) => `Cannot be sent offsite: ${reason}`,
	cc_reason_staging_failed: 'a file could not be prepared for the upload',
	cc_reason_file_unstable: 'a file was still being written',
	cc_reason_listed_without_sha1: 'the offsite copy lists a file without a checksum to compare',
	cc_reason_unverified: 'the copy of a file could not be checked yet',
	cc_reason_file_missing: 'a shot file is missing on the unit',
	cc_reason_upload_refused: 'the offsite copy refused a shot',
	cc_setting_label: 'Ask for color card shots',
	cc_setting_desc:
		'When this is on, the capture screen asks for a shot of the color card with each camera at the start of each volume and whenever the camera settings are changed. Captua sends volumes captured while it is off to Fisqua with a mark saying that they have no color card shots.',
	cc_setting_error: 'Captua could not save the change. Try again.',

	// ── Moving a hand-made volume's captures into a volume from Fisqua (NEH-419),
	// and a move the unit could not settle (NEH-420) ─────────────────────────
	adopt_action: 'Move the captures into a volume from Fisqua',
	adopt_action_desc:
		'Use this when the captures were taken in this volume, made by hand, and Fisqua later assigned the volume they belong to. Captua moves the captures into that volume and gives them its file names.',
	adopt_target_heading: 'Choose the volume from Fisqua',
	adopt_target_desc:
		'Captua lists the volumes that Fisqua assigned, that are empty, and that Captua does not keep only on this unit.',
	adopt_target_empty: 'There is no empty volume from Fisqua to move these captures into.',
	adopt_plan_heading: 'What Captua will do',
	adopt_plan_summary: (
		records: number,
		images: number,
		sets: number,
		source: string,
		target: string
	): string =>
		`Captua will move ${adoptRecordsEn(records)}, with ${adoptImagesEn(images)} and ${adoptGroupsEn(sets)} of color card shots, from ${source} to ${target}.`,
	adopt_plan_summary_no_sets: (
		records: number,
		images: number,
		source: string,
		target: string
	): string =>
		`Captua will move ${adoptRecordsEn(records)}, with ${adoptImagesEn(images)}, from ${source} to ${target}.`,
	adopt_plan_new_names: 'New file names',
	adopt_plan_next:
		'Captua will rename the files on this unit and upload them to the offsite copy again under the new names.',
	adopt_plan_old_copies:
		'The files already stored offsite under the old names will stay there until someone deletes them by hand.',
	adopt_plan_confirm: 'Move the captures',
	adopt_refused_title: 'Captua cannot move these captures',
	adopt_refused_unchanged: 'Captua changed nothing.',
	adopt_err_unfinished:
		'Some captures on this unit were left half moved: Captua stopped before it finished and could not put them back where they were. Until that is repaired, Captua moves no other captures.',
	adopt_err_unfinished_do: 'The Overview shows what to do.',
	adopt_err_volume_gone: (name: string): string => `${name} is no longer on this unit.`,
	adopt_err_same_volume: 'The volume you chose is this same volume.',
	adopt_err_same_volume_do: 'Choose another volume.',
	adopt_err_testing: (name: string): string =>
		`${name} is a testing volume, and Captua moves no captures between testing volumes and real ones.`,
	adopt_err_source_no_stem: (source: string): string => `${source} has no file name stem.`,
	adopt_err_target_no_stem: (target: string): string =>
		`${target} has no file name stem, so Captua cannot give the captures their new names.`,
	adopt_err_target_no_stem_do: 'Give it its stem: its Fisqua reference code.',
	adopt_err_target_not_assigned: (target: string): string =>
		`${target} has no Fisqua reference code, so Fisqua did not assign it.`,
	adopt_err_target_not_assigned_do: "Choose a volume from Fisqua's queue.",
	adopt_err_target_withdrawn: (target: string): string =>
		`Fisqua withdrew ${target} from its queue.`,
	adopt_err_sent: (name: string): string =>
		`Captua has already sent ${name} to Fisqua, or has it waiting to be sent.`,
	adopt_err_kept: (name: string): string =>
		`Captua keeps ${name} only on this unit, so it never copies its files offsite.`,
	adopt_err_kept_do: 'Include it in the current mode first.',
	adopt_err_sub_volumes: (source: string): string => `${source} contains other volumes.`,
	adopt_err_no_images: (source: string): string => `${source} has no images to move.`,
	adopt_err_open_set: (source: string): string =>
		`A group of color card shots in ${source} is not finished.`,
	adopt_err_open_set_do: (source: string): string =>
		`Take or skip the color card shots of ${source} first.`,
	adopt_err_target_not_empty: (target: string): string =>
		`${target} is not empty: it has records, images or groups of color card shots, taken or skipped, or captures were taken in it before.`,
	adopt_err_target_not_empty_do: 'Choose an empty volume.',
	adopt_err_target_names_held: (target: string): string =>
		`The offsite copy already holds files under ${target}'s file names, so Captua cannot upload the captures under those names.`,
	adopt_err_offsite_config:
		'The offsite copy of the image files is not configured correctly on this unit.',
	adopt_err_offsite_config_do: 'Ask whoever installed the unit.',
	adopt_err_storage:
		'Captua cannot write to the storage where it keeps the images, so it cannot rename the files.',
	adopt_err_outside_storage: (name: string): string =>
		`Some files of ${name} have a path outside the unit's storage, so Captua cannot move them.`,
	adopt_err_handed_over: (source: string): string =>
		`Some records of ${source} are no longer in Captured: they were sent for review, or have been reviewed.`,
	adopt_err_handed_over_do:
		'If they are in review, first withdraw the volume with "Withdraw from review".',
	adopt_err_freed: (source: string): string =>
		`Some files of ${source} are stored offsite and are not on the SD card.`,
	adopt_err_freed_do: 'Restore the volume first from "Space on the SD card".',
	adopt_err_outside_own_folder: (source: string): string =>
		`Some files of ${source} are not in the volume's own folder.`,
	adopt_err_file_missing: (source: string): string =>
		`Some files of the images or color card shots of ${source} are not on this unit.`,
	adopt_err_not_verified: (source: string): string =>
		`Not every file of ${source} is verified in the offsite copy yet.`,
	adopt_err_not_verified_do: 'Wait for Captua to finish copying them, then try again.',
	adopt_err_capture_list: (source: string, target: string): string =>
		`Captua's list of the captures of ${source} does not match the volume's files, so Captua cannot carry it over to ${target}.`,
	adopt_err_names: (source: string): string =>
		`Some files of ${source} have names that do not follow the volume's file names, so Captua cannot give them new names.`,
	adopt_err_thumbnail_shared: (source: string): string =>
		`Two images of ${source} share one thumbnail, so Captua cannot move it for both.`,
	adopt_err_unowned_files: (source: string): string =>
		`The folders of ${source} hold files that belong to none of its images or color card shots.`,
	adopt_err_name_taken:
		'Some of the new file names are already taken, on this unit or in the offsite copy.',
	adopt_err_volume_held:
		'Captua is exporting one of these volumes, copying it to a USB drive, or preparing its files for the offsite copy.',
	adopt_err_volume_held_do: 'Wait until it finishes, then try again.',
	adopt_done_heading: 'Captua moved the captures',
	adopt_done_summary: (
		records: number,
		images: number,
		sets: number,
		source: string,
		target: string
	): string =>
		`Captua moved ${adoptRecordsEn(records)}, with ${adoptImagesEn(images)} and ${adoptGroupsEn(sets)} of color card shots, from ${source} to ${target}.`,
	adopt_done_summary_no_sets: (
		records: number,
		images: number,
		source: string,
		target: string
	): string =>
		`Captua moved ${adoptRecordsEn(records)}, with ${adoptImagesEn(images)}, from ${source} to ${target}.`,
	adopt_done_uploading:
		'Captua is uploading the files to the offsite copy again, under their new names.',
	adopt_done_delete: (source: string): string => `Delete ${source}`,
	adopt_done_delete_desc: (source: string, target: string): string =>
		`${source} is now empty. If you delete it, nothing is lost: the captures are in ${target}.`,
	adopt_closed_line: (target: string): string =>
		`Captua moved this volume's captures into ${target}. No new captures can be taken in it, and it can be deleted.`,
	adopt_closed_refusal:
		"Captua moved this volume's captures into another volume, so nothing more can be captured in it.",
	unsettled_heading: 'Captua did not finish moving some captures',
	unsettled_what: (source: string, target: string): string =>
		`Captua stopped while it was moving the captures from ${source} to ${target}, and it could not finish moving them or put them back in ${source}.`,
	unsettled_missing: (name: string): string => `This file is missing on the unit: ${name}`,
	unsettled_blocked: (source: string, target: string): string =>
		`Until this is repaired, no one can capture or make changes in ${source} or ${target}. Other volumes are not affected.`,
	unsettled_repair: 'Repair',
	unsettled_repair_desc:
		'Captua brings the file back from the offsite copy, checks it, and then finishes moving the captures or puts them back where they were.',
	unsettled_repairing: 'Captua is repairing the captures that were left half moved…',
	unsettled_done_finished: (target: string): string =>
		`Captua repaired the problem and finished moving the captures: they are in ${target}.`,
	unsettled_done_undone: (source: string): string =>
		`Captua repaired the problem and put the captures back in ${source}.`,
	unsettled_err_mismatch: (name: string): string =>
		`Captua could not repair the problem: the file ${name} in the offsite copy does not match its checksum.`,
	unsettled_err_absent: (name: string): string =>
		`Captua could not repair the problem: ${name} is not in the offsite copy.`,
	unsettled_err_never_copied: (name: string): string =>
		`Captua could not repair the problem: it never uploaded ${name} to the offsite copy.`,
	unsettled_no_repair:
		'Captua cannot repair the problem from here. Ask whoever installed the unit.',
	unsettled_operator:
		'No one can work in this volume for now. Captua has told the administrators what to do.',
	adopt_err_in_progress: 'Captua is already moving the captures of another volume on this unit.',
	adopt_err_in_progress_do: 'Wait until it finishes, then try again.',
	adopt_err_listing:
		'Captua could not check the offsite copy, so it cannot tell whether the new file names are already in use there.',
	adopt_err_listing_do: "Check the unit's internet connection and try again.",
	adopt_err_records_changed: (source: string): string =>
		`Records were added to ${source} while Captua was preparing to move its captures.`,
	adopt_err_records_changed_do: (source: string): string =>
		`Try again when no one is capturing in ${source}.`,
	adopt_failed_restored: 'Captua could not move the captures and left everything as it was.',
	adopt_failed_restored_do: 'Try again. If it happens again, ask whoever installed the unit.',
	adopt_failed_pending:
		'Captua stopped while it was moving the captures, and they were left half moved. When the unit starts again, Captua will finish moving them or put them back where they were.',
	adopt_failed_pending_do: 'Restart the unit.',
	adopt_done_pending:
		'Captua moved the captures. One last step is left, and Captua will do it when the unit starts again.',
	adopt_plan_project: (source: string, target: string): string =>
		`${source} and ${target} are in different projects. The records will move to the project of ${target}.`,
	adopt_err_ask_installer: 'Ask whoever installed the unit.',

	// ── Offsite settings (Settings → Offsite copy, NEH-341) ──────────────────
	offsite_set_title: 'Offsite settings',
	offsite_set_desc:
		'The bucket and the keys this unit uses for its offsite copy. Bring them on a USB stick, or type them here.',
	offsite_set_none: 'No offsite settings are saved on this unit.',
	offsite_set_bucket: 'Bucket',
	offsite_set_tenant: 'Tenant',
	offsite_set_key_id: 'Key ID',
	offsite_set_app_key: 'Application key',
	offsite_set_public_key: 'Catalog public key',
	offsite_set_key_note:
		'The keys are saved on this unit. Anyone with administrator access to the unit can read them.',
	offsite_set_import: 'Import from a USB stick',
	offsite_set_import_desc:
		'Fill in the template on your computer, save it as captua-offsite.txt at the top level of a USB stick, plug the stick into the unit and mount it under Storage. Then choose it here.',
	offsite_set_choose_drive: 'USB stick',
	offsite_set_no_drive: 'No drive is mounted. Mount the stick under Storage first.',
	offsite_set_enter: 'Enter by hand',
	offsite_set_template: 'Download the template',
	offsite_set_save: 'Check and save',
	offsite_set_saving: 'Checking the bucket…',
	offsite_set_replace: 'Replace the stored key',
	offsite_set_replace_desc: 'This unit already has a different key. Saving replaces it.',
	offsite_set_saved_restarting: 'Saved. Captua restarts to use the new settings.',
	offsite_set_saved_restart_needed: 'Saved. Restart the unit to use the new settings.',
	offsite_set_unchanged: "These are already the unit's settings. Nothing was changed.",
	offsite_set_stick_deleted: 'Captua deleted the file from the stick.',
	offsite_set_stick_not_deleted:
		'Captua could not delete the file from the stick. Delete it yourself before the stick leaves the unit.',
	offsite_set_stick_kept: 'The file is still on the stick.',
	offsite_err_busy: 'Captua is capturing or sending right now. Try again in a few minutes.',
	offsite_err_pairing: 'Captua is linking this unit to Fisqua. Try again when that ends.',
	offsite_err_restart_first:
		'The unit must restart before its offsite settings can change. Restart it under Power, then try again.',
	offsite_err_unverified:
		'Captua may have saved the settings but could not check them. Restart the unit, then check the settings here.',
	offsite_err_overridden:
		'The settings were saved, but other settings on the unit take their place. Ask whoever installed the unit.',
	offsite_err_fisqua: 'This unit is linked to Fisqua, which gives it its offsite settings.',
	offsite_err_unit_not_ready:
		'This unit cannot save offsite settings until it is updated. Ask whoever installed the unit.',
	offsite_err_held:
		'The offsite copy is on hold on this unit. The settings can be saved once the hold is lifted.',
	offsite_err_other_tenant:
		'This unit already writes under another tenant, which cannot be changed here. Ask whoever installed the unit.',
	offsite_err_replace:
		'This unit already has a different key. Check "Replace the stored key" to save the new one.',
	offsite_set_err_listing:
		'Captua could not open the bucket with these settings. Check the bucket, the key ID, the application key and the tenant, and that the unit is online.',
	offsite_err_saved_key_unusable:
		'The settings were saved, but the key the unit keeps cannot open the bucket. If this key ID has a new application key, check "Replace the stored key" and save again.',
	offsite_err_not_saved: 'The settings were not saved. Nothing on the unit changed.',
	offsite_err_not_a_drive: 'Choose a USB stick mounted under Storage.',
	offsite_err_file_missing: 'There is no captua-offsite.txt at the top level of the stick.',
	offsite_err_file_not_settings:
		'captua-offsite.txt on the stick is not a settings file made from the template.',
	offsite_err_file_unreadable: 'Captua cannot read captua-offsite.txt on the stick.',
	offsite_err_file_not_deletable:
		'Captua could not delete captua-offsite.txt from the stick afterwards, so it did not import it. Use a stick formatted as FAT32 or exFAT.',
	offsite_err_bad_line: (line: number): string =>
		`Line ${line} of captua-offsite.txt is neither a comment nor a setting.`,
	offsite_err_unknown_key: (line: number): string =>
		`Line ${line} of captua-offsite.txt has a setting the template does not have.`,
	offsite_err_duplicate: (field: string): string => `${field} appears more than once.`,
	offsite_err_missing: (field: string): string => `${field} is missing.`,
	offsite_err_empty: (field: string): string => `${field} has no value.`,
	offsite_err_bad_value: (field: string): string => `${field} is not valid.`,
	offsite_err_other: 'Captua could not save the offsite settings.',

	// ── API client messages ──────────────────────────────────────────────────
	api_power_ack: 'Command received. The scanner will run it in a few seconds.',
	api_request_failed: 'Request failed'
};

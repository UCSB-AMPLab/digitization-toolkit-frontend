// The sections of Settings (/dashboard/config, NEH-253) and the roles that
// may open each. Network and Language are every role's; the Unit group is
// the administrator's, except Storage, which the operator opens too to free
// space (NEH-380; UnitSections shows the operator its usage figure and the
// list of volumes that can be freed, not the drive controls). The page shows only the sections of the signed-in
// role, and a section asked for that the role may not open (by URL or by
// state) resolves to Network, so a non-admin never renders an admin section.
// The testing role (NEH-391) sees what every non-admin sees, plus Power, so it
// can shut the unit down or restart it.
// The backend enforces the same roles on every route these sections use.
//
// Version: 0.3.0

import type { StringMessageKey } from '$lib/i18n';
import { canFreeVolumes, inTestingSpace, opensUnitSettings } from '$lib/unit-mode';

export interface SettingsSection {
	id: string;
	labelKey: StringMessageKey;
	/** True for the administrator's sections, under the Unit group. */
	unit: boolean;
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
	{ id: 'network', labelKey: 'config_section_network', unit: false },
	{ id: 'language', labelKey: 'config_section_language', unit: false },
	{ id: 'unit-mode', labelKey: 'unit_section_title', unit: true },
	{ id: 'fisqua-link', labelKey: 'fisqua_link_title', unit: true },
	{ id: 'testing', labelKey: 'config_section_testing', unit: true },
	{ id: 'storage', labelKey: 'config_section_storage', unit: true },
	{ id: 'offsite-copy', labelKey: 'backup_section_title', unit: true },
	{ id: 'diagnostics', labelKey: 'config_section_diagnostics', unit: true },
	{ id: 'maintenance', labelKey: 'config_section_maintenance', unit: true },
	{ id: 'power', labelKey: 'config_section_power', unit: true }
];

export const DEFAULT_SECTION = 'network';

export function sectionsFor(role: string | null | undefined): SettingsSection[] {
	if (inTestingSpace(role)) return SETTINGS_SECTIONS.filter((s) => !s.unit || s.id === 'power');
	return SETTINGS_SECTIONS.filter(
		(s) => !s.unit || opensUnitSettings(role) || (s.id === 'storage' && canFreeVolumes(role))
	);
}

/** The section to show for `requested`: itself when the role may open it, else Network. */
export function resolveSection(
	requested: string | null | undefined,
	role: string | null | undefined
): SettingsSection {
	const allowed = sectionsFor(role);
	return allowed.find((s) => s.id === requested) ?? allowed.find((s) => s.id === DEFAULT_SECTION)!;
}

/** The section a Settings URL names: ?section=, or the hash of older links (#offsite-copy). */
export function sectionInUrl(url: URL): string | null {
	return url.searchParams.get('section') || (url.hash ? url.hash.slice(1) : null) || null;
}

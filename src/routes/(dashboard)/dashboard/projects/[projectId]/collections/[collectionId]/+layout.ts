// Version: 0.3.0

import type { LayoutLoad } from './$types';
import { projectsApi, collectionsApi } from '$lib/api';

// Loads the project and volume names for the layout breadcrumb, a testing
// volume's removal date (NEH-391), and the fields of the move of captures
// (NEH-419, NEH-420). A failed fetch yields '—' instead of an
// error, so the volume pages render even when a name is unavailable.
export const load: LayoutLoad = async ({ params }) => {
	const projectId = Number(params.projectId);
	const collectionId = Number(params.collectionId);

	const [project, collection] = await Promise.all([
		projectsApi.get(projectId).catch(() => null),
		collectionsApi.get(collectionId).catch(() => null)
	]);

	return {
		projectId,
		collectionId,
		projectName: project?.name ?? '—',
		collectionName: collection?.name ?? '—',
		collectionTestingExpiresAt: collection?.testing_expires_at ?? null,
		collectionTesting: collection?.testing === true,
		// The volume's colour card summary (NEH-340), for its flag in the top bar.
		collectionColourCard: collection?.colour_card ?? null,
		// What decides the move of captures on the page (NEH-419, NEH-420):
		// whether Fisqua assigned the volume, whether a move closed it, and
		// whether an unsettled move names it.
		collectionAdoption: {
			external_id: collection?.external_id ?? null,
			captures_adopted_at: collection?.captures_adopted_at ?? null,
			adoption_unfinished: collection?.adoption_unfinished === true,
			testing: collection?.testing === true
		}
	};
};

import type { LayoutLoad } from './$types';
import { projectsApi, collectionsApi } from '$lib/api';

// Loads the project and volume names for the layout breadcrumb. A failed fetch
// yields '—' instead of an error, so the volume pages render even when a name
// is unavailable.
export const load: LayoutLoad = async ({ params }) => {
  const projectId    = Number(params.projectId);
  const collectionId = Number(params.collectionId);

  const [project, collection] = await Promise.all([
    projectsApi.get(projectId).catch(() => null),
    collectionsApi.get(collectionId).catch(() => null),
  ]);

  return {
    projectId,
    collectionId,
    projectName:    project?.name    ?? '—',
    collectionName: collection?.name ?? '—',
  };
};

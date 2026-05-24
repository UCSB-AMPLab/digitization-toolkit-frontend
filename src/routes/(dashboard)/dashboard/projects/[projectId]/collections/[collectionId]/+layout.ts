import type { LayoutLoad } from './$types';
import { projectsApi, collectionsApi } from '$lib/api';

// ============================================================================
// LOAD: Datos del proyecto y la colección para el breadcrumb del layout
// ============================================================================
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

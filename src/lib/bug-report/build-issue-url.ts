const DEFAULT_REPO = 'UCSB-AMPLab/digitization-toolkit-software';

/** URL de "nuevo issue" en GitHub, prellenada con título, cuerpo y label bug. */
export function buildIssueUrl(title: string, body: string, repo: string = DEFAULT_REPO): string {
  const params = new URLSearchParams({ title, body, labels: 'bug' });
  return `https://github.com/${repo}/issues/new?${params.toString()}`;
}
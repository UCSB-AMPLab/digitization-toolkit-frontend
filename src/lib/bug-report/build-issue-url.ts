// Version: 0.1.0-beta

const DEFAULT_REPO = 'UCSB-AMPLab/digitization-toolkit-software';

/** GitHub "new issue" URL, prefilled with title, body and the `bug` label. */
export function buildIssueUrl(title: string, body: string, repo: string = DEFAULT_REPO): string {
  const params = new URLSearchParams({ title, body, labels: 'bug' });
  return `https://github.com/${repo}/issues/new?${params.toString()}`;
}
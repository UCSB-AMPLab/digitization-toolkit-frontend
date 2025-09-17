import { browser } from '$app/environment';
import { PUBLIC_API_BASE } from '$env/static/public';

export async function load({ fetch }) {
  const base = browser ? PUBLIC_API_BASE : 'http://api:8000';
  const res = await fetch(`${base}/health`);
  if (!res.ok) return { api: { status: `error (${res.status})` } };
  return { api: await res.json() };
}

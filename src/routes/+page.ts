import { browser } from '$app/environment';
import { PUBLIC_API_BASE } from '$env/static/public';
import { env } from '$env/dynamic/public';

export async function load({ fetch }) {
  // Browser: use PUBLIC_API_BASE (localhost:8000)
  // SSR: use PUBLIC_API_BASE_SSR if available (host.docker.internal:8000), fallback to PUBLIC_API_BASE
  const base = browser ? PUBLIC_API_BASE : (env.PUBLIC_API_BASE_SSR || PUBLIC_API_BASE);
  
  try {
    const res = await fetch(`${base}/health`);
    if (!res.ok) return { api: { status: `error (${res.status})` } };
    return { api: await res.json() };
  } catch (error) {
    return { api: { status: 'unavailable', error: String(error) } };
  }
}

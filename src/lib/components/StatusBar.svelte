<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { env } from '$env/dynamic/public';
  import { tokenStore } from '$lib/api';

  let temperature: number | null = null;
  let tempAvailable = false;
  let cameraCount: number = 0;
  let camerasFetched = false;
  let interval: ReturnType<typeof setInterval>;

  const API_BASE = env.PUBLIC_API_BASE || 'http://localhost:8000';
  const WARN_THRESHOLD = 70;
  const DANGER_THRESHOLD = 80;

  async function fetchTemperature() {
    try {
      const token = tokenStore.get();
      const response = await fetch(`${API_BASE}/system/temperature`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (response.ok) {
        const data = await response.json();
        temperature = data.temperature;
        tempAvailable = data.available;
      }
    } catch {
      // Silently ignore fetch errors (network unavailable, etc.)
    }
  }

  async function fetchCameras() {
    try {
      const token = tokenStore.get();
      const response = await fetch(`${API_BASE}/cameras/devices`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (response.ok) {
        const data = await response.json();
        cameraCount = Array.isArray(data) ? data.length : 0;
        camerasFetched = true;
      }
    } catch {
      camerasFetched = true;
    }
  }

  async function fetchAll() {
    await Promise.all([fetchTemperature(), fetchCameras()]);
  }

  function tempClass(temp: number | null): string {
    if (temp === null) return 'temp-normal';
    if (temp >= DANGER_THRESHOLD) return 'temp-danger';
    if (temp >= WARN_THRESHOLD) return 'temp-warning';
    return 'temp-normal';
  }

  function cameraClass(count: number): string {
    if (count === 0) return 'cam-danger';
    if (count === 1) return 'cam-warning';
    return 'cam-ok';
  }

  onMount(() => {
    if (browser) {
      fetchAll();
      interval = setInterval(fetchAll, 10_000);
    }
  });

  onDestroy(() => {
    if (interval) clearInterval(interval);
  });
</script>

<div class="status-bar">
  {#if camerasFetched}
    <div class="status-bar-item {cameraClass(cameraCount)}" title="{cameraCount} camera(s) detected">
      <span class="material-symbols-outlined icon-sm">{cameraCount === 0 ? 'no_photography' : 'photo_camera'}</span>
      <span class="status-bar-label">
        {#if cameraCount === 0}No cameras{:else if cameraCount === 1}1 camera{:else}{cameraCount} cameras{/if}
      </span>
    </div>
  {/if}
  {#if tempAvailable && temperature !== null}
    <div class="status-bar-item {tempClass(temperature)}" title="CPU temperature">
      <span class="material-symbols-outlined icon-sm">thermostat</span>
      <span class="status-bar-temp">{temperature.toFixed(1)}°C</span>
      {#if temperature >= DANGER_THRESHOLD}
        <span class="status-bar-label">High temperature — consider shutting down</span>
      {:else if temperature >= WARN_THRESHOLD}
        <span class="status-bar-label">Temperature elevated</span>
      {/if}
    </div>
  {/if}
</div>


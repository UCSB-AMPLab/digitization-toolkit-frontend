<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { PUBLIC_API_BASE } from '$env/static/public';
  import { tokenStore } from '$lib/api';

  let temperature: number | null = null;
  let available = false;
  let interval: ReturnType<typeof setInterval>;

  const WARN_THRESHOLD = 70;
  const DANGER_THRESHOLD = 80;

  async function fetchTemperature() {
    try {
      const token = tokenStore.get();
      const response = await fetch(`${PUBLIC_API_BASE}/system/temperature`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (response.ok) {
        const data = await response.json();
        temperature = data.temperature;
        available = data.available;
      }
    } catch {
      // Silently ignore fetch errors (network unavailable, etc.)
    }
  }

  function tempClass(temp: number | null): string {
    if (temp === null) return 'temp-normal';
    if (temp >= DANGER_THRESHOLD) return 'temp-danger';
    if (temp >= WARN_THRESHOLD) return 'temp-warning';
    return 'temp-normal';
  }

  onMount(() => {
    if (browser) {
      fetchTemperature();
      interval = setInterval(fetchTemperature, 10_000);
    }
  });

  onDestroy(() => {
    if (interval) clearInterval(interval);
  });
</script>

{#if available && temperature !== null}
  <div class="status-bar">
    <div class="status-bar-item {tempClass(temperature)}">
      <span class="material-symbols-outlined icon-sm">thermostat</span>
      <span class="status-bar-temp">{temperature.toFixed(1)}°C</span>
      {#if temperature >= DANGER_THRESHOLD}
        <span class="status-bar-label">High temperature — consider shutting down</span>
      {:else if temperature >= WARN_THRESHOLD}
        <span class="status-bar-label">Temperature elevated</span>
      {/if}
    </div>
  </div>
{/if}

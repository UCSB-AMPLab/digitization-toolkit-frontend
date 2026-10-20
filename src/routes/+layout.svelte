<script lang="ts">
  import '../app.css';
  import favicon from '$lib/assets/favicon.svg';
  import VirtualKeyboard from '$lib/components/VirtualKeyboard.svelte';
  import GuidedTour from '$lib/components/GuidedTour.svelte';
  import { locale } from '$lib/i18n';
  import { onMount } from 'svelte';
  import { initErrorCapture } from '$lib/bug-report/error-capture';

  let { children, data } = $props();

  // Sincroniza el store de idioma con la cookie que leyó el servidor.
  // El idioma solo cambia con recarga completa (ver setLanguage en $lib/i18n),
  // así que basta fijarlo una vez por carga.
  locale.set(data.locale);
  onMount(() => { initErrorCapture(); });
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

{@render children?.()}

<!-- El recorrido guiado se monta aquí, una sola vez, para que sobreviva a los
     cambios de ruta: sus pasos viven en tres pantallas distintas (NEH-95). -->
<GuidedTour />

<!-- <VirtualKeyboard /> -->


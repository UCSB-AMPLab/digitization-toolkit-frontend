<script lang="ts">
  import '../app.css';
  import favicon from '$lib/assets/favicon.svg';
  import VirtualKeyboard from '$lib/components/VirtualKeyboard.svelte';
  import { locale } from '$lib/i18n';

  let { children, data } = $props();

  // Sincroniza el store de idioma con la cookie que leyó el servidor.
  // El idioma solo cambia con recarga completa (ver setLanguage en $lib/i18n),
  // así que basta fijarlo una vez por carga.
  locale.set(data.locale);
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

{@render children?.()}

<!-- <VirtualKeyboard /> -->


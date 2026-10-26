<script lang="ts">
  // Public credits page. Like /welcome it sits in the (auth) group, which has
  // no session guard, so it opens before anyone has signed in.

  import { onMount } from 'svelte';
  import { isKiosk } from '$lib/kiosk';
  import nehSeal from '$lib/assets/neh-preferred-seal-white.png';
  import amplUcsb from '$lib/assets/ampl-ucsb-white.png';
  import utHistory from '$lib/assets/ut-history.svg';
  import burdick from '$lib/assets/burdick.png';
  import neogranadina from '$lib/assets/neogranadina-white.png';

  // The credit text is English whatever the interface language, like the
  // start labels on /welcome. Logos that are not white already are inverted
  // by `dark` so all five read the same on the dark ground.
  const LOGOS: { src: string; alt: string; width: number; dark: boolean }[] = [
    { src: nehSeal, alt: 'National Endowment for the Humanities', width: 150, dark: false },
    { src: amplUcsb, alt: 'AMP Lab, University of California, Santa Barbara', width: 110, dark: false },
    { src: utHistory, alt: 'Department of History, University of Texas at Austin', width: 160, dark: true },
    { src: burdick, alt: 'Burdick Global Scholars Program', width: 110, dark: true },
    { src: neogranadina, alt: 'Neogranadina', width: 140, dark: false },
  ];

  // Set after mount so the server render never includes the link and the
  // kiosk never flashes it.
  let showLink = $state(false);
  onMount(() => { showLink = !isKiosk(); });
</script>

<div class="page">
  <div class="top">
    <h1>Credits<span lang="es" class="es"> / Créditos</span></h1>
    <a href="/welcome" class="btn">Back / <span lang="es">Volver</span></a>
  </div>

  <div class="body" lang="en">
    <p>
      Captua is developed by Adelaida Ávila, Juan Cobo Betancourt (grant PI), Jairo Melo Flórez, Santiago Muñoz Arbeláez (grant co-PI), Lucrezia Pograri, and Catalina Salguero at the Archives, Memory, and Preservation Lab of the University of California, Santa Barbara and at the University of Texas at Austin.
    </p>
    <p>
      Captua has been made possible in part by a major grant from the National Endowment for the Humanities: Democracy demands wisdom. (NEH Award HAA-304052-25: "Digitization Toolkit: a Blueprint for Egalitarian Access to Technology in Low-Resource Environments".)
    </p>
    <!-- A new tab, never this one, so a desktop visitor keeps the app open.
         The kiosk does not get the link at all (see `isKiosk`). -->
    {#if showLink}
    <a
      class="more"
      href="https://ampl.clair.ucsb.edu/project/digitization-toolkit"
      target="_blank"
      rel="noopener noreferrer"
    >
      Learn more about the Digitization Toolkit project
      <span class="material-symbols-outlined icon-sm" aria-hidden="true">open_in_new</span>
    </a>
    {/if}
    <p class="muted">
      Any views, findings, conclusions, or recommendations expressed in this software do not necessarily represent those of the National Endowment for the Humanities.
    </p>
  </div>

  <div class="logos">
    {#each LOGOS as logo (logo.alt)}
      <div class="logo-box" style:width="{logo.width}px">
        <img src={logo.src} alt={logo.alt} class:invert={logo.dark} />
      </div>
    {/each}
  </div>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    height: 100vh;
    padding: 24px 40px;
    background-color: var(--color-bg);
    font-family: var(--font-family);
    color: var(--color-light);
  }

  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  h1 { margin: 0; font-size: var(--text-h2); font-weight: var(--fw-bold); }
  .es { color: var(--color-light-grey); }

  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    font-size: 14px;
    line-height: 1.5;
  }
  .body p { margin: 0 0 12px; }
  .more {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    margin-bottom: 12px;
    font-weight: var(--fw-semibold);
    color: var(--color-secondary);
    text-decoration: none;
  }
  .body .muted { color: var(--color-light-grey); }

  .logos {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 16px;
    border-top: 1px solid var(--border-color);
  }

  .logo-box { height: 64px; flex: none; }
  .logo-box img { width: 100%; height: 100%; object-fit: contain; }
  .invert { filter: brightness(0) invert(1); }

  .btn {
    display: inline-flex;
    align-items: center;
    font-size: var(--text-base);
    font-weight: var(--fw-semibold);
    color: var(--color-secondary);
    text-decoration: none;
    border: 1.5px solid var(--color-secondary);
    border-radius: var(--radius-md);
    padding: 10px 24px;
    min-height: var(--touch-target-min);
    box-sizing: border-box;
    transition: background-color var(--transition-base);
  }
  .btn:hover { background-color: rgba(150,177,240,0.1); }
</style>

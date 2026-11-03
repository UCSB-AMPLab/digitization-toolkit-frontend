<script lang="ts">
  // Splash screen. Each start button sets the interface language and asks
  // `/auth/setup/status` whether this is a first install: if setup is needed
  // it goes to `/setup` to create the administrator account, otherwise — or
  // when the check fails — to `/login`.
  //
  // Version: 0.1.0-beta

  import { authApi } from '$lib/api';
  import { m, setLanguage, type Locale } from '$lib/i18n';
  import CaptuaLogo from '$lib/components/CaptuaLogo.svelte';
  import nehSeal from '$lib/assets/neh-preferred-seal-white.png';

  // Each label is in its own language whatever the current one is, so a unit
  // with no saved language lets the person pick theirs.
  // Each greeting stands over its own button.
  const STARTS: { code: Locale; greeting: string; label: string }[] = [
    { code: 'en', greeting: 'Hello!', label: 'Get started in English' },
    { code: 'es', greeting: '¡Hola!', label: 'Empezar en español' },
  ];

  let isChecking = $state(false);

  // The destination is passed to `setLanguage` rather than to `goto`: the
  // server reads the language only on a full page load.
  async function handleStart(code: Locale) {
    if (isChecking) return;
    isChecking = true;
    let destination = '/login';
    try {
      const { needs_setup } = await authApi.setupStatus();
      if (needs_setup) destination = '/setup';
    } catch {
      // The status check failed: fall back to the login screen.
    }
    // The page is left for good, so the guard stays on until it unloads.
    setLanguage(code, destination);
  }
</script>

<div class="splash">
  <div class="main">

  <div class="header">
		<!-- The logo is the page's heading, named "Captua" by the image.
		     Stacked on larger screens, side by side on the 800x480 screen;
		     the hidden one is display: none, so only one is announced. The
		     descriptor follows the locale inside CaptuaLogo. Thin ink: the
		     seedling is drawn well above 90px in both. -->
		<h1 class="logo-heading">
			<span class="logo-stacked">
				<CaptuaLogo wordmark="descriptor" weight="thin" layout="stacked" class="brand-logo-stacked" />
			</span>
			<span class="logo-beside">
				<CaptuaLogo wordmark="descriptor" weight="thin" class="brand-logo-xl" />
			</span>
		</h1>

  </div>

  <!-- One column per language: the greeting, a second-level heading, over
       its button. Each column is a group named by its greeting, so a screen
       reader gives the two together. The columns wrap onto two rows on a
       narrow screen and each greeting stays with its button. -->
  <div class="starts">
    {#each STARTS as start (start.code)}
      <div class="start" lang={start.code} role="group" aria-labelledby="greeting-{start.code}">
        <h2 class="title" id="greeting-{start.code}">{start.greeting}</h2>
        <button
          class="btn"
          lang={start.code}
          onclick={() => handleStart(start.code)}
          disabled={isChecking}
          aria-busy={isChecking}
        >
          {start.label}
        </button>
      </div>
    {/each}
  </div>
  </div>

  <!-- The credit text is English whatever the interface language, like the
       start labels; "Credits / Créditos" is bilingual for the same reason. -->
  <footer class="credit">
    <img src={nehSeal} alt="National Endowment for the Humanities" class="seal" />
    <p lang="en">
      Captua is developed at the Archives, Memory, and Preservation Lab of the University of California, Santa Barbara, and at the University of Texas at Austin. It has been made possible in part by a major grant from the National Endowment for the Humanities: Democracy demands wisdom (NEH Award HAA-304052-25).
    </p>
    <a href="/credits" class="credits-link">Credits / <span lang="es">Créditos</span></a>
  </footer>

</div>

<style>
  .splash {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-height: 100vh;
    background-color: var(--color-bg);
  }

  /* Centres the logo, heading and buttons in the space above the footer */
  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  .credit {
    display: flex;
    align-items: center;
    gap: 16px;
    box-sizing: border-box;
    width: 100%;
    padding: 8px 24px;
    border-top: 1px solid var(--border-color);
  }

  .seal { height: 52px; width: auto; flex: none; }

  .credit p {
    flex: 1;
    margin: 0;
    font-family: var(--font-family);
    font-size: 11px;
    line-height: 1.45;
    color: var(--color-light-grey);
  }

  .credits-link {
    flex: none;
    display: inline-flex;
    align-items: center;
    min-height: var(--touch-target-min);
    font-size: var(--text-sm);
    font-weight: var(--fw-bold);
    color: var(--color-secondary);
  }

  /* The stacked lockup needs at least 640x600; below that, side by side */
  .logo-heading > .logo-stacked { display: none; }

  @media (min-width: 640px) and (min-height: 600px) {
    .logo-heading > .logo-stacked { display: block; }
    .logo-heading > .logo-beside { display: none; }
  }

  /* The bottom margin lifts the logo above the visual center */
  .header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    margin-bottom: 24px;
  }

  .title {
    font-family: var(--font-family);
    font-size: var(--text-h2);
    font-weight: var(--fw-bold);
    color: var(--color-light);
    margin: 0 0 24px;
    text-align: center;
  }

  /* Side by side so the splash still fits at 800x480; on a narrower
     screen the columns wrap rather than run off the side. */
  .starts {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 16px;
  }

  .start {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .logo-heading {
    margin: 0;
    font-size: inherit;
  }

  .logo-heading > span { display: block; }

  .btn {
    font-family: var(--font-family);
    font-size: var(--text-base);
    font-weight: var(--fw-semibold);
    color: var(--color-secondary);
    background: transparent;
    border: 1.5px solid var(--color-secondary);
    border-radius: var(--radius-md);
    padding: 10px 24px;
    min-height: var(--touch-target-min);
    cursor: pointer;
    transition: background-color var(--transition-base);
  }

  .btn:hover:not(:disabled)  { background-color: rgba(150,177,240,0.1); }
  .btn:active:not(:disabled) { transform: scale(0.97); }
  .btn:disabled { opacity: 0.6; cursor: not-allowed; }
</style>

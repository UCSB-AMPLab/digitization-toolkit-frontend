<script lang="ts">
  // Splash screen. Each start button sets the interface language and asks
  // `/auth/setup/status` whether this is a first install: if setup is needed
  // it goes to `/setup` to create the administrator account, otherwise — or
  // when the check fails — to `/login`.
  //
  // Version: 0.1.0-beta

  import { authApi } from '$lib/api';
  import { m, locale, setLanguage, type Locale } from '$lib/i18n';
  import logoEs from '$lib/assets/captua-logo-descrp-light-esp.svg';
  import logoEn from '$lib/assets/captua-logo-descrp-light-eng.svg';
  import nehSeal from '$lib/assets/neh-preferred-seal-white.png';

  // The descriptor in the logo is baked into the SVG, so the asset
  // itself has to follow the locale.
  let logo = $derived($locale === 'en' ? logoEn : logoEs);

  // Each label is in its own language whatever the current one is, so a unit
  // with no saved language lets the person pick theirs.
  const STARTS: { code: Locale; label: string }[] = [
    { code: 'en', label: 'Get started in English' },
    { code: 'es', label: 'Empezar en español' },
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
    	<div class="card-logo-area">
			<img src={logo} alt="Captua" class="brand-logo-xl" />
		</div>

  </div>

  <!-- In both languages, like the start buttons below. -->
  <h1 class="title"><span lang="en">Hello!</span> <span lang="es">¡Hola!</span></h1>

  <div class="starts">
    {#each STARTS as start (start.code)}
      <button
        class="btn"
        lang={start.code}
        onclick={() => handleStart(start.code)}
        disabled={isChecking}
        aria-busy={isChecking}
      >
        {start.label}
      </button>
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

  /* Side by side so the splash still fits at 800x480 */
  .starts {
    display: flex;
    gap: 16px;
  }

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

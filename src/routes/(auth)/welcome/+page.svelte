<script lang="ts">
  // Splash screen. Its start button asks `/auth/setup/status` whether this is
  // a first install: if setup is needed it goes to `/setup` to create the
  // administrator account, otherwise — or when the check fails — to `/login`.

  import { goto } from '$app/navigation';
  import { authApi } from '$lib/api';
  import { m, locale } from '$lib/i18n';
  import logoEs from '$lib/assets/captua-logo-descrp-light-esp.svg';
  import logoEn from '$lib/assets/captua-logo-descrp-light-eng.svg';

  // The descriptor in the logo is baked into the SVG, so the asset
  // itself has to follow the locale.
  let logo = $derived($locale === 'en' ? logoEn : logoEs);

  let isChecking = $state(false);

  async function handleComenzar() {
    if (isChecking) return;
    isChecking = true;
    try {
      const { needs_setup } = await authApi.setupStatus();
      goto(needs_setup ? '/setup' : '/login');
    } catch {
      goto('/login');
    } finally {
      isChecking = false;
    }
  }
</script>

<div class="splash">

  <div class="header">
    	<div class="card-logo-area">
			<img src={logo} alt="Captua" class="brand-logo-xl" />
		</div>

  </div>

  <h1 class="title">{$m.welcome_title}</h1>

  <button class="btn" onclick={handleComenzar} disabled={isChecking} aria-busy={isChecking}>
    {$m.welcome_start}
  </button>

</div>

<style>
  .splash {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background-color: var(--color-bg);
  }

  /* The bottom margin lifts the logo above the visual center */
  .header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    margin-bottom: 80px;
  }

  .title {
    font-family: var(--font-family);
    font-size: var(--text-h2);
    font-weight: var(--fw-bold);
    color: var(--color-light);
    margin: 0 0 24px;
    text-align: center;
  }

  .btn {
    font-family: var(--font-family);
    font-size: var(--text-base);
    font-weight: var(--fw-semibold);
    color: var(--color-secondary);
    background: transparent;
    border: 1.5px solid var(--color-secondary);
    border-radius: var(--radius-md);
    padding: 10px 48px;
    min-height: var(--touch-target-min);
    cursor: pointer;
    transition: background-color var(--transition-base);
  }

  .btn:hover:not(:disabled)  { background-color: rgba(150,177,240,0.1); }
  .btn:active:not(:disabled) { transform: scale(0.97); }
  .btn:disabled { opacity: 0.6; cursor: not-allowed; }
</style>

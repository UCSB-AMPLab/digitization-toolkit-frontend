<script lang="ts">
  // Shutting down or restarting the unit (NEH-189), so that nobody has to
  // pull the plug, which corrupts the SD card. Settings and the avatar menu
  // both use this one component: the caller renders its own buttons and
  // calls `ask(action)`; this component owns the confirmation, the request
  // and the blocking state that follows. The backend accepts the order from
  // any signed-in role.
  //
  //   200 → shutdown/reboot under way (the backend goes away at once)
  //   501 → power control unavailable (development machine)
  //   401 → session expired
  //
  // A caller that passes `onError` shows the failure itself (Settings does,
  // inside its Power card). Without it, the failure appears in a dialog here,
  // because the avatar menu has already closed by then.
  //
  // The dialogs are moved to <body>: the top bars that hold the avatar menu
  // are stacking contexts, and a fixed overlay inside one could be covered
  // by the page underneath.

  import { m } from '$lib/i18n';
  import { systemApi, healthApi, PowerControlError, type PowerAction } from '$lib/api';
  import { dismissible, toBody } from '$lib/dialog';
  import { holdPowerControlOpen } from '$lib/stores/power';

  let { onError }: { onError?: (message: string | null) => void } = $props();

  let pendingAction = $state<PowerAction | null>(null);   // action awaiting confirmation
  let sending = $state(false);                            // request in flight (dialog open)
  let phase = $state<'idle' | 'poweroff' | 'reboot'>('idle');
  let error = $state<string | null>(null);                // shown here only without onError

  // While anything here is on screen, the capture key must not fire behind it.
  $effect(() => {
    if (pendingAction === null && error === null && phase === 'idle') return;
    return holdPowerControlOpen();
  });

  let confirmTitle = $derived(
    pendingAction === 'reboot' ? $m.config_confirm_reboot_title : $m.config_confirm_shutdown_title
  );
  let confirmDesc = $derived(
    pendingAction === 'reboot' ? $m.config_confirm_reboot_desc : $m.config_confirm_shutdown_desc
  );

  function report(message: string | null) {
    if (onError) onError(message);
    else error = message;
  }

  export function ask(action: PowerAction) {
    if (sending || phase !== 'idle') return;
    report(null);
    pendingAction = action;
  }

  function cancel() {
    if (sending) return; // an order already sent cannot be cancelled
    pendingAction = null;
  }

  async function confirm() {
    const action = pendingAction;
    if (!action || sending) return;
    report(null);
    // The dialog stays open with its buttons disabled while the request is
    // in flight. The blocking state appears only once the backend confirms
    // (200) — a 501/401 must not block the page.
    sending = true;
    try {
      await systemApi.powerControl(action);
      phase = action;
      if (action === 'reboot') pollForRecovery();
    } catch (e: unknown) {
      if (e instanceof PowerControlError && e.status === 501) {
        report($m.config_err_power_unavailable);
      } else if (e instanceof PowerControlError && e.status === 401) {
        report($m.config_err_session_expired);
      } else {
        report((e instanceof Error ? e.message : null) || $m.config_err_operation);
      }
    } finally {
      sending = false;
      pendingAction = null;
    }
  }

  // After a reboot the backend goes down and comes back. Once /health
  // responds again, the app is reloaded to start from a clean session.
  async function pollForRecovery() {
    // Gives the backend time to start shutting down before polling.
    await new Promise((r) => setTimeout(r, 8000));
    while (phase === 'reboot') {
      try {
        await healthApi.check();
        window.location.reload();
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }
</script>

<!-- Styled like the confirmations on the Users page, so that a single tap
     cannot power the unit off. -->
{#if pendingAction}
  <div class="modal-backdrop" use:toBody use:dismissible={{ onDismiss: cancel }}>
    <div class="modal-card dialog-fit" role="dialog" aria-modal="true" aria-labelledby="power-confirm-title">
      <h3 class="confirm-title" id="power-confirm-title">{confirmTitle}</h3>
      <p class="confirm-desc">{confirmDesc}</p>

      <div class="modal-actions">
        <button class="btn-ghost" onclick={cancel} disabled={sending}>{$m.common_cancel}</button>
        {#if pendingAction === 'reboot'}
          <button class="btn-confirm-power" onclick={confirm} disabled={sending}>
            {sending ? $m.config_sending : $m.config_confirm_reboot_btn}
          </button>
        {:else}
          <button class="btn-delete" onclick={confirm} disabled={sending}>
            {sending ? $m.config_sending : $m.config_confirm_shutdown_btn}
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}

{#if error}
  <div class="modal-backdrop" use:toBody use:dismissible={{ onDismiss: () => (error = null) }}>
    <div class="modal-card dialog-fit" role="alertdialog" aria-modal="true" aria-labelledby="power-error-title" aria-describedby="power-error-desc">
      <h3 class="confirm-title" id="power-error-title">{$m.config_section_power}</h3>
      <p class="confirm-desc" id="power-error-desc">{error}</p>
      <div class="modal-actions">
        <button class="btn-ghost" onclick={() => (error = null)}>{$m.common_close}</button>
      </div>
    </div>
  </div>
{/if}

<!-- Blocking state while the backend shuts down or reboots. No buttons: it
     ends only when the unit powers off (poweroff) or the app reloads itself
     (reboot). -->
{#if phase !== 'idle'}
  <div class="power-overlay" use:toBody>
    <div class="power-overlay-card" role="status" aria-live="polite">
      <div class="spinner-lg"></div>
      {#if phase === 'poweroff'}
        <h3 class="power-overlay-title">{$m.config_shutting_down}</h3>
        <p class="power-overlay-desc">{$m.config_shutdown_overlay_desc}</p>
      {:else}
        <h3 class="power-overlay-title">{$m.config_rebooting}</h3>
        <p class="power-overlay-desc">{$m.config_reboot_overlay_desc}</p>
      {/if}
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed; inset: 0;
    background-color: rgba(0,0,0,0.65);
    backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    z-index: 100; padding: 24px;
  }

  .modal-card {
    background-color: var(--color-surface-alt);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
    padding: 28px;
    width: 100%; max-width: 440px;
    box-shadow: var(--shadow-lg);
    display: flex; flex-direction: column; gap: 12px;
  }

  .confirm-title {
    font-size: var(--text-h3); font-weight: var(--fw-bold);
    color: var(--color-light); margin: 0;
  }

  .confirm-desc {
    font-size: var(--text-sm); color: var(--color-light-grey);
    line-height: 1.6; margin: 0;
  }

  .modal-actions {
    display: flex; gap: 12px;
    padding-top: 4px;
    border-top: 1px solid var(--border-color);
  }

  .btn-ghost {
    display: inline-flex; align-items: center; justify-content: center; gap: 7px;
    flex: 1;
    background: none; border: 1px solid var(--border-color);
    border-radius: var(--radius-md); padding: 9px 18px;
    font-family: var(--font-family); font-size: var(--text-sm);
    color: var(--color-light-grey); cursor: pointer;
    transition: all var(--transition-fast); min-height: var(--touch-target-min);
    white-space: nowrap;
  }
  .btn-ghost:hover { color: var(--color-light); border-color: rgba(255,255,255,0.2); }
  .btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }

  .btn-delete {
    flex: 1; height: 44px;
    background-color: var(--color-error); color: white;
    font-family: var(--font-family); font-size: var(--text-sm); font-weight: var(--fw-bold);
    border: none; border-radius: var(--radius-md);
    cursor: pointer; transition: opacity var(--transition-base);
  }
  .btn-delete:hover    { opacity: 0.85; }
  .btn-delete:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Reboot is not destructive, so its confirm button is primary green. */
  .btn-confirm-power {
    flex: 1; height: 44px;
    background-color: var(--color-primary); color: white;
    font-family: var(--font-family); font-size: var(--text-sm); font-weight: var(--fw-bold);
    border: none; border-radius: var(--radius-md);
    cursor: pointer; transition: background-color var(--transition-base);
  }
  .btn-confirm-power:hover    { background-color: var(--color-primary-hover); }
  .btn-confirm-power:disabled { opacity: 0.5; cursor: not-allowed; }

  .power-overlay {
    position: fixed; inset: 0;
    background-color: rgba(19,17,16,0.92);
    backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    z-index: 200; padding: 24px;
  }

  .power-overlay-card {
    display: flex; flex-direction: column; align-items: center; text-align: center;
    gap: 16px; max-width: 420px;
  }

  .power-overlay-title {
    font-size: var(--text-h3); font-weight: var(--fw-bold);
    color: var(--color-light); margin: 0;
  }

  .power-overlay-desc {
    font-size: var(--text-base); color: var(--color-light-grey);
    line-height: 1.6; margin: 0;
  }

  .spinner-lg {
    width: 40px; height: 40px;
    border: 3px solid var(--border-color);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
</style>

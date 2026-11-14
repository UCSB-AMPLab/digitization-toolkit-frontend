<script lang="ts">
  // Configuración → Conectar con Fisqua (NEH-345), admin only as the page
  // is. An administrator links the unit to a Fisqua workspace by a code: the
  // admin types the unit's name and presses Obtener un código; the card shows
  // the code (ABC-DEF) and the unit's device id; an administrator of the
  // workspace approves the code in Fisqua; the unit collects its link and
  // restarts its backend. The backend does all the talking to Fisqua and holds
  // every secret; this card reads only the unit's own API, through
  // readPairingStatus, which keeps only the fields of the contract.
  //
  // GET /system/pairing is read every 2 s while the card is mounted (it is
  // also the backend's heartbeat), and stops once the page has been hidden
  // for long (pollPairing). From `applying` on, the backend may restart and GET
  // fails for a while: the card keeps polling and shows "restarting" until
  // GET answers again, then the link. A refusal is shown from its code,
  // never from the backend's English; a state or code this version does not
  // know gets the generic line. POST, renew and DELETE answer with the same
  // body as GET, which the card shows at once. While Captua waits to ask
  // Fisqua again (`trouble`), the card says why. After `lapsed`, `lost_answer`
  // or `unknown`, Obtener un código nuevo renews, which starts a new session
  // with the same name.
  //
  // While `applying`, `reason` says whether Captua is still waiting for an
  // upload in progress (`finishing_uploads`) or writing the link. `apply_failed`
  // with `uploads_still_running` leaves uploads paused until the unit restarts.
  //
  // `restartRequired` (a provisioning run may have changed the settings this
  // process read; it survives a reload, since GET reports it) puts the
  // restart first, names the last outcome and disables Obtener un código.
  //
  // `restart_needed` and `uploads_still_running` offer the existing restart of
  // the unit (PowerControl);
  // a linked unit outside Fisqua mode is pointed to the unit-mode section,
  // whose switch does the rest.
  //
  // Version: 0.3.3

  import { onMount } from 'svelte';
  import { m } from '$lib/i18n';
  import { systemApi } from '$lib/api';
  import PowerControl from '$lib/components/PowerControl.svelte';
  import { ensureUnit, unitState } from '$lib/unit-mode';
  import {
    PAIRING_POLL_MS, groupCode, pairingErrorCode, pairingFinalText, pairingPanel, pairingRefusalText,
    pairingOutcomeText, pairingRetryText, pollPairing, type PairingStatus
  } from '$lib/fisqua-pairing';

  let { pollMs = PAIRING_POLL_MS }: { pollMs?: number } = $props();

  const NAME_MAX = 64;

  let status = $state<PairingStatus | null>(null);
  // The last GET failed outside a restart.
  let readFailed = $state(false);
  // From `applying` until GET answers with a state past the restart.
  let inRestart = $state(false);
  // GET is failing during the restart.
  let gap = $state(false);
  // The first answers after the restart: `idle` with the link configured reads as linked.
  let afterRestart = $state(false);
  let name = $state('');
  let nameTouched = false;
  let acting = $state(false);
  // The code of the last refused request ('generic' when it had none).
  let refusal = $state<string | null>(null);
  let power = $state<ReturnType<typeof PowerControl> | undefined>(undefined);
  let powerError = $state<string | null>(null);

  function accept(next: PairingStatus) {
    readFailed = false;
    gap = false;
    const p = pairingPanel(next.state);
    if (p === 'applying' || p === 'restarting') {
      inRestart = true;
      afterRestart = false;
    } else if (inRestart) {
      inRestart = false;
      afterRestart = true;
    }
    status = next;
    if (!nameTouched && !name && next.unitName) name = next.unitName;
  }

  onMount(() => {
    let alive = true;
    ensureUnit();
    const stop = pollPairing({
      intervalMs: pollMs,
      read: async (signal) => {
        try {
          const next = await systemApi.getPairing(signal);
          if (alive) accept(next);
        } catch {
          if (!alive) return;
          if (inRestart) gap = true;
          else readFailed = true;
        }
      }
    });
    return () => {
      alive = false;
      stop();
    };
  });

  let panel = $derived.by(() => {
    if (!status) return null;
    if (gap) return 'restarting';
    const p = pairingPanel(status.state);
    if (p === 'form' && afterRestart && status.linked.configured) return 'linked';
    return p;
  });

  let showForm = $derived(panel === 'form' || panel === 'linked' || panel === 'final');
  let canCancel = $derived(panel === 'requesting' || panel === 'code');
  let linkedTenant = $derived(status ? status.linked.tenant ?? status.result?.tenant ?? status.currentTenant : null);
  // Only staging is named (as Fisqua's test service); the raw environment name is never shown.
  let linkedEnv = $derived(status ? status.linked.environment ?? status.result?.environment ?? status.environment : null);
  // The line naming the current workspace, where no other line names it.
  let currentLine = $derived(
    !!status && status.linked.configured && !!linkedTenant &&
      (panel === 'form' || (panel === 'final' && status.state !== 'other_workspace'))
  );
  let ineligible = $derived(!!status && !status.eligible.ok);
  let retryLine = $derived(status ? pairingRetryText(status, $m) : null);
  // A provisioning run may have changed the settings this process read: the
  // unit is restarted before anything else. Not while the link is being
  // applied or the backend is restarting, which set the same latch.
  let mustRestart = $derived(
    !!status && status.restartRequired && !gap && panel !== 'applying' && panel !== 'restarting'
  );
  let outcomeLine = $derived(status ? pairingOutcomeText(status, $m) : null);
  let outsideFisquaMode = $derived(!!$unitState && $unitState.mode !== 'fisqua');

  function onName(e: Event) {
    nameTouched = true;
    name = (e.currentTarget as HTMLInputElement).value;
    if (refusal === 'unit_name') refusal = null;
  }

  async function act(call: () => Promise<PairingStatus | null>) {
    acting = true;
    refusal = null;
    afterRestart = false;
    try {
      const next = await call();
      if (next) accept(next);
    } catch (err) {
      console.error('[FisquaLink] Request refused:', err);
      refusal = pairingErrorCode(err) ?? 'generic';
    } finally {
      acting = false;
    }
  }

  function start(unitName = name) {
    const trimmed = unitName.trim();
    if (trimmed.length < 1 || trimmed.length > NAME_MAX) {
      refusal = 'unit_name';
      return;
    }
    act(() => systemApi.startPairing(trimmed));
  }

  // After `lapsed`, `lost_answer` or `unknown`: a new session with the same name.
  function newCode() {
    act(() => systemApi.renewPairing());
  }

  function cancel() {
    act(() => systemApi.cancelPairing());
  }
</script>

<p class="link-desc">{$m.fisqua_link_desc}</p>

<div class="link-card">
  {#if !status}
    {#if readFailed}
      <p class="link-error" role="alert">{$m.fisqua_link_err_read}</p>
    {:else}
      <p class="link-muted">{$m.common_loading_ellipsis}</p>
    {/if}
  {:else}
    {#if readFailed}
      <p class="link-error">{$m.fisqua_link_err_read}</p>
    {/if}

    {#if panel === 'requesting'}
      <p class="link-line">{retryLine ?? $m.fisqua_link_requesting}</p>
    {:else if panel === 'code'}
      {#if status.code}
        <div class="link-code-row">
          <div class="link-fact">
            <span class="link-label">{$m.fisqua_link_code_label}</span>
            <span class="link-code" data-pairing-code>{groupCode(status.code)}</span>
            {#if status.expiresInSeconds !== null}
              <span class="link-muted">{$m.fisqua_link_expires(status.expiresInSeconds)}</span>
            {/if}
          </div>
          {#if status.deviceId}
            <div class="link-fact">
              <span class="link-label">{$m.fisqua_link_device_label}</span>
              <span class="link-device">{status.deviceId}</span>
            </div>
          {/if}
        </div>
      {/if}
      <p class="link-line">{retryLine ?? $m.fisqua_link_waiting}</p>
    {:else if panel === 'applying'}
      <p class="link-line">
        {status.reason === 'finishing_uploads'
          ? $m.fisqua_link_finishing_uploads
          : status.reason === 'finishing_offsite_jobs'
            ? $m.fisqua_link_finishing_offsite_jobs
            : $m.fisqua_link_applying}
      </p>
    {:else if panel === 'restarting'}
      <p class="link-line">{$m.fisqua_link_restarting}</p>
    {:else if panel === 'restart_needed'}
      <p class="link-line">{$m.fisqua_link_restart_manual}</p>
    {:else if panel === 'renew'}
      <p class="link-line">{pairingFinalText(status, $m)}</p>
    {:else if panel === 'linked'}
      <p class="link-line link-ok">{$m.fisqua_link_linked(linkedTenant ?? '—', linkedEnv === 'staging')}</p>
      {#if outsideFisquaMode}
        <p class="link-muted">{$m.fisqua_link_mode_hint}</p>
        <div class="link-actions">
          <a class="link-btn-ghost" href="#unit-mode">{$m.fisqua_link_switch_mode}</a>
        </div>
      {/if}
    {:else if panel === 'final'}
      <div class="link-notice">{pairingFinalText(status, $m)}</div>
    {/if}

    {#if mustRestart}
      <div class="link-notice" role="status">
        <p class="link-notice-line">{$m.fisqua_link_restart_required}</p>
        {#if outcomeLine}
          <p class="link-notice-line">{outcomeLine}</p>
        {/if}
      </div>
    {/if}

    {#if mustRestart || panel === 'restart_needed' || (panel === 'final' && (status.state === 'apply_unverified' || (status.state === 'apply_failed' && status.reason === 'uploads_still_running')))}
      <div class="link-actions">
        <button type="button" class="link-btn-save" onclick={() => power?.ask('reboot')}>{$m.fisqua_link_restart_btn}</button>
      </div>
      {#if powerError}
        <p class="link-error">{powerError}</p>
      {/if}
    {/if}

    {#if panel === 'renew'}
      {#if refusal}
        <p class="link-error" role="alert">{pairingRefusalText(refusal, $m)}</p>
      {/if}
      <div class="link-actions">
        <button type="button" class="link-btn-save" onclick={newCode} disabled={acting || mustRestart}>{$m.fisqua_link_new_code}</button>
      </div>
    {/if}

    {#if canCancel}
      <div class="link-actions">
        <button type="button" class="link-btn-ghost" onclick={cancel} disabled={acting}>{$m.common_cancel}</button>
      </div>
    {/if}

    {#if showForm}
      {#if currentLine}
        <p class="link-line">{$m.fisqua_link_current(linkedTenant ?? '')}</p>
      {/if}
      <p class="link-muted">{$m.fisqua_link_restart_warning}</p>
      <div class="link-field">
        <label class="link-label" for="fisqua-link-name">{$m.fisqua_link_name_label}</label>
        <input
          id="fisqua-link-name"
          class="link-input"
          type="text"
          maxlength={NAME_MAX}
          value={name}
          oninput={onName}
          disabled={acting}
          aria-describedby="fisqua-link-name-hint"
        />
        <span class="link-muted" id="fisqua-link-name-hint">{$m.fisqua_link_name_hint}</span>
      </div>
      {#if status.deviceIdError}
        <p class="link-error">{$m.fisqua_link_device_id_invalid}</p>
      {/if}
      {#if ineligible}
        <p class="link-error">{pairingRefusalText(status.eligible.reason, $m)}</p>
      {/if}
      {#if refusal}
        <p class="link-error" role="alert">{pairingRefusalText(refusal, $m)}</p>
      {/if}
      <div class="link-actions">
        <button type="button" class="link-btn-save" onclick={() => start()} disabled={acting || ineligible || mustRestart || !!status.deviceIdError}>
          {$m.fisqua_link_start}
        </button>
      </div>
    {/if}
  {/if}
</div>

<PowerControl bind:this={power} onError={(message) => (powerError = message)} />

<style>
  /* The tokens and shapes of UnitModeCard, beside it on the same page. */
  .link-desc { margin: -6px 0 14px; font-size: var(--text-sm); color: var(--color-light-grey); line-height: 1.5; max-width: 760px; }

  .link-card {
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
    padding: 20px;
    display: flex; flex-direction: column; gap: 12px;
    max-width: 860px;
  }

  .link-line { margin: 0; font-size: var(--text-base); color: var(--color-light); line-height: 1.45; }
  .link-ok { font-weight: var(--fw-bold); }
  .link-muted { margin: 0; font-size: var(--text-sm); color: var(--color-light-grey); line-height: 1.45; }
  .link-error { margin: 0; font-size: var(--text-sm); color: var(--color-error); line-height: 1.45; }

  .link-notice {
    padding: 14px 16px;
    border-radius: var(--radius-md);
    background-color: var(--color-error-bg);
    border: 1px solid rgba(214, 103, 74, 0.45);
    color: var(--color-light);
    font-size: var(--text-sm);
    line-height: 1.45;
  }

  .link-notice-line { margin: 0; }
  .link-notice-line + .link-notice-line { margin-top: 6px; }

  .link-code-row { display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-end; }
  .link-fact { display: flex; flex-direction: column; gap: 4px; }
  .link-label {
    font-size: 11px; font-weight: var(--fw-bold);
    color: var(--color-light-grey);
    text-transform: uppercase; letter-spacing: 0.06em;
  }
  .link-code {
    font-family: monospace;
    font-size: var(--text-h1);
    font-weight: var(--fw-bold);
    letter-spacing: 0.08em;
    color: var(--color-light);
  }
  .link-device { font-family: monospace; font-size: var(--text-lead); color: var(--color-light); }

  .link-field { display: flex; flex-direction: column; gap: 6px; max-width: 420px; }
  .link-input {
    min-height: var(--touch-target-min);
    padding: 0 12px;
    border: 1px solid var(--border-color); border-radius: var(--radius-md);
    background-color: var(--color-surface-alt-2);
    color: var(--color-light);
    font-family: var(--font-family); font-size: var(--text-base);
  }

  .link-actions { display: flex; align-items: center; gap: 12px; padding-top: 4px; }

  .link-btn-save {
    min-height: var(--touch-target-min);
    padding: 0 22px;
    border: 0; border-radius: var(--radius-md);
    background-color: var(--color-primary);
    color: white;
    font-family: var(--font-family); font-size: var(--text-sm); font-weight: var(--fw-bold);
    cursor: pointer;
    transition: background-color var(--transition-base);
  }
  .link-btn-save:hover:not(:disabled) { background-color: var(--color-primary-hover); }
  .link-btn-save:disabled { opacity: 0.5; cursor: not-allowed; }

  .link-btn-ghost {
    display: inline-flex; align-items: center;
    min-height: var(--touch-target-min);
    padding: 0 18px;
    background: none;
    border: 1px solid var(--border-color); border-radius: var(--radius-md);
    color: var(--color-light-grey);
    font-family: var(--font-family); font-size: var(--text-sm);
    text-decoration: none;
    cursor: pointer;
    transition: all var(--transition-fast);
  }
  .link-btn-ghost:hover:not(:disabled) { color: var(--color-light); border-color: rgba(255,255,255,0.2); }
  .link-btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }
</style>

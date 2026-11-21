<script lang="ts">
  // Settings page (/dashboard/config), for every role (NEH-253). A list of
  // sections, then the one chosen: Network and Language for everyone, and
  // for administrators the Unit group, whose sections (UnitSections) are the
  // ones this page held before it was split. Which sections a role sees and
  // may open is decided in settings-sections.ts; a section asked for that the
  // role may not open shows Network instead.
  //
  // The section is addressable: ?section=<id> (the sidebar's network status
  // links to ?section=network), and the hash of older links (#offsite-copy)
  // is read too. Choosing a section replaces the URL without a new history
  // entry. From 1000 px wide the list is a column beside the section; below
  // that, as on the unit's 800x480 screen, it is a row of tabs above it,
  // scrolled sideways; the row is scrolled, without animation, so that the
  // current section's tab is on screen, also when the URL names one at the
  // end of the row.
  //
  // Version: 0.3.4

  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { m, locale, setLanguage, type Locale } from '$lib/i18n';
  import { authStore } from '$lib/stores/auth';
  import NetworkSection from './NetworkSection.svelte';
  import UnitSections from './UnitSections.svelte';
  import { resolveSection, sectionInUrl, sectionsFor } from './settings-sections';
  import { inTestingSpace, opensUnitSettings } from '$lib/unit-mode';

  // Available languages. The catalogue lives in `$lib/i18n`; this list only
  // names them for the selector.
  const LANGUAGES: { code: Locale; label: string }[] = [
    { code: 'es', label: 'Español' },
    { code: 'en', label: 'English' },
  ];

  let role = $derived($authStore.user?.role ?? null);
  let isAdmin = $derived(opensUnitSettings(role));
  let sections = $derived(sectionsFor(role));
  let general = $derived(sections.filter((s) => !s.unit));
  let unitSections = $derived(sections.filter((s) => s.unit));

  // The URL's choice, then the person's; a new URL (the sidebar link while
  // this page is open) replaces the person's choice. Derived, so the first
  // render already shows the section the URL names (no other section mounts
  // and fires its requests first); writable, so a choice takes effect at
  // once.
  let chosen = $derived<string | null>(sectionInUrl($page.url));

  let current = $derived(resolveSection(chosen, role));

  let nav = $state<HTMLElement | null>(null);

  // Scroll the row of tabs, and only it, so that the current tab shows.
  $effect(() => {
    const id = current.id;
    if (!nav || nav.scrollWidth <= nav.clientWidth) return;
    const tab = nav.querySelector<HTMLElement>(`[data-settings-section="${id}"]`);
    if (!tab) return;
    const row = nav.getBoundingClientRect();
    const box = tab.getBoundingClientRect();
    if (box.left < row.left) nav.scrollLeft -= row.left - box.left;
    else if (box.right > row.right) nav.scrollLeft += box.right - row.right;
  });

  function choose(id: string) {
    chosen = id;
    goto(`?section=${id}`, { replaceState: true, noScroll: true, keepFocus: true });
  }
</script>

<div class="page">

  <div class="page-header">
    <div>
      <h1 class="page-title">{$m.nav_settings}</h1>
      <p class="page-subtitle">{isAdmin ? $m.config_subtitle : $m.config_subtitle_personal}</p>
    </div>
  </div>

  <div class="settings-layout">
    <nav class="settings-nav" aria-label={$m.config_sections_label} bind:this={nav}>
      {#each general as s (s.id)}
        <button
          type="button"
          class="settings-item"
          class:active={current.id === s.id}
          aria-current={current.id === s.id ? 'page' : undefined}
          data-settings-section={s.id}
          onclick={() => choose(s.id)}
        >{$m[s.labelKey]}</button>
      {/each}
      {#if unitSections.length > 0}
        <div class="settings-sep" aria-hidden="true"></div>
        <p class="settings-group">{$m.config_group_unit}</p>
        {#each unitSections as s (s.id)}
          <button
            type="button"
            class="settings-item"
            class:active={current.id === s.id}
            aria-current={current.id === s.id ? 'page' : undefined}
            data-settings-section={s.id}
            onclick={() => choose(s.id)}
          >{$m[s.labelKey]}</button>
        {/each}
      {/if}
    </nav>

    <div class="settings-body">
      {#if current.id === 'network'}
        <NetworkSection {role} />
      {:else if current.id === 'language'}
        <!-- Language is a personal preference; `setLanguage` writes a cookie
             and reloads: it does not touch the session. -->
        <div class="config-section">
          <h2 class="section-title">{$m.config_section_language}</h2>
          <div class="config-card">
            <div class="config-row">
              <div class="row-info">
                <span class="row-label">{$m.config_language_label}</span>
                <span class="row-desc">{$m.config_language_desc}</span>
              </div>

              <div class="lang-options" role="group" aria-label={$m.config_language_label}>
                {#each LANGUAGES as lang}
                  <button
                    type="button"
                    class="lang-option"
                    class:active={$locale === lang.code}
                    aria-pressed={$locale === lang.code}
                    onclick={() => setLanguage(lang.code)}
                  >
                    {lang.label}
                  </button>
                {/each}
              </div>
            </div>
          </div>
        </div>
      {:else if (isAdmin || inTestingSpace(role)) && current.unit}
        <UnitSections section={current.id} />
      {/if}
    </div>
  </div>

</div>

<style>
  .page { padding: 32px; max-width: 1180px; }

  /* Header */
  .page-header {
    display: flex; align-items: flex-start; justify-content: space-between;
    margin-bottom: 28px;
  }

  .page-title    { font-size: var(--text-h2); font-weight: var(--fw-black); color: var(--color-light); margin: 0 0 4px; }
  .page-subtitle { font-size: var(--text-sm); color: var(--color-light-grey); margin: 0; }

  /* Sections: a column beside the body from 1000 px, a row of tabs below. */
  .settings-layout {
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr);
    gap: 28px;
    align-items: start;
  }

  .settings-nav {
    display: flex;
    flex-direction: column;
    gap: 1px;
    position: sticky;
    top: 0;
  }

  /* The sidebar's .s-item look. */
  .settings-item {
    position: relative;
    display: flex;
    align-items: center;
    padding: 10px 10px;
    min-height: var(--touch-target-min);
    border: none;
    border-radius: var(--radius-md);
    background: none;
    color: var(--color-light-grey);
    font-family: var(--font-family);
    font-size: 13px;
    font-weight: var(--fw-semibold);
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
    transition: all var(--transition-fast);
  }
  .settings-item:hover { color: var(--color-light); background-color: rgba(255, 255, 255, 0.04); }
  .settings-item.active { color: var(--color-light); background-color: rgba(90, 140, 98, 0.15); }
  .settings-item.active::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: 60%;
    background-color: var(--color-primary);
    border-radius: 0 3px 3px 0;
  }

  .settings-sep { height: 1px; background: var(--border-color); margin: 8px 10px; }
  .settings-group {
    font-size: 10px;
    font-weight: var(--fw-bold);
    color: var(--color-light-grey);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 6px 10px 4px;
    margin: 0;
    opacity: 0.7;
  }

  .settings-body { min-width: 0; max-width: 900px; }

  /* Below 1000 px: app.css .nav-underline, scrolled sideways. */
  @media (max-width: 999px) {
    .page { padding: 20px; }
    .settings-layout { grid-template-columns: minmax(0, 1fr); gap: 20px; }
    .settings-nav {
      position: static;
      flex-direction: row;
      gap: 0;
      border-bottom: var(--border-width) solid var(--border-color);
      overflow-x: auto;
      scrollbar-width: none;
    }
    .settings-nav::-webkit-scrollbar { height: 0; }
    .settings-item {
      flex-shrink: 0;
      padding: 10px 16px;
      border-radius: 0;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
      font-size: var(--text-sm);
      font-weight: var(--fw-medium);
    }
    .settings-item:hover { background: none; }
    .settings-item.active { background: none; border-bottom-color: var(--color-primary); }
    .settings-item.active::before { display: none; }
    .settings-sep,
    .settings-group { display: none; }
  }

  @media (max-height: 520px) {
    .page { padding: 16px 20px; }
    .page-header { margin-bottom: 14px; }
  }

  .config-section { margin-bottom: 32px; }

  .section-title {
    font-size: var(--text-h3); font-weight: var(--fw-bold);
    color: var(--color-light); margin: 0 0 14px;
  }

  .config-card {
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
    overflow: hidden;
  }

  .config-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 18px 20px; gap: 20px;
  }

  .row-info { display: flex; flex-direction: column; gap: 3px; min-width: 0; }

  .row-label { font-size: var(--text-base); color: var(--color-light); font-weight: var(--fw-medium); }
  .row-desc  { font-size: var(--text-sm); color: var(--color-light-grey); }

  /* Language selector: toggle buttons, not a dropdown — two options fit on
     screen, so the current one can be read without opening anything. */
  .lang-options { display: flex; gap: 8px; flex-shrink: 0; }

  .lang-option {
    padding: 8px 16px;
    min-height: var(--touch-target-min);
    border-radius: var(--radius-md);
    border: var(--border-width) solid var(--border-color);
    background-color: transparent;
    font-family: var(--font-family);
    font-size: var(--text-sm);
    font-weight: var(--fw-medium);
    color: var(--color-light-grey);
    cursor: pointer;
    white-space: nowrap;
    transition: color var(--transition-base), border-color var(--transition-base);
  }
  .lang-option:hover { color: var(--color-light); }
  .lang-option.active {
    border-color: var(--color-light);
    color: var(--color-light);
    font-weight: var(--fw-bold);
  }
</style>

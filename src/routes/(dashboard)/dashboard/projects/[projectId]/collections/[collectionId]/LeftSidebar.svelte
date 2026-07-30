<script lang="ts">
  // ============================================================================
  // COMPONENTE: LeftSidebar (Gallery)
  // Archivo: src/routes/gallery/[collectionId]/LeftSidebar.svelte
  //
  // Panel lateral izquierdo de la galería.
  // Contiene un strip de 3 íconos y un panel expandido según el tab activo:
  //
  //   'info'     → Image info: nombre, formato, metadatos, dimensiones, tamaño
  //   'edit'     → Preview Controls: rotar, brillo, contraste, saturación
  //   'comments' → Anotaciones: lista de notas + motivo de rechazo (desplegable)
  //                + "Agregar nota" + Rechazar/Aprobar (NEH-209) — todo en un
  //                solo panel, sin modales, para que aprobar/rechazar no
  //                obligue a mirar a otro lado de la pantalla. Rechazar y
  //                Aprobar siempre están visibles (aunque el registro ya esté
  //                aprobado/rechazado) para poder deshacer un error, detrás
  //                de un popup de confirmación.
  //
  // En vista 'spread' o 'grid', el sidebar se colapsa mostrando solo el strip.
  // Solo se muestran los paneles en vista 'single'.
  //
  // Las anotaciones se persisten en el backend (recordsApi.*Annotation*),
  // escopadas al record actual: se recargan cada vez que currentRecord cambia.
  // ============================================================================

  import type { Record, RecordImage, RecordAnnotation, PredefinedRejectionReason } from '$lib/api';
  import { recordsApi } from '$lib/api';
  import { m } from '$lib/i18n';
  import { REJECTION_REASONS } from '$lib/rejectionReasons';

  // ---------------------------------------------------------------------------
  // PROPS
  // ---------------------------------------------------------------------------
  let {
    viewMode,
    currentRecord,
    currentIndex,
    totalRecords,
    userRole = null,
    onRotateLeft,
    onRotateRight,
    onRecordUpdated,
    onRecapture,
  }: {
    viewMode: 'list' | 'spread' | 'grid';
    currentRecord: Record | null;
    currentIndex: number;
    totalRecords: number;
    userRole?: string | null;
    onRotateLeft: () => void;
    onRotateRight: () => void;
    // Puede ser async (loadRecords lo es) — confirmPendingAction lo espera
    // para que currentRecord ya refleje el estado nuevo antes de que el
    // usuario pueda volver a hacer click (si no, hay una ventana breve
    // donde currentRecord.status todavía es el viejo, y un click rápido en
    // el botón contrario calcula el mensaje de confirmación equivocado).
    onRecordUpdated: () => void | Promise<void>;
    onRecapture: (record: Record) => void;
  } = $props();

  const canReview = $derived(userRole === 'reviewer' || userRole === 'admin');
  // Recapturar dispara la cámara — solo admin/operator pueden, igual que
  // /live-preview mismo (reviewer es redirigido ahí, NEH-66).
  const canOperate = $derived(userRole === 'admin' || userRole === 'operator');

  // ---------------------------------------------------------------------------
  // ESTADO LOCAL
  // ---------------------------------------------------------------------------

  // Tab activo del strip
  let activeTab = $state<'info' | 'edit' | 'comments'>('info');

  // Panel oculto por defecto; el usuario lo abre pulsando un ícono del strip
  let isExpanded = $state(false);

  // Abre el panel en el tab indicado, o lo colapsa si ya estaba en ese tab
  function toggleTab(tab: 'info' | 'edit' | 'comments') {
    if (isExpanded && activeTab === tab) {
      isExpanded = false;
    } else {
      activeTab = tab;
      isExpanded = true;
    }
  }

  // Valores de sliders de Preview Controls (-100 a 100)
  let brightness = $state(0);
  let contrast = $state(0);
  let saturation = $state(0);

  // Anotaciones: persistidas en el backend, escopadas al record actual
  let annotations = $state<RecordAnnotation[]>([]);
  let annotationsError = $state<string | null>(null);
  let isSavingAnnotation = $state(false);

  // Tipos de error disponibles para "Marcar error" — la lista de ids/colores
  // vive en $lib/rejectionReasons (compartida con RejectReasonModal); acá
  // solo se les agrega la etiqueta traducida.
  const ERROR_LABELS: { [id: string]: string } = $derived({
    blur: $m.col_err_blurry,
    glare: $m.col_err_glare,
    shadow: $m.col_err_shadows,
    focus: $m.col_err_focus,
    exposure: $m.col_err_exposure,
    dirt: $m.col_err_debris,
  });
  const ERROR_TYPES = $derived(REJECTION_REASONS.map(r => ({ ...r, label: ERROR_LABELS[r.id] })));

  // Recarga las anotaciones cada vez que cambia el record activo; evita que
  // las anotaciones de un record se sigan mostrando al navegar a otro.
  // También limpia el estado de "Agregar nota"/"Marcar error" (NEH-209): sin
  // esto, un motivo o nota a medio escribir para un registro se filtraría al
  // siguiente al navegar entre documentos.
  $effect(() => {
    const recordId = currentRecord?.id ?? null;
    annotations = [];
    annotationsError = null;
    noteText = '';
    selectedReasons = [];
    isReasonCardExpanded = false;
    isNoteCardExpanded = false;
    reviewError = null;
    pendingAction = null;
    if (recordId == null) return;

    let cancelled = false;
    recordsApi.getAnnotations(recordId)
      .then(data => { if (!cancelled) annotations = data; })
      .catch(err => {
        if (cancelled) return;
        console.error('[LeftSidebar] Error cargando anotaciones:', err);
        annotationsError = $m.col_annotation_load_error;
      });

    return () => { cancelled = true; };
  });

  // "Marcar error" y "Agregar nota" son dos acordeones independientes, cada
  // uno con su propio botón "Listo" — cada uno crea su PROPIA anotación
  // (error_types solo, o note solo) en vez de combinarse en una — así lo
  // pidió el usuario explícitamente ("que sean dos cosas aparte"). El
  // backend de rechazo formal solo acepta un predefined_reason, así que
  // "Rechazar" usa el de la anotación de error guardada más antigua (ver
  // `firstFlaggedReason` más abajo), no la selección viva de checkboxes.
  let noteText = $state('');
  let selectedReasons = $state<PredefinedRejectionReason[]>([]);
  let isReasonCardExpanded = $state(false);
  let isNoteCardExpanded = $state(false);

  // Un registro rechazado ya no admite más anotaciones — "Marcar error" y
  // "Agregar nota" quedan deshabilitados hasta que alguien lo apruebe (o lo
  // recapture, lo que también lo devuelve a 'in_review'); solo 'rejected'
  // los bloquea.
  let annotationsLocked = $derived(currentRecord?.status === 'rejected');

  // Rechazar/Aprobar (NEH-209) — siempre visibles y habilitados salvo que ya
  // estén en ese mismo estado (no se puede aprobar/rechazar dos veces), para
  // permitir deshacer un aprobar/rechazar por error. Cada click pide
  // confirmación antes de ejecutar (pendingAction).
  let isRejecting = $state(false);
  let isApproving = $state(false);
  let reviewError = $state<string | null>(null);
  let pendingAction = $state<'approve' | 'reject' | null>(null);

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------

  function getErrorLabel(id: string) {
    return ERROR_TYPES.find(e => e.id === id)?.label ?? id;
  }

  function getErrorColor(id: string) {
    return ERROR_TYPES.find(e => e.id === id)?.color ?? '#666';
  }

  function toggleReason(id: PredefinedRejectionReason) {
    selectedReasons = selectedReasons.includes(id)
      ? selectedReasons.filter(r => r !== id)
      : [...selectedReasons, id];
  }

  // Motivo que se envía al rechazar: el primer tipo de error de la
  // anotación guardada MÁS ANTIGUA que tenga alguno (no de los chips
  // seleccionados en este momento, que se vacían en cada "Guardar") —
  // `annotations` está ordenada de más nueva a más vieja (se antepone al
  // guardar), así que la más antigua es la última del arreglo.
  let firstFlaggedReason: PredefinedRejectionReason | null = $derived.by(() => {
    for (let i = annotations.length - 1; i >= 0; i--) {
      const reason = annotations[i].error_types[0];
      if (reason) return reason as PredefinedRejectionReason;
    }
    return null;
  });

  // Mensaje del popup de confirmación: depende de la acción pedida Y del
  // estado actual del registro — "Rechazar" sobre un 'approved' deshace la
  // aprobación (no es un rechazo formal), y lo mismo al revés (NEH-209).
  let pendingActionMessage = $derived.by(() => {
    if (!pendingAction || !currentRecord) return '';
    if (pendingAction === 'approve') {
      return currentRecord.status === 'rejected'
        ? $m.col_review_confirm_undo_reject
        : $m.col_review_confirm_approve;
    }
    return currentRecord.status === 'approved'
      ? $m.col_review_confirm_undo_approve
      : $m.col_review_confirm_reject;
  });

  // ---------------------------------------------------------------------------
  // ACCIONES
  // ---------------------------------------------------------------------------

  // Guarda los tipos de error marcados como su propia anotación (sin nota)
  // y colapsa la tarjeta — "Listo" de "Marcar error".
  async function handleSaveErrors() {
    if (selectedReasons.length === 0 || !currentRecord || isSavingAnnotation) return;
    const recordId = currentRecord.id;
    isSavingAnnotation = true;
    annotationsError = null;
    try {
      const created = await recordsApi.addAnnotation(recordId, {
        error_types: selectedReasons,
        note: undefined,
      });
      // Si el record activo cambió mientras la request estaba en curso, el
      // effect de carga ya reemplazó `annotations` por las del nuevo record;
      // no anteponer aquí, o mostraríamos una anotación del record anterior.
      if (currentRecord?.id === recordId) {
        annotations = [created, ...annotations];
      }
      selectedReasons = [];
      isReasonCardExpanded = false;
    } catch (err) {
      console.error('[LeftSidebar] Error guardando el motivo de error:', err);
      annotationsError = $m.col_annotation_save_error;
    } finally {
      isSavingAnnotation = false;
    }
  }

  // Guarda el comentario como su propia anotación (sin tipos de error) y
  // colapsa la tarjeta — "Listo" de "Agregar nota".
  async function handleSaveComment() {
    const note = noteText.trim();
    if (!note || !currentRecord || isSavingAnnotation) return;
    const recordId = currentRecord.id;
    isSavingAnnotation = true;
    annotationsError = null;
    try {
      const created = await recordsApi.addAnnotation(recordId, {
        error_types: [],
        note,
      });
      if (currentRecord?.id === recordId) {
        annotations = [created, ...annotations];
      }
      noteText = '';
      isNoteCardExpanded = false;
    } catch (err) {
      console.error('[LeftSidebar] Error guardando la nota:', err);
      annotationsError = $m.col_annotation_save_error;
    } finally {
      isSavingAnnotation = false;
    }
  }

  // Pide confirmación antes de rechazar (o deshacer una aprobación). No abre
  // el popup si falta al menos una anotación de error ya guardada para un
  // rechazo formal (desde 'in_review') — deshacer una aprobación no lo
  // necesita.
  function requestReject() {
    if (!currentRecord || currentRecord.status === 'rejected' || isRejecting) return;
    if (currentRecord.status === 'in_review' && firstFlaggedReason === null) return;
    pendingAction = 'reject';
  }

  // Pide confirmación antes de aprobar (o deshacer un rechazo).
  function requestApprove() {
    if (!currentRecord || currentRecord.status === 'approved' || isApproving) return;
    pendingAction = 'approve';
  }

  function cancelPendingAction() {
    pendingAction = null;
  }

  // Ejecuta la acción confirmada en el popup. Si el registro ya estaba en el
  // estado "opuesto" (approved al rechazar, rejected al aprobar), es un
  // deshacer — vuelve a 'in_review' sin motivo ni auditoría de rechazo, en
  // vez de la acción formal (NEH-209).
  async function confirmPendingAction() {
    if (!currentRecord || !pendingAction) return;
    const recordId = currentRecord.id;
    const status = currentRecord.status;
    reviewError = null;

    if (pendingAction === 'approve') {
      isApproving = true;
      try {
        await recordsApi.updateStatus(recordId, status === 'rejected' ? 'in_review' : 'approved');
        // Esperar el refresco (puede ser async) antes de soltar isApproving:
        // si no, hay una ventana breve donde currentRecord.status todavía
        // es el viejo pero los botones ya están habilitados de nuevo, y un
        // click rápido en el botón contrario calcularía el mensaje de
        // confirmación (o la acción) equivocada.
        await onRecordUpdated();
      } catch (err) {
        console.error('[LeftSidebar] Error aprobando el registro:', err);
        reviewError = $m.col_review_approve_error;
      } finally {
        isApproving = false;
      }
    } else {
      isRejecting = true;
      try {
        if (status === 'approved') {
          await recordsApi.updateStatus(recordId, 'in_review');
        } else {
          await recordsApi.reject(recordId, {
            predefined_reason: firstFlaggedReason!,
            comment: noteText.trim() || undefined,
          });
          // Un registro rechazado ya no admite más anotaciones — colapsar
          // cualquier tarjeta que hubiera quedado abierta (el botón de
          // "Marcar error"/"Agregar nota" ya se deshabilita solo vía
          // `annotationsLocked`, pero esto también descarta lo no guardado).
          isReasonCardExpanded = false;
          isNoteCardExpanded = false;
          selectedReasons = [];
          noteText = '';
        }
        await onRecordUpdated();
      } catch (err) {
        console.error('[LeftSidebar] Error rechazando el registro:', err);
        reviewError = $m.col_reject_error;
      } finally {
        isRejecting = false;
      }
    }
    pendingAction = null;
  }

  async function handleDeleteAnnotation(id: number) {
    if (annotationsLocked) return;
    const recordId = currentRecord?.id ?? null;
    const previous = annotations;
    annotations = annotations.filter(a => a.id !== id);
    try {
      await recordsApi.deleteAnnotation(id);
    } catch (err) {
      console.error('[LeftSidebar] Error eliminando anotación:', err);
      // Solo restaurar si seguimos en el mismo record: si cambió, el effect
      // de carga ya cargó la lista del nuevo record y restaurar aquí la
      // pisaría con datos del record anterior.
      if (currentRecord?.id === recordId) {
        annotations = previous;
        annotationsError = $m.col_annotation_delete_error;
      }
    }
  }

  // Formatea la hora de una anotación
  function formatTime(dateStr?: string): string {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }

  // Formatea tamaño de archivo
  function formatFileSize(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${bytes} B`;
  }

  // Formatea fecha/hora de captura
  function formatDateTime(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  // Imágenes del registro ordenadas: left primero, right después
  let sortedImages = $derived(
    [...(currentRecord?.images ?? [])].sort((a, b) => {
      const order = (r?: string | null) => r === 'left' ? 0 : r === 'right' ? 1 : 2;
      return order(a.role) - order(b.role) || a.id - b.id;
    })
  );

  function roleLabel(img: RecordImage): string {
    if (img.role === 'left')  return 'L';
    if (img.role === 'right') return 'R';
    return '·';
  }

  function roleName(img: RecordImage, i: number): string {
    if (img.role === 'left')  return $m.col_role_left;
    if (img.role === 'right') return $m.col_role_right;
    if (img.role === 'overview') return $m.col_role_overview;
    return $m.col_image_n(i + 1);
  }
</script>

<!-- ============================================================
     SIDEBAR
     En modo 'single': strip (60px) + panel expandido (260px) = 320px total
     En modo 'spread': solo strip (60px)
     ============================================================ -->
<div class="sidebar" class:expanded={isExpanded}>

  <!-- ── Strip de íconos ── -->
  <div class="icon-strip">
    <!-- Info -->
    <button
      class="strip-btn"
      class:active={activeTab === 'info' && isExpanded}
      onclick={() => toggleTab('info')}
      aria-label={$m.col_tab_info}
      title={$m.col_tab_info}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    </button>

    <!-- Preview Controls -->
    <button
      class="strip-btn"
      class:active={activeTab === 'edit' && isExpanded}
      onclick={() => toggleTab('edit')}
      aria-label={$m.col_tab_edit}
      title={$m.col_tab_edit}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
    </button>

    <!-- Anotaciones -->
    <button
      class="strip-btn"
      class:active={activeTab === 'comments' && isExpanded}
      onclick={() => toggleTab('comments')}
      aria-label={$m.col_tab_comments}
      title={$m.col_tab_comments}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    </button>
  </div>

  <!-- ── Panel de contenido (solo en single) ── -->
  {#if isExpanded}
    <div class="panel-content">

      <!-- ══ TAB: IMAGE INFO ══ -->
      {#if activeTab === 'info'}
        <div class="panel-section">
          <h3 class="panel-title">{$m.col_tab_info}</h3>

            {#if currentRecord}

              <!-- Encabezado del registro -->
              <div class="record-overview">
                <span class="overview-name">{currentRecord.title || '—'}</span>
                <span class="overview-pos">{currentIndex} / {totalRecords}</span>
              </div>

              {#if sortedImages.length === 0}
                <p class="empty-text">{$m.col_no_images}</p>

              {:else}
                {#each sortedImages as img, i}
                  <div class="img-section" class:first={i === 0}>

                    <!-- Cabecera de imagen -->
                    <div class="img-section-header">
                      <span class="role-pill" class:role-right={img.role === 'right'} class:role-single={img.role !== 'left' && img.role !== 'right'}>
                        {roleLabel(img)}
                      </span>
                      <span class="img-section-title">{roleName(img, i)}</span>
                    </div>

                    <!-- Filas de datos -->
                    <div class="info-rows">

                      {#if img.format}
                        <div class="info-row">
                          <span class="info-label">{$m.col_info_format}</span>
                          <span class="info-value">{img.format.toUpperCase()}</span>
                        </div>
                      {/if}

                      {#if img.resolution_width && img.resolution_height}
                        <div class="info-row">
                          <span class="info-label">{$m.col_info_dimensions}</span>
                          <span class="info-value">{img.resolution_width} × {img.resolution_height}</span>
                        </div>
                      {/if}

                      {#if img.file_size}
                        <div class="info-row">
                          <span class="info-label">{$m.col_info_size}</span>
                          <span class="info-value">{formatFileSize(img.file_size)}</span>
                        </div>
                      {/if}

                      {#if img.sequence != null}
                        <div class="info-row">
                          <span class="info-label">{$m.col_info_sequence}</span>
                          <span class="info-value">{img.sequence}</span>
                        </div>
                      {/if}

                      {#if img.filename}
                        <div class="info-row">
                          <span class="info-label">{$m.col_info_file}</span>
                          <span class="info-value filename-val" title={img.filename}>{img.filename}</span>
                        </div>
                      {/if}

                      {#if img.created_at}
                        <div class="info-row">
                          <span class="info-label">{$m.col_info_captured}</span>
                          <span class="info-value">{formatDateTime(img.created_at)}</span>
                        </div>
                      {/if}

                    </div>
                  </div>
                {/each}
              {/if}

            {:else}
              <p class="empty-text">{$m.col_select_record}</p>
            {/if}
          </div>

        <!-- ══ TAB: PREVIEW CONTROLS ══ -->
        {:else if activeTab === 'edit'}
          <div class="panel-section">
            <div class="preview-card">
              <h3 class="panel-title">{$m.col_tab_edit}</h3>

            <!-- Rotar -->
            <div class="control-group">
              <label class="control-label">{$m.col_rotate}</label>
              <div class="rotate-row">
                <button class="rotate-btn" onclick={onRotateLeft}>
                  <!-- Ícono rotar izquierda -->
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M2.5 2v6h6M2.66 15.57a10 10 0 1 0 .57-8.38"/>
                  </svg>
                  <span>{$m.col_rotate_left}</span>
                </button>
                <button class="rotate-btn" onclick={onRotateRight}>
                  <!-- Ícono rotar derecha -->
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38"/>
                  </svg>
                  <span>{$m.col_rotate_right}</span>
                </button>
              </div>
            </div>

            <!-- Brightness -->
            <div class="slider-group">
              <div class="slider-header">
                <div class="slider-label-row">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                  </svg>
                  <span>{$m.col_brightness}</span>
                </div>
                <span class="slider-val">{brightness > 0 ? `+${brightness}` : brightness}</span>
              </div>
              <!-- El gradiente del slider refleja el porcentaje actual -->
              <input type="range" min="-100" max="100" bind:value={brightness}
                style="background: linear-gradient(to right, var(--color-primary) 0%, var(--color-primary) {((brightness+100)/200)*100}%, var(--color-surface) {((brightness+100)/200)*100}%, var(--color-surface) 100%)"
              />
            </div>

            <!-- Contrast -->
            <div class="slider-group">
              <div class="slider-header">
                <div class="slider-label-row">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20V2z"/>
                  </svg>
                  <span>{$m.col_contrast}</span>
                </div>
                <span class="slider-val">{contrast > 0 ? `+${contrast}` : contrast}</span>
              </div>
              <input type="range" min="-100" max="100" bind:value={contrast}
                style="background: linear-gradient(to right, var(--color-primary) 0%, var(--color-primary) {((contrast+100)/200)*100}%, var(--color-surface) {((contrast+100)/200)*100}%, var(--color-surface) 100%)"
              />
            </div>

            <!-- Saturation -->
            <div class="slider-group">
              <div class="slider-header">
                <div class="slider-label-row">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
                  </svg>
                  <span>{$m.col_saturation}</span>
                </div>
                <span class="slider-val">{saturation > 0 ? `+${saturation}` : saturation}</span>
              </div>
              <input type="range" min="-100" max="100" bind:value={saturation}
                style="background: linear-gradient(to right, var(--color-primary) 0%, var(--color-primary) {((saturation+100)/200)*100}%, var(--color-surface) {((saturation+100)/200)*100}%, var(--color-surface) 100%)"
              />
            </div>

          </div>
        </div>

      <!-- ══ TAB: ANOTACIONES ══ -->
      {:else if activeTab === 'comments'}
        <div class="panel-section">
          <div class="preview-card">

            <!-- Encabezado -->
            <div class="annotations-header">
              <div class="annotations-title-row">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <h3 class="panel-title" style="margin:0">{$m.col_tab_comments}</h3>
              </div>
              <span class="annotation-count">{annotations.length}</span>
            </div>

            {#if annotationsError}
              <p class="annotations-error">{annotationsError}</p>
            {/if}

            <!-- Lista de anotaciones -->
            <div class="annotations-list">
              {#if annotations.length === 0}
                <p class="empty-text">{$m.col_no_annotations}</p>
              {:else}
                {#each annotations as ann}
                  <div class="annotation-card">
                    <div class="annotation-body">
                      <!-- Tags de tipo de error -->
                      {#if ann.error_types.length > 0}
                        <div class="error-tags">
                          {#each ann.error_types as errorId}
                            <div class="error-tag">
                              <div class="error-dot" style="background-color: {getErrorColor(errorId)}"></div>
                              <span>{getErrorLabel(errorId)}</span>
                            </div>
                          {/each}
                        </div>
                      {/if}
                      <!-- Texto de la nota -->
                      {#if ann.note}
                        <p class="annotation-text">{ann.note}</p>
                      {/if}
                    </div>
                    <div class="annotation-footer">
                      <span class="annotation-time">{formatTime(ann.created_at)}</span>
                      <!-- Botón eliminar (visible en hover) — un registro
                           rechazado ya no admite cambios en sus anotaciones,
                           tampoco borrarlas. -->
                      {#if !annotationsLocked}
                        <button class="delete-annotation-btn" onclick={() => handleDeleteAnnotation(ann.id)} aria-label={$m.col_delete_annotation}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      {/if}
                    </div>
                  </div>
                {/each}
              {/if}
            </div>

            <!-- ── Marcar error: acordeón independiente con lista de checkeo ── -->
            {#if canReview}
              <div class="review-section">
                <button
                  type="button"
                  class="annotation-toggle"
                  disabled={annotationsLocked}
                  onclick={() => isReasonCardExpanded = !isReasonCardExpanded}
                  aria-expanded={isReasonCardExpanded}
                >
                  <span class="material-symbols-outlined icon-sm">warning</span>
                  <span>{$m.col_mark_error_btn}</span>
                </button>

                {#if isReasonCardExpanded}
                  <div class="expandable-card">
                    <div class="reason-options">
                      {#each ERROR_TYPES as errType}
                        <button
                          type="button"
                          class="error-type-btn"
                          class:selected={selectedReasons.includes(errType.id)}
                          onclick={() => toggleReason(errType.id)}
                        >
                          <div class="et-dot" style="background-color: {errType.color}"></div>
                          <span>{errType.label}</span>
                          {#if selectedReasons.includes(errType.id)}
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2.5" class="et-check"><polyline points="20 6 9 17 4 12"/></svg>
                          {/if}
                        </button>
                      {/each}
                    </div>
                    <button
                      class="modal-btn confirm reason-done-btn"
                      disabled={selectedReasons.length === 0 || !currentRecord || isSavingAnnotation}
                      onclick={handleSaveErrors}
                    >
                      {$m.col_reason_done}
                    </button>
                  </div>
                {/if}
              </div>

              <!-- ── Agregar nota: acordeón independiente, mismo patrón ── -->
              <div class="review-section review-section--tight">
                <button
                  type="button"
                  class="annotation-toggle"
                  disabled={annotationsLocked}
                  onclick={() => isNoteCardExpanded = !isNoteCardExpanded}
                  aria-expanded={isNoteCardExpanded}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  <span>{$m.col_add_note}</span>
                </button>

                {#if isNoteCardExpanded}
                  <div class="expandable-card">
                    <textarea
                      class="note-textarea"
                      bind:value={noteText}
                      placeholder={$m.col_annotation_comment_placeholder}
                      disabled={!currentRecord}
                    ></textarea>
                    <button
                      class="modal-btn confirm reason-done-btn"
                      disabled={!noteText.trim() || !currentRecord || isSavingAnnotation}
                      onclick={handleSaveComment}
                    >
                      {$m.col_reason_done}
                    </button>
                  </div>
                {/if}
              </div>
            {/if}

            <!-- ── Rechazar / Aprobar / Recapturar (NEH-209) ── Visible para
                 reviewer/admin (Rechazar/Aprobar, siempre ambos presentes —
                 el único disabled es el que coincide con el estado actual,
                 el otro queda habilitado para deshacer un error) y también
                 para operator cuando el registro está rechazado (solo ve
                 "Recapturar imagen" — un operator no aprueba/rechaza, pero
                 sí puede volver a capturar). Cada click de Rechazar/Aprobar
                 pide confirmación (pendingAction) antes de ejecutar. ── -->
            {#if canReview || (canOperate && currentRecord?.status === 'rejected')}
              <div class="review-section">
                {#if reviewError}
                  <p class="annotations-error">{reviewError}</p>
                {/if}

                <div class="review-actions">
                  {#if currentRecord?.status === 'rejected' && canOperate}
                    <button
                      class="btn-review recapture"
                      onclick={() => onRecapture(currentRecord!)}
                    >
                      <span class="material-symbols-outlined icon-sm">photo_camera</span>
                      {$m.col_recapture_btn}
                    </button>
                  {:else if canReview}
                    <button
                      class="btn-review reject"
                      disabled={
                        !currentRecord ||
                        currentRecord.status === 'rejected' ||
                        (currentRecord.status === 'in_review' && firstFlaggedReason === null) ||
                        isRejecting
                      }
                      onclick={requestReject}
                    >
                      <span class="material-symbols-outlined icon-sm">cancel</span>
                      {$m.col_reject}
                    </button>
                  {/if}
                  {#if canReview}
                    <button
                      class="btn-review approve"
                      disabled={!currentRecord || currentRecord.status === 'approved' || isApproving}
                      onclick={requestApprove}
                    >
                      <span class="material-symbols-outlined icon-sm">check_circle</span>
                      {$m.col_approve}
                    </button>
                  {/if}
                </div>
              </div>
            {/if}

          </div>
        </div>
      {/if}

    </div>
  {/if}

</div>

<!-- ============================================================
     POPUP: confirmación de Aprobar/Rechazar (incluye deshacer, NEH-209)
     ============================================================ -->
{#if pendingAction}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="confirm-backdrop" onclick={(e) => { if ((e.target as HTMLElement).classList.contains('confirm-backdrop')) cancelPendingAction(); }}>
    <div class="confirm-card" role="dialog" aria-modal="true">
      <p class="confirm-message">{pendingActionMessage}</p>
      <div class="confirm-actions">
        <button class="modal-btn cancel" onclick={cancelPendingAction}>{$m.common_cancel}</button>
        <button class="modal-btn confirm" onclick={confirmPendingAction}>{$m.common_confirm}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* ── Sidebar ── */
  .sidebar {
    display: flex;
    background-color: var(--color-surface-alt);
    border-right: 1px solid var(--border-color);
    height: 100%;
    flex-shrink: 0;
    z-index: 10;
    width: 60px;
    transition: width var(--transition-base);
  }

  .sidebar.expanded { width: 320px; }

  /* Strip de íconos */
  .icon-strip {
    width: 60px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px 0;
    gap: 12px;
    border-right: 1px solid var(--border-color);
    background-color: var(--color-surface);
  }

  .strip-btn {
    width: 40px; height: 40px;
    border-radius: var(--radius-md);
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--color-light-grey);
    background: none;
    transition: all var(--transition-fast);
    min-height: 0;
  }

  .strip-btn:hover { color: var(--color-light-grey); background-color: rgba(255,255,255,0.04); }

  .strip-btn.active {
    background-color: rgba(90,140,98,0.2);
    color: var(--color-primary);
    border: 1.5px solid var(--color-primary);
  }

  /* Panel de contenido */
  .panel-content {
    flex: 1;
    overflow-y: auto;
    min-width: 0;
  }

  .panel-content::-webkit-scrollbar { width: 3px; }
  .panel-content::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 999px; }

  .panel-section { padding: 20px 16px; }

  .panel-title {
    font-size: var(--text-base);
    font-weight: var(--fw-bold);
    color: var(--color-light);
    margin: 0 0 16px;
  }

  /* Info rows */
  .info-rows { display: flex; flex-direction: column; }

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 7px 0;
    border-bottom: 1px solid var(--border-color);
    gap: 8px;
  }

  .info-label { font-size: 12px; color: var(--color-light-grey); flex-shrink: 0; }
  .info-value { font-size: 12px; color: var(--color-light); font-weight: var(--fw-medium); text-align: right; }

  .filename-val {
    word-break: break-all;
    white-space: normal;
    font-size: 11px;
    max-width: 140px;
  }

  /* Record overview */
  .record-overview {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--border-color);
    gap: 8px;
  }

  .overview-name {
    font-size: var(--text-sm);
    font-weight: var(--fw-bold);
    color: var(--color-light);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .overview-pos {
    font-size: var(--text-xs);
    color: var(--color-light-grey);
    flex-shrink: 0;
  }

  /* Per-image section */
  .img-section {
    margin-bottom: 16px;
    padding-top: 12px;
    border-top: 1px solid var(--border-color);
  }

  .img-section.first { border-top: none; padding-top: 0; }

  .img-section-header {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 8px;
  }

  .img-section-title {
    font-size: var(--text-sm);
    font-weight: var(--fw-medium);
    color: var(--color-light-grey);
  }

  .role-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 4px;
    font-size: 9px;
    font-weight: var(--fw-bold);
    flex-shrink: 0;
    background: rgba(90, 140, 98, 0.2);
    color: var(--color-primary);
    border: 1px solid rgba(90, 140, 98, 0.35);
  }

  .role-pill.role-right {
    background: rgba(192, 132, 252, 0.15);
    color: #c084fc;
    border-color: rgba(192, 132, 252, 0.3);
  }

  .role-pill.role-single {
    background: rgba(147, 197, 253, 0.15);
    color: #93c5fd;
    border-color: rgba(147, 197, 253, 0.3);
  }

  /* Preview card (edit + comments) */
  .preview-card {
    background-color: rgba(255,255,255,0.04);
    border: 1.5px solid rgba(90,140,98,0.3);
    border-radius: var(--radius-xl);
    padding: 16px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  }

  /* Rotar */
  .control-group { margin-bottom: 20px; }

  .control-label {
    font-size: var(--text-sm);
    color: var(--color-light-grey);
    display: block;
    margin-bottom: 10px;
  }

  .rotate-row { display: flex; gap: 8px; }

  .rotate-btn {
    flex: 1;
    height: 40px;
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-family: var(--font-family);
    font-size: var(--text-xs);
    font-weight: var(--fw-bold);
    color: var(--color-light-grey);
    cursor: pointer;
    transition: all var(--transition-fast);
    min-height: var(--touch-target-min);
  }

  .rotate-btn:hover { background-color: rgba(90,140,98,0.12); border-color: var(--color-primary); color: var(--color-primary); }

  /* Sliders */
  .slider-group { margin-bottom: 16px; }

  .slider-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  .slider-label-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--text-sm);
    color: var(--color-light-grey);
  }

  .slider-val {
    font-size: var(--text-xs);
    color: var(--color-light-grey);
    font-family: monospace;
    min-width: 28px;
    text-align: right;
  }

  .slider-group input[type="range"] {
    width: 100%;
    height: 6px;
    -webkit-appearance: none;
    border-radius: var(--radius-full);
    cursor: pointer;
    outline: none;
  }

  .slider-group input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 18px; height: 18px;
    border-radius: 50%;
    background-color: white;
    border: 2px solid rgba(0,0,0,0.15);
    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    cursor: grab;
  }

  /* Anotaciones */
  .annotations-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .annotations-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--color-light);
  }

  .annotation-count {
    font-size: 13px;
    color: var(--color-light-grey);
  }

  .annotations-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 280px;
    overflow-y: auto;
    margin-bottom: 12px;
  }

  .annotations-list::-webkit-scrollbar { width: 3px; }
  .annotations-list::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 999px; }

  .annotation-card {
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: 10px 12px;
    transition: border-color var(--transition-fast);
  }

  .annotation-card:hover { border-color: rgba(90,140,98,0.5); }

  .annotation-body { margin-bottom: 6px; }

  .error-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }

  .error-tag {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px;
    background-color: rgba(0,0,0,0.3);
    border-radius: 4px;
    font-size: 11px;
    color: var(--color-light-grey);
  }

  .error-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

  .annotation-text { font-size: var(--text-sm); color: var(--color-light-grey); line-height: 1.5; margin: 0; }

  .annotation-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .annotation-time { font-size: 11px; color: var(--color-light-grey); opacity: 0.6; }

  .delete-annotation-btn {
    background: none; border: none;
    width: 24px; height: 24px;
    display: flex; align-items: center; justify-content: center;
    color: var(--color-light-grey);
    cursor: pointer;
    border-radius: var(--radius-sm);
    opacity: 0;
    transition: all var(--transition-fast);
  }

  .annotation-card:hover .delete-annotation-btn { opacity: 1; }
  .delete-annotation-btn:hover { color: var(--color-error); background-color: rgba(214,103,74,0.1); }

  /* Secciones inline del panel de revisión (NEH-209): nota, marcar error,
     rechazar/aprobar — reemplazan los antiguos modales. */
  .review-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--border-color);
  }

  /* Sin separador entre "Marcar error" y "Agregar nota" — son dos
     acordeones hermanos, no secciones distintas del panel. */
  .review-section--tight {
    margin-top: 8px;
    padding-top: 0;
    border-top: none;
  }

  .annotations-error {
    font-size: var(--text-xs);
    color: var(--color-error);
    background-color: rgba(214,103,74,0.1);
    border: 1px solid rgba(214,103,74,0.3);
    border-radius: var(--radius-md);
    padding: 8px 10px;
    margin: 0 0 12px;
  }

  .empty-text {
    font-size: var(--text-sm);
    color: var(--color-light-grey);
    opacity: 0.5;
    text-align: center;
    padding: 16px 0;
    margin: 0;
  }

  /* "Marcar error" / "Agregar nota": dos acordeones independientes, cada
     uno un botón neutro (ícono + etiqueta) que ocupa una sola fila
     colapsado, y se expande in-line a su propia tarjeta con "Listo". */
  .annotation-toggle {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 14px 16px;
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    font-family: var(--font-family);
    font-size: var(--text-sm);
    font-weight: var(--fw-medium);
    color: var(--color-light);
    cursor: pointer;
    transition: all var(--transition-fast);
    min-height: var(--touch-target-min);
  }
  .annotation-toggle:hover { border-color: rgba(90,140,98,0.5); }
  .annotation-toggle:disabled { opacity: 0.5; cursor: not-allowed; }

  .expandable-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 8px;
  }

  .reason-options { display: flex; flex-direction: column; gap: 6px; }

  .error-type-btn {
    width: 100%;
    height: 48px;
    padding: 0 16px;
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    gap: 12px;
    font-family: var(--font-family);
    font-size: var(--text-sm);
    font-weight: var(--fw-medium);
    color: var(--color-light-grey);
    cursor: pointer;
    transition: all var(--transition-fast);
    text-align: left;
    min-height: var(--touch-target-min);
  }

  .error-type-btn:hover { border-color: rgba(90,140,98,0.5); }
  .error-type-btn.selected { background-color: rgba(255,255,255,0.06); border-color: var(--color-primary); color: var(--color-light); }

  .et-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
  .et-check { margin-left: auto; flex-shrink: 0; }

  .reason-done-btn { width: 100%; }

  /* Nota textarea */
  .note-textarea {
    width: 100%;
    height: 120px;
    padding: 10px 12px;
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    font-family: var(--font-family);
    font-size: var(--text-sm);
    color: var(--color-light);
    resize: none;
    outline: none;
    transition: border-color var(--transition-base);
  }

  .note-textarea::placeholder { color: var(--color-light-grey); opacity: 0.5; }
  .note-textarea:focus { border-color: var(--color-primary); }
  .note-textarea:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Rechazar / Aprobar (NEH-209) — apilados, uno arriba y otro abajo, no
     lado a lado. */
  .review-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }

  .btn-review {
    width: 100%;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border-radius: var(--radius-md);
    font-family: var(--font-family);
    font-size: var(--text-sm);
    font-weight: var(--fw-bold);
    cursor: pointer;
    transition: all var(--transition-base);
    border: 1px solid var(--border-color);
    min-height: var(--touch-target-min);
  }

  .btn-review.reject { background-color: var(--color-surface); color: var(--color-error); border-color: rgba(214,103,74,0.4); }
  .btn-review.reject:hover { background-color: rgba(214,103,74,0.12); }
  .btn-review.approve { background-color: var(--color-primary); color: white; border-color: var(--color-primary); }
  .btn-review.approve:hover { background-color: var(--color-primary-hover); }
  .btn-review.recapture { background-color: var(--color-highlight); color: var(--color-bg); border-color: var(--color-highlight); }
  .btn-review.recapture:hover { opacity: 0.9; }
  .btn-review:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Popup de confirmación (NEH-209) — para aprobar/rechazar y para
     deshacer un aprobar/rechazar anterior. */
  .confirm-backdrop {
    position: fixed; inset: 0;
    background-color: rgba(0,0,0,0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 24px;
  }

  .confirm-card {
    background-color: var(--color-surface-alt);
    border: 1px solid rgba(90,140,98,0.3);
    border-radius: var(--radius-xl);
    padding: 24px;
    width: 100%;
    max-width: 400px;
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .confirm-message { font-size: var(--text-base); color: var(--color-light); margin: 0; line-height: 1.5; }

  .confirm-actions { display: flex; gap: 12px; }

  .modal-btn {
    flex: 1; height: 44px;
    border-radius: var(--radius-md);
    font-family: var(--font-family);
    font-size: var(--text-sm);
    font-weight: var(--fw-bold);
    cursor: pointer;
    transition: all var(--transition-base);
    border: 1px solid var(--border-color);
    min-height: var(--touch-target-min);
  }

  .modal-btn.cancel { background-color: var(--color-surface); color: var(--color-light-grey); }
  .modal-btn.cancel:hover { color: var(--color-light); border-color: rgba(90,140,98,0.5); }
  .modal-btn.confirm { background-color: var(--color-primary); color: white; border-color: var(--color-primary); }
  .modal-btn.confirm:hover { background-color: var(--color-primary-hover); }
  .modal-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>

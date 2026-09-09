<script lang="ts">
  // ============================================================================
  // COMPONENTE: LiveViewport
  // Archivo: src/routes/live-preview/LiveViewport.svelte
  //
  // Área central de la interfaz de captura.
  // Contiene:
  //   - Vista en vivo de una o dos cámaras (polling cada PREVIEW_INTERVAL_MS ms)
  //   - Líneas de guía arrastrables (rojas)
  //   - Líneas de grilla (cian)
  //   - Botón de captura (círculo blanco)
  //   - Panel flotante: zoom + configurar grilla
  //   - Barra de metadatos inferior (ISO, shutter, aperture)
  //   - Modal de configuración de grilla
  //
  // ── CÓMO FUNCIONA EL PREVIEW ────────────────────────────────────────────────
  // El backend NO tiene streaming MJPEG. En su lugar, el frontend hace polling:
  // cada PREVIEW_INTERVAL_MS ms llama a GET /cameras/preview/{index} que captura
  // un frame en resolución "low" y lo devuelve como JPEG (sin guardar en BD).
  //
  // Para sustituir el polling por streaming real:
  //   1. Agrega un endpoint MJPEG al backend (ej: /cameras/stream/{index})
  //   2. En el bloque marcado "STREAM DE CÁMARA" abajo, reemplaza el <img>
  //      que usa previewUrls[n] por:
  //      <img src="{getApiBase()}/cameras/stream/{n}?token={token}" ... />
  //   3. Elimina todo el bloque "POLLING DEL PREVIEW" del <script>
  //   4. Elimina los imports de onDestroy y browser
  //
  // Para cambiar la frecuencia del polling, modifica PREVIEW_INTERVAL_MS.
  // Para cambiar la resolución del preview, modifica el endpoint en cameras.py.
  // ============================================================================

  import { onMount, onDestroy } from 'svelte';
  import { m } from '$lib/i18n';
  import { browser } from '$app/environment';
  import { env } from '$env/dynamic/public';
  import { camerasApi, tokenStore, type CameraDevice } from '$lib/api';
  import { cameraStatus } from '$lib/stores/cameras';
  import { wbSamplingStore } from '$lib/stores/wbSampling';
  import { histogramStore, computeHistogram } from '$lib/stores/histogram';
  import { viewportAspect as computeViewportAspect, fitBox, frameAspect, panelGrowFactor } from '$lib/viewport-aspect';
  import {
    DEFAULT_CHORD,
    describeChord,
    learnFromEvent,
    ownsEvent,
    readChord,
    shouldTrigger,
    writeChord,
    clearChord as clearStoredChord,
    type CaptureChord,
    type OwnsEventContext
  } from '$lib/capture-key';

  // ---------------------------------------------------------------------------
  // PROPS
  // ---------------------------------------------------------------------------
  let {
    cameraMode,
    shutterSpeed,
    iso,
    aperture,
    projectId,
    projectName,
    collectionId,
    onCaptureDone,
    devices = [],
    rotateDeg = {},
    onRotateDegChange,
    otherModalOpen = false,
  }: {
    cameraMode: 'single' | 'double';
    shutterSpeed: string;
    iso: string;
    aperture: string;
    projectId: number;
    projectName: string;
    collectionId: number;
    onCaptureDone: () => void;
    devices?: CameraDevice[];
    rotateDeg?: Record<number, number>;
    onRotateDegChange?: (cam: number, deg: number) => void;
    // NEH-228: true while the page's own image-inspection modal is open
    // (Book view's "inspectedRecord"). That modal is rendered by +page.svelte,
    // not by this component, so its openness arrives as a prop instead of
    // local state — the capture key must not fire while it's up.
    otherModalOpen?: boolean;
  } = $props();

  function stepRotation(camIdx: number, delta: number) {
    const current = (rotateDeg ?? {})[camIdx] ?? 0;
    const next = ((current + delta) % 360 + 360) % 360;
    onRotateDegChange?.(camIdx, next);
  }

  // ---------------------------------------------------------------------------
  // ESTADO LOCAL: Viewport
  // ---------------------------------------------------------------------------

  let zoom = $state(1);          // Zoom del viewport CSS (1 = 100%)
  let guideV = $state(50);       // Guía vertical (% desde izquierda)
  let guideH = $state(50);       // Guía horizontal (% desde arriba)
  let dragging = $state<'v' | 'h' | null>(null);

  // Orientación de cámaras: swapped=true → cámara 1 a la izquierda, 0 a la derecha
  let swapped = $state(false);
  let leftIdx  = $derived(swapped ? 1 : 0);
  let rightIdx = $derived(swapped ? 0 : 1);

  // Configuración de la grilla
  let gridRows = 3;
  let gridCols = 3;
  let showGrid = $state(false);
  let showGuides = $state(true);
  let showGridModal = $state(false);

  // ---------------------------------------------------------------------------
  // TECLA DE CAPTURA (NEH-228)
  // El pedal USB de digitalización se comporta como un teclado que emite una
  // sola tecla, distinta por dispositivo. En vez de exigir configuración
  // manual, quien opera la asigna presionando el pedal una vez en el control
  // de abajo, y queda guardada en ese navegador. Por defecto es la barra
  // espaciadora, así que un teclado normal funciona sin tocar nada.
  // ---------------------------------------------------------------------------
  let chord = $state<CaptureChord>(readChord());

  // Seguro de "tecla sostenida": se activa cuando una pulsación arranca una
  // captura y se libera en el keyup correspondiente. Si el keyup nunca llega
  // (la ventana perdió el foco a mitad de la pulsación), blur y
  // visibilitychange lo liberan igual — si no, un pedal soltado fuera de
  // foco dejaría la captura bloqueada hasta recargar la página (ronda 55).
  let chordHeld = $state(false);
  // El release se compara contra el `code` físico de la tecla que armó el
  // seguro, nunca contra `chord.key`: soltar el modificador antes que la
  // tecla cambia lo que esa tecla reporta (Shift+2 arma con key "@" y suelta
  // con key "2"), y `code` no cambia con los modificadores. null cuando no
  // hay seguro armado, o cuando el dispositivo no reportó un `code`
  // utilizable al presionar.
  //
  // El seguro nunca puede sobrevivir a un release que sí llega: se libera
  // cuando los dos `code` (el de la pulsación y el del release) coinciden,
  // pero también cuando a cualquiera de los dos le falta un `code`
  // utilizable — un release sin `code` identificable sigue siendo un
  // release. Es una guarda deliberadamente débil, la tercera de tres: la
  // bandera de captura en curso y el flag de repeat ya impiden una segunda
  // captura real; este seguro solo evita que una repetición del sistema
  // operativo cuele una captura extra entre el keydown y su keyup. Dejarlo
  // trabado por falta de `code` es peor que soltarlo de más.
  let heldCode = $state<string | null>(null);

  // Estado del control para asignar la tecla: mientras `learning` es true,
  // el próximo keydown de la ventana no dispara una captura — se le entrega
  // a learnFromEvent en su lugar.
  let learning = $state(false);
  // Un modificador solo (Control/Alt/Shift/Meta) llegó mientras se asignaba
  // la tecla, a la espera de que junto con él llegue la tecla que arma la
  // combinación. Si en cambio se suelta sin que llegue nada más, keyup lo
  // reporta como un dispositivo que solo emite el modificador, en vez de
  // quedarse "asignando" para siempre.
  let pendingModifier = $state<'Control' | 'Alt' | 'Shift' | 'Meta' | null>(null);
  let learnMessage = $state<string | null>(null);

  // Los ajustes de cuadrícula ya deciden cuándo el teclado no le pertenece a
  // la captura; el modal de inspección de imagen vive en la página
  // (+page.svelte) y llega como prop, así que ambos se combinan acá.
  let modalOpen = $derived(showGridModal || otherModalOpen);

  // Panel de controles plegable. Abierto por defecto; plegado devuelve al feed
  // el espacio que el panel le quita. El botón de plegar es siempre visible:
  // en la pantalla táctil del Pi no hay hover que pueda revelarlo.
  let controlsOpen = $state(true);

  // Estado de la captura
  let isCapturing = $state(false);
  let captureFlash = $state(false);

  // Listo para capturar: solo cuando projectId/collectionId ya se resolvieron
  // (evita disparar una captura desde una URL vacía/mal formada).
  const captureReady = $derived(projectId > 0 && collectionId > 0);

  // Referencia al contenedor del viewport (para calcular posición de guías)
  let viewportEl = $state<HTMLElement | null>(null);

  // ===========================================================================
  // POLLING DEL PREVIEW
  // ===========================================================================
  // Este bloque maneja la vista en vivo de las cámaras mediante polling periódico.
  //
  // ── PARA SUSTITUIR POR STREAMING REAL ──────────────────────────────────────
  // Si en el futuro el backend implementa MJPEG streaming:
  //   1. Elimina todo este bloque (desde "POLLING DEL PREVIEW" hasta "FIN POLLING")
  //   2. En el HTML abajo, reemplaza el <img src={previewUrls[n]}> por:
  //      <img src="{getApiBase()}/cameras/stream/{n}" class="feed-img" />
  //   3. Agrega el token de auth como query param si el backend lo requiere:
  //      <img src="{getApiBase()}/cameras/stream/{n}?token={getToken()}" ... />
  // ===========================================================================

  // Frecuencia de actualización del preview en milisegundos.
  // Aumentar si el Pi tiene problemas de rendimiento (ej: 3000 = 3s).
  // Disminuir para más fluidez si el hardware lo permite (ej: 1000 = 1s).
  const PREVIEW_INTERVAL_MS = 2000;

  // URLs de objeto de las últimas imágenes capturadas por cada cámara.
  // Key = índice de cámara (0 = izquierda, 1 = derecha).
  // Se actualizan con cada ciclo de polling.
  let previewUrls = $state<Record<number, string>>({});

  // References to the live preview <img> elements for pixel sampling.
  let imgEl0: HTMLImageElement | null = $state(null);
  let imgEl1: HTMLImageElement | null = $state(null);

  // Tamaño medido de cada panel .camera-feed (px), usado para que la imagen
  // rotada no se recorte contra el overflow:hidden del panel — ver
  // feedRotateStyle más abajo.
  let feedW0 = $state(0);
  let feedH0 = $state(0);
  let feedW1 = $state(0);
  let feedH1 = $state(0);

  // NEH-222: tamaño natural del frame de cada cámara (px). El viewport toma
  // su forma de estos frames en vez de un 4:3 fijo — ver viewportAspect y
  // fitBox más abajo.
  let naturalW0 = $state(0);
  let naturalH0 = $state(0);
  let naturalW1 = $state(0);
  let naturalH1 = $state(0);

  // Tamaño medido del tablero (.mat-board): el viewport se dimensiona en
  // píxeles dentro de este tamaño (R39-3: un width:100% fijo le gana a
  // aspect-ratio cuando el alto es el límite, así que el viewport recibe
  // dimensiones explícitas en vez de depender de CSS para derivarlas).
  let boardW = $state(0);
  let boardH = $state(0);

  // Forma del viewport: la del frame en modo single; en modo double, la
  // suma de los anchos de los dos paneles a una altura común (R39-2).
  let viewportAspect = $derived(computeViewportAspect(
    [
      naturalW0 && naturalH0 ? { w: naturalW0, h: naturalH0, rotation: rotateDeg[leftIdx] ?? 0 } : null,
      cameraMode === 'double' && naturalW1 && naturalH1
        ? { w: naturalW1, h: naturalH1, rotation: rotateDeg[rightIdx] ?? 0 }
        : null,
    ],
    cameraMode
  ));

  // Caja en píxeles que le da al viewport esa forma dentro del tablero medido.
  let viewportBox = $derived(fitBox(viewportAspect, boardW, boardH));

  // R39-2: factor de crecimiento de cada panel en modo double — la forma
  // propia de su frame, para que ningún panel quede recortado aunque solo
  // uno esté rotado. Si un panel todavía no tiene frame propio (sin señal,
  // o esperando el primer frame), toma prestada la forma del otro panel en
  // vez de un 1:1 parejo — solo cae a 1 cuando ninguno de los dos la tiene.
  let leftFrameAspect = $derived(
    frameAspect({ w: naturalW0, h: naturalH0, rotation: rotateDeg[leftIdx] ?? 0 })
  );
  let rightFrameAspect = $derived(
    frameAspect({ w: naturalW1, h: naturalH1, rotation: rotateDeg[rightIdx] ?? 0 })
  );
  let leftFeedAspect = $derived(panelGrowFactor(leftFrameAspect, rightFrameAspect));
  let rightFeedAspect = $derived(panelGrowFactor(rightFrameAspect, leftFrameAspect));

  // Un simple `transform: rotate()` sobre una caja del mismo tamaño del
  // panel se recorta en 90°/270°, porque el panel es rectangular
  // (landscape) y la imagen rotada pasa a ser portrait (o viceversa): el
  // rectángulo rotado ya no calza en el rectángulo original y
  // overflow:hidden le corta las puntas.
  //
  // El arreglo: antes de rotar, le damos a la imagen el tamaño del panel
  // con ancho/alto intercambiados, centrada de forma absoluta. Rotada
  // 90°/270°, esa caja intercambiada vuelve a calzar exacto en el panel.
  // 180° no cambia de orientación, así que no necesita este ajuste.
  function feedRotateStyle(rotation: number, containerW: number, containerH: number): string {
    if (rotation === 90 || rotation === 270) {
      if (!containerW || !containerH) return `transform: rotate(${rotation}deg);`;
      return `position: absolute; top: 50%; left: 50%; width: ${containerH}px; height: ${containerW}px; transform: translate(-50%, -50%) rotate(${rotation}deg);`;
    }
    if (rotation === 180) return `transform: rotate(180deg);`;
    return '';
  }

  // ---------------------------------------------------------------------------
  // WB SAMPLING — click-to-neutralize
  // Reads a 3×3 pixel block from the blob-URL preview image via an offscreen
  // canvas (same-origin: no CORS issue with blob URLs).
  // ---------------------------------------------------------------------------
  function samplePixel(imgEl: HTMLImageElement, event: MouseEvent): [number, number, number] | null {
    if (!imgEl || !imgEl.naturalWidth) return null;
    const rect = imgEl.getBoundingClientRect();
    const cx = Math.round(((event.clientX - rect.left) / rect.width) * imgEl.naturalWidth);
    const cy = Math.round(((event.clientY - rect.top) / rect.height) * imgEl.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = imgEl.naturalWidth;
    canvas.height = imgEl.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(imgEl, 0, 0);
    // Average a 3×3 block for robustness against noise
    const x0 = Math.max(0, cx - 1);
    const y0 = Math.max(0, cy - 1);
    const w = Math.min(3, imgEl.naturalWidth - x0);
    const h = Math.min(3, imgEl.naturalHeight - y0);
    const data = ctx.getImageData(x0, y0, w, h).data;
    let r = 0, g = 0, b = 0;
    const count = w * h;
    for (let i = 0; i < count; i++) {
      r += data[i * 4];
      g += data[i * 4 + 1];
      b += data[i * 4 + 2];
    }
    return [Math.round(r / count), Math.round(g / count), Math.round(b / count)];
  }

  function handleWbSampleClick(cameraIndex: number, event: MouseEvent) {
    const sampling = $wbSamplingStore;
    if (!sampling.active || sampling.cameraIndex !== cameraIndex) return;
    const imgEl = cameraIndex === 0 ? imgEl0 : imgEl1;
    if (!imgEl) return;
    const pixel = samplePixel(imgEl, event);
    if (pixel) {
      sampling.onSample?.(pixel[0], pixel[1], pixel[2]);
    }
    // Deactivate regardless so we don't get stuck
    wbSamplingStore.set({ active: false, cameraIndex: 0, onSample: null });
  }

  // Handle del intervalo de polling (null cuando está pausado)
  let previewInterval: ReturnType<typeof setInterval> | null = null;

  // true cuando la pestaña es visible — se pausa el polling si el usuario
  // cambia de pestaña para ahorrar recursos en el Raspberry Pi.
  let previewActive = $state(true);

  // Indica si ya hay un fetch en curso para evitar requests solapados
  let fetchingPreview: Record<number, boolean> = { 0: false, 1: false };

  // Contador de errores consecutivos de preview — muestra banner tras 3 fallos
  let previewErrorCount = $state(0);
  let previewConnectError = $derived(previewErrorCount >= 3);

  // Cámara individual ausente (404 en su último fetch de preview, NEH-229).
  // Distinto de previewConnectError: 404 se excluye deliberadamente del
  // contador de errores porque significa "cámara no conectada", no "backend
  // caído" — pero sigue siendo información útil por cámara para mostrar un
  // overlay sobre su feed.
  // This overlay follows continuous polling, outside cameraRefresh. A 404
  // from before reconnect can briefly restore it after reconnect succeeds;
  // the next successful frame clears it. Unlike the dashboard, a 404 here
  // does not stop polling.
  let cameraMissing = $state<Record<number, boolean>>({});

  // ── Helper: URL base de la API ─────────────────────────────────────────────
  function getApiBase(): string {
    if (!browser) return 'http://localhost:8000';
    return env.PUBLIC_API_BASE || 'http://localhost:8000';
  }

  // ── Helper: cabecera de autenticación ──────────────────────────────────────
  function getAuthHeader(): HeadersInit {
    const token = tokenStore.get();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  // ── Fetch de un frame de preview para una cámara ───────────────────────────
  // Llama a GET /cameras/preview/{cameraIndex} (endpoint en cameras.py).
  // Si la cámara no está conectada, el backend devuelve 404 — falla silenciosamente.
  // La URL de objeto anterior se libera para evitar memory leaks.
  async function fetchPreview(cameraIndex: number) {
    // Evitar requests solapados para la misma cámara
    if (fetchingPreview[cameraIndex] || !previewActive) return;

    fetchingPreview[cameraIndex] = true;
    try {
      const response = await fetch(
        `${getApiBase()}/cameras/preview/${cameraIndex}`,
        { headers: getAuthHeader() }
      );

      if (response.ok) {
        const blob = await response.blob();
        const newUrl = URL.createObjectURL(blob);

        // Liberar la URL anterior para no acumular memoria
        if (previewUrls[cameraIndex]) {
          URL.revokeObjectURL(previewUrls[cameraIndex]);
        }

        previewUrls = { ...previewUrls, [cameraIndex]: newUrl };
        previewErrorCount = 0;  // reset on success
        if (cameraMissing[cameraIndex]) {
          cameraMissing = { ...cameraMissing, [cameraIndex]: false };
        }
      } else if (response.status === 404) {
        // 404 = cámara no conectada → falla silencioso para el contador de
        // errores, pero se refleja en el overlay por cámara (NEH-229).
        cameraMissing = { ...cameraMissing, [cameraIndex]: true };
      } else {
        // Otros errores (500, etc.) cuentan para el banner
        previewErrorCount += 1;
      }
    } catch {
      // Error de red — cuenta para el banner de reconexión
      previewErrorCount += 1;
    } finally {
      fetchingPreview[cameraIndex] = false;
    }
  }

  // ── Inicia o reinicia el polling ───────────────────────────────────────────
  // Se llama al montar el componente y cada vez que cambia cameraMode.
  // Cancela el intervalo anterior antes de crear uno nuevo.
  function startPreviewPolling() {
    if (previewInterval) {
      clearInterval(previewInterval);
      previewInterval = null;
    }

    // Fetch inmediato al arrancar (no esperar el primer intervalo)
    fetchPreview(0);
    if (cameraMode === 'double') fetchPreview(1);

    // Polling periódico
    previewInterval = setInterval(() => {
      fetchPreview(0);
      if (cameraMode === 'double') fetchPreview(1);
    }, PREVIEW_INTERVAL_MS);
  }

  // ── Pausa el polling cuando la pestaña pierde el foco ─────────────────────
  // Esto ahorra recursos en el Raspberry Pi cuando el usuario no está mirando.
  function handleVisibilityChange() {
    previewActive = !document.hidden;
    if (previewActive) {
      // Pestaña visible de nuevo → reiniciar polling
      startPreviewPolling();
    } else {
      // Pestaña oculta → pausar polling
      if (previewInterval) {
        clearInterval(previewInterval);
        previewInterval = null;
      }
      // NEH-228: también libera el seguro de tecla sostenida — es una de
      // las dos rutas de recuperación de un keyup que nunca llega (ronda 55).
      clearChordLatch();
    }
  }

  // ── Ciclo de vida ──────────────────────────────────────────────────────────
  onMount(() => {
    // Solo registrar el listener de visibilidad aquí.
    // startPreviewPolling() se llama desde el $effect de abajo,
    // que ya corre en el montaje inicial. Tenerlo en ambos lanzaba
    // dos ciclos de polling al montar el componente.
    if (browser) {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
  });

  // Reactivo: reiniciar polling cuando cambia el modo de cámara
  // (ej: de single a double → empezar a pedir también camera 1)
  $effect(() => {
    const _mode = cameraMode; // suscribirse al cambio
    startPreviewPolling();
  });

  onDestroy(() => {
    // Limpiar el intervalo al desmontar el componente
    if (previewInterval) clearInterval(previewInterval);

    // Liberar todas las URLs de objeto para evitar memory leaks
    Object.values(previewUrls).forEach(url => {
      try { URL.revokeObjectURL(url); } catch {}
    });

    if (browser) {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  });

  // ===========================================================================
  // FIN POLLING DEL PREVIEW
  // ===========================================================================

  // ---------------------------------------------------------------------------
  // ZOOM (CSS transform del wrapper — ajuste visual del viewport, no afecta la cámara)
  // Para zoom de cámara (ScalerCrop) usa el slider de Zoom en CameraControls.
  // ---------------------------------------------------------------------------
  function zoomIn()    { zoom = Math.min(zoom + 0.2, 3); }
  function zoomOut()   { zoom = Math.max(zoom - 0.2, 0.5); }
  function resetZoom() { zoom = 1; }

  // ---------------------------------------------------------------------------
  // GUÍAS ARRASTRABLES
  // ---------------------------------------------------------------------------
  function startDrag(guide: 'v' | 'h') { dragging = guide; }

  function handleMouseMove(e: MouseEvent) {
    if (!dragging || !viewportEl) return;
    const rect = viewportEl.getBoundingClientRect();
    if (dragging === 'v') {
      guideV = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    } else {
      guideH = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    }
  }

  function stopDrag() { dragging = null; }

  // ---------------------------------------------------------------------------
  // CAPTURA
  // ---------------------------------------------------------------------------
  async function handleCapture() {
    if (isCapturing || !captureReady) return;
    isCapturing = true;

    try {
      const payload = {
        project_name: projectName,
        collection_id: collectionId || undefined,
        record_title: $m.lv_capture_title(new Date().toISOString().slice(0,19)),
      };

      let result;
      if (cameraMode === 'double') {
        result = await camerasApi.captureDual({
          ...payload,
          left_camera_index: leftIdx,
          rotate_deg_cam0: rotateDeg[0] ?? 0,
          rotate_deg_cam1: rotateDeg[1] ?? 0,
        });
      } else {
        result = await camerasApi.capture({ ...payload, camera_index: 0, rotate_deg: rotateDeg[0] ?? 0 });
      }

      if (!result.success) {
        // Antes de NEH-72 este texto no se mostraba en ninguna parte, así que
        // el literal en inglés daba igual. Ahora es lo que lee el operario en
        // el banner cuando el backend no manda un `error` propio, y tiene que
        // salir del catálogo.
        throw new Error(result.error || $m.lv_capture_error);
      }

      // El flash solo dispara cuando el backend confirmó la captura: es la
      // única señal de éxito que ve el operador, y si dispara siempre, una
      // captura fallida se ve idéntica a una buena y la página se pierde
      // sin que nadie se entere hasta la revisión o la exportación (NEH-72).
      captureFlash = true;
      setTimeout(() => { captureFlash = false; }, 150);

      cameraStatus.reportSuccess();
      onCaptureDone();

    } catch (error) {
      const msg = error instanceof Error ? error.message : $m.lv_capture_error;
      cameraStatus.reportFailure(msg);
      console.error('[LiveViewport] Capture error:', error);
    } finally {
      isCapturing = false;
    }
  }

  // ---------------------------------------------------------------------------
  // TECLA DE CAPTURA — manejo de teclado (NEH-228)
  //
  // ownsEvent y shouldTrigger responden preguntas distintas y se llaman por
  // separado (ronda 55): ownsEvent decide si el evento le pertenece a la
  // captura (y por lo tanto si hay que llamar a preventDefault), sin importar
  // si esta pulsación en particular debe arrancar una captura. Confundirlas
  // deja pasar las repeticiones de un pedal sostenido hacia lo que tenga
  // foco — la primera pulsación se cancela, pero cada repetición después de
  // esa activa el botón enfocado en vez de la cámara.
  // ---------------------------------------------------------------------------

  function ownsEventContext(): OwnsEventContext {
    return {
      chord,
      modalOpen,
      activeElement: browser ? document.activeElement : null,
    };
  }

  function clearChordLatch() {
    chordHeld = false;
    heldCode = null;
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (learning) {
      handleLearnKeydown(event);
      return;
    }
    const ctx = ownsEventContext();
    if (!ownsEvent(event, ctx)) return;
    // Siempre que el evento le pertenece a la captura, no a solo cuando de
    // verdad arranca una: si no, cada repetición después de la primera pasa
    // de largo hacia el botón enfocado (ronda 55).
    event.preventDefault();
    if (shouldTrigger(event, { ...ctx, keyHeld: chordHeld, capturing: isCapturing, ready: captureReady })) {
      chordHeld = true;
      // Se guarda el `code` físico, no `chord.key`: es lo único que sigue
      // identificando esta tecla cuando el release llega con los
      // modificadores ya sueltos. Si el evento no trae un `code` utilizable,
      // heldCode queda en null y el seguro depende de blur/visibilitychange.
      heldCode = event.code || null;
      handleCapture();
    }
  }

  function handleWindowKeyup(event: KeyboardEvent) {
    if (learning) {
      // El dispositivo solo mandó un modificador y ahora lo suelta sin que
      // haya llegado ninguna otra tecla junto con él: se lo decimos a quien
      // opera en vez de dejar el control "asignando" para siempre.
      if (pendingModifier && event.key === pendingModifier) {
        learnMessage = $m.lv_capture_key_modifier_only(pendingModifier);
        pendingModifier = null;
      }
      return;
    }
    // El release se compara contra el `code` físico que armó el seguro, no
    // contra la tecla del chord: soltar un modificador antes que la tecla
    // cambia lo que esa tecla reporta como `key`, pero no su `code`. Se
    // libera cuando los dos `code` coinciden, y también cuando a cualquiera
    // de los dos lados le falta un `code` utilizable — un release sin
    // `code` identificable sigue siendo un release, y dejar el seguro
    // trabado por falta de dato es peor que soltarlo de más: la captura en
    // curso y el flag de repeat son las guardas que de verdad impiden una
    // segunda captura, este seguro es solo la tercera.
    if (!heldCode || !event.code || event.code === heldCode) {
      clearChordLatch();
    }
  }

  function handleLearnKeydown(event: KeyboardEvent) {
    event.preventDefault();
    const result = learnFromEvent(event);
    if (result.ok) {
      chord = result.chord;
      writeChord(chord);
      learning = false;
      pendingModifier = null;
      learnMessage = null;
      return;
    }
    if (result.reason === 'modifier-only') {
      pendingModifier = result.modifier;
      learnMessage = null;
      return;
    }
    // 'unbindable': Dead, Unidentified, o un evento a mitad de composición.
    learnMessage = $m.lv_capture_key_unbindable;
  }

  function startLearningChord() {
    learning = true;
    pendingModifier = null;
    learnMessage = null;
  }

  // Cancelar es siempre un botón visible, nunca una tecla — si no, un pedal
  // que emite Escape no se podría asignar nunca.
  function cancelLearningChord() {
    learning = false;
    pendingModifier = null;
    learnMessage = null;
  }

  function resetChord() {
    clearStoredChord();
    chord = DEFAULT_CHORD;
    cancelLearningChord();
  }

  function closeGridModal() {
    showGridModal = false;
    // Cerrar los ajustes de cuadrícula a mitad de la asignación no debe
    // dejar el próximo keydown de la ventana secuestrado por un control ya
    // invisible.
    cancelLearningChord();
  }

  // ---------------------------------------------------------------------------
  // MODAL DE GRILLA
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // HELPER: etiqueta de cámara con índice
  // ---------------------------------------------------------------------------
  function cameraLabel(idx: number): string {
    const dev = devices.find(d => d.index === idx);
    return `${dev?.label || dev?.model || 'Camera'} [${idx}]`;
  }
</script>

<svelte:window onkeydown={handleWindowKeydown} onkeyup={handleWindowKeyup} onblur={clearChordLatch} />

<!-- ============================================================
     VIEWPORT PRINCIPAL
     ============================================================ -->
<div class="viewport-outer">
  <div class="mat-board" bind:clientWidth={boardW} bind:clientHeight={boardH}>

    <!-- ══════════════════════════════════════════════════════════
         ÁREA DE CÁMARAS
         ══════════════════════════════════════════════════════════ -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="camera-viewport"
      class:flash={captureFlash}
      bind:this={viewportEl}
      style={viewportBox.w && viewportBox.h ? `width: ${viewportBox.w}px; height: ${viewportBox.h}px` : undefined}
      onmousemove={handleMouseMove}
      onmouseup={stopDrag}
      onmouseleave={stopDrag}
    >

      <!-- Banner: la última captura falló (NEH-72). `cameraStatus` ya
           registraba el fallo, pero nada lo mostraba: el componente que iba a
           hacerlo nunca se montó y después se eliminó. Se limpia solo con la
           siguiente captura buena (`reportSuccess`), así que no puede quedarse
           colgado a mitad de una secuencia. -->
      {#if $cameraStatus.captureError}
        <div class="capture-error-banner" role="alert">
          <span class="material-symbols-outlined icon-sm">error</span>
          <!-- `||` y no `??`: un mensaje vacío también tiene que caer al
               catálogo, o el banner sale sin texto. -->
          {$cameraStatus.errorMessage || $m.lv_capture_error}
        </div>
      {/if}

      <!-- Banner: reconectando tras errores consecutivos de preview -->
      {#if previewConnectError}
        <div class="reconnect-banner" class:stacked={$cameraStatus.captureError}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
          {$m.lv_reconnecting}
        </div>
      {/if}

      <!-- ══════════════════════════════════════════════════════
           STREAM DE CÁMARA
           ══════════════════════════════════════════════════════
           Este bloque muestra el feed en vivo de una o dos cámaras.

           ESTADO ACTUAL: usa previewUrls[n] que se actualiza via polling.
           previewUrls[n] es una Object URL que apunta al último frame JPEG
           capturado por /cameras/preview/{n} en el backend.

           ── PARA SUSTITUIR POR STREAMING REAL ──────────────────
           Cuando el backend tenga MJPEG streaming, reemplaza cada:

             {#if previewUrls[n]}
               <img src={previewUrls[n]} ... />
             {:else}
               <div class="no-stream">...</div>
             {/if}

           Por simplemente:

             <img
               src="{getApiBase()}/cameras/stream/{n}"
               class="feed-img"
               alt="Camera {n}"
             />

           Y elimina el bloque "POLLING DEL PREVIEW" del <script>.
           ══════════════════════════════════════════════════════ -->
      <div class="camera-feeds-wrapper" style="transform: scale({zoom})">

        <!-- Cámara izquierda (leftIdx) — siempre visible -->
        <div class="camera-feed" bind:clientWidth={feedW0} bind:clientHeight={feedH0} style="flex-grow: {leftFeedAspect}">
          {#if previewUrls[leftIdx]}
            <!-- Frame en vivo del polling — se actualiza cada PREVIEW_INTERVAL_MS -->
            <img
              bind:this={imgEl0}
              bind:naturalWidth={naturalW0}
              bind:naturalHeight={naturalH0}
              src={previewUrls[leftIdx]}
              alt={$m.lv_camera_left_alt}
              class="feed-img"
              style={feedRotateStyle(rotateDeg[leftIdx] ?? 0, feedW0, feedH0)}
              onload={() => { if (imgEl0) histogramStore.update(s => ({ ...s, [leftIdx]: computeHistogram(imgEl0!) })); }}
            />
            <!-- WB sampling overlay: visible only when picker is active for this camera -->
            {#if $wbSamplingStore.active && $wbSamplingStore.cameraIndex === leftIdx}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="wb-sample-overlay"
                onclick={(e) => handleWbSampleClick(leftIdx, e)}
                title={$m.lv_wb_click_hint}
              ></div>
            {/if}
          {:else}
            <!-- Placeholder: sin señal o esperando primer frame -->
            <div class="no-stream">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              <span>{$m.lv_no_signal_left}</span>
              <small>{$m.lv_check_hw}</small>
            </div>
          {/if}
          <!-- Overlay: la cámara respondió 404 en el último fetch (NEH-229) -->
          {#if cameraMissing[leftIdx]}
            <div class="camera-missing" role="status">{$m.lv_camera_missing}</div>
          {/if}
          <!-- Badge identificador de cámara -->
          <div class="feed-label">{cameraLabel(leftIdx)}</div>
          <!-- Floating rotation overlay -->
          <div class="feed-rotate-overlay">
            <button class="feed-rotate-btn" onclick={() => stepRotation(leftIdx, -90)} aria-label={$m.lv_rotate_ccw}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
              </svg>
            </button>
            <span class="feed-rotate-deg">{(rotateDeg ?? {})[leftIdx] ?? 0}°</span>
            <button class="feed-rotate-btn" onclick={() => stepRotation(leftIdx, 90)} aria-label={$m.lv_rotate_cw}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                <path d="M21 3v5h-5"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Cámara derecha (rightIdx) — solo en modo double -->
        {#if cameraMode === 'double'}
          <div class="camera-feed" bind:clientWidth={feedW1} bind:clientHeight={feedH1} style="flex-grow: {rightFeedAspect}">
            {#if previewUrls[rightIdx]}
              <!-- Frame en vivo del polling -->
              <img
                bind:this={imgEl1}
                bind:naturalWidth={naturalW1}
                bind:naturalHeight={naturalH1}
                src={previewUrls[rightIdx]}
                alt={$m.lv_camera_right_alt}
                class="feed-img"
                style={feedRotateStyle(rotateDeg[rightIdx] ?? 0, feedW1, feedH1)}
                onload={() => { if (imgEl1) histogramStore.update(s => ({ ...s, [rightIdx]: computeHistogram(imgEl1!) })); }}
              />
              {#if $wbSamplingStore.active && $wbSamplingStore.cameraIndex === rightIdx}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="wb-sample-overlay"
                  onclick={(e) => handleWbSampleClick(rightIdx, e)}
                  title={$m.lv_wb_click_hint}
                ></div>
              {/if}
            {:else}
              <!-- Placeholder: sin señal o esperando primer frame -->
              <div class="no-stream">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
                <span>{$m.lv_no_signal_right}</span>
                <small>{$m.lv_check_hw}</small>
              </div>
            {/if}
            <!-- Overlay: la cámara respondió 404 en el último fetch (NEH-229) -->
            {#if cameraMissing[rightIdx]}
              <div class="camera-missing" role="status">{$m.lv_camera_missing}</div>
            {/if}
            <!-- Badge identificador de cámara -->
            <div class="feed-label right">{cameraLabel(rightIdx)}</div>
            <!-- Floating rotation overlay -->
            <div class="feed-rotate-overlay">
              <button class="feed-rotate-btn" onclick={() => stepRotation(rightIdx, -90)} aria-label={$m.lv_rotate_ccw}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                  <path d="M3 3v5h5"/>
                </svg>
              </button>
              <span class="feed-rotate-deg">{(rotateDeg ?? {})[rightIdx] ?? 0}°</span>
              <button class="feed-rotate-btn" onclick={() => stepRotation(rightIdx, 90)} aria-label={$m.lv_rotate_cw}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                  <path d="M21 3v5h-5"/>
                </svg>
              </button>
            </div>
          </div>
        {/if}

      </div>
      <!-- ══ FIN STREAM DE CÁMARA ══ -->

      <!-- ── GRILLA (líneas cian, no arrastrables) ── -->
      {#if showGrid}
        {#each Array.from({length: gridCols - 1}, (_, i) => i) as i}
          <div class="grid-line vertical" style="left: {(i+1) * (100/gridCols)}%"></div>
        {/each}
        {#each Array.from({length: gridRows - 1}, (_, i) => i) as i}
          <div class="grid-line horizontal" style="top: {(i+1) * (100/gridRows)}%"></div>
        {/each}
      {/if}

      <!-- ── GUÍAS ARRASTRABLES (líneas rojas) ── -->
      {#if showGuides}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="guide vertical" style="left: {guideV}%" onmousedown={() => startDrag('v')}>
          <div class="guide-line"></div>
        </div>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="guide horizontal" style="top: {guideH}%" onmousedown={() => startDrag('h')}>
          <div class="guide-line"></div>
        </div>
      {/if}

      <!-- ── BARRA DE METADATOS ── -->
      <div class="metadata-bar">
        <div class="metadata-values">
          <span>ISO {iso}</span>
          <span>{shutterSpeed}</span>
          <span>f/{aperture}</span>
          <span>50mm</span>
        </div>
      </div>

    </div><!-- /camera-viewport -->

    <!-- ── PANEL FLOTANTE: zoom + grilla ── -->
    <div class="floating-controls" class:collapsed={!controlsOpen}>
      <button
        class="float-btn float-btn-toggle"
        onclick={() => controlsOpen = !controlsOpen}
        aria-expanded={controlsOpen}
        aria-label={controlsOpen ? $m.lv_controls_collapse : $m.lv_controls_expand}
        title={controlsOpen ? $m.lv_controls_collapse : $m.lv_controls_expand}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          {#if controlsOpen}
            <path d="M9 18l6-6-6-6"/>
          {:else}
            <path d="M15 18l-6-6 6-6"/>
          {/if}
        </svg>
      </button>
      {#if controlsOpen}
        <div class="float-divider"></div>
        <button class="float-btn" onclick={zoomIn} aria-label={$m.lv_zoom_in}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
          </svg>
        </button>
        <button class="float-btn" onclick={zoomOut} aria-label={$m.lv_zoom_out}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            <line x1="8" y1="11" x2="14" y2="11"/>
          </svg>
        </button>
        <button class="float-btn" onclick={resetZoom} aria-label={$m.col_fit_screen_aria}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
          </svg>
        </button>
        <div class="float-divider"></div>
        <button class="float-btn" onclick={() => showGridModal = true} aria-label={$m.lv_grid_settings}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
          </svg>
        </button>
        {#if cameraMode === 'double'}
          <div class="float-divider"></div>
          <button
            class="float-btn"
            class:float-btn-active={swapped}
            onclick={() => swapped = !swapped}
            aria-label={$m.lv_swap_orientation}
            title={swapped ? $m.lv_orientation_swapped : $m.lv_orientation_normal}
          >
            <span class="material-symbols-outlined" style="font-size:22px">sync</span>
          </button>
        {/if}
      {/if}
    </div>

    <!-- ── BOTÓN DE CAPTURA ── -->
    <div class="capture-btn-wrapper">
      <button
        class="capture-btn"
        class:capturing={isCapturing}
        onclick={handleCapture}
        disabled={isCapturing || !captureReady}
        title={captureReady ? undefined : $m.lv_capture_not_ready}
        aria-label={$m.lv_capture_btn}
      >
        <div class="capture-ring outer"></div>
        <div class="capture-ring middle"></div>
        <div class="capture-circle"></div>
      </button>
    </div>

  </div><!-- /mat-board -->
</div><!-- /viewport-outer -->

<!-- ============================================================
     MODAL: Configuración de Grilla
     ============================================================ -->
{#if showGridModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={(e) => { if ((e.target as HTMLElement).classList.contains('modal-backdrop')) closeGridModal(); }}>
    <div class="modal-card">
      <h3 class="modal-title">{$m.lv_grid_modal_title}</h3>
      <p class="modal-subtitle">{$m.lv_grid_modal_subtitle}</p>
      <div class="modal-body">
        <div class="modal-toggle-row">
          <div>
            <p class="modal-toggle-title">{$m.lv_grid}</p>
            <p class="modal-toggle-sub">{$m.lv_grid_desc}</p>
          </div>
          <button class="toggle-btn" class:on={showGrid} onclick={() => showGrid = !showGrid}>
            <div class="toggle-thumb" class:on={showGrid}></div>
          </button>
        </div>
        <div class="modal-toggle-row">
          <div>
            <p class="modal-toggle-title">{$m.lv_guides}</p>
            <p class="modal-toggle-sub">{$m.lv_guides_desc}</p>
          </div>
          <button class="toggle-btn" class:on={showGuides} onclick={() => showGuides = !showGuides}>
            <div class="toggle-thumb" class:on={showGuides}></div>
          </button>
        </div>

        <!-- NEH-228: la tecla de captura — se asigna una vez y queda
             guardada en este navegador. -->
        <div class="modal-toggle-row capture-key-row">
          <div>
            <p class="modal-toggle-title">{$m.lv_capture_key_current(describeChord(chord, $m.lv_capture_key_space))}</p>
            <p class="modal-toggle-sub">{$m.lv_capture_key_desc}</p>
          </div>
          <div class="capture-key-buttons">
            {#if learning}
              <button class="capture-key-btn" onclick={cancelLearningChord}>{$m.common_cancel}</button>
            {:else}
              <button class="capture-key-btn" onclick={startLearningChord}>{$m.lv_capture_key_learn}</button>
            {/if}
            <button class="capture-key-btn" onclick={resetChord}>{$m.lv_capture_key_reset}</button>
          </div>
        </div>
        {#if learning}
          <p class="modal-toggle-sub capture-key-status" role="status">{$m.lv_capture_key_learning}</p>
        {/if}
        {#if learnMessage}
          <p class="modal-toggle-sub capture-key-status" role="alert">{learnMessage}</p>
        {/if}
        <p class="modal-toggle-sub capture-key-note">{$m.lv_capture_key_note}</p>
      </div>
      <div class="modal-actions">
        <button class="modal-btn confirm" onclick={closeGridModal}>{$m.common_close}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .viewport-outer {
    flex: 1;
    position: relative;
    background-color: var(--color-bg);
    overflow: hidden;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }

  .mat-board {
    position: relative;
    width: 100%;
    height: 100%;
    background-color: #2c2920;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
  }

  /* Banner de captura fallida — mismo lenguaje visual que el de reconexión,
     pero opaco y sin pulso: es un estado que exige acción, no una espera.
     z-index 60 lo deja por encima de todo lo que se dibuja en el viewport
     (guías y overlays llegan hasta 50), para que no quede tapado justo
     cuando el operador tiene las guías de encuadre puestas. */
  .capture-error-banner {
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 60;
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 80%;
    padding: 8px 16px;
    background: rgba(190, 45, 35, 0.96);
    color: #fff;
    font-size: 0.8rem;
    border-radius: 20px;
    backdrop-filter: blur(4px);
    pointer-events: none;
  }

  /* Banner de reconexión */
  .reconnect-banner {
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 30;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    background: rgba(220, 80, 60, 0.88);
    color: #fff;
    font-size: 0.75rem;
    border-radius: 20px;
    backdrop-filter: blur(4px);
    pointer-events: none;
    animation: pulse-opacity 1.5s ease-in-out infinite;
  }

  /* Una cámara caída dispara los dos banners a la vez, y ambos se centran
     arriba: cuando eso pasa, el de reconexión baja para no quedar debajo
     del de captura fallida. */
  .reconnect-banner.stacked { top: 52px; }

  @keyframes pulse-opacity {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.6; }
  }

  /* ── Viewport negro interno ── */
  /* width/aspect-ratio son el respaldo antes de que el tablero (.mat-board)
     se mida por primera vez — viewportBox llega en 0x0 en ese primer tick
     y el elemento no tiene todavía un tamaño en línea, así que sin esto se
     colapsaría a 0. En cuanto viewportBox deja de ser 0x0, el tamaño en
     línea (width/height en px) pisa a estas dos reglas. max-height:100% NO
     va aquí a propósito — es justo lo que R39-3 eliminó. */
  .camera-viewport {
    position: relative;
    width: 100%;
    aspect-ratio: 4 / 3;
    background-color: #0a0a0a;
    border: 1px solid rgba(90,140,98,0.2);
    box-shadow: 0 4px 24px rgba(0,0,0,0.6);
    overflow: hidden;
    cursor: crosshair;
  }

  /* Efecto flash al capturar */
  .camera-viewport.flash::after {
    content: '';
    position: absolute;
    inset: 0;
    background-color: rgba(255,255,255,0.3);
    z-index: 50;
    pointer-events: none;
    animation: flash 150ms ease;
  }

  @keyframes flash { 0% { opacity: 0.3; } 100% { opacity: 0; } }

  /* ══════════════════════════════════════════════════════════════
     FEEDS DE CÁMARA
     Wrapper flex que contiene los paneles L y R lado a lado.
     En modo single: solo aparece el feed izquierdo (flex: 1).
     En modo double: dos feeds iguales dividiendo el espacio.
     ══════════════════════════════════════════════════════════════ */
  .camera-feeds-wrapper {
    display: flex;
    width: 100%;
    height: 100%;
    transition: transform 0.3s ease;
  }

  /* Cada panel de cámara */
  .camera-feed {
    flex: 1 1 0;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
    /* Línea divisoria entre L y R */
    border-right: 1px solid rgba(255,255,255,0.06);
  }

  .camera-feed:last-child { border-right: none; }

  /* Overlay: cámara ausente (404 en el último fetch de preview, NEH-229) */
  .camera-missing {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    max-width: 80%;
    background: rgba(19,17,16,0.85);
    backdrop-filter: blur(2px);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: var(--radius-md);
    padding: 10px 16px;
    font-size: var(--text-sm);
    font-weight: var(--fw-medium);
    color: var(--color-light);
    text-align: center;
    z-index: 6;
    pointer-events: none;
  }

  /* Imagen del stream / polling */
  .feed-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }

  /* Badge L / R en la esquina del feed */
  .feed-label {
    position: absolute;
    top: 8px;
    left: 8px;
    background: rgba(19,17,16,0.75);
    backdrop-filter: blur(2px);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 4px;
    padding: 4px 10px;
    font-size: 14px;
    font-weight: 700;
    color: var(--color-light);
    pointer-events: none;
    z-index: 5;
  }

  .feed-label.right { left: auto; right: 8px; }

  /* Placeholder sin señal */
  .no-stream {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    color: var(--color-light-grey);
    opacity: 0.4;
    text-align: center;
    padding: 16px;
  }

  .no-stream span  { font-size: var(--text-base); font-weight: var(--fw-medium); }
  .no-stream small { font-size: var(--text-sm); }

  /* ── Grilla (cian) ── */
  .grid-line {
    position: absolute;
    pointer-events: none;
    z-index: 20;
    background-color: rgba(0, 210, 255, 0.5);
  }

  .grid-line.vertical   { top: 0; bottom: 0; width: 1px; }
  .grid-line.horizontal { left: 0; right: 0; height: 1px; }

  /* ── Guías arrastrables (rojo) ── */
  .guide {
    position: absolute;
    z-index: 30;
  }

  .guide.vertical   { top: 0; bottom: 0; width: 16px; margin-left: -8px; cursor: ew-resize; }
  .guide.horizontal { left: 0; right: 0; height: 16px; margin-top: -8px; cursor: ns-resize; }

  .guide-line {
    position: absolute;
    background-color: rgba(220,50,50,0.8);
    transition: background-color var(--transition-fast);
  }

  .guide.vertical   .guide-line { left: 50%; top: 0; bottom: 0; width: 1px; transform: translateX(-50%); }
  .guide.horizontal .guide-line { top: 50%; left: 0; right: 0; height: 1px; transform: translateY(-50%); }
  .guide:hover .guide-line { background-color: rgba(255,80,80,1); }

  /* ── Barra de metadatos ── */
  .metadata-bar {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 32px;
    background-color: #18181b;
    border-top: 1px solid rgba(255,255,255,0.1);
    display: flex;
    align-items: center;
    padding: 0 16px;
    z-index: 40;
  }

  .metadata-values {
    display: flex;
    gap: 16px;
    font-family: monospace;
    font-size: 10px;
    color: var(--color-light-grey);
  }

  .metadata-auto {
    font-family: monospace;
    font-size: 10px;
    color: var(--color-light-grey);
  }

  /* ── Panel flotante ── */
  .floating-controls {
    position: absolute;
    top: 75px; right: 1px;
    z-index: 40;
    background-color: rgba(26,24,21,0.9);
    backdrop-filter: blur(4px);
    border: 1px solid rgba(90,140,98,0.3);
    border-radius: var(--radius-xl);
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 76px;
    align-items: center;
    transition: width var(--transition-base);
  }

  /* Plegado: solo el botón de alternar, para devolverle el área al feed */
  .floating-controls.collapsed {
    background-color: rgba(26,24,21,0.6);
  }

  .float-btn-toggle { color: var(--color-light); }

  .float-btn {
    width: 64px; height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none; border: none;
    cursor: pointer;
    color: var(--color-light-grey);
    border-radius: var(--radius-md);
    transition: color var(--transition-fast), background-color var(--transition-fast);
  }

  .float-btn:hover { color: var(--color-primary); background-color: rgba(255,255,255,0.05); }
  .float-btn-active { color: var(--color-primary); }
  .float-btn-active:hover { color: var(--color-primary); }

  .float-divider { width: 32px; height: 1px; background-color: var(--border-color); }

  /* ── Botón de captura ── */
  .capture-btn-wrapper {
    position: absolute;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 50;
  }

  .capture-btn {
    position: relative;
    width: 60px; height: 60px;
    background: none; border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: opacity var(--transition-fast);
  }

  .capture-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .capture-ring {
    position: absolute;
    border-radius: 50%;
    transition: transform var(--transition-fast);
  }

  .capture-ring.outer  { inset: 0; border: 2px solid rgba(255,255,255,0.6); animation: pulse-ring 2s ease infinite; }
  .capture-ring.middle { width: 52px; height: 52px; border: 1.5px solid rgba(255,255,255,0.3); }

  .capture-circle {
    width: 44px; height: 44px;
    background-color: white;
    border-radius: 50%;
    box-shadow: 0 0 20px rgba(0,0,0,0.5);
    transition: transform var(--transition-fast);
    z-index: 1;
  }

  .capture-btn:hover:not(:disabled)  .capture-circle { transform: scale(0.93); }
  .capture-btn:active:not(:disabled) .capture-circle { transform: scale(0.88); }
  .capture-btn.capturing .capture-ring.outer { border-color: var(--color-primary); animation: none; }

  @keyframes pulse-ring {
    0%   { opacity: 1; transform: scale(1); }
    50%  { opacity: 0.7; transform: scale(1.05); }
    100% { opacity: 1; transform: scale(1); }
  }

  /* ── Modal ── */
  .modal-backdrop {
    position: fixed; inset: 0;
    background-color: rgba(0,0,0,0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 24px;
  }

  .modal-card {
    background-color: var(--color-surface-alt);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
    padding: 32px 28px;
    width: 100%;
    max-width: 420px;
    box-shadow: var(--shadow-lg);
  }

  .modal-title    { font-size: var(--text-h3); font-weight: var(--fw-bold); color: var(--color-light); margin: 0 0 6px; }
  .modal-subtitle { font-size: var(--text-sm); color: var(--color-light-grey); margin: 0 0 24px; }

  .modal-body   { display: flex; flex-direction: column; gap: 20px; margin-bottom: 24px; }
  .modal-field  { display: flex; flex-direction: column; gap: 8px; }
  .modal-label  { font-size: var(--text-sm); font-weight: var(--fw-semibold); color: var(--color-light); }

  .slider-with-value { display: flex; align-items: center; gap: 12px; }

  .modal-range {
    flex: 1; height: 8px;
    -webkit-appearance: none;
    background-color: var(--color-surface-alt-2);
    border-radius: var(--radius-full);
    cursor: pointer;
  }

  .modal-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px; height: 16px;
    border-radius: 50%;
    background-color: var(--color-primary);
    cursor: pointer;
  }

  .range-value {
    width: 40px; height: 40px;
    background-color: var(--color-surface-alt-2);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    display: flex; align-items: center; justify-content: center;
    font-weight: var(--fw-bold);
    color: var(--color-light);
    flex-shrink: 0;
  }

  .modal-toggle-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px;
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
  }

  .modal-toggle-title { font-size: var(--text-sm); font-weight: var(--fw-semibold); color: var(--color-light); margin: 0 0 2px; }
  .modal-toggle-sub   { font-size: var(--text-xs); color: var(--color-light-grey); margin: 0; }

  .toggle-btn {
    width: 48px; height: 24px;
    border-radius: var(--radius-full);
    background-color: var(--color-surface-alt);
    border: 1px solid var(--border-color);
    cursor: pointer;
    position: relative;
    transition: background-color var(--transition-base);
    flex-shrink: 0;
  }

  .toggle-btn.on { background-color: var(--color-primary); border-color: var(--color-primary); }

  .toggle-thumb {
    position: absolute;
    top: 2px; left: 2px;
    width: 18px; height: 18px;
    border-radius: 50%;
    background-color: var(--color-light-grey);
    transition: transform var(--transition-base), background-color var(--transition-base);
  }

  .toggle-thumb.on { transform: translateX(24px); background-color: white; }

  /* NEH-228: fila de la tecla de captura — igual que .modal-toggle-row, pero
     con dos botones en vez de un toggle a la derecha. */
  .capture-key-buttons { display: flex; gap: 8px; flex-shrink: 0; }

  .capture-key-btn {
    padding: 8px 12px;
    font-family: var(--font-family);
    font-size: var(--text-sm);
    font-weight: var(--fw-semibold);
    border-radius: var(--radius-md);
    border: 1px solid var(--border-color);
    background-color: var(--color-surface-alt);
    color: var(--color-light);
    cursor: pointer;
    transition: background-color var(--transition-fast);
    white-space: nowrap;
  }

  .capture-key-btn:hover { background-color: rgba(255,255,255,0.05); }

  .capture-key-status { color: var(--color-primary); }

  .capture-key-note { margin-top: -8px; }

  .modal-actions { display: flex; gap: 12px; }

  .modal-btn {
    flex: 1; height: 44px;
    border-radius: var(--radius-md);
    font-family: var(--font-family);
    font-size: var(--text-base);
    font-weight: var(--fw-bold);
    cursor: pointer;
    transition: all var(--transition-base);
    border: 1px solid var(--border-color);
  }

  .modal-btn.cancel  { background-color: var(--color-surface); color: var(--color-light-grey); }
  .modal-btn.cancel:hover { background-color: rgba(255,255,255,0.05); color: var(--color-light); }
  .modal-btn.confirm { background-color: var(--color-primary); color: white; border-color: var(--color-primary); box-shadow: 0 4px 12px rgba(90,140,98,0.3); }
  .modal-btn.confirm:hover { background-color: var(--color-primary-hover); }
</style>
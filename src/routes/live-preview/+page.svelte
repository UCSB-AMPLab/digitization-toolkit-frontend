<script lang="ts">
  // Capture screen, at /live-preview?projectId=X&collectionId=Y (optionally
  // &recordId=Z). The page holds the state its children share — camera mode,
  // exposure values, per-camera rotation, the volume's records — and passes it
  // down as props; `CameraControls`, `LiveViewport`, `ThumbnailStrip` and
  // `ImageViewerModal` do the rendering. Only admin and operator may use it;
  // a reviewer is redirected (role guard in `onMount`, NEH-66). When the
  // volume is an item of a stored digitisation list, `CaptureInstruction`
  // shows that item's notes and action under the top bar: the item of the
  // newest list for this volume (GET /imports/digitisation-lists), or, when
  // no list has one, the notes the import kept in the volume's
  // custom_attributes.
  //
  // The recapture turn (0.2.0), from GET /records/to-retake/summary: an
  // empty volume while the turn is `recaptures` gets the block panel instead
  // of the capture controls (an admin may capture anyway), and an empty
  // volume while the turn is `new` gets the green band that says it may be
  // started. Opened with the `recordId` of a rejected record, the screen
  // guides the operator through the volume's rejected records in sequence
  // order: each successful retake opens the next, "Saltar por ahora" defers
  // the record to the back, and the end panel shows once the volume has
  // nothing pending. A failed reload after a retake pauses the guide with a
  // retry; until the next state is on screen, ordinary capture stays blocked.
  // While the guide is open, the thumbnails of the next record or two are
  // loaded ahead, so that the next modal, which opens on thumbnails, shows
  // them at once (0.3.1). Full-size images are never loaded ahead.
  //
  // Capturing into a placeholder (NEH-317): a record for a whole opening
  // never captured (missing_side 'both') opens in the same modal, which
  // shows where the opening goes between its neighbours, the note (under
  // "From Fisqua review" when it came from a Fisqua request), what it should
  // hold, the line that separates order from file names, and a link to the
  // close dialog. It is always filled by a dual capture into the record.
  // After that capture the modal asks whether another opening is missing
  // there: "Capture another here" inserts a new record right after the one
  // just filled (afterRecordId) and asks again; "That was the last one" goes
  // on as a retake does (the guide's next record, or back to the volume).
  // Closing the placeholder goes on the same way. The app has no folio for
  // a record and no next capture number for a volume, so the texts that
  // would name them use their variants without (cap_title, cap_another_q,
  // cap_order_note); the record the opening goes after is named by its
  // sequence. Going on from the after-panel keeps the modal locked, with no
  // Capture, until the guide has moved on (`leaving`). After the fill and
  // after each "Capture another here" the records are read again, and the
  // panel describes the next slot: after
  // the record filled last. While the after-panel shows, Skip is disabled;
  // Close goes on as "That was the last one" does, and nothing closes the
  // modal while "Capture another here" runs. Both dual captures send the
  // same left_camera_index as the viewport (the `swapped` state, bound to
  // LiveViewport), and "Capture another here" the default record title
  // (NEH-181), as the viewport's capture does.
  //
  // The focus check (NEH-339): on a unit whose capabilities report DSLR
  // settings, "Refocus" in the viewport opens RefocusModal, and the page
  // opens it by itself when the screen is opened or the tab comes back into
  // view and no check or capture is recorded since the sign-in, or the last
  // one is more than 15 minutes old (src/lib/focus-check.ts). Closing it,
  // completed or skipped, and every capture made here record the activity.
  // While it is open the capture key and the pedal do not capture.
  //
  // The camera check (NEH-339): "Check cameras" in the top bar opens
  // CameraCheck over the screen, with the same left camera as the viewport;
  // only the operator opens it and closes it. While it is open the capture
  // key and the pedal take no capture, and the focus check waits. Its
  // "Refocus" counts as a focus check done. It shows each capture at the
  // camera's rotation here, and its "Turn" goes through
  // handleRotateDegChange, so it is saved as the viewport's rotate buttons
  // save it.
  //
  // Which camera is which (NEH-343): the page asks GET /cameras/setup on
  // loading, once it has its devices, after "Reconnect cameras", when the camera check
  // opens, when the tab comes back into view, and after a device listing
  // that reports other bodies than the one before; never on a timer. When
  // set-up is needed, WhichCamera opens by itself over everything and
  // cannot be dismissed, and nothing here captures: LiveViewport's capture
  // button is disabled and its capture key ignored (captureBlocked, and
  // otherModalOpen), and a retake or placeholder capture is refused with
  // the step's message. Capture is held the same way, with nothing shown,
  // from loading until the first answer has arrived (captureHeld); a 404
  // counts as an answer (no set-up needed), and so does a read that fails
  // otherwise, which ends the hold and leaves capture as before. A read
  // that fails keeps the last answer. "Change which camera is
  // which" in the camera check's details opens the same step by hand,
  // cancellable, over the check. A save returns to where the operator was.
  // While set-up is needed the step's "Leave the capture screen" goes where
  // the top bar's back button goes (handleBack); coming back shows the step
  // again. The saved roles decide left and right: when set-up is not needed
  // and the latest device rows (from CameraControls, from the step's rescan,
  // or from a save) confirm one body as the left page and one as the right
  // (leftIndexFromRoles), `swapped` is set from them, and LiveViewport hides
  // its swap control (swapLocked). Everything that reads leftCameraIndex
  // then follows the roles. With an old backend, or without two confirmed
  // roles, `swapped` and the control are as before. `swapped` is not stored.
  //
  // Version: 0.3.3

  import { onMount, tick, untrack } from 'svelte';
  import { focusCheckNeeded, recordFocusActivity } from '$lib/focus-check';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { authStore, userRole } from '$lib/stores/auth';
  import { ensureUnit, projectsShownIn, stemFormTarget, unitState } from '$lib/unit-mode';
  import { camerasApi, recordsApi, projectsApi, collectionsApi, importsApi, type Record as ApiRecord, type CameraDevice,
           type CameraRolesResponse, type CameraSetup, type QueueItem, type RetakeSummary, type RetakeSummaryVolume } from '$lib/api';
  import { cameraStatus } from '$lib/stores/cameras';
  import { m } from '$lib/i18n';
  import { seedRotation, createOrientationSaver, canSaveRotation, settlePendingRotations } from '$lib/camera-orientation';
  import { isConflict, needsStem } from '$lib/volume-stem';
  import { CaptureFailed, captureErrorText } from '$lib/capture-errors';
  import { captureInstruction, instructionForVolume, retakeUrl, type CaptureInstruction as Instruction } from '$lib/queue';
  import { deferToBack, folioHint, guideNextId, guideOrder, preferredRetakeVolume, readRetakeSummary } from '$lib/recapture-turn';
  import { defaultRecordTitle } from '$lib/record-title';
  import { newestOnly } from '$lib/newest-only';

  import TopBar from './TopBar.svelte';
  import CameraControls from './CameraControls.svelte';
  import LiveViewport from './LiveViewport.svelte';
  import ThumbnailStrip from './ThumbnailStrip.svelte';
  import ImageViewerModal from './ImageViewerModal.svelte';
  import CaptureInstruction from './CaptureInstruction.svelte';
  import RefocusModal from './RefocusModal.svelte';
  import CameraCheck from './CameraCheck.svelte';
  import WhichCamera from './WhichCamera.svelte';
  import { hardwareKey, leftIndexFromRoles } from '$lib/camera-roles';
  import { dialogOpen } from '$lib/dialog';
  import MissingPage from '$lib/components/MissingPage.svelte';
  import CloseMissingDialog from '$lib/components/CloseMissingDialog.svelte';

  let projectId = $derived(Number($page.url.searchParams.get('projectId')) || 0);
  let collectionId = $derived(Number($page.url.searchParams.get('collectionId')) || 0);
  // Set when the operator arrives from Book view's "Recapture image" button
  // (NEH-209) for one record. The page opens that record's retake modal
  // directly, so the operator does not have to find it again in the
  // thumbnail strip.
  let recordId = $derived(Number($page.url.searchParams.get('recordId')) || 0);
  // A successful retake that came from that flow returns to Book view instead
  // of staying on /live-preview. A retake started from a thumbnail on this
  // page does not navigate anywhere.
  let cameFromRecapture = $state(false);

  let cameraMode = $state<'single' | 'double'>('double');

  // Detected camera devices, reported by `CameraControls` through
  // `onDevicesChange` on mount and after every device-list refresh.
  let devices = $state<CameraDevice[]>([]);


  // Exposure values shown in the viewport's metadata bar; `CameraControls`
  // reports changes to them.
  let shutterSpeed = $state('1.6s');
  let iso = $state('200');
  let aperture = $state('13.0');

  // Per-camera capture rotation (clockwise degrees): 0 | 90 | 180 | 270
  // Default 90° — most digitisation rigs use vertical (portrait) orientation.
  // This default only holds until the device list arrives — onDevicesChange
  // below reseeds it from what the appliance actually remembers (NEH-71).
  let rotateDeg = $state<{ [cam: number]: number }>({ 0: 90, 1: 90 });

  // Which body (hardware_id) the operator manually rotated at each camera
  // index in this session — NOT reactive state: it's bookkeeping consulted
  // (and updated) alongside rotateDeg, never rendered on its own.
  let rotateTouched = new Map<number, string>();

  // Rotations changed while an index has no identified body (no device yet,
  // or one reported under a placeholder id): there is nothing to persist them
  // to, so they are kept here until the first identified body appears at the
  // index. That body takes the change unless it has a saved orientation of
  // its own, which wins (settlePendingRotations). Until then the change stays
  // on screen, so a reseed from an incomplete listing does not undo it.
  let rotatePending = new Map<number, number>();

  // PUTs of the orientation in flight, by camera index: the camera check
  // (NEH-339) holds that camera's "Turn" while one is.
  let orientationPuts = $state<Record<number, number>>({});
  let savingOrientation = $derived(
    Object.fromEntries(Object.entries(orientationPuts).map(([cam, n]) => [cam, n > 0])) as Record<number, boolean>
  );

  // Persists a rotation change to the backend, coalescing quick repeat taps
  // on the same camera into a single in-flight PUT.
  const saveOrientation = createOrientationSaver(
    (i, hw, deg) => {
      orientationPuts = { ...orientationPuts, [i]: (orientationPuts[i] ?? 0) + 1 };
      return camerasApi.setOrientation(i, hw, deg).finally(() => {
        orientationPuts = { ...orientationPuts, [i]: (orientationPuts[i] ?? 1) - 1 };
      });
    },
    (i, e) => console.error('[LivePreview] Error saving orientation:', i, e)
  );

  let projectName = $state<string>('');

  // The top bar shows the volume name next to the project. Without it the
  // operator has nothing on screen that says which volume the captures go
  // into, and a wrong volume is discovered only afterwards.
  let collectionName = $state<string>('');

  // Whether the volume has no stem (filename_stem). The backend refuses
  // every capture into such a volume, so the viewport disables capture and
  // links to the volume's form, where an operator gives it one.
  let volumeNeedsStem = $state(false);

  // The list item's notes and action. `listInstruction` is undefined when
  // the lists fail or no list has an item for this volume; the volume's
  // custom_attributes are used then. No band shows until the lists request
  // has answered or failed (0.3.0), so that notes the lists would replace,
  // such as a withdrawn volume's, never show for a moment.
  let listInstruction = $state<Instruction | null | undefined>(undefined);
  let attributesInstruction = $state<Instruction | null>(null);
  let listsSettled = $state(false);
  let instruction = $derived(
    !listsSettled ? null : listInstruction !== undefined ? listInstruction : attributesInstruction
  );
  // The banner's way to a stem: the volume form on the project page, or on
  // Volúmenes while projects are hidden (NEH-313); an operator in Fisqua
  // mode, who cannot give one, gets a note instead (NEH-311).
  let stemTarget = $derived(stemFormTarget($userRole, $unitState, projectId, collectionId));
  let stemFormHref = $derived(stemTarget.href ?? '');
  let stemNote = $derived(stemTarget.note ? $m.pd_fisqua_codes_readonly : '');

  let records = $state<ApiRecord[]>([]);
  let selectedRecordId = $state<number | null>(null);

  // The record open in `ImageViewerModal`; null when the modal is closed.
  let inspectedRecord = $state<ApiRecord | null>(null);

  let isLoading = $state(false);
  // The first load of the volume's records succeeded, so an empty list
  // means an empty volume.
  let recordsLoaded = $state(false);

  // ---------------------------------------------------------------------------
  // The recapture turn (0.2.0)
  // ---------------------------------------------------------------------------
  // Null until it arrives, and when it cannot be loaded: then nothing is
  // blocked here, and the backend still refuses what the turn forbids.
  let retakeSummary = $state<RetakeSummary | null>(null);
  // The items of the stored lists, newest list first, so that the block
  // names the volume Cola puts first.
  let queueItems = $state<QueueItem[]>([]);
  // An admin chose to capture anyway; the operator started the volume.
  let turnOverride = $state(false);
  let unlockDismissed = $state(false);

  let isAdmin = $derived($userRole === 'admin');
  let isEmptyVolume = $derived(collectionId > 0 && recordsLoaded && records.length === 0);
  let turnState = $derived(retakeSummary && retakeSummary.pendingRecords > 0 ? retakeSummary.turn.state : 'free');
  let blocked = $derived(isEmptyVolume && turnState === 'recaptures' && !turnOverride);
  let unlockShown = $derived(isEmptyVolume && turnState === 'new' && !unlockDismissed);
  let blockNext = $derived(preferredRetakeVolume(retakeSummary, queueItems));

  // Resolves whether a summary of the contract's shape is on screen from a
  // read started no earlier than this call. A failed read keeps the last one
  // for the turn's panels; the guide does not go on from it
  // (afterGuidedRetake). Of overlapping reads only the newest is assigned
  // (newestOnly, NEH-317), so an older answer never replaces a newer one.
  const readSummary = newestOnly(
    () => recordsApi.toRetakeSummary(),
    (raw) => {
      const summary = readRetakeSummary(raw);
      if (summary) retakeSummary = summary;
      return summary !== null;
    },
    (e) => console.error('[LivePreview] Error loading the recapture summary:', e)
  );
  async function loadRetakeSummary(): Promise<boolean> {
    return (await readSummary()).ok;
  }

  // The guided retake. `order` holds the volume's records to retake, by
  // sequence from the one the guide opened on; "Saltar por ahora" moves a
  // record to its back, so skipped records come back last, in the order they
  // were skipped. `retaken` counts the retakes done in the guide, and
  // `total` is the most records the guide has known to do. Null outside it.
  //
  // What is still to retake is the backend's pending: rejected, or captured
  // with a current image that still carries its rejection (prepared for
  // retake), which the records do not show. It comes from the volume's
  // `pendingRecordIds` in the summary, read again after every retake; the
  // guide goes on only from a round in which it was read.
  let guide = $state<{ order: number[]; retaken: number; total: number } | null>(null);
  // Set when nothing is left to retake: whether the turn is now `new`, and
  // another volume with retakes to go on with.
  let guideEnd = $state<{ turnNew: boolean; other: RetakeSummaryVolume | null } | null>(null);
  // The records or the summary could not be read again after a retake: the
  // guide waits, with the error and a retry, and opens nothing until both are.
  let guidePaused = $state(false);
  let guideRetrying = $state(false);
  // The folios the next record's rejection names, for the guide's footer.
  let guideNextFolios = $state<string | null>(null);

  function volumeEntry(): RetakeSummaryVolume | null {
    return retakeSummary?.volumes.find(v => v.collectionId === collectionId) ?? null;
  }

  // The volume's pending records, from the summary; none when the summary
  // does not list the volume.
  let pendingIds = $derived(volumeEntry()?.pendingRecordIds ?? []);

  function isPending(id: number): boolean {
    return pendingIds.includes(id) && records.some(r => r.id === id);
  }

  // The most records the guide has known it must retake.
  function updateGuideTotal() {
    if (!guide) return;
    guide.total = Math.max(guide.total, guide.retaken + pendingIds.length);
  }

  let guideDone = $derived(guide ? guide.retaken : 0);
  // k of "Recaptura k de N": the retakes done so far, plus the open one.
  let guidePosition = $derived(guide ? Math.min(guide.retaken + 1, guide.total) : 0);

  function openRecord(record: ApiRecord) {
    // A new record in the modal: no after-panel of the one before.
    filled = null;
    anotherError = null;
    refreshFailed = false;
    refreshing = false;
    cameraMode = record.capture_mode === 'dual' ? 'double' : 'single';
    selectedRecordId = record.id;
    inspectedRecord = record;
  }

  // Opens the next record to retake in the order. The end panel shows only
  // when the summary lists nothing pending for the volume; a pending record
  // the order lacks joins its back. The open modal stays up until one of the
  // two replaces it, so that capture stays blocked in between.
  async function advanceGuide() {
    if (!guide) return;
    const pending = pendingIds.filter(id => records.some(r => r.id === id));
    if (pending.length > 0) {
      const missing = pending.filter(id => !guide!.order.includes(id));
      if (missing.length > 0) guide.order = [...guide.order, ...missing];
      updateGuideTotal();
      const nextId = guideNextId(guide.order, isPending);
      const next = nextId === null ? undefined : records.find(r => r.id === nextId);
      if (next) openRecord(next);
      return;
    }
    guideEnd = {
      turnNew: retakeSummary?.turn.state === 'new',
      other: retakeSummary?.volumes.find(v => v.collectionId !== collectionId) ?? null
    };
    inspectedRecord = null;
    guide = null;
  }

  // After a successful retake in the guide: read the records and the
  // summary again, then go on. If either read fails the guide pauses, and
  // goes on only after a round in which both were read, so that it never
  // takes the summary from before the retake (and its first pending record)
  // as current.
  async function afterGuidedRetake() {
    if (!guide) return;
    guide.retaken += 1;
    const [loaded, summarised] = await Promise.all([loadRecords(), loadRetakeSummary()]);
    if (!loaded || !summarised) {
      guidePaused = true;
      inspectedRecord = null;
      return;
    }
    await advanceGuide();
  }

  async function retryGuide() {
    if (guideRetrying) return;
    guideRetrying = true;
    try {
      const [loaded, summarised] = await Promise.all([loadRecords(), loadRetakeSummary()]);
      if (!loaded || !summarised) return;
      guidePaused = false;
      await advanceGuide();
    } finally {
      guideRetrying = false;
    }
  }

  function skipGuided() {
    if (!guide || !inspectedRecord || filled || anotherBusy || leaving) return;
    guide.order = deferToBack(guide.order, inspectedRecord.id);
    advanceGuide();
  }

  function closeInspected() {
    if (anotherBusy || leaving) return;
    // Out of the after-panel: on as "That was the last one" goes.
    if (filled) {
      continueAfterCapture();
      return;
    }
    inspectedRecord = null;
    guide = null;
  }

  // ---------------------------------------------------------------------------
  // Capturing into a placeholder (NEH-317)
  // ---------------------------------------------------------------------------
  // Set once the placeholder open in the modal is filled: which placeholder,
  // and the record filled last, after which "Capture another here" inserts
  // the next one.
  let filled = $state<{ holeId: number; lastId: number } | null>(null);
  let anotherBusy = $state(false);
  let anotherError = $state<string | null>(null);
  let closingPlaceholder = $state(false);
  // The records could not be read again after a fill or an insertion: the
  // panel cannot say where the next opening goes, so "Capture another here"
  // waits for a successful retry. The record filled last is kept.
  let refreshFailed = $state(false);
  let refreshing = $state(false);

  // Each refresh belongs to the fill it started from (`filled`): if the
  // operator has moved on meanwhile, its result is dropped, so a slow read
  // never marks the next placeholder's panel as stale.
  async function refreshAfterFill() {
    const from = filled;
    const ok = await loadRecords();
    if (filled === from) refreshFailed = !ok;
  }

  async function retryRefresh() {
    if (refreshing) return;
    const from = filled;
    refreshing = true;
    try {
      await refreshAfterFill();
    } finally {
      if (filled === from) refreshing = false;
    }
  }

  // Shared with LiveViewport (bound): whether camera 1 takes the left page.
  let swapped = $state(false);
  // Counts the captures made here rather than in LiveViewport (retakes and
  // placeholders). LiveViewport clears the last capture it shows on each, as
  // such a capture may have superseded it (NEH-334).
  let pageCaptures = $state(0);
  // True while one of the captures made here is in flight, so LiveViewport
  // asks the cameras for no preview frame meanwhile (NEH-334).
  let pageCapturing = $state(false);
  let leftCameraIndex = $derived(swapped ? 1 : 0);

  // ---------------------------------------------------------------------------
  // The focus check (NEH-339)
  // ---------------------------------------------------------------------------
  // Set once the capabilities report DSLR settings; only then is there a
  // "Refocus" button and an automatic check.
  let dslrUnit = $state(false);
  let refocusOpen = $state(false);
  // The camera check (NEH-339), opened from the top bar.
  let cameraCheckOpen = $state(false);
  // True while LiveViewport's own capture is in flight (bound from it).
  let viewportCapturing = $state(false);

  // ---------------------------------------------------------------------------
  // Which camera is which (NEH-343)
  // ---------------------------------------------------------------------------
  // The last answer from GET /cameras/setup; null until one arrives.
  let cameraSetup = $state<CameraSetup | null>(null);
  let setupNeeded = $derived(cameraSetup?.needs_setup === true);
  // The first read of the set-up has settled, answered or failed. Until it
  // has, capture is held as while set-up is needed, with nothing on screen.
  let setupAnswered = $state(false);
  let captureHeld = $derived(setupNeeded || !setupAnswered);
  // "Change which camera is which", from the camera check.
  let whichByHand = $state(false);
  // The bodies of the last device listing, to ask again when they change.
  let lastHardwareKey: string | null = null;

  const readSetup = newestOnly(
    () => camerasApi.getSetup(),
    (setup) => {
      cameraSetup = setup;
      setupAnswered = true;
      return true;
    },
    (e) => {
      // Capture must not depend on the health of this route.
      setupAnswered = true;
      console.error('[LivePreview] Error reading the camera set-up:', e);
    }
  );
  async function checkSetup(): Promise<void> {
    await readSetup();
  }

  // The latest device rows, with their roles: CameraControls' listings,
  // the step's rescan, and the rows a save returns.
  let roleDevices = $state<CameraDevice[]>([]);
  // The left camera the saved roles decide; null when they decide nothing.
  let rolesLeft = $derived(leftIndexFromRoles(roleDevices, cameraSetup));
  // The only place `swapped` follows the roles. The manual control is
  // hidden meanwhile, so nothing else writes it.
  $effect(() => {
    if (rolesLeft !== null) swapped = rolesLeft === 1;
  });

  // The roles were saved: back to where the operator was.
  function rolesSaved(answer: CameraRolesResponse) {
    if (Array.isArray(answer.devices) && answer.devices.length > 0) roleDevices = answer.devices;
    cameraSetup = answer.setup;
    whichByHand = false;
  }
  // Set once the first load has settled (records, volume, recapture summary,
  // and the retake modal of a `recordId`), so the check never opens before
  // the screen knows whether something else is on it.
  let screenSettled = $state(false);
  // Something that must be dealt with first: any open dialog, wherever it
  // comes from (the registry in src/lib/dialog.ts, which every dialog joins
  // through `dismissible` or `trapFocus`), the recapture-turn block panel,
  // the guide's pause or end panel; or a capture in flight. The check waits
  // until none shows.
  let focusCheckWaits = $derived(
    !screenSettled || $dialogOpen || blocked || guidePaused || guideEnd !== null ||
      viewportCapturing || pageCapturing || cameraCheckOpen
  );

  function askForFocusIfDue() {
    if (!dslrUnit || refocusOpen || focusCheckWaits) return;
    if (focusCheckNeeded(authStore.getUser()?.id, Date.now())) refocusOpen = true;
  }

  function noteFocusActivity() {
    recordFocusActivity(authStore.getUser()?.id, Date.now());
  }

  // Completed or skipped, the check counts as done for the next 15 minutes.
  function closeRefocus() {
    refocusOpen = false;
    noteFocusActivity();
  }

  // On the first settle, once the capabilities report DSLR settings, and
  // whenever what it waits for has gone (the last dialog closing included),
  // the check opens if it is still due. It asks after the update has been
  // applied, so that a dialog mounted in the same update has registered.
  $effect(() => {
    if (!dslrUnit || focusCheckWaits) return;
    void tick().then(() => untrack(askForFocusIfDue));
  });

  onMount(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        askForFocusIfDue();
        void checkSetup();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    // The first answer ends the capture hold, whether the devices load or not.
    void checkSetup();
    return () => document.removeEventListener('visibilitychange', onVisibility);
  });

  // Left, right, then images without a role.
  function sideOrder(role?: string | null): number {
    return role === 'left' ? 0 : role === 'right' ? 1 : 2;
  }

  function isOpenPlaceholder(record: ApiRecord): boolean {
    return record.missing_side === 'both' && !record.closed_reason;
  }

  // The volume's records in their order, for the neighbours of a placeholder.
  let ordered = $derived(
    [...records].sort((a, b) => (a.sequence ?? Infinity) - (b.sequence ?? Infinity) || a.id - b.id)
  );
  // The slot the panel describes: around the placeholder, or, once it is
  // filled, right after the record filled last.
  let neighbours = $derived.by(() => {
    if (filled) {
      const last = filled.lastId;
      const i = ordered.findIndex(r => r.id === last);
      return { prev: i >= 0 ? ordered[i] : null, next: i >= 0 && i < ordered.length - 1 ? ordered[i + 1] : null };
    }
    const cur = inspectedRecord;
    const i = cur ? ordered.findIndex(r => r.id === cur.id) : -1;
    return {
      prev: i > 0 ? ordered[i - 1] : null,
      next: i >= 0 && i < ordered.length - 1 ? ordered[i + 1] : null,
    };
  });
  // The sequence of the record the opening goes after.
  let afterSequence = $derived(
    neighbours.prev?.sequence ?? Math.max(0, (inspectedRecord?.sequence ?? 1) - 1)
  );

  // Set while the screen goes on from a record (continueAfterCapture): the
  // modal stays locked, and a filled placeholder keeps its after-panel with
  // no Capture, until the guide has opened the next record, paused or ended,
  // or the page has left.
  let leaving = $state(false);

  // After a retake, or once a placeholder is done with: the guide's next
  // record, or back where the operator came from, or the records again.
  async function continueAfterCapture() {
    if (leaving) return;
    leaving = true;
    try {
      if (guide) {
        await afterGuidedRetake();
        return;
      }

      // The modal stays mounted, and so locked, until the screen has moved
      // on: while it is open LiveViewport takes no capture (otherModalOpen).
      // Coming from "Recapture image" in Book view (NEH-209), go back there
      // instead of staying on /live-preview: the retake is finished, and the
      // operator sees the result right where they asked for it. A retake
      // started from a thumbnail on this page does not navigate anywhere.
      // A navigation that fails falls back to reading the records and the
      // summary in place: the capture itself succeeded.
      try {
        if (cameFromRecapture && projectId && collectionId) {
          try {
            await goto(`/dashboard/projects/${projectId}/collections/${collectionId}`);
            return;
          } catch (error) {
            console.error('[LivePreview] Error going back to the volume:', error);
          }
        }
        await Promise.all([loadRecords(), loadRetakeSummary()]);
      } finally {
        inspectedRecord = null;
      }
    } finally {
      // Released whatever happened, a failed reload included.
      leaving = false;
      filled = null;
      anotherError = null;
      refreshFailed = false;
      refreshing = false;
    }
  }

  // Another opening is missing at the same place: a dual capture inserted
  // right after the record just filled, which the next one follows in turn.
  async function captureAnother() {
    const start = filled;
    if (!start || anotherBusy || leaving || refreshFailed || refreshing) return;
    if (volumeNeedsStem) {
      anotherError = $m.lv_needs_stem;
      return;
    }
    if (captureHeld) {
      anotherError = $m.camwhich_needed;
      return;
    }
    anotherBusy = true;
    anotherError = null;
    try {
      // The same fields as LiveViewport's capture, inserted after the record filled last.
      let result;
      pageCapturing = true;
      try {
        result = await camerasApi.captureDual({
          project_name: projectName,
          collection_id: collectionId ?? undefined,
          record_title: defaultRecordTitle(),
          afterRecordId: start.lastId,
          left_camera_index: leftCameraIndex,
          rotate_deg_cam0: rotateDeg[0] ?? 0,
          rotate_deg_cam1: rotateDeg[1] ?? 0,
        });
      } finally {
        pageCapturing = false;
      }
      if (!result.success) throw new CaptureFailed(result.error);
      pageCaptures += 1;
      noteFocusActivity();
      // Only if the screen is still where the capture started.
      if (result.record_id != null && filled === start) {
        filled = { holeId: start.holeId, lastId: result.record_id };
        await refreshAfterFill();
      }
    } catch (error) {
      console.error('[LivePreview] Error capturing another opening:', error);
      anotherError = captureErrorText(error, $m);
    } finally {
      anotherBusy = false;
    }
  }

  function handlePlaceholderClosed() {
    closingPlaceholder = false;
    continueAfterCapture();
  }

  $effect(() => {
    const g = guide;
    const current = inspectedRecord;
    guideNextFolios = null;
    if (!g || !current) return;
    const nextId = guideNextId(g.order, isPending, current.id);
    if (nextId === null) return;
    let stale = false;
    recordsApi
      .listRejections(nextId)
      .then(list => { if (!stale) guideNextFolios = folioHint(list[0]?.comment); })
      .catch(e => console.error('[LivePreview] Error loading the next rejection:', e));
    return () => { stale = true; };
  });

  // How many of the next records to retake have their thumbnails loaded ahead.
  const PRELOAD_NEXT = 2;
  // Thumbnail URLs already asked for, so that a record is not loaded twice.
  const preloadedThumbs = new Set<string>();

  $effect(() => {
    const g = guide;
    const current = inspectedRecord;
    if (!g || !current) return;
    const nextIds = g.order.filter(id => id !== current.id && isPending(id)).slice(0, PRELOAD_NEXT);
    for (const id of nextIds) {
      for (const img of records.find(r => r.id === id)?.images ?? []) {
        const url = recordsApi.getImageThumbnailUrl(img.id);
        if (preloadedThumbs.has(url)) continue;
        preloadedThumbs.add(url);
        new Image().src = url;
      }
    }
  });

  onMount(async () => {
    ensureUnit();
    // The capture screen is for admin and operator only. A reviewer cannot
    // trigger captures or delete (the backend answers 403 in
    // cameras.py/records.py), and this route sits outside the (dashboard)
    // group, so it checks the role itself (NEH-66).
    if (!authStore.requireSession(['admin', 'operator'])) {
      return;
    }

    // Not one of `tasks`: nothing waits for the focus check.
    camerasApi.getCapabilities()
      .then(caps => {
        dslrUnit = caps?.dslr_settings === true;
      })
      .catch(e => console.error('[LivePreview] Error loading camera capabilities:', e));

    const tasks: Promise<void>[] = [];

    if (projectId) {
      tasks.push(
        projectsApi.get(projectId)
          .then(p => { projectName = p.name; })
          .catch(e => console.error('[LivePreview] Error loading project:', e))
      );
    }

    if (collectionId) {
      tasks.push(loadRecords().then(() => {}));
      tasks.push(
        collectionsApi.get(collectionId)
          .then(c => {
            collectionName = c.name;
            volumeNeedsStem = needsStem(c);
            attributesInstruction = captureInstruction(c.custom_attributes);
          })
          .catch(e => console.error('[LivePreview] Error loading volume:', e))
      );
      // Not one of `tasks`: the band can arrive late, and the retake modal
      // below (NEH-209) must never wait for the lists.
      importsApi.lists()
        .then(lists => {
          listInstruction = instructionForVolume(lists, collectionId);
          queueItems = lists.flatMap(l => l.items);
        })
        .catch(e => console.error('[LivePreview] Error loading digitisation lists:', e))
        .finally(() => { listsSettled = true; });
    }

    // Not one of `tasks` either: the retake modal must not wait for it.
    const summaryLoad = collectionId ? loadRetakeSummary() : Promise.resolve(false);

    await Promise.all(tasks);

    // With a `recordId` (NEH-209, Book view's "Recapture image" button), open
    // its retake modal directly and set the camera mode to the record's
    // actual `capture_mode`. Otherwise a dual record with `cameraMode` at
    // 'single' (or the reverse) would trip the backend's mode-mismatch guard
    // in cameras.py.
    if (recordId) {
      const target = records.find(r => r.id === recordId);
      if (target) {
        openRecord(target);
        cameFromRecapture = true;
        // A record the summary lists as pending starts the guide through the
        // volume's others, in the summary's order. Without the summary the
        // modal opens as a single retake.
        const summarised = await summaryLoad;
        if (summarised && isPending(target.id) && inspectedRecord?.id === target.id) {
          const order = guideOrder(pendingIds.filter(id => records.some(r => r.id === id)), target.id);
          guide = { order, retaken: 0, total: order.length };
        }
      }
    }
    // The recapture turn decides whether the block panel shows.
    await summaryLoad;
    screenSettled = true;
  });

  // Resolves whether the records on screen come from a read started no
  // earlier than this call. Of overlapping reads (after a capture, a retry,
  // the guide moving on) only the newest is assigned (newestOnly, NEH-317):
  // an older answer is discarded whoever asked for it, so a slow read never
  // puts an older snapshot over a newer one.
  let loadsInFlight = 0;
  const readRecords = newestOnly(
    () => recordsApi.listAll({ collection_id: collectionId }),
    (data) => {
      records = data;
      recordsLoaded = true;
      if (data.length > 0 && !selectedRecordId) {
        selectedRecordId = data[0].id;
      }
      return true;
    },
    (error) => console.error('[LivePreview] Error loading records:', error)
  );
  async function loadRecords(): Promise<boolean> {
    loadsInFlight++;
    isLoading = true;
    try {
      return (await readRecords()).ok;
    } finally {
      isLoading = --loadsInFlight > 0;
    }
  }

  // Captures are reviewed in the volume view.
  function handleGoToReview() {
    goto(`/dashboard/projects/${projectId}/collections/${collectionId}`);
  }

  async function handleCaptureDone() {
    noteFocusActivity();
    await loadRecords();
  }

  function handleBack() {
    if (projectId && collectionId) {
      goto(`/dashboard/projects/${projectId}/collections/${collectionId}`);
    } else {
      goto('/');
    }
  }

  // Reads the volume again after a capture 409, and records whether it has
  // no stem. Resolves true when that is why the backend refused. The turn is
  // read again too, as a 409 may be the recapture turn's.
  async function recheckStem(): Promise<boolean> {
    loadRetakeSummary();
    try {
      const c = await collectionsApi.get(collectionId);
      volumeNeedsStem = needsStem(c);
    } catch (e) {
      console.error('[LivePreview] Error loading volume:', e);
    }
    return volumeNeedsStem;
  }

  // Retake of a record from the image modal. When the record is 'rejected'
  // and a new capture arrives with the same `record_id`, the backend
  // (cameras.py, NEH-208) keeps the previous images as history: it marks them
  // `is_current=false` instead of deleting them, so they remain available
  // for audit through `GET /records/{id}/rejections`. The frontend must NOT
  // delete them itself (NEH-209).
  async function handleRetake(record: ApiRecord) {
    // The modal shows a thrown error's message; this one is the catalogue's.
    if (volumeNeedsStem) throw new Error($m.lv_needs_stem);
    if (captureHeld) throw new Error($m.camwhich_needed);
    try {
      await retake(record);
    } catch (error) {
      console.error('[LivePreview] Error during retake:', error);
      if (isConflict(error) && (await recheckStem())) throw new Error($m.lv_needs_stem);
      // The backend's text is English; the modal shows the catalogue's.
      throw new Error(captureErrorText(error, $m));
    }
  }

  async function retake(record: ApiRecord) {
    let result;
    // A placeholder is a whole opening, closed or not: only a dual capture
    // fills it. An open one gets the after-panel.
    const hole = isOpenPlaceholder(record);
    pageCapturing = true;
    try {
      if (cameraMode === 'double' || record.missing_side === 'both') {
        result = await camerasApi.captureDual({
          project_name: projectName,
          collection_id: collectionId ?? undefined,
          record_id: record.id,
          // The roles of the new images: the same camera on the left as in the viewport.
          left_camera_index: leftCameraIndex,
          rotate_deg_cam0: rotateDeg[0] ?? 0,
          rotate_deg_cam1: rotateDeg[1] ?? 0,
        });
      } else {
        result = await camerasApi.capture({
          project_name: projectName,
          camera_index: 0,
          collection_id: collectionId ?? undefined,
          record_id: record.id,
          rotate_deg: rotateDeg[0] ?? 0,
        });
      }
    } finally {
      pageCapturing = false;
    }

    if (!result.success) {
      throw new CaptureFailed(result.error);
    }
    pageCaptures += 1;
    noteFocusActivity();

    // A placeholder filled: the modal stays, and asks whether another
    // opening is missing there (NEH-317).
    if (hole) {
      // Only if the modal still shows that placeholder.
      if (inspectedRecord?.id === record.id && filled === null) {
        filled = { holeId: record.id, lastId: record.id };
        await refreshAfterFill();
      }
      return;
    }

    // In the guide, the next rejected record opens instead (0.2.0).
    // The modal stays open, its retake still running, until the next state
    // is on screen: LiveViewport takes no capture meanwhile.
    await continueAfterCapture();
  }

  // The only writer of `rotateDeg` (NEH-71): both the controls panel and the
  // `LiveViewport` overlay call this function, so there are never two copies
  // of the value drifting apart. If the index has no identified body (it was
  // disconnected, the mode is single and the right camera is selected, or the
  // body is reported under a placeholder id), only the local state changes,
  // and the change waits in `rotatePending` until a body is identified there.
  // Every device listing, from CameraControls: reseeds the rotations, and
  // asks for the camera set-up on the first listing and whenever the bodies
  // listed change (NEH-343).
  function applyDevices(d: CameraDevice[]) {
    devices = d;
    roleDevices = d;
    const seeded = seedRotation(rotateDeg, d, rotateTouched);
    const settled = settlePendingRotations(rotatePending, d);
    rotatePending = settled.remaining;
    rotateDeg = { ...seeded.rotation, ...Object.fromEntries(settled.remaining) };
    rotateTouched = seeded.touched;
    // Applied through the single writer so the change counts as touched
    // and is saved against the body now identified at that index.
    for (const [cam, deg] of settled.apply) handleRotateDegChange(cam, deg);
    const key = hardwareKey(d);
    if (key !== lastHardwareKey) {
      lastHardwareKey = key;
      void checkSetup();
    }
  }

  function handleRotateDegChange(cam: number, deg: number) {
    const device = devices.find(d => d.index === cam);
    if (!canSaveRotation(device)) {
      rotateDeg = { ...rotateDeg, [cam]: deg };
      rotatePending.set(cam, deg);
      return;
    }
    rotatePending.delete(cam);
    rotateTouched.set(cam, device.hardware_id);
    rotateDeg = { ...rotateDeg, [cam]: deg };
    saveOrientation(cam, device.hardware_id, deg);
  }
</script>

<!-- Full screen, without the dashboard sidebar -->
<div class="live-preview-wrapper">

  <!-- No project name while the unit hides projects (NEH-313). -->
  <TopBar
    projectName={projectsShownIn($unitState) ? projectName : ''}
    {collectionName}
    onBack={handleBack}
    onGoToReview={handleGoToReview}
    onCheckCameras={() => {
      if (viewportCapturing || pageCapturing) return;
      cameraCheckOpen = true;
      void checkSetup();
    }}
    checkCamerasDisabled={pageCapturing || viewportCapturing}
  />

  <CaptureInstruction {instruction} />

  {#if unlockShown && retakeSummary}
    <section class="turn-unlock" aria-labelledby="turn-unlock-title">
      <span class="material-symbols-outlined turn-unlock-icon" aria-hidden="true">check</span>
      <div class="turn-unlock-text">
        <h2 id="turn-unlock-title" class="turn-unlock-title">{$m.unlock_title}</h2>
        {#if retakeSummary.turn.unlockedBy}
          <p class="turn-unlock-body">{$m.unlock_body(retakeSummary.turn.unlockedBy.name)}</p>
        {/if}
      </div>
      <button class="btn btn-primary btn-lg" onclick={() => (unlockDismissed = true)}>{$m.unlock_cta}</button>
    </section>
  {/if}

  {#if guidePaused}
    <div class="turn-stage">
      <section class="guide-end guide-paused" aria-labelledby="guide-paused-title">
        <span class="material-symbols-outlined guide-paused-icon" aria-hidden="true">error</span>
        {#if collectionName}<p class="guide-end-volume">{collectionName}</p>{/if}
        <p id="guide-paused-title" class="guide-end-title" role="alert">{$m.retakes_load_error}</p>
        <div class="turn-actions">
          <button class="btn btn-recapture btn-lg" disabled={guideRetrying} onclick={retryGuide}>{$m.common_retry}</button>
        </div>
      </section>
    </div>
  {:else if guideEnd}
    <div class="turn-stage">
      <section class="guide-end" aria-labelledby="guide-end-title">
        <span class="material-symbols-outlined guide-end-icon" aria-hidden="true">check_circle</span>
        {#if collectionName}<p class="guide-end-volume">{collectionName}</p>{/if}
        <h2 id="guide-end-title" class="guide-end-title">{$m.guide_done(guideEnd.turnNew)}</h2>
        <div class="turn-actions">
          <a class="btn btn-primary btn-lg" href="/dashboard/queue">{$m.guide_done_queue}</a>
          {#if guideEnd.other}
            <!-- Another volume on the same route: a full load, so the page reads its new address. -->
            <a class="btn btn-recapture btn-lg" data-sveltekit-reload href={retakeUrl(guideEnd.other.projectId, guideEnd.other.collectionId, guideEnd.other.firstPendingRecordId)}>{$m.guide_done_more}</a>
          {/if}
        </div>
      </section>
    </div>
  {:else if blocked}
    <div class="turn-stage">
      <section class="turn-block" aria-labelledby="turn-block-title">
        <div class="turn-block-head">
          <span class="material-symbols-outlined turn-block-icon" aria-hidden="true">lock</span>
          <h2 id="turn-block-title" class="turn-block-title">{$m.block_title}</h2>
        </div>
        <p class="turn-block-body">{$m.block_body}</p>
        {#if blockNext}
          <p class="turn-block-next">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
            <span>{$m.block_next(blockNext.name, blockNext.pending)}</span>
          </p>
        {/if}
        <div class="turn-actions">
          {#if blockNext}
            <!-- Another volume on the same route: a full load, so the page reads its new address. -->
            <a class="btn btn-recapture btn-lg" data-sveltekit-reload href={retakeUrl(blockNext.projectId, blockNext.collectionId, blockNext.firstPendingRecordId)}>{$m.block_cta(blockNext.name)}</a>
          {/if}
          <a class="btn btn-ghost btn-lg" href="/dashboard/queue">{$m.block_back}</a>
          {#if isAdmin}
            <button class="btn btn-ghost turn-block-admin" onclick={() => (turnOverride = true)}>{$m.block_admin}</button>
          {/if}
        </div>
      </section>
    </div>
  {:else}
    <div class="content-area">

      <CameraControls
        {cameraMode}
        {shutterSpeed}
        {iso}
        {aperture}
        onCameraModeChange={(m) => cameraMode = m}
        onShutterSpeedChange={(v) => shutterSpeed = v}
        onIsoChange={(v) => iso = v}
        onApertureChange={(v) => aperture = v}
        onDevicesChange={applyDevices}
        onRotateDegChange={handleRotateDegChange}
        {rotateDeg}
        onRescan={() => void checkSetup()}
      />

      <div class="center-column">

        <LiveViewport
          {cameraMode}
          {shutterSpeed}
          {iso}
          {aperture}
          {projectId}
          {projectName}
          {collectionId}
          {devices}
          {rotateDeg}
          onCaptureDone={handleCaptureDone}
          onRotateDegChange={handleRotateDegChange}
          otherModalOpen={inspectedRecord !== null || refocusOpen || cameraCheckOpen || setupNeeded || whichByHand}
          captureBlocked={captureHeld}
          swapLocked={rolesLeft !== null}
          needsStem={volumeNeedsStem}
          {stemFormHref}
          {stemNote}
          onStemRefused={recheckStem}
          {pageCaptures}
          {pageCapturing}
          onRefocus={dslrUnit ? () => { if (!viewportCapturing && !pageCapturing) refocusOpen = true; } : undefined}
          bind:swapped
          bind:capturing={viewportCapturing}
        />

        <div class="thumbnail-area">
          <ThumbnailStrip
            {records}
            {selectedRecordId}
            {cameraMode}
            onSelect={(record) => { filled = null; refreshFailed = false; refreshing = false; selectedRecordId = record.id; inspectedRecord = record; }}
          />
        </div>

      </div>

    </div>
  {/if}

</div>

{#snippet guideBar(retaking: boolean)}
  {#if guide && inspectedRecord}
    {@const total = guide.total}
    <div class="lv-guide">
      <p class="lv-guide-title" id="lv-guide-title">{$m.guide_header(guidePosition, total, collectionName)}</p>
      <div class="lv-guide-progress" role="progressbar" aria-labelledby="lv-guide-title" aria-valuemin="0" aria-valuemax={total} aria-valuenow={guideDone}>
        <span style="width: {total > 0 ? (guideDone / total) * 100 : 0}%"></span>
      </div>
      <div class="lv-guide-row">
        <button class="btn btn-ghost" disabled={retaking || filled !== null || anotherBusy || leaving} onclick={skipGuided}>{$m.guide_skip}</button>
        {#if guideNextFolios}<span class="lv-guide-next">{$m.guide_next(guideNextFolios)}</span>{/if}
      </div>
    </div>
  {/if}
{/snippet}

{#snippet neighbourSpread(record: ApiRecord)}
  <div class="ph-spread">
    <div class="ph-pages">
      <!-- Left before right, then images without a role, as the grid and the strip. -->
      {#each [...(record.images ?? [])].sort((a, b) => sideOrder(a.role) - sideOrder(b.role) || a.id - b.id) as img (img.id)}
        <img class="ph-thumb" src={recordsApi.getImageThumbnailUrl(img.id)} alt="" draggable="false" />
      {/each}
    </div>
    {#if record.sequence != null}<span class="ph-caption">{$m.retakes_sequence(record.sequence)}</span>{/if}
  </div>
{/snippet}

{#snippet placeholderPanel(retaking: boolean)}
  {#if inspectedRecord}
    {@const hole = inspectedRecord}
    <div class="ph-panel">
      {#if !refreshFailed}
      <h2 class="ph-title">{$m.cap_title(null, afterSequence)}</h2>

      <div class="ph-where" role="group" aria-labelledby="ph-where-label">
        <span class="ph-label" id="ph-where-label">{$m.cap_where}</span>
        <div class="ph-row">
          {#if neighbours.prev}{@render neighbourSpread(neighbours.prev)}{/if}
          <div class="ph-spread ph-this">
            <div class="ph-pages">
              <div class="ph-empty"><MissingPage side="left" /></div>
              <div class="ph-empty"><MissingPage side="right" /></div>
            </div>
            {#if !filled && hole.sequence != null}<span class="ph-caption">{$m.retakes_sequence(hole.sequence)}</span>{/if}
          </div>
          {#if neighbours.next}{@render neighbourSpread(neighbours.next)}{/if}
        </div>
      </div>
      {/if}

      {#if hole.missing_note || hole.missing_expected}
        <div class="ph-note">
          {#if hole.missing_request_id}<span class="ph-label">{$m.cap_from_review}</span>{/if}
          {#if hole.missing_note}<p class="ph-note-text">{hole.missing_note}</p>{/if}
          {#if hole.missing_expected}<p class="ph-expected">{hole.missing_expected}</p>{/if}
        </div>
      {/if}

      {#if filled}
        <section class="ph-after" aria-labelledby="ph-after-label">
          <span class="ph-label" id="ph-after-label">{$m.cap_after}</span>
          <p class="ph-after-q" role="status">{$m.cap_another_q(null)}</p>
          {#if anotherError}<p class="ph-error" role="alert">{$m.lvm_retake_error(anotherError)}</p>{/if}
          {#if refreshFailed}
            <p class="ph-error" role="alert">{$m.cap_refresh_error}</p>
          {/if}
          <div class="ph-actions">
            {#if refreshFailed}
              <button class="btn btn-secondary" disabled={refreshing || leaving} onclick={retryRefresh}>{$m.common_retry}</button>
            {/if}
            <button class="btn btn-recapture" disabled={anotherBusy || leaving || refreshFailed || refreshing} onclick={captureAnother}>{$m.cap_another}</button>
            <button class="btn btn-secondary" disabled={anotherBusy || leaving} onclick={continueAfterCapture}>{$m.cap_last}</button>
          </div>
        </section>
      {/if}

      {#if !refreshFailed}<p class="ph-order">{$m.cap_order_note(afterSequence, null)}</p>{/if}

      {#if !filled}
        <button class="ph-nothing" disabled={retaking || leaving} onclick={() => (closingPlaceholder = true)}>{$m.cap_nothing_link}</button>
      {/if}
    </div>
  {/if}
{/snippet}

{#if inspectedRecord}
  <!-- Keyed, so that the next record of the guide opens with a fresh modal. -->
  {#key inspectedRecord.id}
    <ImageViewerModal
      record={inspectedRecord}
      {cameraMode}
      onClose={closeInspected}
      onRetake={handleRetake}
      guide={guide ? guideBar : undefined}
      pending={pendingIds.includes(inspectedRecord.id)}
      placeholder={placeholderPanel}
      offerCapture={filled === null && !leaving}
      busy={anotherBusy || leaving}
    />
  {/key}
{/if}

{#if refocusOpen}
  <RefocusModal leftIndex={leftCameraIndex} onClose={closeRefocus} />
{/if}

{#if cameraCheckOpen}
  <CameraCheck
    leftIndex={leftCameraIndex}
    projectName={projectsShownIn($unitState) ? projectName : ''}
    {collectionName}
    {rotateDeg}
    onRotateDegChange={handleRotateDegChange}
    {savingOrientation}
    onClose={() => (cameraCheckOpen = false)}
    onRefocusClosed={noteFocusActivity}
    onChangeRoles={() => (whichByHand = true)}
    covered={setupNeeded || whichByHand}
  />
{/if}

{#if setupNeeded || whichByHand}
  <WhichCamera
    setup={cameraSetup}
    cancellable={!setupNeeded}
    projectName={projectsShownIn($unitState) ? projectName : ''}
    {collectionName}
    {rotateDeg}
    onRotateDegChange={handleRotateDegChange}
    {savingOrientation}
    onSaved={rolesSaved}
    onCancel={() => (whichByHand = false)}
    onReread={checkSetup}
    onLeave={handleBack}
    onDevices={applyDevices}
  />
{/if}

{#if closingPlaceholder && inspectedRecord}
  <CloseMissingDialog
    record={inspectedRecord}
    onCancel={() => (closingPlaceholder = false)}
    onClosed={handlePlaceholderClosed}
  />
{/if}

<style>
  /* ── The recapture turn (0.2.0) ── */
  .turn-stage {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    overflow-y: auto;
    background: repeating-linear-gradient(135deg, var(--color-bg) 0 22px, var(--color-surface) 22px 44px);
  }
  .turn-block,
  .guide-end {
    width: min(720px, 100%);
    box-sizing: border-box;
    padding: 32px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    background-color: var(--color-surface);
    border-radius: var(--radius-xl);
  }
  .turn-block { border: 2px solid var(--color-highlight); }
  .turn-block-head { display: flex; align-items: center; gap: 14px; }
  .turn-block-icon { font-size: 40px; color: var(--color-highlight); }
  .turn-block-title { margin: 0; font-size: var(--text-h2); font-weight: var(--fw-black); color: var(--color-light); }
  .turn-block-body { margin: 0; font-size: var(--text-lead); line-height: 1.5; color: var(--color-light); }
  .turn-block-next {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 0;
    padding: 14px 16px;
    border-radius: var(--radius-md);
    background-color: var(--color-surface-alt-2);
    border: 1px solid rgba(225, 183, 120, 0.5);
    font-size: var(--text-base);
    line-height: 1.5;
    color: var(--color-light);
  }
  .turn-block-next svg { flex-shrink: 0; color: var(--color-highlight); }
  .turn-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
  .turn-block-admin { margin-left: auto; border-style: dashed; color: var(--color-light-grey); }

  .turn-unlock {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px 20px;
    padding: 16px 24px;
    background-color: var(--color-success-bg);
    border-bottom: 2px solid var(--color-success);
    flex-shrink: 0;
  }
  .turn-unlock-icon { font-size: 32px; color: var(--color-success); }
  .turn-unlock-text { flex: 1; min-width: 16rem; display: flex; flex-direction: column; gap: 4px; }
  .turn-unlock-title { margin: 0; font-size: var(--text-lead); font-weight: var(--fw-extrabold); color: var(--color-light); }
  .turn-unlock-body { margin: 0; font-size: var(--text-base); line-height: 1.5; color: var(--color-light); }

  .guide-end { align-items: center; text-align: center; border: 1px solid var(--border-color); border-top: 3px solid var(--color-success); }
  .guide-end-icon { font-size: 56px; color: var(--color-success); }
  .guide-end-volume { margin: 0; font-size: var(--text-sm); font-weight: var(--fw-bold); color: var(--color-light-grey); }
  .guide-end-title { margin: 0; font-size: var(--text-h3); font-weight: var(--fw-extrabold); line-height: 1.3; color: var(--color-light); }
  .guide-end .turn-actions { justify-content: center; }
  .guide-paused { border-top-color: var(--color-error); }
  .guide-paused-icon { font-size: 56px; color: var(--color-error); }

  /* The guide inside the retake modal. */
  .lv-guide {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 16px;
    border-bottom: 2px solid var(--color-highlight);
    flex-shrink: 0;
  }
  .lv-guide-title { margin: 0; font-size: var(--text-lead); font-weight: var(--fw-extrabold); color: var(--color-light); }
  .lv-guide-progress { height: 8px; border-radius: var(--radius-full); background-color: var(--color-surface-alt-2); overflow: hidden; }
  .lv-guide-progress span { display: block; height: 100%; background-color: var(--color-highlight); }
  .lv-guide-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
  .lv-guide-next { margin-left: auto; font-size: var(--text-sm); color: var(--color-light-grey); }

  /* Capturing into a placeholder (NEH-317). */
  .ph-panel {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
  }
  .ph-title { margin: 0; font-size: var(--text-h3); font-weight: var(--fw-extrabold); color: var(--color-light); }
  .ph-label {
    font-size: var(--text-xs);
    font-weight: var(--fw-bold);
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--color-light-grey);
  }
  .ph-where { display: flex; flex-direction: column; gap: 8px; }
  .ph-row { display: flex; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
  .ph-spread { display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .ph-pages { display: flex; gap: 4px; height: 140px; }
  .ph-thumb { height: 100%; width: auto; max-width: 110px; object-fit: contain; border-radius: var(--radius-sm); background-color: var(--color-surface-alt); }
  .ph-empty { width: 105px; height: 100%; }
  .ph-this .ph-pages { padding: 4px; border: 1px dashed var(--color-warning); border-radius: var(--radius-md); }
  .ph-caption { font-size: var(--text-xs); color: var(--color-light-grey); }
  .ph-note {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 12px;
    border-left: 3px solid var(--color-warning);
    border-radius: var(--radius-sm);
    background-color: var(--color-surface-alt);
  }
  .ph-note-text { margin: 0; font-size: var(--text-sm); line-height: 1.4; color: var(--color-light); white-space: pre-wrap; overflow-wrap: anywhere; }
  .ph-expected { margin: 0; font-size: var(--text-sm); color: var(--color-light-grey); overflow-wrap: anywhere; }
  .ph-after {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border: 2px solid var(--color-highlight);
    border-radius: var(--radius-md);
  }
  .ph-after-q { margin: 0; font-size: var(--text-lead); font-weight: var(--fw-bold); color: var(--color-light); }
  .ph-actions { display: flex; flex-wrap: wrap; gap: 12px; }
  .ph-error { margin: 0; font-size: var(--text-sm); color: var(--color-error); }
  .ph-order { margin: 0; font-size: var(--text-sm); line-height: 1.5; color: var(--color-light-grey); }
  .ph-nothing {
    align-self: flex-start;
    min-height: var(--touch-target-min);
    padding: 0;
    border: none;
    background: none;
    font-family: var(--font-family);
    font-size: var(--text-sm);
    color: var(--color-secondary);
    text-decoration: underline;
    cursor: pointer;
  }
  .ph-nothing:disabled { opacity: 0.5; cursor: not-allowed; }
</style>

const STORAGE_KEY = "dashboardState";
const THEME_KEY = "dashboardTheme";
const CLIPBOARD_KEY = "dashboardClipboard";
const TITLE_DEFAULT = "Productive Dashboard";

const MIN_WIDGET_WIDTH = 260;
const MIN_WIDGET_HEIGHT = 220;
const NOTE_MIN_WIDTH = 320;
const NOTE_MIN_HEIGHT = 260;
const NOTE_DEFAULT_HEIGHT = 520;
const CALENDAR_DEFAULT_HEIGHT = 360;

const DEFAULT_CALENDAR_REGION = "US";
const CALENDAR_REGIONS = [
  { value: "US", label: "United States" },
  { value: "GLOBAL", label: "Worldwide" },
];

const CALENDAR_TIME_LOCATIONS = [
  { label: "New York", timeZone: "America/New_York" },
  { label: "São Paulo", timeZone: "America/Sao_Paulo" },
  { label: "London", timeZone: "Europe/London" },
  { label: "Riyadh", timeZone: "Asia/Riyadh" },
  { label: "Dubai", timeZone: "Asia/Dubai" },
  { label: "Singapore", timeZone: "Asia/Singapore" },
  { label: "Tokyo", timeZone: "Asia/Tokyo" },
  { label: "Sydney", timeZone: "Australia/Sydney" },
];

const THEMES = [
  { id: "minimal-white", label: "Minimal White", mode: "light" },
  { id: "soft-pastel", label: "Soft Pastel", mode: "light" },
  { id: "modern-blue-sky", label: "Modern Blue Sky", mode: "light" },
  { id: "elegant-gold", label: "Elegant Gold", mode: "light" },
  { id: "nature-green", label: "Nature Green", mode: "light" },
  { id: "classic-dark", label: "Classic Dark", mode: "dark" },
  { id: "cyber-neon", label: "Cyber Neon", mode: "dark" },
  { id: "deep-ocean", label: "Deep Ocean", mode: "dark" },
  { id: "crimson-noir", label: "Crimson Noir", mode: "dark" },
  { id: "midnight-purple", label: "Midnight Purple", mode: "dark" },
];

const THEME_GROUPS = [
  { label: "Bright Themes", mode: "light" },
  { label: "Dark Themes", mode: "dark" },
];

const DEFAULT_THEME_ID = "minimal-white";
const THEME_MAP = new Map(THEMES.map((theme) => [theme.id, theme]));

const SUPPORTED_WIDGET_TYPES = new Set([
  "note",
  "timer",
  "calculator",
  "calendar",
]);

function getCalendarTimeLocations() {
  const seen = new Set();
  const locations = [];
  try {
    const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof localZone === "string" && localZone.trim().length) {
      seen.add(localZone);
      locations.push({ label: "Local", timeZone: localZone });
    }
  } catch (error) {
    /* ignore */
  }
  CALENDAR_TIME_LOCATIONS.forEach((entry) => {
    if (seen.has(entry.timeZone)) {
      return;
    }
    seen.add(entry.timeZone);
    locations.push(entry);
  });
  return locations;
}

const TIMER_ALERT_CLASS = "widget--timer-alert";
const TOAST_DURATION_MS = 6000;

const timeFormatterCache = new Map();
const dateFormatterCache = new Map();

const widgetTemplate = document.getElementById("widget-template");
const noteContainer = document.getElementById("note-container");
const utilityContainer = document.getElementById("utility-container");
const clipboardHost = document.getElementById("clipboard-panel");
const addWidgetButton = document.getElementById("add-widget");
const widgetTypeSelect = document.getElementById("widget-type");
const themeSelect = document.getElementById("theme-select");
const resetDashboardButton = document.getElementById("reset-dashboard");

let state = loadState();
let activeTimerId = null;
const runningTimers = new Map();
const calendarTimeIntervals = new Map();
let clipboardEntries = loadClipboard();
const noteTextareas = new Map();
let activeNoteId = null;
let clipboardPanelBinding = null;
let toastContainer = null;
let notificationPermissionRequested = false;

const initialThemeId = initializeThemePicker();
applyTheme(initialThemeId, { persist: false });
setupClipboardPanel();

function scheduleTask(task) {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(task);
  } else {
    setTimeout(task, 0);
  }
}

function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `widget-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function loadClipboard() {
  const saved = localStorage.getItem(CLIPBOARD_KEY);
  if (!saved) {
    return [];
  }
  try {
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed)) {
      return parsed
        .map((entry) => {
          if (!entry || typeof entry !== "object") {
            return null;
          }
          const text = typeof entry.text === "string" ? entry.text : "";
          if (!text.trim()) {
            return null;
          }
          return {
            id: typeof entry.id === "string" ? entry.id : generateId(),
            text,
          };
        })
        .filter(Boolean);
    }
  } catch (error) {
    console.warn("Unable to parse clipboard state:", error);
  }
  return [];
}

function saveClipboard() {
  localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(clipboardEntries));
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed
          .map((widget) => normalizeWidgetRecord(widget))
          .filter(Boolean);
      }
    } catch (error) {
      console.warn("Unable to parse saved state:", error);
    }
  }
  return createDefaultState();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function normalizeWidgetRecord(widget) {
  if (!widget || typeof widget !== "object") {
    return null;
  }
  const type = typeof widget.type === "string" ? widget.type : null;
  if (!type || !SUPPORTED_WIDGET_TYPES.has(type)) {
    return null;
  }
  const normalizedData = normalizeWidgetData(type, widget.data);
  const normalizedSize = normalizeWidgetSize(widget.size, type);
  return {
    id: typeof widget.id === "string" ? widget.id : generateId(),
    type,
    data: normalizedData,
    size: normalizedSize ?? getDefaultWidgetSize(type),
  };
}

function normalizeWidgetData(type, data) {
  switch (type) {
    case "note":
      return normalizeNoteData(data);
    case "timer":
      return normalizeTimerData(data);
    case "calculator":
      return normalizeCalculatorData(data);
    case "calendar":
      return normalizeCalendarData(data);
    default:
      return data && typeof data === "object" ? data : {};
  }
}

function normalizeNoteData(data) {
  return {
    text: typeof data?.text === "string" ? data.text : "",
  };
}

function normalizeTimerData(data) {
  const label =
    typeof data?.label === "string" && data.label.trim().length
      ? data.label.trim()
      : "Timer";
  const minutesValue = Number.parseInt(data?.minutes, 10);
  const secondsValue = Number.parseInt(data?.seconds, 10);
  const minutes = clampNumber(
    Number.isFinite(minutesValue) ? minutesValue : 0,
    0,
    600
  );
  const seconds = clampNumber(
    Number.isFinite(secondsValue) ? secondsValue : 0,
    0,
    59
  );
  const remainingValue = Number.parseInt(data?.remainingSeconds, 10);
  const configuredSeconds = minutes * 60 + seconds;
  const remainingSeconds = clampNumber(
    Number.isFinite(remainingValue) ? remainingValue : configuredSeconds,
    0,
    600 * 60
  );
  const targetTimestamp =
    typeof data?.targetTimestamp === "number" ? data.targetTimestamp : null;
  const isRunning =
    Boolean(data?.isRunning) &&
    targetTimestamp !== null &&
    remainingSeconds > 0;
  return {
    label,
    minutes,
    seconds,
    remainingSeconds,
    isRunning,
    targetTimestamp: isRunning ? targetTimestamp : null,
    needsAttention: Boolean(data?.needsAttention),
  };
}

function normalizeCalculatorData(data) {
  return {
    expression: typeof data?.expression === "string" ? data.expression : "",
    result: typeof data?.result === "string" ? data.result : "0",
  };
}

function normalizeCalendarData(data) {
  const now = new Date();
  const monthValue = Number.parseInt(data?.month, 10);
  const yearValue = Number.parseInt(data?.year, 10);
  const month = Number.isFinite(monthValue)
    ? clampNumber(monthValue, 0, 11)
    : now.getMonth();
  const year = Number.isFinite(yearValue)
    ? clampNumber(yearValue, 1970, 9999)
    : now.getFullYear();
  const rawRegion =
    typeof data?.region === "string" && data.region.trim().length
      ? data.region.trim().toUpperCase()
      : DEFAULT_CALENDAR_REGION;
  const allowedRegions = new Set(CALENDAR_REGIONS.map((option) => option.value));
  const region = allowedRegions.has(rawRegion)
    ? rawRegion
    : DEFAULT_CALENDAR_REGION;
  const locations = getCalendarTimeLocations();
  const fallbackZone = locations.length ? locations[0].timeZone : "UTC";
  const rawZone =
    typeof data?.timeZone === "string" && data.timeZone.trim().length
      ? data.timeZone.trim()
      : fallbackZone;
  const allowedZones = new Set(locations.map((entry) => entry.timeZone));
  const timeZone = allowedZones.has(rawZone) ? rawZone : fallbackZone;
  return {
    month,
    year,
    region,
    timeZone,
  };
}

function createDefaultState() {
  return [
    {
      id: generateId(),
      type: "note",
      data: { text: "" },
      size: getDefaultWidgetSize("note"),
    },
    {
      id: generateId(),
      type: "timer",
      data: {
        label: "Focus Timer",
        minutes: 25,
        seconds: 0,
        remainingSeconds: 1500,
        isRunning: false,
        targetTimestamp: null,
        needsAttention: false,
      },
      size: null,
    },
    {
      id: generateId(),
      type: "calculator",
      data: {
        expression: "",
        result: "0",
      },
      size: getDefaultWidgetSize("calculator"),
    },
    {
      id: generateId(),
      type: "calendar",
      data: normalizeCalendarData({}),
      size: getDefaultWidgetSize("calendar"),
    },
  ];
}

function getValidThemeId(themeId) {
  if (typeof themeId === "string" && THEME_MAP.has(themeId)) {
    return themeId;
  }
  return DEFAULT_THEME_ID;
}

function initializeThemePicker() {
  if (!themeSelect) {
    return getValidThemeId(localStorage.getItem(THEME_KEY));
  }
  themeSelect.innerHTML = "";
  THEME_GROUPS.forEach((group) => {
    const groupThemes = THEMES.filter((theme) => theme.mode === group.mode);
    if (!groupThemes.length) {
      return;
    }
    const optgroup = document.createElement("optgroup");
    optgroup.label = group.label;
    groupThemes.forEach((theme) => {
      const option = document.createElement("option");
      option.value = theme.id;
      option.textContent = theme.label;
      optgroup.appendChild(option);
    });
    themeSelect.appendChild(optgroup);
  });
  const savedTheme = localStorage.getItem(THEME_KEY);
  const initialThemeId = getValidThemeId(savedTheme);
  themeSelect.value = initialThemeId;
  themeSelect.addEventListener("change", (event) => {
    applyTheme(event.target.value);
  });
  return initialThemeId;
}

function applyTheme(themeId, options = {}) {
  const { persist = true } = options;
  const validThemeId = getValidThemeId(themeId);
  const theme = THEME_MAP.get(validThemeId);
  if (document.body) {
    document.body.dataset.theme = validThemeId;
    document.body.dataset.themeMode = theme?.mode ?? "light";
  }
  if (persist) {
    localStorage.setItem(THEME_KEY, validThemeId);
  }
  if (themeSelect && themeSelect.value !== validThemeId) {
    themeSelect.value = validThemeId;
  }
}

addWidgetButton.addEventListener("click", () => {
  const type = widgetTypeSelect.value;
  const newWidget = createWidgetState(type);
  if (!newWidget) {
    return;
  }
  state.push(newWidget);
  saveState();
  renderWidgets();
});

resetDashboardButton?.addEventListener("click", () => {
  resetDashboard();
});

function createWidgetState(type) {
  switch (type) {
    case "note":
      return {
        id: generateId(),
        type: "note",
        data: { text: "" },
        size: getDefaultWidgetSize("note"),
      };
    case "timer":
      return {
        id: generateId(),
        type: "timer",
        data: {
          label: "Timer",
          minutes: 5,
          seconds: 0,
          remainingSeconds: 300,
          isRunning: false,
          targetTimestamp: null,
          needsAttention: false,
        },
        size: null,
      };
    case "calculator":
      return {
        id: generateId(),
        type: "calculator",
        data: {
          expression: "",
          result: "0",
        },
        size: getDefaultWidgetSize("calculator"),
      };
    case "calendar":
      return {
        id: generateId(),
        type: "calendar",
        data: normalizeCalendarData({}),
        size: getDefaultWidgetSize("calendar"),
      };
    default:
      return null;
  }
}

function resetDashboard() {
  stopAllIntervals();
  activeTimerId = null;
  resetDocumentTitle();
  state = createDefaultState();
  noteTextareas.clear();
  activeNoteId = null;
  clipboardEntries = [];
  saveClipboard();
  saveState();
  applyTheme(DEFAULT_THEME_ID);
  if (widgetTypeSelect) {
    widgetTypeSelect.value = "note";
  }
  renderWidgets();
  refreshClipboardViews();
}

function stopAllIntervals() {
  runningTimers.forEach((intervalId) => clearInterval(intervalId));
  runningTimers.clear();
  calendarTimeIntervals.forEach((intervalId) => clearInterval(intervalId));
  calendarTimeIntervals.clear();
}

function renderWidgets() {
  stopAllIntervals();
  noteTextareas.clear();
  if (noteContainer) {
    noteContainer.innerHTML = "";
  }
  if (utilityContainer) {
    utilityContainer.innerHTML = "";
  }
  state.forEach((widgetState) => {
    const widget = buildWidget(widgetState);
    if (!widget) {
      return;
    }
    if (widgetState.type === "note") {
      noteContainer?.appendChild(widget);
    } else {
      utilityContainer?.appendChild(widget);
    }
  });
  ensureActiveNote();
  renderClipboardPanel();
  scheduleTask(() => restoreRunningTimers());
}

function buildWidget(widgetState) {
  const { id, type } = widgetState;
  const fragment = widgetTemplate.content.cloneNode(true);
  const widget = fragment.querySelector(".widget");
  widget.dataset.id = id;
  widget.classList.add(`widget--${type}`);

  const title = fragment.querySelector(".widget__title");
  const body = fragment.querySelector(".widget__body");
  const removeButton = fragment.querySelector(".widget__remove");
  removeButton.textContent = "×";

  let widgetLabel = "Widget";

  if (type === "note") {
    widgetLabel = "Note Pad";
    title.textContent = widgetLabel;
    body.appendChild(createNoteBody(widgetState));
  } else if (type === "timer") {
    const timerLabel =
      widgetState.data.label && widgetState.data.label.trim().length
        ? widgetState.data.label.trim()
        : "Timer";
    widgetLabel = timerLabel;
    title.textContent = widgetLabel;
    body.appendChild(createTimerBody(widgetState));
  } else if (type === "calculator") {
    widgetLabel = "Calculator";
    title.textContent = widgetLabel;
    body.appendChild(createCalculatorBody(widgetState));
  } else if (type === "calendar") {
    widgetLabel = "Calendar";
    title.textContent = widgetLabel;
    body.appendChild(createCalendarBody(widgetState));
  }

  removeButton.setAttribute("aria-label", `Remove ${widgetLabel}`);
  removeButton.setAttribute("title", `Remove ${widgetLabel}`);

  removeButton.addEventListener("click", () => {
    removeWidget(id);
  });

  if (type === "note") {
    widget.draggable = false;
  } else {
    widget.draggable = true;
    setupDragAndDrop(widget);
  }
  applyWidgetSize(widget, widgetState);
  const resizerOptions = { allowWidth: false };
  widget.appendChild(createWidgetResizer(widget, widgetState, resizerOptions));
  if (type === "timer") {
    applyTimerAttentionState(widget, widgetState);
  }
  return widget;
}

function applyTimerAttentionState(widgetElement, widgetState) {
  if (!widgetElement || widgetState.type !== "timer") {
    return;
  }
  widgetElement.classList.toggle(
    TIMER_ALERT_CLASS,
    Boolean(widgetState.data?.needsAttention)
  );
}

function applyWidgetSize(widgetElement, widgetState) {
  const size = widgetState.size ?? null;
  const hasWidth = size && Number.isFinite(size.width);
  const hasHeight = size && Number.isFinite(size.height);
  widgetElement.style.removeProperty("width");
  widgetElement.style.removeProperty("justify-self");

  if (hasHeight) {
    widgetElement.style.height = `${size.height}px`;
    widgetElement.style.alignSelf = "start";
  } else {
    widgetElement.style.removeProperty("height");
    widgetElement.style.removeProperty("align-self");
  }
}

function normalizeWidgetSize(size, type) {
  if (!size || typeof size !== "object") {
    return null;
  }
  const heightValue = Number.parseFloat(size.height);
  const { minHeight } = getWidgetSizeLimits(type);
  const normalized = {};
  if (Number.isFinite(heightValue)) {
    normalized.height = Math.max(minHeight, Math.round(heightValue));
  }
  return Object.keys(normalized).length ? normalized : null;
}

function getWidgetSizeLimits(type) {
  switch (type) {
    case "note":
      return { minWidth: NOTE_MIN_WIDTH, minHeight: NOTE_MIN_HEIGHT };
    case "calculator":
      return { minWidth: 220, minHeight: 240 };
    case "calendar":
      return { minWidth: 300, minHeight: 320 };
    default:
      return { minWidth: MIN_WIDGET_WIDTH, minHeight: MIN_WIDGET_HEIGHT };
  }
}

function getDefaultWidgetSize(type) {
  switch (type) {
    case "note":
      return { height: NOTE_DEFAULT_HEIGHT };
    case "calculator":
      return null;
    case "calendar":
      return {
        height: CALENDAR_DEFAULT_HEIGHT,
      };
    default:
      return null;
  }
}

function resolveResizeAllowance(widgetState, options = {}) {
  const allowWidthOption =
    typeof options.allowWidth === "boolean" ? options.allowWidth : false;
  const allowHeightOption =
    typeof options.allowHeight === "boolean" ? options.allowHeight : true;
  return {
    allowWidth: widgetState.type !== "note" && allowWidthOption,
    allowHeight: allowHeightOption,
  };
}

function createWidgetResizer(widgetElement, widgetState, options = {}) {
  const { allowWidth, allowHeight } = resolveResizeAllowance(
    widgetState,
    options
  );
  const resizer = document.createElement("button");
  resizer.type = "button";
  resizer.className = "widget__resizer";
  resizer.setAttribute("aria-label", "Resize widget");
  resizer.setAttribute(
    "title",
    "Drag or use arrow keys to resize. Double-click to reset."
  );
  if (!allowWidth && allowHeight) {
    resizer.classList.add("widget__resizer--vertical");
  }

  resizer.addEventListener("pointerdown", (event) => {
    startWidgetResize(event, widgetElement, widgetState, resizer, options);
  });

  resizer.addEventListener("dblclick", (event) => {
    event.preventDefault();
    resetWidgetSize(widgetElement, widgetState, options);
  });

  resizer.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 40 : 20;
    if (allowWidth && event.key === "ArrowRight") {
      event.preventDefault();
      adjustWidgetSize(widgetElement, widgetState, step, 0, options);
    } else if (allowWidth && event.key === "ArrowLeft") {
      event.preventDefault();
      adjustWidgetSize(widgetElement, widgetState, -step, 0, options);
    } else if (allowHeight && event.key === "ArrowDown") {
      event.preventDefault();
      adjustWidgetSize(widgetElement, widgetState, 0, step, options);
    } else if (allowHeight && event.key === "ArrowUp") {
      event.preventDefault();
      adjustWidgetSize(widgetElement, widgetState, 0, -step, options);
    } else if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      resetWidgetSize(widgetElement, widgetState, options);
    }
  });

  return resizer;
}

function startWidgetResize(
  event,
  widgetElement,
  widgetState,
  resizer,
  options = {}
) {
  const { allowWidth, allowHeight } = resolveResizeAllowance(
    widgetState,
    options
  );
  event.preventDefault();
  event.stopPropagation();

  const startX = event.clientX;
  const startY = event.clientY;
  const rect = widgetElement.getBoundingClientRect();
  const startWidth = rect.width;
  const startHeight = rect.height;
  let currentWidth = startWidth;
  let currentHeight = startHeight;

  widgetElement.classList.add("widget--resizing");
  if (typeof resizer.setPointerCapture === "function") {
    try {
      resizer.setPointerCapture(event.pointerId);
    } catch (error) {
      /* noop */
    }
  }

  const handlePointerMove = (moveEvent) => {
    const deltaX = moveEvent.clientX - startX;
    const deltaY = moveEvent.clientY - startY;
    const { minWidth, minHeight } = getWidgetSizeLimits(widgetState.type);
    if (allowWidth) {
      currentWidth = Math.max(minWidth, Math.round(startWidth + deltaX));
      widgetElement.style.width = `${currentWidth}px`;
      widgetElement.style.justifySelf = "start";
    }
    if (allowHeight) {
      currentHeight = Math.max(minHeight, Math.round(startHeight + deltaY));
      widgetElement.style.height = `${currentHeight}px`;
      widgetElement.style.alignSelf = "start";
    }
  };

  const endResize = (shouldPersist = true) => {
    widgetElement.classList.remove("widget--resizing");
    if (
      typeof resizer.releasePointerCapture === "function" &&
      resizer.hasPointerCapture?.(event.pointerId)
    ) {
      try {
        resizer.releasePointerCapture(event.pointerId);
      } catch (error) {
        /* noop */
      }
    }
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    window.removeEventListener("pointercancel", handlePointerCancel);
    if (shouldPersist) {
      const widthChanged =
        allowWidth && Math.round(currentWidth) !== Math.round(startWidth);
      const heightChanged =
        allowHeight && Math.round(currentHeight) !== Math.round(startHeight);
      persistWidgetSize(widgetState, currentWidth, currentHeight, {
        ...options,
        widthChanged,
        heightChanged,
      });
    }
  };

  const handlePointerUp = (upEvent) => {
    if (upEvent.pointerId === event.pointerId) {
      endResize();
    }
  };

  const handlePointerCancel = (cancelEvent) => {
    if (cancelEvent.pointerId === event.pointerId) {
      endResize(false);
    }
  };

  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", handlePointerUp);
  window.addEventListener("pointercancel", handlePointerCancel);
}

function adjustWidgetSize(
  widgetElement,
  widgetState,
  deltaWidth,
  deltaHeight,
  options = {}
) {
  const { allowWidth, allowHeight } = resolveResizeAllowance(
    widgetState,
    options
  );
  const rect = widgetElement.getBoundingClientRect();
  const { minWidth, minHeight } = getWidgetSizeLimits(widgetState.type);
  const nextWidth = Math.max(minWidth, Math.round(rect.width + deltaWidth));
  const nextHeight = Math.max(minHeight, Math.round(rect.height + deltaHeight));
  if (allowWidth) {
    widgetElement.style.width = `${nextWidth}px`;
    widgetElement.style.justifySelf = "start";
  }
  if (allowHeight) {
    widgetElement.style.height = `${nextHeight}px`;
    widgetElement.style.alignSelf = "start";
  }
  persistWidgetSize(widgetState, nextWidth, nextHeight, {
    ...options,
    widthChanged: allowWidth && deltaWidth !== 0,
    heightChanged: allowHeight && deltaHeight !== 0,
  });
}

function resetWidgetSize(widgetElement, widgetState, options = {}) {
  const { allowWidth, allowHeight } = resolveResizeAllowance(
    widgetState,
    options
  );
  const defaultSize = getDefaultWidgetSize(widgetState.type);
  if (defaultSize) {
    const nextSize = {};
    if (allowWidth && Number.isFinite(defaultSize.width)) {
      nextSize.width = defaultSize.width;
    }
    if (allowHeight && Number.isFinite(defaultSize.height)) {
      nextSize.height = defaultSize.height;
    }
    widgetState.size = Object.keys(nextSize).length ? nextSize : null;
  } else {
    widgetState.size = null;
  }
  applyWidgetSize(widgetElement, widgetState);
  saveState();
}

function persistWidgetSize(widgetState, width, height, options = {}) {
  const { allowWidth, allowHeight } = resolveResizeAllowance(
    widgetState,
    options
  );
  const { widthChanged = true, heightChanged = true } = options;
  const { minWidth, minHeight } = getWidgetSizeLimits(widgetState.type);
  const nextSize = { ...(widgetState.size ?? {}) };
  let changed = false;

  if (allowWidth && widthChanged && Number.isFinite(width)) {
    const normalizedWidth = Math.max(minWidth, Math.round(width));
    if (nextSize.width !== normalizedWidth) {
      nextSize.width = normalizedWidth;
      changed = true;
    }
  } else if (!allowWidth && "width" in nextSize) {
    delete nextSize.width;
    changed = true;
  }

  if (allowHeight && heightChanged && Number.isFinite(height)) {
    const normalizedHeight = Math.max(minHeight, Math.round(height));
    if (nextSize.height !== normalizedHeight) {
      nextSize.height = normalizedHeight;
      changed = true;
    }
  } else if (!allowHeight && "height" in nextSize) {
    delete nextSize.height;
    changed = true;
  }

  if (!changed) {
    return;
  }

  widgetState.size = Object.keys(nextSize).length ? nextSize : null;
  saveState();
}

function setupDragAndDrop(widget) {
  widget.addEventListener("dragstart", (event) => {
    if (
      !event.target.closest(".widget__header") ||
      event.target.closest(".widget__controls")
    ) {
      event.preventDefault();
      return;
    }
    widget.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", widget.dataset.id);
  });

  widget.addEventListener("dragend", () => {
    widget.classList.remove("dragging");
  });

  widget.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  });

  widget.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const draggedId = event.dataTransfer.getData("text/plain");
    if (!draggedId || draggedId === widget.dataset.id) {
      return;
    }
    reorderWidgets(draggedId, widget.dataset.id);
  });
}

function reorderWidgets(sourceId, targetId) {
  const sourceIndex = state.findIndex((widget) => widget.id === sourceId);
  const targetIndex = state.findIndex((widget) => widget.id === targetId);
  if (sourceIndex === -1 || targetIndex === -1) {
    return;
  }
  const [moved] = state.splice(sourceIndex, 1);
  state.splice(targetIndex, 0, moved);
  saveState();
  renderWidgets();
}

function removeWidget(id) {
  const widgetIndex = state.findIndex((widget) => widget.id === id);
  if (widgetIndex === -1) {
    return;
  }
  stopTimer(id);
  stopCalendarTimeTicker(id);
  state.splice(widgetIndex, 1);
  if (activeTimerId === id) {
    activeTimerId = null;
    resetDocumentTitle();
  }
  noteTextareas.delete(id);
  if (activeNoteId === id) {
    activeNoteId = null;
  }
  saveState();
  renderWidgets();
}

function createNoteBody(widgetState) {
  const wrapper = document.createElement("div");
  wrapper.className = "note-content";
  const textarea = document.createElement("textarea");
  textarea.className = "note-area";
  textarea.placeholder = "Capture your thoughts, ideas, and plans...";
  textarea.value = widgetState.data.text || "";
  textarea.addEventListener("input", (event) => {
    widgetState.data.text = event.target.value;
    saveState();
  });
  const handleFocus = () => {
    setActiveNote(widgetState.id, textarea);
  };
  textarea.addEventListener("focus", handleFocus);
  textarea.addEventListener("pointerdown", () => {
    setActiveNote(widgetState.id, textarea);
  });

  noteTextareas.set(widgetState.id, textarea);
  if (!activeNoteId) {
    activeNoteId = widgetState.id;
  }
  scheduleTask(() => {
    if (activeNoteId === widgetState.id) {
      renderClipboardPanel();
    }
  });

  wrapper.append(textarea);
  return wrapper;
}

function setActiveNote(widgetId, textarea) {
  if (!widgetId || !textarea) {
    return;
  }
  noteTextareas.set(widgetId, textarea);
  if (activeNoteId === widgetId) {
    return;
  }
  activeNoteId = widgetId;
  renderClipboardPanel();
}

function getTextareaSelection(textarea) {
  if (!textarea) {
    return { start: 0, end: 0 };
  }
  const valueLength = textarea.value.length;
  const start = typeof textarea.selectionStart === "number"
    ? clampNumber(textarea.selectionStart, 0, valueLength)
    : valueLength;
  const end = typeof textarea.selectionEnd === "number"
    ? clampNumber(textarea.selectionEnd, 0, valueLength)
    : start;
  return { start, end };
}

function getTextareaSelectionText(textarea) {
  if (!textarea) {
    return { text: "", start: 0, end: 0 };
  }
  const { start, end } = getTextareaSelection(textarea);
  const a = Math.min(start, end);
  const b = Math.max(start, end);
  return { text: textarea.value.slice(a, b), start: a, end: b };
}

function ensureActiveNote() {
  if (activeNoteId && noteTextareas.has(activeNoteId)) {
    return;
  }
  const nextNote = state.find((widget) => widget.type === "note" && noteTextareas.has(widget.id));
  activeNoteId = nextNote ? nextNote.id : null;
}

function getActiveNoteContext() {
  if (!activeNoteId) {
    return null;
  }
  const widgetState = state.find(
    (widget) => widget.id === activeNoteId && widget.type === "note"
  );
  if (!widgetState) {
    return null;
  }
  const textarea = noteTextareas.get(activeNoteId);
  if (!textarea) {
    return null;
  }
  return { widgetState, textarea };
}

function setupClipboardPanel() {
  if (!clipboardHost) {
    return;
  }
  clipboardHost.innerHTML = "";

  const panel = document.createElement("article");
  panel.className = "clipboard-panel";
  panel.setAttribute("aria-label", "Clipboard snippets");

  const header = document.createElement("div");
  header.className = "clipboard-panel__header";
  const title = document.createElement("h3");
  title.className = "clipboard-panel__title";
  title.textContent = "Clipboard";

  const saveSelectionButton = document.createElement("button");
  saveSelectionButton.type = "button";
  saveSelectionButton.className = "button button--ghost clipboard-panel__action";
  saveSelectionButton.textContent = "Save selection";
  saveSelectionButton.addEventListener("click", () => {
    const context = getActiveNoteContext();
    if (!context) {
      return;
    }
    const { text } = getTextareaSelectionText(context.textarea);
    if (!text || !text.trim()) {
      return;
    }
    addClipboardEntry(text);
  });

  header.append(title, saveSelectionButton);

  const status = document.createElement("p");
  status.className = "clipboard-panel__status";

  const composer = document.createElement("div");
  composer.className = "clipboard-panel__composer";
  const composerInput = document.createElement("textarea");
  composerInput.className = "clipboard-panel__input";
  composerInput.rows = 2;
  composerInput.placeholder = "Store a reusable snippet...";

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "button clipboard-panel__action";
  addButton.textContent = "Add snippet";
  const handleAddSnippet = () => {
    const snippet = composerInput.value.trim();
    if (!snippet) {
      return;
    }
    addClipboardEntry(snippet);
    composerInput.value = "";
  };
  addButton.addEventListener("click", handleAddSnippet);
  composerInput.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      handleAddSnippet();
    }
  });

  composer.append(composerInput, addButton);

  const list = document.createElement("ul");
  list.className = "clipboard-panel__list";
  list.setAttribute("role", "list");

  panel.append(header, status, composer, list);
  clipboardHost.appendChild(panel);

  clipboardPanelBinding = {
    panel,
    list,
    saveSelectionButton,
    status,
  };

  renderClipboardPanel();
}

function renderClipboardPanel() {
  if (!clipboardPanelBinding) {
    return;
  }
  const context = getActiveNoteContext();
  const hasTarget = Boolean(context);

  clipboardPanelBinding.saveSelectionButton.disabled = !hasTarget;
  clipboardPanelBinding.saveSelectionButton.title = hasTarget
    ? "Save the selected note text as a snippet"
    : "Focus the note to enable saving selections";
  clipboardPanelBinding.status.textContent = hasTarget
    ? "Snippets paste wherever your note cursor is placed."
    : "Focus the note to enable clipboard controls.";

  renderClipboardList(clipboardPanelBinding.list, hasTarget);
}

function renderClipboardList(list, hasTarget) {
  list.innerHTML = "";
  if (!clipboardEntries.length) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "clipboard-panel__empty";
    emptyItem.textContent = "No snippets saved yet.";
    list.appendChild(emptyItem);
    return;
  }

  clipboardEntries.forEach((entry) => {
    const item = document.createElement("li");
    item.className = "clipboard-item";

    const snippet = document.createElement("pre");
    snippet.className = "clipboard-item__text";
    snippet.textContent = entry.text;

    const actions = document.createElement("div");
    actions.className = "clipboard-item__actions";

    const pasteButton = document.createElement("button");
    pasteButton.type = "button";
    pasteButton.className = "button clipboard-item__button";
    pasteButton.textContent = "Paste";
    pasteButton.disabled = !hasTarget;
    pasteButton.title = hasTarget
      ? "Paste this snippet into the note"
      : "Focus the note to enable pasting";
    pasteButton.addEventListener("click", () => {
      insertClipboardText(entry.text);
    });

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "button button--ghost clipboard-item__button";
    copyButton.textContent = "Copy";
    copyButton.addEventListener("click", async () => {
      await writeToClipboard(entry.text);
    });

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className =
      "button button--ghost clipboard-item__button clipboard-item__button--danger";
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => {
      removeClipboardEntry(entry.id);
    });

    actions.append(pasteButton, copyButton, removeButton);
    item.append(snippet, actions);
    list.appendChild(item);
  });
}

function insertClipboardText(text) {
  const context = getActiveNoteContext();
  if (!context) {
    return;
  }
  const { widgetState, textarea } = context;
  const { start, end } = getTextareaSelection(textarea);
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);
  const nextValue = `${before}${text}${after}`;
  const caret = start + text.length;
  textarea.value = nextValue;
  widgetState.data.text = nextValue;
  textarea.focus();
  try {
    textarea.setSelectionRange(caret, caret);
  } catch (error) {
    /* ignore */
  }
  saveState();
}

function addClipboardEntry(text) {
  const normalized = text.trim();
  if (!normalized) {
    return;
  }
  clipboardEntries = [
    {
      id: generateId(),
      text: normalized,
    },
    ...clipboardEntries,
  ];
  saveClipboard();
  refreshClipboardViews();
}

function removeClipboardEntry(id) {
  const nextEntries = clipboardEntries.filter((entry) => entry.id !== id);
  if (nextEntries.length === clipboardEntries.length) {
    return;
  }
  clipboardEntries = nextEntries;
  saveClipboard();
  refreshClipboardViews();
}

function refreshClipboardViews() {
  renderClipboardPanel();
}

async function writeToClipboard(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      /* fall back */
    }
  }
  const helper = document.createElement("textarea");
  helper.value = text;
  helper.setAttribute("readonly", "true");
  helper.style.position = "fixed";
  helper.style.opacity = "0";
  helper.style.pointerEvents = "none";
  document.body.appendChild(helper);
  helper.focus();
  helper.select();
  helper.setSelectionRange(0, helper.value.length);
  try {
    document.execCommand("copy");
  } catch (error) {
    console.warn("Unable to copy to clipboard", error);
    document.body.removeChild(helper);
    return false;
  }
  document.body.removeChild(helper);
  return true;
}

function createTimerBody(widgetState) {
  const { data } = widgetState;
  const wrapper = document.createElement("div");
  wrapper.className = "timer";

  const inputs = document.createElement("div");
  inputs.className = "timer-inputs";
  const minutesField = buildTimerInput("Minutes", data.minutes ?? 0);
  const secondsField = buildTimerInput("Seconds", data.seconds ?? 0);
  inputs.append(minutesField.container, secondsField.container);

  const display = document.createElement("div");
  display.className = "timer-display";
  display.textContent = formatTime(data.remainingSeconds ?? 0);

  const status = document.createElement("p");
  status.className = "timer-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  let startButton;

  minutesField.input.addEventListener("input", () => {
    handleTimerInputChange(
      widgetState,
      minutesField.input,
      secondsField.input,
      display,
      status
    );
  });
  secondsField.input.addEventListener("input", () => {
    handleTimerInputChange(
      widgetState,
      minutesField.input,
      secondsField.input,
      display,
      status
    );
  });

  [minutesField.input, secondsField.input].forEach((input) => {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        startTimer(
          widgetState,
          display,
          minutesField.input,
          secondsField.input,
          startButton,
          status
        );
      } else if (event.key === "Escape") {
        event.preventDefault();
        resetTimer(
          widgetState,
          display,
          minutesField.input,
          secondsField.input,
          startButton,
          status
        );
      }
    });
  });

  const actions = document.createElement("div");
  actions.className = "timer-actions";

  startButton = document.createElement("button");
  startButton.className = "button timer__start";
  startButton.type = "button";
  startButton.innerHTML =
    '<span class="timer__button-icon" aria-hidden="true"></span>' +
    '<span class="timer__button-label"></span>';
  updateTimerStartButton(startButton, Boolean(data.isRunning));
  startButton.addEventListener("click", () => {
    if (widgetState.data.isRunning) {
      pauseTimer(widgetState);
      return;
    }
    startTimer(
      widgetState,
      display,
      minutesField.input,
      secondsField.input,
      startButton,
      status
    );
  });

  const resetButton = document.createElement("button");
  resetButton.className = "button button--ghost timer__reset";
  resetButton.type = "button";
  resetButton.innerHTML =
    '<span class="timer__button-icon" aria-hidden="true">↻</span>' +
    '<span class="timer__button-label">Reset</span>';
  resetButton.addEventListener("click", () => {
    resetTimer(
      widgetState,
      display,
      minutesField.input,
      secondsField.input,
      startButton,
      status
    );
  });

  actions.append(startButton, resetButton);

  wrapper.append(inputs, display, status, actions);
  applyTimerStatus(widgetState, status);
  return wrapper;
}

function buildTimerInput(labelText, value) {
  const container = document.createElement("label");
  container.className = "timer-input";
  const label = document.createElement("span");
  label.className = "timer-input__label";
  label.textContent = labelText;
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.max = labelText === "Seconds" ? "59" : "600";
  input.value = Number.isFinite(value) ? value : 0;
  input.inputMode = "numeric";
  input.dataset.timerField = labelText === "Seconds" ? "seconds" : "minutes";
  container.append(label, input);
  return { container, input };
}

function updateTimerStartButton(button, isRunning) {
  if (!button) {
    return;
  }
  const icon = button.querySelector(".timer__button-icon");
  const label = button.querySelector(".timer__button-label");
  if (icon) {
    icon.textContent = isRunning ? "❚❚" : "▶";
  }
  if (label) {
    label.textContent = isRunning ? "Pause" : "Start";
  }
  button.setAttribute("data-running", String(Boolean(isRunning)));
}

function getTimerConfiguredSeconds(widgetState) {
  if (!widgetState || widgetState.type !== "timer") {
    return 0;
  }
  const data = widgetState.data;
  const minutes = clampNumber(Number.parseInt(data.minutes, 10) || 0, 0, 600);
  const seconds = clampNumber(Number.parseInt(data.seconds, 10) || 0, 0, 59);
  return minutes * 60 + seconds;
}

function getTimerRemainingSeconds(widgetState) {
  if (!widgetState || widgetState.type !== "timer") {
    return 0;
  }
  const remaining = Number.parseInt(widgetState.data.remainingSeconds, 10);
  if (Number.isFinite(remaining) && remaining > 0) {
    return remaining;
  }
  return getTimerConfiguredSeconds(widgetState);
}

function getTimerElements(widgetId) {
  const widgetElement = document.querySelector(`[data-id="${widgetId}"]`);
  if (!widgetElement) {
    return null;
  }
  const display = widgetElement.querySelector(".timer-display");
  const minutesInput = widgetElement.querySelector('input[data-timer-field="minutes"]');
  const secondsInput = widgetElement.querySelector('input[data-timer-field="seconds"]');
  const startButton = widgetElement.querySelector(
    ".timer-actions .button:not(.button--ghost)"
  );
  const status = widgetElement.querySelector(".timer-status");
  return {
    widgetElement,
    display,
    minutesInput,
    secondsInput,
    startButton,
    status,
  };
}

function updateTimerUI(widgetState) {
  const elements = getTimerElements(widgetState.id);
  if (!elements) {
    return;
  }
  const { display, minutesInput, secondsInput, startButton, status } = elements;
  if (display) {
    display.textContent = formatTime(widgetState.data.remainingSeconds ?? 0);
  }
  if (minutesInput) {
    minutesInput.value = widgetState.data.minutes ?? 0;
  }
  if (secondsInput) {
    secondsInput.value = widgetState.data.seconds ?? 0;
  }
  if (startButton) {
    updateTimerStartButton(startButton, Boolean(widgetState.data.isRunning));
  }
  if (status) {
    applyTimerStatus(widgetState, status);
  }
}

function getTimerStatusInfo(widgetState) {
  if (!widgetState || widgetState.type !== "timer") {
    return { text: "", tone: "idle" };
  }
  const data = widgetState.data;
  if (data.needsAttention) {
    return { text: "Time is up — press Start to run again.", tone: "alert" };
  }
  if (data.isRunning) {
    return { text: "Counting down…", tone: "running" };
  }
  const configured = getTimerConfiguredSeconds(widgetState);
  const remaining = Number.parseInt(data.remainingSeconds, 10) || 0;
  if (!configured) {
    return { text: "Set a duration to get started", tone: "idle" };
  }
  if (!remaining || remaining === configured) {
    return { text: "Ready to start", tone: "ready" };
  }
  return { text: "Paused", tone: "paused" };
}

function applyTimerStatus(widgetState, statusElement) {
  if (!statusElement) {
    return;
  }
  const info = getTimerStatusInfo(widgetState);
  statusElement.textContent = info.text;
  statusElement.dataset.status = info.tone;
}

function syncTimerStatus(widgetState) {
  const elements = getTimerElements(widgetState.id);
  if (elements?.status) {
    applyTimerStatus(widgetState, elements.status);
  }
}

function setTimerAttention(widgetState, isAttention) {
  if (!widgetState || widgetState.type !== "timer") {
    return;
  }
  widgetState.data.needsAttention = Boolean(isAttention);
  const widgetElement = document.querySelector(`[data-id="${widgetState.id}"]`);
  if (widgetElement) {
    applyTimerAttentionState(widgetElement, widgetState);
  }
  syncTimerStatus(widgetState);
}

function completeTimer(widgetState, options = {}) {
  if (!widgetState || widgetState.type !== "timer") {
    return;
  }
  const wasActive = activeTimerId === widgetState.id;
  const shouldUpdateTitle = Boolean(
    Object.prototype.hasOwnProperty.call(options, "updateTitle")
      ? options.updateTitle
      : wasActive
  );
  const shouldNotify = Object.prototype.hasOwnProperty.call(options, "notify")
    ? Boolean(options.notify)
    : true;

  const elements = getTimerElements(widgetState.id);
  resetTimer(
    widgetState,
    elements?.display,
    elements?.minutesInput,
    elements?.secondsInput,
    elements?.startButton,
    elements?.status,
    { attention: true, skipPause: true }
  );

  if (wasActive) {
    activeTimerId = null;
  }

  if (shouldNotify) {
    alertTimerComplete(widgetState, { updateTitle: shouldUpdateTitle });
  } else if (shouldUpdateTitle) {
    resetDocumentTitle();
  } else if (wasActive) {
    resetDocumentTitle();
  }
}

function handleTimerInputChange(
  widgetState,
  minutesInput,
  secondsInput,
  display,
  statusElement
) {
  const minutes = clampNumber(parseInt(minutesInput.value, 10) || 0, 0, 600);
  const seconds = clampNumber(parseInt(secondsInput.value, 10) || 0, 0, 59);
  widgetState.data.minutes = minutes;
  widgetState.data.seconds = seconds;
  widgetState.data.remainingSeconds = minutes * 60 + seconds;
  widgetState.data.isRunning = false;
  widgetState.data.targetTimestamp = null;
  stopTimer(widgetState.id);
  if (activeTimerId === widgetState.id) {
    activeTimerId = null;
    resetDocumentTitle();
  }
  if (display) {
    display.textContent = formatTime(widgetState.data.remainingSeconds);
  }
  const timerElement = minutesInput.closest(".timer");
  const startButton = timerElement?.querySelector(
    ".timer-actions .button:not(.button--ghost)"
  );
  if (startButton) {
    updateTimerStartButton(startButton, false);
  }
  setTimerAttention(widgetState, false);
  applyTimerStatus(widgetState, statusElement);
  saveState();
}

function startTimer(
  widgetState,
  display,
  minutesInput,
  secondsInput,
  startButton,
  statusElement
) {
  const data = widgetState.data;
  if (!data.isRunning) {
    const totalSeconds = getTimerRemainingSeconds(widgetState);
    if (!totalSeconds || totalSeconds <= 0) {
      return;
    }
    const targetTime = Date.now() + totalSeconds * 1000;
    data.targetTimestamp = targetTime;
    data.isRunning = true;
    data.remainingSeconds = totalSeconds;
    setTimerAttention(widgetState, false);
    activeTimerId = widgetState.id;
    applyTimerStatus(widgetState, statusElement);
    runTimer(widgetState, display, startButton, statusElement);
    updateDocumentTitle(totalSeconds);
    saveState();
  }
}

function runTimer(widgetState, display, startButton, statusElement) {
  const update = () => {
    const data = widgetState.data;
    if (!data.isRunning || typeof data.targetTimestamp !== "number") {
      stopTimer(widgetState.id);
      return;
    }
    const remaining = Math.max(
      0,
      Math.round((data.targetTimestamp - Date.now()) / 1000)
    );
    if (remaining <= 0) {
      const shouldUpdateTitle = activeTimerId === widgetState.id;
      completeTimer(widgetState, { updateTitle: shouldUpdateTitle, notify: true });
      return;
    }
    data.remainingSeconds = remaining;
    if (display) {
      display.textContent = formatTime(remaining);
    }
    if (startButton) {
      updateTimerStartButton(startButton, Boolean(data.isRunning));
    }
    if (statusElement) {
      applyTimerStatus(widgetState, statusElement);
    }
    if (activeTimerId === widgetState.id) {
      updateDocumentTitle(remaining);
    }
    saveState();
  };

  stopTimer(widgetState.id);
  const intervalId = setInterval(update, 500);
  runningTimers.set(widgetState.id, intervalId);
  update();
}

function pauseTimer(widgetState) {
  stopTimer(widgetState.id);
  widgetState.data.isRunning = false;
  widgetState.data.targetTimestamp = null;
  updateTimerUI(widgetState);
  if (activeTimerId === widgetState.id) {
    activeTimerId = null;
    resetDocumentTitle();
  }
  syncTimerStatus(widgetState);
  saveState();
}

function resetTimer(
  widgetState,
  display,
  minutesInput,
  secondsInput,
  startButton,
  statusElement,
  options = {}
) {
  const { attention = false, skipPause = false } = options;
  if (!skipPause) {
    pauseTimer(widgetState);
  } else {
    stopTimer(widgetState.id);
    widgetState.data.isRunning = false;
    widgetState.data.targetTimestamp = null;
  }
  const minutes = widgetState.data.minutes ?? 0;
  const seconds = widgetState.data.seconds ?? 0;
  const configuredSeconds = minutes * 60 + seconds;
  widgetState.data.remainingSeconds = attention ? 0 : configuredSeconds;
  if (display) {
    display.textContent = formatTime(widgetState.data.remainingSeconds);
  }
  if (minutesInput) {
    minutesInput.value = minutes;
  }
  if (secondsInput) {
    secondsInput.value = seconds;
  }
  if (startButton) {
    updateTimerStartButton(startButton, false);
  }
  setTimerAttention(widgetState, attention);
  applyTimerStatus(widgetState, statusElement);
  saveState();
}

function stopTimer(id) {
  if (runningTimers.has(id)) {
    clearInterval(runningTimers.get(id));
    runningTimers.delete(id);
  }
}

function alertTimerComplete(widgetState, { updateTitle = false } = {}) {
  const label =
    widgetState?.data?.label && widgetState.data.label.trim().length
      ? widgetState.data.label.trim()
      : "Timer";
  if (updateTitle) {
    document.title = `⏱ ${label} finished!`;
    setTimeout(() => {
      if (!activeTimerId) {
        resetDocumentTitle();
      }
    }, 4000);
  }
  showNotification(`${label} complete`, "Your timer has finished.");
}

function updateDocumentTitle(remainingSeconds) {
  if (typeof remainingSeconds !== "number" || remainingSeconds <= 0) {
    resetDocumentTitle();
    return;
  }
  const formatted = formatTime(remainingSeconds);
  document.title = `⏳ ${formatted} remaining`;
}

function resetDocumentTitle() {
  document.title = TITLE_DEFAULT;
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function makeDate(year, month, day) {
  return new Date(Date.UTC(year, month, day));
}

function dateToISO(date) {
  return date.toISOString().slice(0, 10);
}

function parseISODate(iso) {
  if (!iso) {
    return null;
  }
  const parts = iso.split("-").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 3 || parts.some((value) => !Number.isFinite(value))) {
    return null;
  }
  const [year, month, day] = parts;
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date, amount) {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + amount);
  return result;
}

function nthWeekdayOfMonth(year, month, weekday, occurrence) {
  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const offset = (7 + weekday - firstOfMonth.getUTCDay()) % 7;
  const day = 1 + offset + (occurrence - 1) * 7;
  return new Date(Date.UTC(year, month, day));
}

function lastWeekdayOfMonth(year, month, weekday) {
  const lastOfMonth = new Date(Date.UTC(year, month + 1, 0));
  const offset = (7 + lastOfMonth.getUTCDay() - weekday) % 7;
  const day = lastOfMonth.getUTCDate() - offset;
  return new Date(Date.UTC(year, month, day));
}

function calculateEasterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month, day));
}

function observedHolidayDate(date) {
  const day = date.getUTCDay();
  if (day === 6) {
    return addDays(date, -1);
  }
  if (day === 0) {
    return addDays(date, 1);
  }
  return date;
}

function addObservedHoliday(collection, date, name) {
  const observed = observedHolidayDate(date);
  if (observed.getTime() !== date.getTime()) {
    collection.push({
      date: observed,
      name: `${name} (Observed)`,
      observed: true,
    });
  }
}

function getTimeFormatter(timeZone) {
  if (!timeFormatterCache.has(timeZone)) {
    timeFormatterCache.set(
      timeZone,
      new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        timeZone,
      })
    );
  }
  return timeFormatterCache.get(timeZone);
}

function getDateFormatter(timeZone) {
  if (!dateFormatterCache.has(timeZone)) {
    dateFormatterCache.set(
      timeZone,
      new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone,
      })
    );
  }
  return dateFormatterCache.get(timeZone);
}

function createCalendarBody(widgetState) {
  const wrapper = document.createElement("div");
  wrapper.className = "calendar";

  const header = document.createElement("div");
  header.className = "calendar__header";

  const prevButton = document.createElement("button");
  prevButton.type = "button";
  prevButton.className = "button button--ghost calendar__nav-button";
  prevButton.textContent = "‹";

  const heading = document.createElement("h3");
  heading.className = "calendar__heading";

  const nextButton = document.createElement("button");
  nextButton.type = "button";
  nextButton.className = "button button--ghost calendar__nav-button";
  nextButton.textContent = "›";

  header.append(prevButton, heading, nextButton);

  const timeButton = document.createElement("button");
  timeButton.type = "button";
  timeButton.className = "calendar__clock";
  timeButton.setAttribute("aria-expanded", "false");
  timeButton.setAttribute("aria-haspopup", "listbox");

  const timeText = document.createElement("div");
  timeText.className = "calendar__time-text";

  const timeDisplay = document.createElement("time");
  timeDisplay.className = "calendar__time-reading";
  timeDisplay.textContent = "--:--:--";

  const timeDate = document.createElement("span");
  timeDate.className = "calendar__time-date";
  timeDate.textContent = "";

  timeText.append(timeDisplay, timeDate);

  const timeZoneName = document.createElement("span");
  timeZoneName.className = "calendar__time-zone-name";
  timeZoneName.textContent = "";

  timeButton.append(timeText, timeZoneName);

  const pickerId = `${widgetState.id}-time-picker`;
  timeButton.setAttribute("aria-controls", pickerId);

  const timePicker = document.createElement("div");
  timePicker.className = "calendar__time-picker";
  timePicker.id = pickerId;
  timePicker.hidden = true;

  const timeSelect = document.createElement("select");
  timeSelect.className = "calendar__time-select";
  timeSelect.setAttribute("aria-label", "Choose time zone");
  timePicker.appendChild(timeSelect);

  const grid = document.createElement("div");
  grid.className = "calendar__grid";
  grid.setAttribute("role", "grid");

  wrapper.append(header, timeButton, timePicker, grid);

  const locations = getCalendarTimeLocations();
  const locationLabels = new Map();
  let selectedZone = widgetState.data.timeZone;
  if (!locations.some((location) => location.timeZone === selectedZone)) {
    selectedZone = locations.length ? locations[0].timeZone : "UTC";
    widgetState.data.timeZone = selectedZone;
  }
  if (locations.length) {
    locations.forEach((location) => {
      locationLabels.set(location.timeZone, location.label);
      const option = document.createElement("option");
      option.value = location.timeZone;
      option.textContent = location.label;
      timeSelect.appendChild(option);
    });
  }
  if (!timeSelect.options.length) {
    const option = document.createElement("option");
    option.value = selectedZone;
    option.textContent = selectedZone;
    timeSelect.appendChild(option);
  }
  if (!locationLabels.has(selectedZone)) {
    locationLabels.set(selectedZone, selectedZone);
  }
  timeSelect.value = selectedZone;

  const updateTimeZoneLabel = () => {
    const zone = widgetState.data.timeZone;
    const label = locationLabels.get(zone) || zone;
    timeZoneName.textContent = label;
    const description = `Current time in ${label}. Click to choose a different time zone.`;
    timeButton.setAttribute("aria-label", description);
    timeButton.title = description;
  };

  const toggleTimePicker = (force) => {
    if (!timeSelect.options.length) {
      return;
    }
    const expanded = timeButton.getAttribute("aria-expanded") === "true";
    const nextExpanded = typeof force === "boolean" ? force : !expanded;
    timeButton.setAttribute("aria-expanded", String(nextExpanded));
    timePicker.hidden = !nextExpanded;
    if (nextExpanded) {
      timeSelect.focus();
      document.addEventListener("pointerdown", handleOutsidePointerDown);
    } else {
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
    }
  };

  const handleOutsidePointerDown = (event) => {
    if (!wrapper.contains(event.target)) {
      toggleTimePicker(false);
    }
  };

  let holidayMap = new Map();

  const getTimeConfig = () => ({
    timeElement: timeDisplay,
    dateElement: timeDate,
    timeZone: widgetState.data.timeZone,
  });

  const renderCalendar = () => {
    const { month, year } = widgetState.data;
    const region = widgetState.data.region || DEFAULT_CALENDAR_REGION;
    const monthLabel = new Intl.DateTimeFormat(undefined, {
      month: "long",
      year: "numeric",
    }).format(new Date(year, month, 1));
    heading.textContent = monthLabel;
    if (timeSelect.value !== widgetState.data.timeZone) {
      const optionExists = Array.from(timeSelect.options).some(
        (option) => option.value === widgetState.data.timeZone
      );
      if (optionExists) {
        timeSelect.value = widgetState.data.timeZone;
      }
    }
    updateTimeZoneLabel();
    holidayMap = getHolidaysForRegion(region, year);
    renderCalendarGrid(grid, month, year, holidayMap);
  };

  const changeMonth = (delta) => {
    let month = widgetState.data.month + delta;
    let year = widgetState.data.year;
    if (month < 0) {
      month = 11;
      year -= 1;
    } else if (month > 11) {
      month = 0;
      year += 1;
    }
    widgetState.data.month = month;
    widgetState.data.year = year;
    saveState();
    renderCalendar();
  };

  prevButton.addEventListener("click", () => changeMonth(-1));
  nextButton.addEventListener("click", () => changeMonth(1));

  timeButton.addEventListener("click", (event) => {
    if (event.target === timeButton) {
      toggleTimePicker();
    }
  });

  timeText.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleTimePicker();
  });

  timeZoneName.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleTimePicker();
  });

  timeSelect.addEventListener("change", (event) => {
    widgetState.data.timeZone = event.target.value;
    saveState();
    updateCalendarTimeDisplay(getTimeConfig());
    startCalendarTimeTicker(widgetState.id, getTimeConfig);
    updateTimeZoneLabel();
    toggleTimePicker(false);
    timeButton.focus();
  });

  timeSelect.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      toggleTimePicker(false);
      timeButton.focus();
    }
  });

  wrapper.addEventListener("focusout", () => {
    scheduleTask(() => {
      if (timeButton.getAttribute("aria-expanded") !== "true") {
        return;
      }
      const active = document.activeElement;
      if (
        active !== timeButton &&
        !timePicker.contains(active) &&
        !timeButton.contains(active)
      ) {
        toggleTimePicker(false);
      }
    });
  });

  renderCalendar();
  updateCalendarTimeDisplay(getTimeConfig());
  startCalendarTimeTicker(widgetState.id, getTimeConfig);
  updateTimeZoneLabel();

  return wrapper;
}

function updateCalendarTimeDisplay(config) {
  if (!config || !config.timeElement) {
    return;
  }
  const now = new Date();
  const { timeElement, dateElement, timeZone } = config;
  if (!timeZone) {
    timeElement.textContent = "--:--:--";
    if (dateElement) {
      dateElement.textContent = "";
    }
    return;
  }
  try {
    const timeFormatter = getTimeFormatter(timeZone);
    const dateFormatter = getDateFormatter(timeZone);
    timeElement.textContent = timeFormatter.format(now);
    timeElement.dateTime = now.toISOString();
    if (dateElement) {
      dateElement.textContent = dateFormatter.format(now);
    }
  } catch (error) {
    timeElement.textContent = "--:--:--";
    if (dateElement) {
      dateElement.textContent = "";
    }
  }
}

function startCalendarTimeTicker(widgetId, getConfig) {
  stopCalendarTimeTicker(widgetId);
  if (typeof getConfig !== "function") {
    return;
  }
  const update = () => {
    const config = getConfig();
    updateCalendarTimeDisplay(config);
  };
  update();
  const intervalId = setInterval(update, 1000);
  calendarTimeIntervals.set(widgetId, intervalId);
}

function stopCalendarTimeTicker(widgetId) {
  if (!calendarTimeIntervals.has(widgetId)) {
    return;
  }
  clearInterval(calendarTimeIntervals.get(widgetId));
  calendarTimeIntervals.delete(widgetId);
}

function renderCalendarGrid(grid, month, year, holidayMap) {
  grid.innerHTML = "";
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  dayNames.forEach((name) => {
    const headerCell = document.createElement("div");
    headerCell.className = "calendar__day-name";
    headerCell.textContent = name;
    grid.appendChild(headerCell);
  });

  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const leadingFiller = firstOfMonth.getUTCDay();
  for (let i = 0; i < leadingFiller; i += 1) {
    const filler = document.createElement("div");
    filler.className = "calendar__cell calendar__cell--filler";
    grid.appendChild(filler);
  }

  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth();
  const todayDate = today.getDate();

  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = dateToISO(new Date(Date.UTC(year, month, day)));
    const cell = document.createElement("div");
    cell.className = "calendar__cell";
    cell.dataset.date = iso;
    const dateNumber = document.createElement("span");
    dateNumber.className = "calendar__date";
    dateNumber.textContent = String(day);
    cell.appendChild(dateNumber);

    if (
      year === todayYear &&
      month === todayMonth &&
      day === todayDate
    ) {
      cell.classList.add("calendar__cell--today");
    }

    if (holidayMap.has(iso)) {
      cell.classList.add("calendar__cell--holiday");
      const names = holidayMap
        .get(iso)
        .map((entry) => entry.name)
        .join(", ");
      cell.title = names;
    }

    grid.appendChild(cell);
  }

  const totalCells = leadingFiller + daysInMonth;
  const trailing = (7 - (totalCells % 7)) % 7;
  for (let i = 0; i < trailing; i += 1) {
    const filler = document.createElement("div");
    filler.className = "calendar__cell calendar__cell--filler";
    grid.appendChild(filler);
  }
}

function buildHolidayMap(entries) {
  const map = new Map();
  entries.forEach((entry) => {
    const iso = dateToISO(entry.date);
    if (!map.has(iso)) {
      map.set(iso, []);
    }
    map.get(iso).push({ name: entry.name, observed: Boolean(entry.observed) });
  });
  return map;
}

function getHolidaysForRegion(region, year) {
  switch (region) {
    case "GLOBAL":
      return buildHolidayMap(getGlobalHolidays(year));
    case "US":
    default:
      return buildHolidayMap(getUSHolidays(year));
  }
}

function getUSHolidays(year) {
  const holidays = [];
  const newYears = makeDate(year, 0, 1);
  holidays.push({ date: newYears, name: "New Year's Day" });
  addObservedHoliday(holidays, newYears, "New Year's Day");

  holidays.push({
    date: nthWeekdayOfMonth(year, 0, 1, 3),
    name: "Martin Luther King Jr. Day",
  });
  holidays.push({
    date: nthWeekdayOfMonth(year, 1, 1, 3),
    name: "Presidents' Day",
  });
  holidays.push({
    date: lastWeekdayOfMonth(year, 4, 1),
    name: "Memorial Day",
  });

  const juneteenth = makeDate(year, 5, 19);
  holidays.push({ date: juneteenth, name: "Juneteenth National Independence Day" });
  addObservedHoliday(holidays, juneteenth, "Juneteenth National Independence Day");

  const independence = makeDate(year, 6, 4);
  holidays.push({ date: independence, name: "Independence Day" });
  addObservedHoliday(holidays, independence, "Independence Day");

  holidays.push({
    date: nthWeekdayOfMonth(year, 8, 1, 1),
    name: "Labor Day",
  });
  holidays.push({
    date: nthWeekdayOfMonth(year, 9, 1, 2),
    name: "Columbus Day",
  });

  const veterans = makeDate(year, 10, 11);
  holidays.push({ date: veterans, name: "Veterans Day" });
  addObservedHoliday(holidays, veterans, "Veterans Day");

  holidays.push({
    date: nthWeekdayOfMonth(year, 10, 4, 4),
    name: "Thanksgiving Day",
  });

  const christmas = makeDate(year, 11, 25);
  holidays.push({ date: christmas, name: "Christmas Day" });
  addObservedHoliday(holidays, christmas, "Christmas Day");

  const easter = calculateEasterSunday(year);
  holidays.push({ date: addDays(easter, -2), name: "Good Friday" });
  holidays.push({ date: easter, name: "Easter Sunday" });

  return holidays;
}

function getGlobalHolidays(year) {
  const holidays = [];
  holidays.push({ date: makeDate(year, 0, 1), name: "New Year's Day" });
  const easter = calculateEasterSunday(year);
  holidays.push({ date: addDays(easter, -2), name: "Good Friday" });
  holidays.push({ date: easter, name: "Easter Sunday" });
  holidays.push({ date: makeDate(year, 4, 1), name: "Labour Day" });
  holidays.push({ date: makeDate(year, 11, 25), name: "Christmas Day" });
  return holidays;
}

function ensureToastContainer() {
  if (toastContainer) {
    return toastContainer;
  }
  toastContainer = document.createElement("div");
  toastContainer.className = "toast-container";
  toastContainer.setAttribute("aria-live", "polite");
  document.body.appendChild(toastContainer);
  return toastContainer;
}

function showToast(title, message) {
  const container = ensureToastContainer();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");

  const heading = document.createElement("strong");
  heading.className = "toast__title";
  heading.textContent = title;

  const body = document.createElement("p");
  body.className = "toast__message";
  body.textContent = message;

  toast.append(heading, body);
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("toast--visible");
  });

  setTimeout(() => {
    toast.classList.remove("toast--visible");
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, TOAST_DURATION_MS);
}

async function attemptNativeNotification(title, message) {
  if (typeof Notification === "undefined") {
    return;
  }
  try {
    if (Notification.permission === "granted") {
      new Notification(title, { body: message });
      return;
    }
    if (Notification.permission === "denied") {
      return;
    }
    if (notificationPermissionRequested) {
      return;
    }
    notificationPermissionRequested = true;
    const permission = await Notification.requestPermission();
    notificationPermissionRequested = false;
    if (permission === "granted") {
      new Notification(title, { body: message });
    }
  } catch (error) {
    notificationPermissionRequested = false;
  }
}

function showNotification(title, message) {
  showToast(title, message);
  void attemptNativeNotification(title, message);
}

function createCalculatorBody(widgetState) {
  const wrapper = document.createElement("div");
  wrapper.className = "calculator";
  wrapper.tabIndex = 0;

  const display = document.createElement("div");
  display.className = "calculator-display";
  const expressionDisplay = document.createElement("div");
  expressionDisplay.className = "calculator-expression";
  expressionDisplay.textContent = widgetState.data.expression || "";
  const resultDisplay = document.createElement("div");
  resultDisplay.className = "calculator-result";
  resultDisplay.textContent = widgetState.data.result || "0";
  display.append(expressionDisplay, resultDisplay);

  const keypad = document.createElement("div");
  keypad.className = "calculator-keypad";
  const buttons = [
    "7",
    "8",
    "9",
    "÷",
    "4",
    "5",
    "6",
    "×",
    "1",
    "2",
    "3",
    "-",
    "0",
    ".",
    "=",
    "+",
    "C",
    "⌫",
  ];

  buttons.forEach((label) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => {
      handleCalculatorInput(
        widgetState,
        label,
        expressionDisplay,
        resultDisplay
      );
    });
    keypad.appendChild(button);
  });

  wrapper.addEventListener("keydown", (event) => {
    if (event.key.match(/[0-9.+\-/*]/)) {
      event.preventDefault();
      handleCalculatorInput(
        widgetState,
        event.key,
        expressionDisplay,
        resultDisplay
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      handleCalculatorInput(widgetState, "=", expressionDisplay, resultDisplay);
    } else if (event.key === "Backspace") {
      event.preventDefault();
      handleCalculatorInput(widgetState, "⌫", expressionDisplay, resultDisplay);
    } else if (event.key === "Escape") {
      event.preventDefault();
      handleCalculatorInput(widgetState, "C", expressionDisplay, resultDisplay);
    }
  });

  wrapper.addEventListener("focusin", () => {
    wrapper.classList.add("calculator--active");
  });

  wrapper.addEventListener("focusout", (event) => {
    if (!wrapper.contains(event.relatedTarget)) {
      wrapper.classList.remove("calculator--active");
    }
  });

  wrapper.append(display, keypad);
  return wrapper;
}

function handleCalculatorInput(
  widgetState,
  input,
  expressionDisplay,
  resultDisplay
) {
  let { expression } = widgetState.data;
  const validOperators = ["+", "-", "×", "÷", "*", "/"];

  if (input === "C") {
    expression = "";
    updateCalculatorState(
      widgetState,
      expression,
      "0",
      expressionDisplay,
      resultDisplay
    );
    return;
  }

  if (input === "⌫") {
    expression = expression.slice(0, -1);
    const result = safeEvaluate(expression);
    updateCalculatorState(
      widgetState,
      expression,
      result,
      expressionDisplay,
      resultDisplay
    );
    return;
  }

  if (input === "=") {
    const result = safeEvaluate(expression);
    updateCalculatorState(
      widgetState,
      expression,
      result,
      expressionDisplay,
      resultDisplay
    );
    return;
  }

  if (validOperators.includes(input) || input === "." || /\d/.test(input)) {
    expression += normalizeOperator(input);
    const result = safeEvaluate(expression);
    updateCalculatorState(
      widgetState,
      expression,
      result,
      expressionDisplay,
      resultDisplay
    );
  }
}

function normalizeOperator(input) {
  switch (input) {
    case "×":
      return "*";
    case "÷":
      return "/";
    default:
      return input;
  }
}

function safeEvaluate(expression) {
  if (!expression) {
    return "0";
  }
  const sanitized = expression.replace(/[^0-9+\-*/.]/g, "");
  if (!sanitized) {
    return "0";
  }
  try {
    const result = Function(`"use strict"; return (${sanitized})`)();
    if (Number.isFinite(result)) {
      return Number(result.toFixed(8)).toString();
    }
  } catch (error) {
    return "Error";
  }
  return "Error";
}

function updateCalculatorState(
  widgetState,
  expression,
  result,
  expressionDisplay,
  resultDisplay
) {
  widgetState.data.expression = expression;
  widgetState.data.result = result;
  expressionDisplay.textContent = expression;
  resultDisplay.textContent = result;
  saveState();
}

function restoreRunningTimers() {
  state.forEach((widgetState) => {
    if (widgetState.type !== "timer") {
      return;
    }
    const data = widgetState.data;
    if (data.isRunning && data.targetTimestamp) {
      const remaining = Math.round((data.targetTimestamp - Date.now()) / 1000);
      if (remaining > 0) {
        const widgetElement = document.querySelector(
          `[data-id="${widgetState.id}"]`
        );
        if (widgetElement) {
          const display = widgetElement.querySelector(".timer-display");
          const startButton = widgetElement.querySelector(
            ".timer-actions .button:not(.button--ghost)"
          );
          const status = widgetElement.querySelector(".timer-status");
          if (!activeTimerId) {
            activeTimerId = widgetState.id;
          }
          data.remainingSeconds = remaining;
          setTimerAttention(widgetState, false);
          runTimer(widgetState, display, startButton, status);
        }
      } else {
        completeTimer(widgetState, { updateTitle: false, notify: false });
      }
    }
  });
}

renderWidgets();

function handleAreaDragOver(event) {
  event.preventDefault();
}

function handleAreaDrop(event) {
  event.preventDefault();
  const draggedId = event.dataTransfer.getData("text/plain");
  if (!draggedId) {
    return;
  }
  const target = event.target.closest(".widget");
  if (!target) {
    moveWidgetToEnd(draggedId);
    return;
  }
  if (target.dataset.id !== draggedId) {
    reorderWidgets(draggedId, target.dataset.id);
  }
}

[noteContainer, utilityContainer].forEach((area) => {
  area?.addEventListener("dragover", handleAreaDragOver);
  area?.addEventListener("drop", handleAreaDrop);
});

function moveWidgetToEnd(id) {
  const index = state.findIndex((widget) => widget.id === id);
  if (index === -1) {
    return;
  }
  const [item] = state.splice(index, 1);
  state.push(item);
  saveState();
  renderWidgets();
}

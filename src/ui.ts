// Icon Editor — UI thread.

import "./ui.css";

type Value = number | "mixed" | null;

interface Reference {
  kind: "stroked" | "filled";
  value: number;
  name: string;
}

interface State {
  type: "state";
  stroked: number;
  filled: number;
  delta: Value;
  /** Slider position to use when the value is "mixed". */
  anchor: number | null;
  /** Shapes the last apply could not thin. */
  refused: number;
  reference: Reference | null;
}

const MAX_DELTA = 2;

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing element #${id}`);
  return found as T;
}

function post(message: unknown): void {
  parent.postMessage({ pluginMessage: message }, "*");
}

function clamp(value: number): number {
  return Math.min(MAX_DELTA, Math.max(-MAX_DELTA, value));
}

/** Signed, so the panel always reads as a change rather than a size. */
function formatDelta(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

const block = el<HTMLElement>("weight-block");
const slider = el<HTMLInputElement>("delta-slider");
const field = el<HTMLInputElement>("delta-field");
const presets = el<HTMLElement>("presets");
const presetButtons = Array.from(presets.querySelectorAll("button"));
const pickBtn = el<HTMLButtonElement>("pick");
const applyBtn = el<HTMLButtonElement>("apply");
const clearBtn = el<HTMLButtonElement>("clear");
const referenceRow = el<HTMLElement>("reference");
const referenceName = el<HTMLElement>("ref-name");
const referenceWeight = el<HTMLElement>("ref-weight");
const count = el<HTMLElement>("count");
const status = el<HTMLElement>("status");

let state: State = {
  type: "state",
  stroked: 0,
  filled: 0,
  delta: null,
  anchor: null,
  refused: 0,
  reference: null,
};

function showDelta(value: Value, anchor: number | null): void {
  // A mixed selection has no single value, so park the thumb on the smallest
  // one present rather than leaving it wherever it happened to be.
  const position = typeof value === "number" ? value : (anchor ?? 0);
  slider.value = String(clamp(position));

  if (typeof value === "number") {
    field.value = formatDelta(value);
  } else {
    field.value = value === "mixed" ? "Mixed" : "—";
  }

  for (const button of presetButtons) {
    button.classList.toggle("is-active", value === Number(button.dataset.delta));
  }
}

function render(): void {
  const total = state.stroked + state.filled;
  block.classList.toggle("is-disabled", total === 0);

  showDelta(state.delta, state.anchor);

  pickBtn.disabled = total === 0;
  if (state.reference) {
    const targets = state.reference.kind === "filled" ? state.filled : state.stroked;
    applyBtn.disabled = targets === 0;
    referenceRow.hidden = false;
    referenceName.textContent = state.reference.name;
    referenceWeight.textContent = `${state.reference.kind === "filled" ? "filled" : "stroke"} ${formatDelta(state.reference.value)} px`;
  } else {
    applyBtn.disabled = true;
    referenceRow.hidden = true;
  }

  count.textContent = total === 0 ? "No vectors selected" : plural(total, "vector");

  // Thinning rewrites geometry, which only works on editable vector paths.
  status.textContent =
    state.refused > 0
      ? `${plural(state.refused, "shape")} could not be thinned — not an editable vector path.`
      : "";
  status.classList.toggle("is-warning", state.refused > 0);
}

slider.addEventListener("input", () => {
  const value = Number(slider.value);
  field.value = formatDelta(value);
  post({ type: "set-delta", value, commit: false });
});

slider.addEventListener("change", () =>
  post({ type: "set-delta", value: Number(slider.value), commit: true })
);

function commitField(): void {
  const raw = field.value.trim().replace("−", "-");
  const parsed = Number(raw);
  if (raw === "" || Number.isNaN(parsed)) {
    showDelta(state.delta, state.anchor);
    return;
  }
  const value = clamp(parsed);
  showDelta(value, null);
  post({ type: "set-delta", value, commit: true });
}

field.addEventListener("blur", commitField);
field.addEventListener("keydown", (event) => {
  if (event.key === "Enter") field.blur();
});

presets.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest("button");
  if (!button || state.stroked + state.filled === 0) return;
  const value = Number(button.dataset.delta);
  if (Number.isNaN(value)) return;
  showDelta(value, null);
  post({ type: "set-delta", value, commit: true });
});

pickBtn.addEventListener("click", () => post({ type: "pick-reference" }));
applyBtn.addEventListener("click", () => post({ type: "apply-reference" }));
clearBtn.addEventListener("click", () => post({ type: "clear-reference" }));

window.addEventListener("message", (event: MessageEvent) => {
  const message = event.data && event.data.pluginMessage;
  if (message && message.type === "state") {
    state = message as State;
    render();
  }
});

render();
post({ type: "ready" });

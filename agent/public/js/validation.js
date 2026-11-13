// Panneau droit : liste de validation de la session ouverte, cochable
// pendant la seance de relecture avec le metier. L'etat des cases est
// journalise dans la session ; le compteur suit les points restants.

import { apiFetch } from "./api.js";

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

let panel = null;
let counter = null;
let currentSessionId = null;
let state = {};
let saveTimer = null;

function persistState() {
  if (!currentSessionId) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    apiFetch(`/api/session/${currentSessionId}/validation-state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state })
    }).catch(() => {});
  }, 800);
}

function updateCounter() {
  const boxes = [...panel.querySelectorAll("input[type=checkbox]")];
  const left = boxes.filter((b) => !b.checked).length;
  counter.textContent = boxes.length ? `${left} point${left > 1 ? "s" : ""} restant${left > 1 ? "s" : ""}` : "";
}

// affiche la liste (items groupes par famille) dans le panneau
function render(items) {
  panel.innerHTML = "";
  if (!items.length) {
    panel.innerHTML = "<p class='hint'>Rien à valider : aucune valeur déduite, incertitude ou signal détecté.</p>";
    updateCounter();
    return;
  }
  let lastFam = null;
  items.forEach((it) => {
    if (it.family !== lastFam) {
      const h = document.createElement("div");
      h.className = "vfam";
      h.textContent = it.family;
      panel.appendChild(h);
      lastFam = it.family;
    }
    const div = document.createElement("div");
    div.className = "vitem";
    const checked = !!state[it.id];
    div.innerHTML = `
      <input type="checkbox" id="v_${esc(it.id)}" ${checked ? "checked" : ""}/>
      <label for="v_${esc(it.id)}" class="vtext">${esc(it.text)}` +
      (it.meta ? `<span class="vmeta">${esc(it.meta)}</span>` : "") + `</label>`;
    if (checked) div.classList.add("checked");
    div.querySelector("input").addEventListener("change", (e) => {
      state[it.id] = e.target.checked;
      div.classList.toggle("checked", e.target.checked);
      updateCounter();
      persistState();
    });
    panel.appendChild(div);
  });
  updateCounter();
}

// charge la liste de validation de la session (servie par le serveur,
// memes donnees que l'export imprimable)
export async function loadValidation(sessionId, initialState) {
  currentSessionId = sessionId;
  state = initialState || {};
  if (!sessionId) { panel.innerHTML = ""; counter.textContent = ""; return; }
  try {
    const res = await apiFetch(`/api/session/${sessionId}/validation-list`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    render(data.items || []);
  } catch (_) {
    panel.innerHTML = "<p class='hint'>Liste de validation indisponible pour cette session.</p>";
    counter.textContent = "";
  }
}

export function initValidation(panelEl, counterEl) {
  panel = panelEl;
  counter = counterEl;
}

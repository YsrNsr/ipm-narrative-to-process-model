// Poste de travail Agent MIP : cablage de l'interface. La logique
// metier vit dans les modules (entretiens, anonymisation, editeur,
// sessions, validation) ; ce fichier orchestre.

import { apiFetch, apiDownload } from "./api.js";
import { initInterviews, addInterview, getInterviews, getAllTexts, setTexts } from "./interviews.js";
import { detectSensitive, applyReplacement } from "./anonymize.js";
import { initEditor, loadXml, getLastXml, getSessionId, exportPng } from "./editor.js";
import { listPages, singlePageXml } from "./pagepick.js";
import { initSessions, refreshSessions } from "./sessions.js";
import { initValidation, loadValidation } from "./validation.js";

const $ = (id) => document.getElementById(id);
const statusEl = $("status");

// ---- panneaux repliables ----
function initCollapse(btnId, panelId, openLabel, closeLabel) {
  const btn = $(btnId), panel = $(panelId);
  btn.addEventListener("click", () => {
    const collapsed = panel.classList.toggle("collapsed");
    btn.textContent = collapsed ? openLabel : closeLabel;
  });
}
initCollapse("collapse-left", "left-panel", "⟩", "⟨");
$("collapse-right").addEventListener("click", () => {
  const panel = $("right-panel");
  const collapsed = panel.classList.toggle("collapsed");
  $("collapse-right").textContent = collapsed ? "⟩" : "⟨";
});

// ---- badge fournisseur ----
const badge = $("provider-badge");
const providerSel = $("provider");
const modelSel = $("model");
// modeles proposables par fournisseur, servis par /api/models ; le
// choix du fournisseur ET du modele est memorise d'une visite a l'autre
let providersInfo = {};
function fillModels() {
  const info = providersInfo[providerSel.value] || { models: [], default: "" };
  modelSel.innerHTML = "";
  info.models.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    modelSel.appendChild(opt);
  });
  const stored = localStorage.getItem(`agentmip.model.${providerSel.value}`);
  modelSel.value = stored && info.models.includes(stored) ? stored : info.default;
  if (!modelSel.value && info.models.length) modelSel.value = info.models[0];
}
function updateBadge() {
  const cloud = providerSel.value !== "ollama";
  badge.textContent = cloud
    ? "cloud : transcription envoyée à un service externe"
    : "local : les données ne quittent pas la machine";
  badge.className = `badge ${cloud ? "badge-cloud" : "badge-local"}`;
  $("anonymize-box").classList.toggle("hidden", !cloud);
  // le badge affiche le modele SELECTIONNE, pas celui du serveur
  const model = modelSel.value;
  $("model-badge").textContent = model || "";
  $("model-badge").classList.toggle("hidden", !model);
}
providerSel.addEventListener("change", () => {
  localStorage.setItem("agentmip.provider", providerSel.value);
  fillModels();
  updateBadge();
});
modelSel.addEventListener("change", () => {
  localStorage.setItem(`agentmip.model.${providerSel.value}`, modelSel.value);
  updateBadge();
});
apiFetch("/api/models").then((r) => r.json()).then((data) => {
  providersInfo = data.providers || {};
  const stored = localStorage.getItem("agentmip.provider");
  const wanted = stored || data.defaultProvider;
  if (wanted && [...providerSel.options].some((o) => o.value === wanted)) {
    providerSel.value = wanted;
  }
  fillModels();
  updateBadge();
}).catch(() => updateBadge());

// ---- entretiens ----
initInterviews($("interviews"));
$("btn-add-interview").addEventListener("click", () => addInterview());
$("btn-example").addEventListener("click", async () => {
  try {
    const res = await apiFetch("/api/example");
    if (!res.ok) throw new Error();
    const text = await res.text();
    addInterview("Exemple : demande de congés", text.trim());
    statusEl.textContent = "Transcription d'exemple chargée.";
    statusEl.classList.remove("error");
  } catch (_) {
    statusEl.textContent = "Exemple introuvable côté serveur.";
    statusEl.classList.add("error");
  }
});

// ---- anonymisation (aide locale, cloud uniquement) ----
$("btn-anonymize").addEventListener("click", () => {
  const listEl = $("anonymize-list");
  listEl.innerHTML = "";
  const items = detectSensitive(getAllTexts());
  if (!items.length) {
    listEl.innerHTML = "<li class='hint'>Aucun candidat détecté. Relisez tout de même avant l'envoi.</li>";
    return;
  }
  items.forEach((it) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="term"></span><span class="arrow">→</span>` +
      `<span class="repl"></span><span class="count"></span>`;
    li.querySelector(".term").textContent = it.term;
    li.querySelector(".repl").textContent = it.replacement;
    li.querySelector(".count").textContent = `×${it.count}`;
    const apply = document.createElement("button");
    apply.className = "ghost";
    apply.textContent = "Remplacer";
    apply.addEventListener("click", () => {
      setTexts(getAllTexts().map((t) => applyReplacement(t, it.term, it.replacement)));
      li.remove();
    });
    const ignore = document.createElement("button");
    ignore.className = "ghost";
    ignore.textContent = "Ignorer";
    ignore.addEventListener("click", () => li.remove());
    li.appendChild(apply);
    li.appendChild(ignore);
    listEl.appendChild(li);
  });
});

// ---- progression (etats simules pendant l'appel : l'extraction domine
// tres largement les autres etapes, qui sont marquees a la reponse) ----
const PROGRESS_STEPS = ["extract", "validate", "ground", "render"];
function progressReset() {
  $("progress").classList.remove("hidden");
  PROGRESS_STEPS.forEach((s) => {
    const li = document.querySelector(`#progress [data-step="${s}"]`);
    li.classList.remove("active", "done");
  });
  document.querySelector('#progress [data-step="extract"]').classList.add("active");
}
async function progressFinish() {
  for (const s of PROGRESS_STEPS) {
    const li = document.querySelector(`#progress [data-step="${s}"]`);
    li.classList.remove("active");
    li.classList.add("done");
    await new Promise((r) => setTimeout(r, 120));
  }
}

// ---- selecteur en deux groupes ----
// pages du fichier Draw.io : alimentent le champ pages de /api/generate
// (grille MIP comprise : elle aussi est optionnelle depuis l'iteration 3)
const PAGES = [
  ["page-maki", "Makigami"],
  ["page-proc", "Processus"],
  ["page-bpmn", "BPMN"],
  ["page-raci", "RACI"],
  ["page-sipoc", "SIPOC"],
  ["page-ana", "Analyse"]
];
// fichiers a telecharger apres generation
const OUTPUTS = [
  ["out-md", "Fiche processus", (id) => `/api/session/${id}/export.md`],
  ["out-csv", "Tableau CSV", (id) => `/api/session/${id}/export.csv`],
  ["out-validation", "Liste de validation", (id) => `/api/session/${id}/export-validation.md`],
  ["out-questions", "Questions d'entretien", (id) => `/api/session/${id}/export-questions.md`],
  ["out-bpmn", "BPMN pour import dans un autre outil", (id) => `/api/session/${id}/export.bpmn`],
  ["out-json", "Modèle extrait (JSON)", (id) => `/api/session/${id}/export.json`]
];
// slug du nom de processus de la session courante : nomme les fichiers
// telecharges cote client (fichier Draw.io, PNG) ; fourni par le serveur
let currentSlug = "processus";
// les cases cochees sont retenues d'une visite a l'autre ; la matrice
// de responsabilites reste cochee par defaut (composition historique)
[...PAGES.map(([id]) => id), ...OUTPUTS.map(([id]) => id)].forEach((id) => {
  const box = $(id);
  const stored = localStorage.getItem(`agentmip.${id}`);
  box.checked = stored === null ? (id === "page-raci" || id === "page-maki") : stored === "1";
  box.addEventListener("change", () => {
    localStorage.setItem(`agentmip.${id}`, box.checked ? "1" : "0");
    updatePagesGuard();
  });
});
const selectedPages = () => PAGES.filter(([id]) => $(id).checked).map(([, name]) => name);
// au moins une page est requise : bouton desactive et message clair
function updatePagesGuard() {
  const none = selectedPages().length === 0;
  $("gen").disabled = none;
  $("pages-hint").classList.toggle("hidden", !none);
}
updatePagesGuard();
function renderDownloads(sessionId) {
  const dl = $("downloads");
  dl.innerHTML = "";
  const grille = document.createElement("a");
  grille.href = "#";
  // le lien annonce le contenu reel du fichier, pas toujours la grille
  const nPages = listPages(getLastXml() || "").length;
  grille.textContent = `Fichier Draw.io (${nPages} page${nPages > 1 ? "s" : ""})`;
  grille.addEventListener("click", (e) => {
    e.preventDefault();
    const xml = getLastXml();
    if (!xml) return;
    const blob = new Blob([xml], { type: "application/xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${currentSlug}.drawio`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  dl.appendChild(grille);
  OUTPUTS.forEach(([id, label, url]) => {
    if (!$(id).checked) return;
    const a = document.createElement("a");
    a.href = "#";
    a.textContent = label;
    // telechargement par l'assistant commun : le jeton d'acces part
    // avec la requete (une navigation directe ne le porterait pas)
    a.addEventListener("click", async (e) => {
      e.preventDefault();
      try { await apiDownload(url(sessionId)); }
      catch (err) {
        statusEl.textContent = err.message;
        statusEl.classList.add("error");
      }
    });
    dl.appendChild(a);
  });
  dl.classList.remove("hidden");
  refreshPngPages();
  $("png-row").classList.remove("hidden");
}

// ---- export PNG de la page choisie ----
// le protocole embed exporte le contenu qu'on lui passe : la page
// choisie est extraite du dernier XML connu et rendue seule, ce qui
// garantit d'exporter la bonne page (et pas toujours la premiere)
function refreshPngPages() {
  const sel = $("png-page");
  const current = sel.value;
  sel.innerHTML = "";
  listPages(getLastXml() || "").forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  });
  if ([...sel.options].some((o) => o.value === current)) sel.value = current;
}
$("btn-png").addEventListener("click", async () => {
  const name = $("png-page").value || "Makigami";
  try {
    const xml = singlePageXml(getLastXml() || "", name);
    if (!xml) throw new Error(`page « ${name} » introuvable`);
    const data = await exportPng({ xml });
    const a = document.createElement("a");
    a.href = data;
    a.download = `${currentSlug}-${name.toLowerCase()}.png`;
    a.click();
    statusEl.textContent = `PNG de la page « ${name} » téléchargé.`;
    statusEl.classList.remove("error");
  } catch (e) {
    statusEl.textContent = "Export PNG impossible (" + e.message +
      ") — repli : exportez depuis l'éditeur, menu Fichier.";
    statusEl.classList.add("error");
  }
});

// ---- generation ----
$("gen").addEventListener("click", async () => {
  const interviews = getInterviews();
  if (!interviews.length) {
    statusEl.textContent = "Collez au moins un récit (ou chargez l'exemple).";
    statusEl.classList.add("error");
    return;
  }
  const provider = providerSel.value;
  const btn = $("gen");
  btn.disabled = true;
  statusEl.textContent = "";
  statusEl.classList.remove("error");
  $("result-box").classList.add("hidden");
  $("downloads").classList.add("hidden");
  progressReset();
  // attente honnete : chrono qui defile, et ordre de grandeur tire des
  // sessions passees du meme fournisseur et modele
  const elapsedEl = $("elapsed");
  elapsedEl.classList.remove("hidden");
  let estimate = null;
  apiFetch("/api/sessions").then((r) => r.json()).then((d) => {
    const same = (d.sessions || []).filter((s) =>
      s.provider === provider && s.llmModel === (modelSel.value || null) && s.ms);
    if (same.length) estimate = Math.round(same.reduce((a, s) => a + s.ms, 0) / same.length / 1000);
  }).catch(() => {});
  const t0c = Date.now();
  elapsedEl.textContent = "0 s écoulée";
  const tick = setInterval(() => {
    const sec = Math.round((Date.now() - t0c) / 1000);
    elapsedEl.textContent = `${sec} s écoulée${sec > 1 ? "s" : ""}` +
      (estimate ? ` · généralement autour de ${estimate} s avec ce modèle` : "");
  }, 1000);
  // annulation cote client : la requete fournisseur va a son terme
  // cote serveur, son resultat est simplement jete
  const aborter = new AbortController();
  const cancelBtn = $("btn-cancel");
  cancelBtn.classList.remove("hidden");
  const onCancel = () => aborter.abort();
  cancelBtn.addEventListener("click", onCancel);
  try {
    const body = interviews.length > 1
      ? { texts: interviews.map((x) => x.text), provider, model: modelSel.value || undefined, pages: selectedPages() }
      : { text: interviews[0].text, provider, model: modelSel.value || undefined, pages: selectedPages() };
    const res = await apiFetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: aborter.signal
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Erreur serveur (${res.status})`);
    await progressFinish();
    loadXml(data.xml, data.sessionId);
    // resultat : duree, volumes extraits, valeurs a verifier, avertissements
    const toCheck = countInferred(data.model);
    const box = $("result-box");
    box.innerHTML =
      `<strong>Grille MIP générée</strong> en ${(data.ms / 1000).toFixed(1)} s — ` +
      `${(data.model.steps || []).length} étapes, ${(data.model.actors || []).length} acteurs, ` +
      `${toCheck} valeur${toCheck > 1 ? "s" : ""} à vérifier (marquées « ≈ »).` +
      (data.repaired ? "<br/>Une requête corrective a été nécessaire (sortie initiale invalide)." : "");
    if (data.warnings && data.warnings.length) {
      box.innerHTML += `<ul class="warnings">${data.warnings.map((w) => `<li>${escHtml(w)}</li>`).join("")}</ul>`;
    }
    // ligne de provenance : la version du prompt et le modele effectifs
    box.innerHTML += `<div class="provenance">Généré avec le prompt v${escHtml(data.promptVersion || "?")}` +
      ` · ${escHtml(data.llmModel || data.provider || "?")}` +
      ` · ${(data.ms / 1000).toFixed(1).replace(".", ",")} s</div>`;
    // le modele extrait, en lecture seule, pour l'analyste outille
    const jsonView = document.createElement("details");
    jsonView.className = "json-view";
    jsonView.innerHTML = "<summary>Voir le modèle extrait (JSON)</summary><pre></pre>";
    jsonView.querySelector("pre").textContent = JSON.stringify(data.model, null, 2);
    box.appendChild(jsonView);
    box.classList.remove("hidden");
    currentSlug = data.slug || "processus";
    renderDownloads(data.sessionId);
    $("btn-validate").classList.remove("hidden");
    $("validate-status").textContent = "";
    $("right-panel").classList.remove("collapsed");
    loadValidation(data.sessionId, {});
    statusEl.textContent = "Relisez la grille : corrigez directement dans l'éditeur, la session enregistre tout.";
  } catch (e) {
    document.querySelector("#progress .active")?.classList.remove("active");
    if (e.name === "AbortError") {
      statusEl.textContent = "Génération annulée. La requête déjà partie chez le fournisseur se termine côté serveur ; son résultat est ignoré ici (la session apparaîtra dans l'historique).";
      statusEl.classList.remove("error");
    } else {
      statusEl.textContent = explainError(e.message);
      statusEl.classList.add("error");
      // nouvelle tentative proposee a l'utilisateur, jamais automatique
      const retry = document.createElement("button");
      retry.className = "ghost small";
      retry.textContent = "Réessayer la génération";
      retry.style.marginLeft = "8px";
      retry.addEventListener("click", () => { retry.remove(); $("gen").click(); });
      statusEl.appendChild(retry);
    }
  } finally {
    clearInterval(tick);
    elapsedEl.classList.add("hidden");
    cancelBtn.classList.add("hidden");
    cancelBtn.removeEventListener("click", onCancel);
    btn.disabled = false;
  }
});

function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function countInferred(model) {
  let n = 0;
  for (const s of model.steps || []) {
    const inf = s.inferred || {};
    Object.values(inf).forEach((v) => {
      if (Array.isArray(v)) n += v.filter(Boolean).length;
      else if (v) n++;
    });
  }
  const ip = model.inferredProcess || {};
  Object.values(ip).forEach((v) => { if (Array.isArray(v)) n += v.filter(Boolean).length; });
  return n;
}

// messages d'erreur en langage clair, avec la cause probable
function explainError(msg) {
  const m = String(msg || "");
  if (/Delai depasse|timed? ?out/i.test(m)) {
    return "Le fournisseur n'a pas répondu dans le délai (LLM_TIMEOUT_MS). " + m;
  }
  if (/ECONNREFUSED|fetch failed|injoignable|ENOTFOUND/i.test(m)) {
    return "Fournisseur injoignable : vérifiez qu'Ollama tourne (ollama serve) ou que la connexion réseau est disponible. Détail : " + m;
  }
  if (/api[_ ]?key|401|authent/i.test(m)) {
    return "Clé d'API absente ou refusée : vérifiez la variable dans .env. Détail : " + m;
  }
  if (/Aucun processus reconnaissable/.test(m)) {
    return m + " (le texte est peut-être trop court ou ne décrit pas un enchaînement d'activités)";
  }
  return "Erreur : " + m;
}

// ---- editeur et sauvegardes ----
initEditor($("drawio"), (data) => {
  if (data && data.editEffort) {
    statusEl.textContent = `Modifications enregistrées (effort d'édition cumulé : ${data.editEffort.total}).`;
    statusEl.classList.remove("error");
  }
});

// ---- validation metier ----
$("btn-validate").addEventListener("click", async () => {
  const id = getSessionId();
  if (!id) return;
  try {
    const res = await apiFetch(`/api/session/${id}/validate-metier`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ xml: getLastXml() })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur serveur");
    $("validate-status").textContent =
      `Validation métier enregistrée le ${new Date(data.validatedAt).toLocaleString("fr-CH")}. ` +
      "Cette version est l'artefact de référence de la session.";
  } catch (e) {
    $("validate-status").textContent = "Échec de l'enregistrement : " + e.message;
  }
});

// ---- historique ----
initValidation($("validation-panel"), $("validation-counter"));
initSessions($("sessions-dialog"), (sessionData) => {
  $("btn-validate").classList.remove("hidden");
  $("right-panel").classList.remove("collapsed");
  currentSlug = sessionData.slug || "processus";
  renderDownloads(sessionData.id);
  loadValidation(sessionData.id, sessionData.validationState || {});
  statusEl.textContent = `Session « ${sessionData.process} » rouverte (${sessionData.status}).`;
  statusEl.classList.remove("error");
});

// Historique des sessions : liste, reouverture d'une grille dans
// l'editeur, telechargement des sorties, comparaison lisible entre la
// sortie brute de l'IA et la version courante.

import { loadXml } from "./editor.js";
import { apiFetch, apiDownload } from "./api.js";

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const STATUS_CLASS = { "ebauche generee": "brute", "corrigee": "corrigee", "validee metier": "validee" };

let dialog = null;
let listEl = null;
let diffEl = null;
let onReopen = () => {};

async function showDiff(id) {
  diffEl.classList.remove("hidden");
  diffEl.innerHTML = "<p class='hint'>Comparaison en cours…</p>";
  try {
    const res = await apiFetch(`/api/session/${id}/diff`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur serveur");
    if (data.unchanged) {
      diffEl.innerHTML = "<p class='hint'>Aucune modification enregistrée : la grille est encore la sortie brute de l'IA.</p>";
      return;
    }
    if (data.noMakigami) {
      diffEl.innerHTML = "<p class='hint'>Comparaison indisponible : cette session a été générée sans la grille MIP (l'effort d'édition n'est pas mesuré).</p>";
      return;
    }
    const d = data.details;
    const section = (title, rows) => rows.length
      ? `<h3>${title}</h3><ul>${rows.join("")}</ul>` : "";
    const li = (tag, cls, text) => `<li><span class="tag ${cls}">${tag}</span>${esc(text)}</li>`;
    const html =
      section("Acteurs", [
        ...d.actors.added.map((a) => li("ajouté", "add", a)),
        ...d.actors.removed.map((a) => li("supprimé", "del", a)),
        ...d.actors.renamed.map(([a, b]) => li("renommé", "ren", `${a} → ${b}`))
      ]) +
      section("Étapes", [
        ...d.tasks.added.map((t) => li("ajoutée", "add", t)),
        ...d.tasks.removed.map((t) => li("supprimée", "del", t)),
        ...d.tasks.renamed.map(([a, b]) => li("renommée", "ren", `${a} → ${b}`)),
        ...d.tasks.reassigned.map(([t, from, to]) => li("réattribuée", "ren", `${t} : ${from} → ${to}`))
      ]);
    diffEl.innerHTML =
      `<h3>Sortie brute de l'IA → version courante</h3>` +
      (html || "<p class='hint'>Différences de détail uniquement (métadonnées).</p>") +
      (data.effort ? `<p class="hint">Effort d'édition total : ${data.effort.total}</p>` : "");
  } catch (e) {
    diffEl.innerHTML = `<p class="status error">Comparaison impossible : ${esc(e.message)}</p>`;
  }
}

async function reopen(id) {
  const res = await apiFetch(`/api/session/${id}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erreur serveur");
  loadXml(data.xml, id);
  dialog.close();
  onReopen(data);
}

export async function refreshSessions() {
  listEl.innerHTML = "<p class='hint'>Chargement…</p>";
  const res = await apiFetch("/api/sessions");
  const data = await res.json();
  if (!data.sessions.length) {
    listEl.innerHTML = "<p class='hint'>Aucune session pour l'instant : générez une première grille MIP.</p>";
    return;
  }
  listEl.innerHTML = "";
  for (const s of data.sessions) {
    const row = document.createElement("div");
    row.className = "session-row";
    const date = new Date(s.createdAt).toLocaleString("fr-CH");
    // provenance : les sessions anterieures a sa journalisation
    // affichent "non journalise"
    const prov = s.promptVersion || s.llmModel
      ? `prompt v${esc(s.promptVersion || "?")} · ${esc(s.llmModel || s.provider)}`
      : `${esc(s.provider)} · provenance non journalisée`;
    row.innerHTML = `
      <span class="sname">${esc(s.process)}</span>
      <button type="button" class="rename" data-act="rename" title="Renommer la session">✏️</button>
      <span class="smeta">${date} · ${prov} · ${s.steps} étapes · ${s.actors} acteurs` +
      (s.editEffort != null ? ` · effort ${s.editEffort}` : "") + `</span>
      <span class="sstatus ${STATUS_CLASS[s.status] || "brute"}">${esc(s.status)}</span>
      <button type="button" data-act="open">Rouvrir</button>
      <button type="button" data-act="diff">Comparer</button>
      <button type="button" data-act="dl">Exports</button>
      <button type="button" data-act="pages">Télécharger d'autres pages</button>
      <button type="button" data-act="del" title="Supprimer la session (corbeille du serveur)">Supprimer</button>`;
    row.querySelector('[data-act="open"]').addEventListener("click", () => reopen(s.id).catch((e) => alert(e.message)));
    row.querySelector('[data-act="diff"]').addEventListener("click", () => showDiff(s.id));
    row.querySelector('[data-act="dl"]').addEventListener("click", async () => {
      try {
        await apiDownload(`/api/session/${s.id}/export.md`);
        await apiDownload(`/api/session/${s.id}/export.csv`);
      } catch (e) { alert(e.message); }
    });
    // renommage : le nom personnalise prime ensuite partout (liste,
    // noms des fichiers exportes) ; vide -> retour au nom extrait
    row.querySelector('[data-act="rename"]').addEventListener("click", async () => {
      const nn = prompt("Nom de la session (laisser vide pour reprendre le nom extrait) :", s.process);
      if (nn === null) return;
      try {
        const res = await apiFetch(`/api/session/${s.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: nn })
        });
        if (!res.ok) throw new Error((await res.json()).error || "Erreur serveur");
        refreshSessions();
      } catch (e) { alert("Renommage impossible : " + e.message); }
    });
    // suppression avec double confirmation nommant le processus ; la
    // session part en corbeille cote serveur, pas d'effacement brut
    row.querySelector('[data-act="del"]').addEventListener("click", async () => {
      if (!confirm(`Supprimer la session « ${s.process} » ?\nElle sera déplacée dans la corbeille du serveur (logs/sessions/corbeille/), d'où un administrateur peut encore la restaurer ou l'effacer définitivement.`)) return;
      if (!confirm(`Dernière confirmation : supprimer « ${s.process} » de l'historique ?`)) return;
      try {
        const res = await apiFetch(`/api/session/${s.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error((await res.json()).error || "Erreur serveur");
        refreshSessions();
      } catch (e) { alert("Suppression impossible : " + e.message); }
    });
    // pages derivables apres coup : n'importe quel sous-ensemble se
    // recompose depuis le modele journalise, sans nouvel appel LLM
    row.querySelector('[data-act="pages"]').addEventListener("click", () => {
      const open = row.querySelector(".pages-box");
      if (open) { open.remove(); return; }
      const box = document.createElement("div");
      box.className = "pages-box";
      const names = ["Makigami", "Processus", "BPMN", "RACI", "SIPOC", "Analyse"];
      box.innerHTML = names.map((n) =>
        `<label class="check"><input type="checkbox" value="${n}"${(s.pages || []).includes(n) ? " checked" : ""}/> ${n}</label>`
      ).join("") +
        `<button type="button" class="ghost small" data-act="dlpages">Télécharger ces pages (.drawio)</button>`;
      box.querySelector('[data-act="dlpages"]').addEventListener("click", async () => {
        const sel = [...box.querySelectorAll("input:checked")].map((i) => i.value);
        if (!sel.length) { alert("Cochez au moins une page."); return; }
        try {
          await apiDownload(`/api/session/${s.id}/render.drawio?pages=${sel.join(",")}`);
        } catch (e) { alert(e.message); }
      });
      row.appendChild(box);
    });
    listEl.appendChild(row);
  }
}

export function initSessions(dialogEl, reopenCb) {
  dialog = dialogEl;
  listEl = dialog.querySelector("#sessions-list");
  diffEl = dialog.querySelector("#session-diff");
  onReopen = reopenCb || onReopen;
  document.getElementById("btn-sessions").addEventListener("click", () => {
    diffEl.classList.add("hidden");
    dialog.showModal();
    refreshSessions().catch(() => {
      listEl.innerHTML = "<p class='status error'>Historique injoignable : le serveur est-il démarré ?</p>";
    });
  });
  document.getElementById("btn-close-sessions").addEventListener("click", () => dialog.close());
}

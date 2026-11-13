// Gestion des entretiens : blocs nommes (ajout, suppression), collage
// direct, glisser-deposer de fichiers .txt / .md lus cote navigateur,
// compteur de mots, dictee experimentale (bouton micro par bloc).
// Retrocompatibilite : un texte colle contenant l'ancien separateur
// === ENTRETIEN === est decoupe automatiquement.

import { attachDictation } from "./dictation.js";
import { parseTranscript } from "./transcript-parse.js";

// decoupage retrocompatible (fonction pure, testable hors navigateur)
export function splitLegacy(text) {
  return String(text || "")
    .split(/^\s*===+\s*ENTRETIEN[^\n]*$/im)
    .map((t) => t.trim())
    .filter(Boolean);
}

export const countWords = (t) => (String(t || "").match(/\S+/g) || []).length;

let container = null;
let seq = 0;

function updateWords(block) {
  const ta = block.querySelector("textarea");
  block.querySelector(".words").textContent = `${countWords(ta.value)} mots`;
}

function makeBlock(name, text) {
  seq++;
  const div = document.createElement("div");
  div.className = "interview";
  div.innerHTML = `
    <div class="interview-head">
      <input type="text" value="" aria-label="Nom de l'entretien"/>
      <span class="words">0 mots</span>
      <button type="button" class="pickfile" title="Charger un fichier .txt, .md, .vtt ou .srt" aria-label="Charger un fichier">📄</button>
      <button type="button" class="delblock" title="Supprimer cet entretien" aria-label="Supprimer cet entretien">✕</button>
    </div>
    <textarea placeholder="Collez le récit ici, ou déposez un fichier .txt, .md, .vtt ou .srt"></textarea>
    <div class="filehint hidden"></div>`;
  div.querySelector("input").value = name || `Entretien ${seq}`;
  const ta = div.querySelector("textarea");
  ta.value = text || "";
  div.querySelector(".delblock").addEventListener("click", () => {
    div.remove();
    if (!container.children.length) addInterview();
  });
  // dictee experimentale : micro dans l'en-tete du bloc, segments
  // finalises ajoutes au texte avec le locuteur actif
  attachDictation(div.querySelector(".interview-head"), ta, () => updateWords(div));
  ta.addEventListener("input", () => {
    // un collage contenant l'ancien separateur devient plusieurs blocs
    const parts = splitLegacy(ta.value);
    if (parts.length > 1) {
      ta.value = parts[0];
      parts.slice(1).forEach((p) => addInterview("", p));
    }
    updateWords(div);
  });
  // chargement d'un fichier texte ou de sous-titres, lu localement :
  // .txt/.md tels quels (avec decoupage retrocompatible), .vtt/.srt
  // convertis en texte de travail (locuteurs conserves, format de la
  // dictee) ; contenu insere brut avec message clair si le fichier ne
  // ressemble pas a des sous-titres
  const hint = div.querySelector(".filehint");
  const showHint = (msg) => {
    hint.textContent = msg;
    hint.classList.remove("hidden");
    setTimeout(() => hint.classList.add("hidden"), 8000);
  };
  const loadFile = (file) => {
    if (!file || !/\.(txt|md|vtt|srt)$/i.test(file.name)) {
      if (file) showHint(`Format non pris en charge : ${file.name}. Formats acceptés : .txt, .md, .vtt, .srt (pour le .docx, exportez d'abord en texte).`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result);
      if (/\.(vtt|srt)$/i.test(file.name)) {
        const parsed = parseTranscript(raw);
        if (parsed === null) {
          ta.value = raw;
          showHint("Fichier de sous-titres non reconnu (aucun horodatage trouvé) : contenu inséré tel quel, à nettoyer à la main.");
        } else {
          ta.value = parsed;
        }
      } else {
        const parts = splitLegacy(raw);
        ta.value = parts[0] || "";
        parts.slice(1).forEach((p) => addInterview("", p));
      }
      const input = div.querySelector("input");
      if (/^Entretien \d+$/.test(input.value)) input.value = file.name.replace(/\.(txt|md|vtt|srt)$/i, "");
      updateWords(div);
    };
    reader.readAsText(file);
  };
  div.addEventListener("dragover", (e) => { e.preventDefault(); div.classList.add("dragover"); });
  div.addEventListener("dragleave", () => div.classList.remove("dragover"));
  div.addEventListener("drop", (e) => {
    e.preventDefault();
    div.classList.remove("dragover");
    loadFile(e.dataTransfer.files && e.dataTransfer.files[0]);
  });
  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = ".txt,.md,.vtt,.srt";
  picker.className = "hidden";
  div.appendChild(picker);
  div.querySelector(".pickfile").addEventListener("click", () => picker.click());
  picker.addEventListener("change", () => { loadFile(picker.files && picker.files[0]); picker.value = ""; });
  container.appendChild(div);
  updateWords(div);
  return div;
}

export function addInterview(name, text) {
  return makeBlock(name, text);
}

// [{ name, text }] des blocs non vides, dans l'ordre d'affichage
export function getInterviews() {
  return [...container.querySelectorAll(".interview")].map((div) => ({
    name: div.querySelector("input").value.trim(),
    text: div.querySelector("textarea").value.trim()
  })).filter((x) => x.text);
}

// remplace le texte de tous les blocs (retour de l'anonymisation)
export function setTexts(texts) {
  const blocks = [...container.querySelectorAll(".interview")];
  blocks.forEach((div, i) => {
    if (texts[i] != null) {
      div.querySelector("textarea").value = texts[i];
      updateWords(div);
    }
  });
}

export function getAllTexts() {
  return [...container.querySelectorAll(".interview")].map((d) => d.querySelector("textarea").value);
}

export function initInterviews(el) {
  container = el;
  addInterview();
}

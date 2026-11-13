// Dictee d'entretien (experimental, leger) : reconnaissance vocale du
// navigateur (Web Speech API), AUCUNE dependance lourde, rien cote
// serveur. Distinction des locuteurs sans apprentissage : l'intervieweur
// bascule d'un clic (ou au clavier) quand la parole change, chaque
// segment finalise est prefixe du locuteur actif. La logique de
// prefixage est pure et testable hors navigateur.

export const SPEAKERS = [
  ["interviewer", "Intervieweur"],
  ["metier", "Métier"]
];

// ajoute un segment finalise au texte, prefixe du locuteur ; regroupe
// les segments consecutifs du meme locuteur sur la meme ligne
export function appendSegment(text, speakerLabel, segment) {
  const seg = String(segment || "").trim();
  if (!seg) return text;
  const base = String(text || "");
  const prefix = `${speakerLabel} : `;
  const lines = base.split("\n");
  const last = lines[lines.length - 1];
  if (last && last.startsWith(prefix)) {
    lines[lines.length - 1] = `${last.trim()} ${seg}`;
    return lines.join("\n");
  }
  return (base && !base.endsWith("\n") ? base + "\n" : base) + prefix + seg;
}

export function dictationSupported() {
  return typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

// Accroche la dictee a un bloc d'entretien : bouton micro dans headEl,
// bascule de locuteurs pendant l'enregistrement (clic ou touche F2),
// resultats intermediaires en grise sous la zone de texte.
export function attachDictation(headEl, textarea, onChange) {
  const mic = document.createElement("button");
  mic.type = "button";
  mic.className = "mic";
  mic.textContent = "🎤";
  const honest = "La reconnaissance vocale du navigateur peut transmettre l'audio au service du navigateur ; rien n'est envoyé au serveur Agent MIP.";
  if (!dictationSupported()) {
    mic.disabled = true;
    mic.title = "Dictée non disponible dans ce navigateur : collez une transcription ou utilisez un outil de transcription externe.";
    headEl.insertBefore(mic, headEl.lastElementChild);
    return;
  }
  mic.title = "Dictée (expérimental). Basculez le locuteur d'un clic ou avec F2 quand la parole change ; chaque segment est préfixé du locuteur actif. " + honest;
  headEl.insertBefore(mic, headEl.lastElementChild);

  const bar = document.createElement("div");
  bar.className = "speaker-bar hidden";
  SPEAKERS.forEach(([key, label], i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.speaker = key;
    b.textContent = label;
    b.className = "speaker" + (i === 0 ? " active" : "");
    b.title = "Locuteur actif pour les prochains segments (bascule : clic ou F2)";
    bar.appendChild(b);
  });
  const interim = document.createElement("div");
  interim.className = "interim";
  textarea.insertAdjacentElement("afterend", interim);
  textarea.insertAdjacentElement("afterend", bar);

  let active = false;
  let speaker = SPEAKERS[0][1];
  const setSpeaker = (key) => {
    bar.querySelectorAll(".speaker").forEach((b) => {
      const on = b.dataset.speaker === key;
      b.classList.toggle("active", on);
      if (on) speaker = b.textContent;
    });
  };
  bar.addEventListener("click", (e) => {
    if (e.target.dataset && e.target.dataset.speaker) setSpeaker(e.target.dataset.speaker);
  });
  const toggleSpeaker = () => {
    const cur = bar.querySelector(".speaker.active");
    const next = cur && cur.nextElementSibling ? cur.nextElementSibling : bar.firstElementChild;
    setSpeaker(next.dataset.speaker);
  };
  const keyHandler = (e) => {
    if (e.key === "F2" && active) { e.preventDefault(); toggleSpeaker(); }
  };

  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  let lang = "fr-CH";
  const start = () => {
    rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (evt) => {
      let interimText = "";
      for (let i = evt.resultIndex; i < evt.results.length; i++) {
        const r = evt.results[i];
        if (r.isFinal) {
          textarea.value = appendSegment(textarea.value, speaker, r[0].transcript);
          if (onChange) onChange();
        } else {
          interimText += r[0].transcript;
        }
      }
      interim.textContent = interimText;
    };
    rec.onerror = (e) => {
      // repli fr-CH -> fr-FR si la langue n'est pas disponible
      if (e.error === "language-not-supported" && lang === "fr-CH") {
        lang = "fr-FR";
        try { rec.stop(); } catch (_) { /* deja arrete */ }
      }
    };
    rec.onend = () => { if (active) start(); };
    rec.start();
  };
  mic.addEventListener("click", () => {
    active = !active;
    mic.classList.toggle("recording", active);
    bar.classList.toggle("hidden", !active);
    if (active) {
      document.addEventListener("keydown", keyHandler);
      start();
    } else {
      document.removeEventListener("keydown", keyHandler);
      interim.textContent = "";
      if (rec) { rec.onend = null; try { rec.stop(); } catch (_) { /* deja arrete */ } }
    }
  });
}

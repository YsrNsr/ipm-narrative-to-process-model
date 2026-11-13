// Transcriptions reelles : sous-titres .vtt (Teams, Whisper) et .srt
// (Zoom et consorts). Retire horodatages, numeros de sequence et
// balises, recolle les lignes en paragraphes, et conserve les noms de
// locuteurs quand le format les porte (<v Nom> en VTT, "Nom :" en tete
// de replique) sous la forme "Nom : texte" — le meme format que la
// dictee. Module pur, sans DOM, importable par les tests Node.

const TIME_RE = /-->/;
const SRT_INDEX_RE = /^\d+$/;
const SPEAKER_LINE_RE = /^([A-ZÀ-Þ][\w'’. -]{0,40}?)\s*:\s+(.*)$/;

// retire les balises de sous-titres en capturant le locuteur <v Nom>
function stripTags(line, current) {
  let speaker = current;
  const v = line.match(/<v(?:\.[^ >]*)?\s+([^>]+)>/);
  if (v) speaker = v[1].trim();
  const text = line
    .replace(/<v(?:\.[^ >]*)?\s+[^>]+>/g, "")
    .replace(/<\/?[a-zA-Z][^>]*>/g, "")
    .replace(/\{\\?[^}]*\}/g, "")
    .trim();
  return { speaker, text };
}

// true si le contenu ressemble bien a des sous-titres horodates
export function looksLikeSubtitles(content) {
  return TIME_RE.test(String(content || ""));
}

// Convertit un .vtt ou .srt en texte de travail. Renvoie null si le
// contenu ne ressemble pas a des sous-titres (l'appelant insere brut).
export function parseTranscript(content) {
  const raw = String(content || "");
  if (!looksLikeSubtitles(raw)) return null;
  const lines = raw.split(/\r?\n/);
  const segments = []; // { speaker|null, text }
  let inNoteBlock = false;
  let cueSpeaker = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) { inNoteBlock = false; cueSpeaker = null; continue; }
    if (/^WEBVTT/.test(line)) continue;
    if (/^(NOTE|STYLE|REGION)\b/.test(line)) { inNoteBlock = true; continue; }
    if (inNoteBlock) continue;
    if (TIME_RE.test(line)) { cueSpeaker = null; continue; }
    // numero de sequence SRT (ou identifiant de cue juste avant l'horodatage)
    if (SRT_INDEX_RE.test(line) && TIME_RE.test((lines[i + 1] || ""))) continue;
    if (!TIME_RE.test(line) && TIME_RE.test((lines[i + 1] || "")) && !SPEAKER_LINE_RE.test(line)) {
      // identifiant de cue VTT nomme, suivi de l'horodatage
      continue;
    }
    let { speaker, text } = stripTags(line, cueSpeaker);
    cueSpeaker = speaker;
    if (!text) continue;
    // locuteur en tete de replique ("Nom : texte")
    const m = text.match(SPEAKER_LINE_RE);
    if (m && m[1].length <= 40) { speaker = m[1].trim(); text = m[2].trim(); }
    const last = segments[segments.length - 1];
    if (last && last.speaker === speaker) last.text += (last.text ? " " : "") + text;
    else segments.push({ speaker, text });
  }
  if (!segments.length) return null;
  return segments
    .map((s) => (s.speaker ? `${s.speaker} : ${s.text}` : s.text))
    .join("\n");
}

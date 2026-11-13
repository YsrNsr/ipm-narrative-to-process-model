// Normalisation des expressions de duree : convertit les formes
// litterales en une valeur canonique en minutes, et extrait la valeur
// principale si l'expression en contient plusieurs. Utilisee par le
// scoreur (comparaison equitable des reformulations) et par le rendu
// (barre de temps proportionnelle du Makigami).

const norm = (s) => String(s == null ? "" : s)
  .toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/\s+/g, " ")
  .trim();

const NUMBER_WORDS = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7,
  huit: 8, neuf: 9, dix: 10, douze: 12, quinze: 15, vingt: 20, trente: 30,
  quarante: 40, cinquante: 50, soixante: 60, cent: 100
};
const UNIT_MINUTES = {
  seconde: 1 / 60, secondes: 1 / 60, s: 1 / 60,
  min: 1, mn: 1, minute: 1, minutes: 1,
  h: 60, heure: 60, heures: 60,
  jour: 1440, jours: 1440, j: 1440,
  semaine: 10080, semaines: 10080,
  mois: 43200
};

export function normalizeDuration(s) {
  const t = norm(s);
  if (!t) return null;
  // formes figees sans nombre explicite
  if (/trois quarts d.heure/.test(t)) return 45;
  if (/quart d.heure/.test(t)) return 15;
  if (/demi[- ]?journee/.test(t)) return 720;
  if (/demi[- ]?heure/.test(t)) return 30;
  // premiere occurrence nombre + unite = valeur principale
  const re = /(\d+(?:[.,]\d+)?|[a-z]+)[\s-]*(secondes?|min(?:utes?)?|mn|h(?:eures?)?|jours?|semaines?|mois)\b/g;
  let m;
  while ((m = re.exec(t))) {
    const value = /^\d/.test(m[1]) ? Number(m[1].replace(",", ".")) : NUMBER_WORDS[m[1]];
    const factor = UNIT_MINUTES[m[2]];
    if (value != null && factor != null) return value * factor;
  }
  return null;
}

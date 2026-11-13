// Purge manuelle des sessions anciennes, sans demarrer le serveur.
// Les sessions partent en corbeille (logs/sessions/corbeille/), jamais
// d'effacement brut ; vider la corbeille reste un geste manuel.
//   npm run purge -- --days 30          recapitulatif puis confirmation
//   npm run purge -- --days 30 --yes    sans question (automatisation)
//   --dir <chemin>                      autre dossier de sessions
//                                       (defaut : logs/sessions du projet)

import { fileURLToPath } from "node:url";
import path from "node:path";
import readline from "node:readline";
import { listExpired, trashSession } from "../src/session-store.js";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? (args[i + 1] || "") : null;
};

const days = Number(flag("--days"));
if (!Number.isFinite(days) || days <= 0) {
  console.error("Usage : npm run purge -- --days <N> [--yes] [--dir <chemin>]");
  console.error("Deplace en corbeille les sessions plus anciennes que N jours.");
  process.exit(1);
}
const dir = flag("--dir")
  || path.join(fileURLToPath(new URL("../logs", import.meta.url)), "sessions");
const auto = args.includes("--yes");

const expired = listExpired(dir, days);
if (!expired.length) {
  console.log(`Aucune session de plus de ${days} jours dans ${dir} : rien a faire.`);
  process.exit(0);
}

console.log(`Sessions de plus de ${days} jours dans ${dir} :`);
for (const e of expired) console.log(`  - ${e.id}  ${e.createdAt}  « ${e.process} »`);
console.log(`${expired.length} session(s) a deplacer vers ${path.join(dir, "corbeille")}.`);

async function confirmThenPurge() {
  if (!auto) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise((r) => rl.question("Confirmer le deplacement ? (oui/non) ", r));
    rl.close();
    if (!/^o(ui)?$/i.test(answer.trim())) {
      console.log("Abandon : rien n'a ete deplace.");
      process.exit(0);
    }
  }
  let moved = 0;
  for (const e of expired) {
    const file = trashSession(dir, e.id);
    if (file) { moved++; console.log(`  deplacee : ${e.id} -> ${file}`); }
  }
  console.log(`Termine : ${moved} session(s) en corbeille. Vider ${path.join(dir, "corbeille")} est l'effacement definitif.`);
}

confirmThenPurge();

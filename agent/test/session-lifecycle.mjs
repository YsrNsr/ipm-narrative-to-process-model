// Cycle de vie des sessions : persistance, corbeille, retention et
// script de purge — exclusivement sur un REPERTOIRE TEMPORAIRE. Le
// vrai logs/sessions/ n'est jamais touche par ce test.
// Usage : node test/session-lifecycle.mjs

import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { loadSessions, persistSession, trashSession, listExpired, applyRetention } from "../src/session-store.js";

let failures = 0;
const ok = (cond, msg) => {
  if (cond) console.log(`  ok   ${msg}`);
  else { console.log(`  FAIL ${msg}`); failures++; }
};

const DAY = 86400e3;
// Relative to the current date: scripts/purge.mjs uses the real clock.
const NOW = Date.now();
const mkSession = (id, ageDays, process = "Processus test") => ({
  id,
  createdAt: new Date(NOW - ageDays * DAY).toISOString(),
  model: { process, actors: ["A"], steps: [] }
});

const tmp = mkdtempSync(path.join(tmpdir(), "agentmip-sessions-"));
try {
  console.log("\n[1] Persistance et rechargement");
  persistSession(tmp, mkSession("vieille-1", 40, "Vieux processus"));
  persistSession(tmp, mkSession("vieille-2", 31));
  persistSession(tmp, mkSession("recente-1", 5, "Processus recent"));
  const loaded = loadSessions(tmp);
  ok(loaded.size === 3, `3 sessions rechargees (recu: ${loaded.size})`);
  ok(loaded.get("vieille-1").model.process === "Vieux processus", "contenu preserve");

  console.log("\n[2] Suppression -> corbeille (jamais d'effacement brut)");
  const file = trashSession(tmp, "vieille-2", NOW);
  ok(file !== null && file.startsWith("corbeille"), `fichier deplace (${file})`);
  ok(!existsSync(path.join(tmp, "vieille-2.json")), "retire du dossier des sessions");
  const trashed = readdirSync(path.join(tmp, "corbeille"));
  ok(trashed.length === 1 && /_vieille-2\.json$/.test(trashed[0]), "nom horodate en corbeille");
  ok(JSON.parse(readFileSync(path.join(tmp, "corbeille", trashed[0]), "utf8")).id === "vieille-2",
    "contenu intact en corbeille : restauration possible");
  ok(trashSession(tmp, "inconnue", NOW) === null, "id inconnu -> null, pas d'erreur");
  ok(loadSessions(tmp).size === 2, "la corbeille n'est pas rechargee comme session");

  console.log("\n[3] Retention (SESSION_RETENTION_DAYS)");
  const exp = listExpired(tmp, 30, NOW);
  ok(exp.length === 1 && exp[0].id === "vieille-1", "listExpired : seule la session de 40 jours");
  ok(exp[0].process === "Vieux processus", "recapitulatif : le processus est nomme");
  const moved = applyRetention(tmp, 30, NOW);
  ok(moved.length === 1 && moved[0].id === "vieille-1" && moved[0].file,
    "applyRetention deplace et rend la liste (une ligne de journal par session)");
  ok(loadSessions(tmp).size === 1 && loadSessions(tmp).has("recente-1"),
    "la session recente reste");
  ok(applyRetention(tmp, 30, NOW).length === 0, "seconde passe : rien a deplacer");

  console.log("\n[4] Script de purge manuelle (scripts/purge.mjs)");
  persistSession(tmp, mkSession("vieille-3", 90, "Purge test"));
  const out = execFileSync(process.execPath,
    [path.join("scripts", "purge.mjs"), "--days", "30", "--yes", "--dir", tmp],
    { cwd: new URL("..", import.meta.url), encoding: "utf8" });
  ok(/vieille-3/.test(out) && /1 session\(s\) a deplacer/.test(out), "recapitulatif nomme la session");
  ok(/Termine : 1 session\(s\) en corbeille/.test(out), "total annonce, jamais silencieux");
  ok(!existsSync(path.join(tmp, "vieille-3.json")), "session deplacee par le script");
  const out2 = execFileSync(process.execPath,
    [path.join("scripts", "purge.mjs"), "--days", "30", "--yes", "--dir", tmp],
    { cwd: new URL("..", import.meta.url), encoding: "utf8" });
  ok(/rien a faire/i.test(out2), "seconde purge : rien a faire, sortie propre");
  let usage = "";
  try {
    execFileSync(process.execPath, [path.join("scripts", "purge.mjs"), "--dir", tmp],
      { cwd: new URL("..", import.meta.url), encoding: "utf8", stdio: "pipe" });
  } catch (e) { usage = String(e.stderr || ""); }
  ok(/Usage/.test(usage), "sans --days : usage explique, code de sortie non nul");

  console.log("\n[5] Cablage : serveur et historique");
  const srv = readFileSync(new URL("../server.js", import.meta.url), "utf8");
  ok(/app\.delete\("\/api\/session\/:id"/.test(srv), "route DELETE presente");
  ok(/SESSION_RETENTION_DAYS/.test(srv) && /applyRetention/.test(srv), "retention au demarrage");
  ok(/LOGS_DIR/.test(srv), "LOGS_DIR configurable");
  const sess = readFileSync(new URL("../public/js/sessions.js", import.meta.url), "utf8");
  ok(/data-act="del"/.test(sess), "action de suppression dans l'historique");
  ok((sess.match(/confirm\(`[^`]*\$\{s\.process\}/g) || []).length >= 2,
    "double confirmation nommant le processus");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} TEST(S) EN ECHEC` : "\nTOUS LES TESTS PASSENT");
process.exit(failures ? 1 : 0);

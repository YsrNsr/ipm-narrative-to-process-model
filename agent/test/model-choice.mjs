// Choix du modele : priorite parametre > variable d'environnement >
// defaut, et passage du modele choisi jusqu'au fournisseur (factice).
// Hors ligne, aucun appel LLM reel.
// Usage : node test/model-choice.mjs

import { extract, extractAll, pickModel } from "../src/llm/index.js";

let failures = 0;
const ok = (cond, msg) => {
  if (cond) console.log(`  ok   ${msg}`);
  else { console.log(`  FAIL ${msg}`); failures++; }
};

console.log("\n[1] Priorite parametre > env > defaut");
delete process.env.TEST_MODEL_ENV;
ok(pickModel(null, "TEST_MODEL_ENV", "defaut-code") === "defaut-code", "sans rien : defaut du code");
process.env.TEST_MODEL_ENV = "modele-env";
ok(pickModel(null, "TEST_MODEL_ENV", "defaut-code") === "modele-env", "env presente : env gagne sur le defaut");
ok(pickModel("modele-param", "TEST_MODEL_ENV", "defaut-code") === "modele-param",
  "parametre present : il gagne sur l'env");
ok(pickModel("   ", "TEST_MODEL_ENV", "defaut-code") === "modele-env", "parametre blanc ignore");
delete process.env.TEST_MODEL_ENV;

console.log("\n[2] Le modele choisi descend jusqu'au fournisseur");
{
  const calls = [];
  const impl = {
    complete: async (messages, opts) => {
      calls.push(opts && opts.model);
      return JSON.stringify({
        process: "P", actors: ["A"],
        steps: [{ id: "s1", actors: ["A"], stage: 1, label: "Faire" },
          { id: "s2", actors: ["A"], stage: 2, label: "Suite" }]
      });
    }
  };
  await extract("Un recit.", { impl, model: "mon-modele" });
  ok(calls.length === 1 && calls[0] === "mon-modele", "opts.model transmis a complete()");
  calls.length = 0;
  await extract("Un recit.", { impl });
  ok(calls[0] === undefined, "sans choix : le fournisseur resout env/defaut lui-meme");
}

console.log("\n[3] La requete corrective garde le meme modele");
{
  const calls = [];
  let first = true;
  const impl = {
    complete: async (messages, opts) => {
      calls.push(opts && opts.model);
      if (first) { first = false; return "pas du json"; }
      return JSON.stringify({
        process: "P", actors: ["A"],
        steps: [{ id: "s1", actors: ["A"], stage: 1, label: "Faire" },
          { id: "s2", actors: ["A"], stage: 2, label: "Suite" }]
      });
    }
  };
  await extract("Un recit.", { impl, model: "modele-fixe" });
  ok(calls.length === 2 && calls[0] === "modele-fixe" && calls[1] === "modele-fixe",
    "les deux appels (initial + reparation) portent le modele choisi");
}

console.log("\n[4] Extractions multiples : limite de concurrence");
{
  const makeSlowImpl = () => {
    let active = 0, maxActive = 0, calls = 0;
    const impl = {
      complete: async () => {
        active++; calls++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 30));
        active--;
        return JSON.stringify({
          process: "P", actors: ["A"],
          steps: [{ id: "s1", actors: ["A"], stage: 1, label: "Faire" },
            { id: "s2", actors: ["A"], stage: 2, label: "Suite" }]
        });
      }
    };
    return { impl, stats: () => ({ maxActive, calls }) };
  };
  const texts = ["t1", "t2", "t3", "t4", "t5"];
  const cloud = makeSlowImpl();
  const rc = await extractAll(texts, { provider: "anthropic", impl: cloud.impl });
  ok(rc.models.length === 5 && rc.models.every(Boolean), "cinq modeles extraits, ordre preserve");
  ok(cloud.stats().maxActive === 3,
    `cloud : au plus 3 extractions simultanees (recu: ${cloud.stats().maxActive})`);
  const local = makeSlowImpl();
  await extractAll(texts.slice(0, 3), { provider: "ollama", impl: local.impl });
  ok(local.stats().maxActive === 1,
    `ollama : strictement sequentiel (recu: ${local.stats().maxActive})`);
}

console.log(failures ? `\n${failures} TEST(S) EN ECHEC` : "\nTOUS LES TESTS PASSENT");
process.exit(failures ? 1 : 0);

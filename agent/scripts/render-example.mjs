// Rend le modele de reference du raccordement en fichier .drawio ouvrable.
// Utile pour inspecter visuellement le rendu sans appel LLM.
// Usage : node scripts/render-example.mjs

import { normalizeModel } from "../src/schema.js";
import { renderDrawioXml } from "../src/drawio.js";
import { writeFileSync } from "node:fs";

const model = normalizeModel({
  process: "Traitement d'une demande de raccordement",
  actors: ["Client", "Service clientele", "Bureau technique", "Technicien terrain"],
  steps: [
    { id: "s1", actor: "Client", label: "Remplir le formulaire de demande",
      documents_out: ["Demande de raccordement"], tools: ["Portail web"] },
    { id: "s2", actor: "Service clientele", label: "Recuperer et verifier le dossier",
      documents_in: ["Demande de raccordement"], tools: ["CRM"], friction: "Pieces justificatives souvent manquantes" },
    { id: "s3", actor: "Bureau technique", label: "Etudier la faisabilite",
      documents_out: ["Avis de faisabilite"], tools: ["SIG"], duration: "5 jours" },
    { id: "s4", actor: "Technicien terrain", label: "Realiser le raccordement",
      friction: "Acces au site requis" },
    { id: "s5", actor: "Service clientele", label: "Cloturer le dossier et facturer",
      documents_out: ["Facture"], tools: ["ERP"] }
  ]
});

// Le rendu produit deja un <mxfile> complet a deux pages.
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` + renderDrawioXml(model) + "\n";

writeFileSync(new URL("../examples/raccordement_reference.drawio", import.meta.url), xml, "utf8");
console.log("Ecrit examples/raccordement_reference.drawio (" + xml.length + " octets)");

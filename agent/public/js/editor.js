// Editeur Draw.io integre (embed.diagrams.net, protocole postMessage) :
// chargement du XML, autosauvegarde vers la session avec un differe,
// suivi du dernier etat connu pour l'export .drawio local.

import { apiFetch } from "./api.js";

let iframe = null;
let baseSrc = "";
let pendingXml = null;
let lastXml = null;
let sessionId = null;
let sendTimer = null;
let onSaved = () => {};

export const getLastXml = () => lastXml;
export const getSessionId = () => sessionId;

function queueFinal(xml) {
  lastXml = xml;
  if (!sessionId) return;
  clearTimeout(sendTimer);
  sendTimer = setTimeout(async () => {
    try {
      const res = await apiFetch(`/api/session/${sessionId}/final`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xml })
      });
      const data = await res.json();
      onSaved(data);
    } catch (_) { /* hors ligne : lastXml reste disponible pour l'export */ }
  }, 1500);
}

// Export PNG de la page courante via le protocole embed : envoie
// l'action export et attend le message de retour portant l'image en
// data URI. La nouvelle tentative est laissee a l'utilisateur.
let pngWaiter = null;
// options.xml : contenu a rendre (page unique extraite par pagepick) ;
// sans lui, l'editeur exporte son contenu courant
export function exportPng(options = {}) {
  return new Promise((resolve, reject) => {
    if (!iframe || iframe.classList.contains("hidden")) {
      reject(new Error("Aucune grille chargee dans l'editeur."));
      return;
    }
    clearTimeout(pngWaiter && pngWaiter.timer);
    const timer = setTimeout(() => {
      pngWaiter = null;
      reject(new Error("L'éditeur n'a pas répondu."));
    }, 10000);
    pngWaiter = { resolve, timer };
    const msg = { action: "export", format: "png", spin: "Export en cours" };
    if (options.xml) msg.xml = options.xml;
    iframe.contentWindow.postMessage(JSON.stringify(msg), "*");
  });
}

// charge un XML dans l'editeur (recharge l'iframe pour declencher init)
export function loadXml(xml, newSessionId) {
  pendingXml = xml;
  lastXml = xml;
  if (newSessionId !== undefined) sessionId = newSessionId;
  iframe.classList.remove("hidden");
  const empty = document.getElementById("empty-state");
  if (empty) empty.classList.add("hidden");
  iframe.src = baseSrc;
}

export function initEditor(el, savedCb) {
  iframe = el;
  baseSrc = iframe.src;
  onSaved = savedCb || onSaved;
  window.addEventListener("message", (evt) => {
    if (typeof evt.data !== "string") return;
    let msg;
    try { msg = JSON.parse(evt.data); } catch (_) { return; }
    if (msg.event === "init" && pendingXml) {
      iframe.contentWindow.postMessage(
        JSON.stringify({ action: "load", autosave: 1, xml: pendingXml }), "*");
      pendingXml = null;
    } else if ((msg.event === "save" || msg.event === "autosave") && msg.xml) {
      queueFinal(msg.xml);
    } else if (msg.event === "export" && msg.data && pngWaiter) {
      clearTimeout(pngWaiter.timer);
      pngWaiter.resolve(msg.data);
      pngWaiter = null;
    }
  });
}

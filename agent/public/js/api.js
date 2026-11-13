// Toutes les requetes API du client passent par ici : ajout du jeton
// d'acces (deploiement partage, AUTH_TOKEN cote serveur) et invite au
// premier 401. Le jeton vit en sessionStorage — pas localStorage : un
// poste partage ne doit pas le retenir indefiniment.

const TOKEN_KEY = "agentmip.token";

function withToken(options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (token) headers["X-Auth-Token"] = token;
  return { ...options, headers };
}

export async function apiFetch(url, options = {}) {
  let res = await fetch(url, withToken(options));
  if (res.status === 401) {
    const t = prompt("Accès protégé : entrez le jeton d'accès (AUTH_TOKEN du serveur).");
    if (t === null) return res;
    sessionStorage.setItem(TOKEN_KEY, t.trim());
    res = await fetch(url, withToken(options));
  }
  return res;
}

// Telechargement d'un export : par blob plutot que par navigation,
// pour que le jeton parte aussi avec la requete. Le nom de fichier
// vient de l'en-tete Content-Disposition (derive du processus).
export async function apiDownload(url, fallbackName) {
  const res = await apiFetch(url);
  if (!res.ok) {
    let msg = `Téléchargement impossible (${res.status})`;
    try { msg = (await res.json()).error || msg; } catch (_) { /* corps non JSON */ }
    throw new Error(msg);
  }
  const dispo = res.headers.get("Content-Disposition") || "";
  const m = /filename="([^"]+)"/.exec(dispo);
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (m && m[1]) || fallbackName || "export";
  a.click();
  URL.revokeObjectURL(a.href);
}

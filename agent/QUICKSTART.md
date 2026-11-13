# Agent MIP — démarrer en cinq minutes

Transformer un récit d'entretien en grille MIP (acteurs × étapes +
métadonnées), la relire avec le métier, l'exporter. Le fond est dans le
[README](README.md) ; cette page fait seulement démarrer.

## 1. Installer

**Avec Node.js (18+)** :

```
git clone <depot> agent-mip
cd agent-mip
npm install
copy .env.example .env       # cp sous Linux/macOS
npm start                    # → http://localhost:3000
```

**Ou avec Docker** (depuis le dossier du projet, `.env` rempli) :

```
docker build -t agent-mip .
docker run -d -p 3000:3000 --name agent-mip -v "%cd%\.env:/app/.env:ro" -v "%cd%\logs:/app/logs" agent-mip
```

## 2. Configurer `.env` (trois lignes)

Au choix, **local** (rien ne quitte la machine ; installer
https://ollama.com puis `ollama pull mistral`) :

```
PROVIDER=ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=mistral
```

ou **cloud** (plus rapide et plus fidèle ; anonymiser avant d'envoyer) :

```
PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-opus-5
```

## 3. Générer

1. Ouvrir http://localhost:3000.
2. Coller un récit d'entretien dans le bloc de gauche — ou cliquer
   **« Charger l'exemple : demande de congés »**.
3. Cliquer **« Générer la grille MIP »**. Le temps écoulé s'affiche
   (compter ~30 s en cloud, beaucoup plus en local).

## 4. Relire et corriger

- La grille s'ouvre dans l'éditeur central : chaque valeur douteuse est
  marquée « ≈ » ; corriger directement dans les cellules, tout est
  autosauvegardé dans la session.
- Le panneau droit liste les points à parcourir avec le métier ; cocher
  au fil de la relecture.
- Cliquer **« Marquer comme validé par le métier »** : cette version
  devient l'artefact de référence de la session.

## 5. Exporter

Sous le bouton de génération : fichier Draw.io (toutes les pages
cochées), PNG de la page choisie, fiche processus (.md), tableau (.csv),
liste de validation, questions d'entretien, BPMN (.bpmn), modèle brut
(.json). Les fichiers prennent le nom du processus.

**Ensuite** : le bouton « Historique » (en haut à droite) rouvre chaque
session, compare la version corrigée à l'ébauche générée, re-dérive
d'autres pages et supprime un entretien sur demande.

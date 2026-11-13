# Règles d'annotation du corpus d'évaluation

Ce document fixe les règles de construction des modèles de référence
(`*.expected.json`) du banc d'évaluation. Il doit être écrit et figé **avant**
la rédaction du corpus.

Raison d'être : un modèle de référence rédigé au jugé encode l'interprétation de
son auteur. Le banc mesure alors l'écart entre le LLM et une lecture
particulière, et non la fidélité au texte. L'incident « Technicien » contre
« Technicien terrain » en est l'illustration : la référence avait enrichi le
texte source. Des règles explicites rendent l'étalon vérifiable et opposable.

Ce document est également citable au chapitre 7 comme élément de validité de
construit.

---

## R1. Fidélité stricte au texte source

On n'annote que ce que le texte dit. Aucune inférence, aucun complément tiré de
la connaissance du domaine, même si l'ajout paraît évident.

- Le texte dit « un technicien se déplace » : l'acteur est `Technicien`.
- Le texte ne mentionne pas de validation hiérarchique : on n'en ajoute pas.

En cas de doute, la question est : puis-je pointer la phrase qui le justifie ?
Si non, on n'annote pas.

## R2. Désignation des acteurs

Reprendre la désignation la plus complète effectivement présente dans le texte,
sans troncature ni enrichissement.

- Si le texte dit « le service clientèle », l'acteur est `Service clientèle`.
- Si plusieurs formulations désignent le même acteur (« le conseiller », « le
  service clientèle »), retenir la plus explicite présente et la conserver de
  manière uniforme dans tout le modèle.
- Le locuteur qui parle à la première personne est nommé par sa fonction si le
  texte la donne, jamais par un pronom.

## R3. Granularité des étapes

Une étape correspond à une action d'un acteur produisant un résultat
identifiable. Les micro-actions consécutives d'un même acteur qui partagent le
même résultat sont regroupées.

- « Je récupère la demande dans le CRM et je vérifie que le dossier est
  complet » donne une seule étape : `Récupérer et vérifier le dossier`.

**Cas particulier des transferts entre acteurs.** Un passage de relais d'un
acteur à un autre constitue une étape à part entière lorsqu'il est explicité
dans le texte. Ce choix est délibéré : dans la tradition Makigami, les
transferts sont précisément les endroits où se logent les délais et les
frictions, c'est-à-dire l'information que le Modèle cherche à capturer. Un
modèle qui les masque perdrait sa valeur diagnostique.

- « je le transmets au bureau technique » est donc une étape.

## R3 bis. Acteurs passifs

Un acteur ne reçoit un couloir que si le texte lui attribue **au moins une
action**. Une entité qui n'est qu'objet ou destinataire d'actions n'est pas un
acteur du modèle : elle apparaît, selon le cas, comme document, comme
destinataire mentionné dans un libellé, ou n'apparaît pas.

- Dans le cas 01, le client remplit un formulaire : il agit, il obtient un
  couloir.
- Dans le cas 03, le candidat ne fait que recevoir le contrat : il n'obtient pas
  de couloir.

Justification : un couloir représente une responsabilité opérationnelle. Ouvrir
un couloir vide de toute action alourdit la lecture sans apporter d'information,
ce qui contrevient au principe de lisibilité cognitive (PC4).

Cette règle a été ajoutée après observation empirique : sur le cas 03, le modèle
n'avait pas retenu le candidat comme acteur, et cette lecture s'est révélée plus
défendable que celle de la référence initiale. C'est la seconde fois qu'une
divergence entre modèle et référence révèle une faiblesse de la référence et non
du modèle, ce qui confirme l'utilité du contrôle entre annotateurs.

## R4. Ordre des étapes

L'ordre suit le déroulement décrit par le texte, et non l'ordre d'apparition des
phrases lorsque le récit revient en arrière. Si le texte est ambigu sur
l'ordonnancement de deux étapes, conserver l'ordre d'apparition et le signaler
en commentaire du fichier de référence.

## R5. Métadonnées

Quatre catégories, à ne pas confondre.

- `documents_in` et `documents_out` : objets d'information consommés ou produits
  (formulaire, dossier, bon d'intervention, facture). Un même document produit
  par une étape et consommé par la suivante apparaît en sortie de la première et
  en entrée de la seconde.
- `tools` : systèmes ou applications informatiques nommés (CRM, SIG, ERP,
  portail web). Ne pas y mettre d'outils physiques ni de moyens de
  communication génériques, sauf mention explicite.
- `duration` : durée ou délai explicitement chiffré, recopié tel quel
  (« 5 jours », « 10 min »). Vide si le texte ne chiffre rien.
- `friction` : difficulté, blocage, condition ou source de perte de temps
  explicitement mentionnés (« il manque souvent des pièces », « à condition
  d'avoir accès au site »). Une seule friction par étape ; s'il y en a
  plusieurs, retenir la plus explicite.

Les champs non renseignés par le texte restent vides. Un champ vide est une
information, pas un oubli.

## R6. Rattachement

Chaque métadonnée est rattachée à l'étape où elle apparaît dans le récit. Un
outil mentionné une fois pour un ensemble d'étapes n'est rattaché qu'à celle que
le texte associe explicitement.

---

## Procédure de construction du corpus

1. Rédiger ou collecter la transcription, la déposer en `eval/corpus/NN_nom.txt`.
2. Annoter en appliquant R1 à R6, produire `NN_nom.expected.json`.
3. Relire à froid, au moins un jour plus tard, en vérifiant chaque élément
   contre une phrase du texte.
4. Consigner en commentaire les cas litigieux et la décision prise.

## Contrôle de fiabilité entre annotateurs

Fortement recommandé pour la solidité du chapitre 7, et peu coûteux.

Faire annoter deux transcriptions du corpus par une seconde personne (un
camarade, à qui l'on remet ce document et rien d'autre), puis calculer l'accord
sur les acteurs, les étapes et les métadonnées. Un accord élevé valide l'étalon ;
un désaccord révèle une règle à préciser. Le résultat se rapporte en une phrase
au chapitre 7 et répond par avance à la question de la validité de la référence.

## Composition visée du corpus

Six à huit cas, variés selon les dimensions suivantes :

- longueur : deux cas courts, trois moyens, deux longs ;
- ordre du récit : au moins deux transcriptions désordonnées, avec retours en
  arrière et digressions, car c'est le régime réel des entretiens ;
- nombre d'acteurs : de deux à six ;
- densité de métadonnées : au moins un cas pauvre en métadonnées et un cas très
  riche ;
- origine : privilégier au moins deux transcriptions issues d'entretiens réels,
  anonymisées, le reste pouvant être synthétique mais réaliste. Documenter
  l'origine de chaque cas.

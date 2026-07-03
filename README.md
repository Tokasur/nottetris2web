# Not Tetris 2 — version web 🕹️

> Fork de [Not Tetris 2](https://stabyourself.net/nottetris2/) (stabyourself.net) avec un
> **portage web complet** : le jeu tourne dans n'importe quel navigateur, sur
> **PC (clavier), smartphone (tactile) aussi compatible manette**.
>
> *Le jeu original (dossier racine, en Lua) tourne sur LÖVE 0.7.2 — il n'est pas modifié.
> La version web vit dans le dossier [`docs/`](docs/).*

**Not Tetris 2**, c'est Tetris… mais avec un vrai moteur physique : les pièces tombent,
basculent, glissent et s'empilent de travers. Quand une ligne est assez remplie (8,1 blocs),
elle est **découpée physiquement** — les morceaux restants retombent.

---

## 🎮 Jouer

### En ligne

```
https://tokasur.github.io/nottetris2web/
```

### En local (2 commandes)

```bash
cd nottetris2web
python3 -m http.server 8000
# puis ouvrir http://localhost:8000/docs/ dans le navigateur
```

> Ouvrir `docs/index.html` par double-clic fonctionne aussi, mais le navigateur bloque alors les couleurs et le son (restrictions `file://`). Préférez le petit serveur ci-dessus.

---

## ⌨️🖐️🎮 Contrôles

| Action | Clavier | Tactile (mobile) | Manette |
|---|---|---|---|
| Déplacer | ← → | ◀ ▶ | Croix / stick gauche |
| Descente rapide | ↓ | ▼ | Croix bas / stick bas |
| Rotation horaire | X (ou ↑ pour tourner via ▲) | ⟳ | A / Y / RB |
| Rotation anti-horaire | Z, W ou Y (AZERTY ok) | ⟲ | B / X / LB |
| Démarrer / Pause | Entrée | START | Start |
| Retour / Menu | Échap | SELECT | Select/Back |

- Les boutons tactiles apparaissent automatiquement sur écran tactile
  (multi-touch : on peut déplacer et tourner en même temps).
- La manette est reconnue dès qu'on appuie sur un bouton (Xbox, PlayStation, etc.).
- 📱 Sur iPhone/Android : **« Ajouter à l'écran d'accueil »** pour jouer en plein écran.

### Modes de jeu

- **Normal** : le mode classique — les lignes remplies à 81 % sont tranchées ;
  score façon NES, niveaux tous les 10 lignes, la vitesse augmente.
- **Stack** : pas de suppression de lignes, empilez un maximum de pièces (100 pts/pièce).
- High scores sauvegardés dans le navigateur, choix de la musique (A/B/C/off),
  options volume + teinte de couleur, et la **fusée de félicitations** au-delà de
  3000 points, comme sur NES. 🚀


## 🔧 Sous le capot

- **Zéro dépendance à installer, zéro étape de build** : HTML + CSS + JavaScript vanilla.
- Physique : [Planck.js](https://piqnt.com/planck.js) (portage JS de **Box2D**, le même
  moteur que le jeu original) — embarqué dans `docs/js/planck.min.js`.
- La découpe des lignes reproduit l'algorithme original (`gameA.lua`) : chaque polygone
  convexe est rogné contre la bande de la ligne, les fragments sont regroupés par
  proximité de sommets et redeviennent des corps rigides ; les sprites sont découpés
  par *clipping* canvas.
- Rendu : canvas 160×144 (résolution Game Boy d'origine) mis à l'échelle au pixel près,
  polices bitmap et teinte de couleur (« hue ») du jeu original.
- Sons : les `.ogg` d'origine + conversion `.m4a` (AAC) pour Safari/iOS,
  Web Audio avec déblocage au premier geste.

```
docs/
├── index.html          page + boutons tactiles
├── css/style.css
├── js/
│   ├── planck.min.js   moteur physique (Box2D en JS)
│   ├── data.js         pièces, polices bitmap, constantes
│   ├── gfx.js          chargement, recoloration "hue", rendu
│   ├── sfx.js          Web Audio (ogg/m4a)
│   ├── input.js        clavier + manette + tactile unifiés
│   ├── physics.js      monde Box2D, découpe des lignes
│   ├── game.js         modes Normal & Stack
│   ├── menu.js         logo, titre, menus, options, high scores
│   ├── rocket.js       cinématique de fin 🚀
│   └── main.js         boucle, mise à l'échelle, plein écran
└── assets/             graphismes & sons du jeu original
```

### Non porté

- Le mode **2 joueurs** en écran partagé (`gameBmulti.lua`) — le jeu affiche
  « 1p only » si on le sélectionne.

---

## Crédits & licence

- Jeu original : **Maurice** ([stabyourself.net](https://stabyourself.net)) — concept
  Tetris : Alexey Pajitnov.
- Licence : [WTFPL](LICENSE.txt) (identique à l'original).
- Portage web réalisé avec Claude Code.

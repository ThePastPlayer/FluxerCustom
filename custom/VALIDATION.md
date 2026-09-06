# Validation — Fluxer LePast 1.0.2

Date : 2026-09-06. Source de l'application : 80ed1290 (lepast/custom).
Amont : fluxer-desktop-canary@2026.904.135113, bc7f701e876fde99ecd5088152981015bd823484.

## Vérifié sur le PC Windows de construction

- Compilation complète WASM + web + Electron + modules natifs pour la 1.0.1.
- Reconstruction web/Electron/paquet 1.0.2, modules natifs inchangés.
- Typecheck Electron passé ; 15 tests natifs ciblés + 6 tests propres au client passés.
- Installateur 1.0.0 exécuté avec succès, profil et identité distincts du client officiel.
- Binaire empaqueté puis binaire installé : écran de connexion rendu, API LePast
  accessible, scripts exclusivement sur l'origine embarquée, aucun pageerror.
- Protections observées : nodeIntegration=false, contextIsolation=true, webSecurity=true.
- Capture Windows native disponible ; NVENC H264/H265 disponible.
  Cela ne mesure PAS les FPS dans un appel ni la capture UVC réelle.
- Logo violet extrait du véritable EXE ; icône explicite pour fenêtre et popout Windows.
- Updater réel : installation 1.0.1 -> détection 1.0.2 sur HTTPS LePast ->
  téléchargement et contrôle du paquet -> application -> manifeste installé 1.0.2.
  Le banc de test désactive seulement le relancement automatique post-installation ;
  il relance ensuite le véritable EXE installé et refait le smoke test.
- Aucun compte connecté, aucun mot de passe lu, aucun salon rejoint pendant ces tests.

## Déploiement vérifié

- https://chat.lepast.fr/fluxer-custom/ : HTTP 200, certificat HTTPS validé.
- Flux Velopack indépendant sous /fluxer-custom/updates/win32-x64/.
- Téléchargement complet et Range bytes=0-1 : réponses 200 et 206.
- Reçu public avec commit exact et sommes SHA-256.
- Service lié à 127.0.0.1:8179, route Traefik ajoutée sans redémarrer Traefik/Fluxer.
- Timer VPS actif ; prochaine vérification le 2026-09-07 vers 06:10 CEST.
- Tâche Windows active, exécution réelle de la file vide : LastTaskResult=0.
- Dépôt source poussé ; GitHub Actions désactivé.

## Non prétendu / à valider avec un utilisateur

- Pas de garantie de 1440p60 : test de stream et d'audio authentifié restant à faire.
- Le scénario d'une future fusion amont n'a pas encore eu lieu : logique installée,
  compilation actuelle et file vide vérifiées, pas de promesse « zéro régression ».
- L'installateur n'est pas signé par un certificat d'éditeur.
- Une transition vers le canal officiel demandera une migration explicite.

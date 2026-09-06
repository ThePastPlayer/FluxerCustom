# Fluxer LePast (Windows x64)

Client non officiel pour https://chat.lepast.fr, basé sur la Canary Fluxer.
Sources sous AGPL-3.0-or-later : historique, licences et attributions amont conservés.
Les adaptations sont dans custom/ et fluxer_desktop (voir le diff contre
le commit amont indiqué dans custom/config.json).

## Architecture

Interface compilée depuis les sources et embarquée dans Electron.
https://client.fluxer.invalid est une origine virtuelle interceptée localement.
Aucun HTML/JavaScript du serveur n'y est chargé. Les API sont sur chat.lepast.fr.
CSP active, nodeIntegration:false, contextIsolation:true, webSecurity:true.
La sandbox suit l'amont (sandbox:false) : ceci n'est pas un audit complet d'Electron.

Identité FluxerLePast, protocole fluxer-lepast, profil %APPDATA%/fluxer-lepast.
Aucune migration/lecture des profils ou identifiants du client officiel.
Mises à jour exclusivement :
https://chat.lepast.fr/fluxer-custom/updates/win32-x64/releases.win.json

Pas de signature Authenticode. Les empreintes SHA-256 détectent la corruption,
mais ne remplacent pas une signature d'éditeur. HTTPS protège le transport.
Protéger le VPS et le compte de publication ; ne pas désactiver l'antivirus.

NVENC et capture native conservés. Un test d'ouverture ne garantit pas 1440p60
en appel réel : source, GPU, codec, réception et réseau comptent.
Les iframes tierces et un captcha autre que none demandent une revue de CSP.
La future architecture embarquée officielle demandera aussi une revue explicite.

## Construire sur ce PC

Windows x64, Node 22+, Git, Rust MSVC + wasm32-unknown-unknown,
Visual Studio 2022 C++, SDK .NET 8, LLVM 23.1.0.
LLVM vérifié est installé dans :
E:/FluxerCustom/custom/.tools/llvm
(clang.exe, llvm-ar.exe, lib/clang/23/include).
Archive officielle : github.com/llvm/llvm-project, release llvmorg-23.1.0.
Sur un nouveau PC, vérifier le SHA-256 contre le digest publié avant extraction.

PowerShell 7 :
    ./custom/build.ps1

pnpm 11.19.0 et Playwright 1.63.0 sont verrouillés dans test-tools.
Velopack 0.0.1298 correspond au SDK du client ; lockfile amont conservé.
Le script compile WASM, web, Electron et modules natifs, effectue le typecheck,
les tests natifs ciblés, les tests de confinement et le smoke test du vrai EXE.
Résultat : custom/releases/VERSION. GitHub Actions est désactivé dans ce dépôt.

La construction initiale prend plusieurs minutes et des gigaoctets.
-SkipWeb et -SkipNative sont réservés aux reconstructions locales contrôlées,
jamais au worker automatique. Committer le source avant le reçu de publication.
LEPAST_TEST_PROFILE=smoke isole les tests dans %TEMP%/FluxerCustom-smoke-profile :
ne pas s'y connecter avec un vrai compte.

## Publication

Connexion manuelle depuis le raccourci Fluxer LePast ; aucun mot de passe à fournir
aux scripts. Publication :
    ./custom/publish.ps1 -ProjectRoot E:/FluxerCustom

Téléversement dans incoming/VERSION, vérification des empreintes, du numéro
croissant et du reçu des tests, puis bascule atomique du lien public/current.
Le flux d'update et l'installateur changent ensemble.
Les anciens paquets restent accessibles aux téléchargements déjà engagés.
release.json indique le commit source exact et les empreintes.

## Cycle hebdomadaire

- VPS : fluxer-custom-check.timer, lundi 04:00 UTC + jusqu'à 15 minutes d'aléa.
  Pas de compilation VPS ni GitHub Actions.
- PC : tâche Fluxer LePast - Build updates ; vérifie la file lorsque cet utilisateur
  est connecté. PC éteint = publication différée.
- Candidat isolé dans %LOCALAPPDATA%/Temp/FluxerLePast-builds/SHA.
  Une seule construction à la fois, aucune opération git destructive dans le projet.
- Ref amont vérifiée contre le SHA annoncé ; fusion propre requise.
- Modification de frontières de privilèges, dépendances ou outils de build :
  review_required et aucune publication automatique.
- Échec de compilation/test : version publique inchangée, candidat marqué failed.
  Pas de boucle de tentatives ; on attend un nouveau commit.
- Après tests : push fast-forward du source, puis promotion des paquets.
- Pas de suppression automatique des archives. Publication bloquée sous 2 GiB
  libres sur VPS, construction bloquée sous 15 GiB sur C:. Nettoyage périodique
  à effectuer après validation des versions à conserver.

Logs : custom/state/worker.log et custom/state/SHA.json ; journalctl sur VPS.
Les scripts installés restent figés localement. Une modification du worker ou
des scripts serveur nécessite une revue manuelle.

## Retour arrière

Désinstaller Fluxer LePast via Windows ne touche pas Fluxer officiel ni le compte
serveur. Sauvegarder le profil avant toute suppression éventuelle.

Sauvegardes serveur : /opt/fluxer-custom/backups/DATE.
Pour geler les publications : désactiver la tâche Windows et le timer
fluxer-custom-check.timer ; ne pas arrêter Fluxer, Hoopa ni Traefik.

Un opérateur peut remettre public/current sur releases/VERSION_PRECEDENTE.
Cela protège les nouvelles installations, mais ne rétrograde pas les clients
déjà mis à jour : reconstruire le code corrigé avec un numéro supérieur pour eux.

Pour retirer l'hébergement après accord : supprimer uniquement la route
dynamic/fluxer-custom.yml et arrêter fluxer-custom-downloads.service.
Conserver paquets, sources et profils jusqu'à validation.

Un retour au client officiel n'est pas un simple changement d'URL d'update :
identité, protocole, profil et origine sont distincts. Prévoir une migration
explicite et testée lorsque l'architecture officielle le permettra.

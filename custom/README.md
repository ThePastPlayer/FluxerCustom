# Fluxer LePast (Windows x64 et macOS Apple Silicon)

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
https://chat.lepast.fr/fluxer-custom/updates/darwin-arm64/RELEASES.json

Les canaux sont calculés depuis le système et l'architecture du binaire, jamais
depuis l'agent utilisateur du navigateur. Mac Intel n'est pas distribué.
La page propose le Mac sur macOS mais indique explicitement la restriction M1+.

Pas de signature Authenticode. Les empreintes SHA-256 détectent la corruption,
mais ne remplacent pas une signature d'éditeur. HTTPS protège le transport.
Protéger le VPS et le compte de publication ; ne pas désactiver l'antivirus.

La version macOS est, elle, signée Developer ID et notarifiée par Apple ;
le ticket est agrafé à l'application et au DMG. Profil séparé :
~/Library/Application Support/fluxer-lepast. macOS 13 minimum.

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

## Construire sur le Mac Mini

Workspace dédié : /Users/mac/FluxerCustom. Clé SSH locale mpds_mac.
`bash custom/mac-bootstrap.sh` installe uniquement les outils de ce projet.
`bash custom/mac-build.sh` compile les modules natifs Apple Silicon, teste,
signe et notarifie. Le frontend embarqué doit provenir du même commit/version
que le paquet Windows validé. `custom/source-commit.txt` porte ce commit.
Les identifiants Apple existants restent sur le Mac, dans mpds-signing ;
ils ne sont ni copiés, ni affichés, ni inclus dans le dépôt.
Un trousseau temporaire est ajouté pendant la signature puis retiré.

Sorties : custom/releases/darwin-arm64/VERSION (ZIP d'update, DMG, reçu, feed).
`publish-mac.py` refuse toute signature/notarification/test manquant, empreinte
incorrecte ou URL ne désignant pas exactement le ZIP Mac de cette version.
Promotion atomique indépendante via public/current-darwin-arm64.

Validation du 6 septembre 2026 : une copie de test signée 1.0.3 a téléchargé
le ZIP sur le vrai canal HTTPS Mac, puis installé la 1.0.4 au même emplacement.
Signature et Gatekeeper vérifiés après remplacement (`test-mac-update.mjs`).
Rapports locaux : custom/reports/mac-update.json et codec-interoperability.json.
La capture écran Mac nécessite l'autorisation système au premier usage ;
le test de lancement ne la donne pas à la place de l'utilisateur.

La détection du système sur la page est autorisée par une empreinte CSP précise
dans custom/server/traefik.yml, pas par un droit général aux scripts inline.
Après modification du script HTML, actualiser cette empreinte puis exécuter
`node custom/test-download-page.mjs --public` après déploiement. Ce test vérifie
Mac, Windows, iPad/Android et la CSP effectivement renvoyée par le serveur.
Sauvegarde de la page/route antérieures :
/opt/fluxer-custom/backups/distribution-20260906-macos.

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
- Mac : la phase `mac-sync.ps1` du même worker compare les deux versions publiques
  à chaque passage. Elle utilise exclusivement le commit et le bundle Windows
  déjà validés, puis recompile sur le Mac, signe, notarifie et publie son canal.
  Mac éteint = report ; échec de construction = maintien de la version Mac
  précédente et attente d'une nouvelle version. Aucun paquet Windows n'est
  copié dans le canal Mac. Un checkout Mac modifié ou non fast-forward bloque.
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
Pour Mac uniquement : public/current-darwin-arm64 sur
releases/darwin-arm64/VERSION_PRECEDENTE. Ne pas changer le lien Windows.
Cela protège les nouvelles installations, mais ne rétrograde pas les clients
déjà mis à jour : reconstruire le code corrigé avec un numéro supérieur pour eux.

Pour retirer l'hébergement après accord : supprimer uniquement la route
dynamic/fluxer-custom.yml et arrêter fluxer-custom-downloads.service.
Conserver paquets, sources et profils jusqu'à validation.

Un retour au client officiel n'est pas un simple changement d'URL d'update :
identité, protocole, profil et origine sont distincts. Prévoir une migration
explicite et testée lorsque l'architecture officielle le permettra.

## Régression réception iOS (-2302), corrigée en 1.0.4

LiveKit 1.12 en mode single-PC négociait la réception VP8 avec uniquement H264
après une émission desktop H264. `singlePeerConnection: false` sépare ces deux
négociations, sans changer la qualité ni le codec de l'émission.
Reproduction locale : `node custom/test-codec-interoperability.mjs` avec le
binaire officiel LiveKit 1.12 Windows placé dans custom/.tools/livekit-1.12.0
(SHA-256 vérifié contre checksums.txt de cette release officielle).
Serveur lié uniquement à 127.0.0.1, vidéos canvas et identifiants synthétiques.
Le test compare le contrôle défectueux et le vrai réglage de l'application,
et exige plus de 100 images reçues simultanément en VP8 et H264 après correction.
Il ne remplace pas la confirmation d'un appel iOS réel.

## Volume du stream indépendant, corrigé en 1.0.5

Le bouton en bas à droite près du plein écran pilotait le volume général de
l'appel même lorsqu'un stream était affiché en grand. Il agit désormais sur
le stream focalisé (volume et sourdine), avec le libellé « Stream volume ».
Le réglage individuel de la voix, l'audio des autres streams et le volume
général restent inchangés. Même comportement en vue compacte et en popout.
Dans une vue d'appel sans stream focalisé, le bouton garde son rôle général.
Un stream personnel ou sans piste audio ne propose pas de faux contrôle qui
couperait les voix à la place.

`node --test custom/test-stream-volume.mjs` exerce les vrais gestionnaires
du bouton et l'application des préférences aux publications audio : volume
0/25/200 %, mute/unmute du stream, voix à 80 %, autre session du même
participant, mute vocal séparé et assourdissement global. Aucun compte ni
salon réel utilisé pour ces vérifications.

Retour arrière de cette version : conserver les paquets 1.0.4 et le commit
précédent ; remettre uniquement le lien `public/current` (Windows) ou
`public/current-darwin-arm64` (Mac) sur leur version précédente pour geler
les nouvelles installations. Une rétrogradation des clients déjà installés
nécessite un nouveau paquet avec un numéro supérieur, pas l'écrasement des profils.

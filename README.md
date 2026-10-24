# Mes Enchaînements — appli Android (GAF / GAM UFOLEP)

L'appli web [gaf_ufolep](https://github.com/kbenjaminpajusco/gaf_ufolep) (construction d'enchaînements et calcul de la
note de départ, programme UFOLEP sept. 2026) emballée en appli Android avec [Capacitor](https://capacitorjs.com).
Le code de l'appli est dans `www/` (HTML/JS sans build), le projet Android dans `android/`.

## Formules

| | Gratuit | Premium (abonnement) |
|---|---|---|
| Enchaînements, note, fiche à l'écran | ✔ | ✔ |
| Gymnastes | 1 profil perso (« Moi ») | **plusieurs gymnastes**, filtre par gymnaste |
| Impression / PDF de la fiche (A4 paysage) | 🔒 | ✔ |
| Publicité | bannière AdMob | aucune |

Quand l'abonnement s'arrête, rien n'est supprimé : les enchaînements des autres gymnastes restent visibles, mais on ne peut
plus en créer ni imprimer.

## Où est quoi

- `www/native.js` — pont Android : abonnement (Google Play Billing via `cordova-plugin-purchase`), bannière (`@capacitor-community/admob`, avec formulaire de consentement RGPD), impression, partage, bouton Retour. Hors Android (navigateur) tout est débloqué.
- `www/config.js` — ID de l'abonnement et de la bannière (**IDs de test Google** par défaut).
- `android/app/src/main/java/.../PrintPlugin.java` — impression native (dialogue Android : imprimante ou « Enregistrer au format PDF »).
- `.github/workflows/android.yml` — build de l'APK, publication, captures sur émulateur.
- `tools/emulator-shots.js` — navigue dans l'appli sur l'émulateur et prend les captures.

## Build automatique (GitHub Actions)

À chaque push (`main` ou `claude/**`) :

1. APK debug construit, publié **tel quel (sans zip)** comme artefact `MesEnchainements-debug.apk` et dans la release
   [`apk-latest`](../../releases/tag/apk-latest) (téléchargement direct sans compte GitHub).
2. Émulateur Android 14 : l'APK est installé, l'appli est pilotée et 5 captures d'écran sont publiées (artefacts `.png`, sans zip).
3. Si les secrets `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD` existent : AAB signé `MesEnchainements-release.aab` pour le Play Store (+ `ADMOB_APP_ID` optionnel).

> Les artefacts sans zip utilisent `actions/upload-artifact@v7` avec `archive: false`.

## Mise en production (à faire de ton côté)

1. **Play Console** : créer l'appli `fr.pajusco.mesenchainements`, puis un **abonnement** dont l'ID est `gaf_premium`, avec une offre mensuelle et une annuelle (l'appli affiche toutes les offres de l'abonnement). Les achats ne fonctionnent que sur un build **signé installé depuis Google Play** (piste de test interne) — pas avec l'APK debug.
2. **AdMob** : créer l'appli et un bloc « Bannière », puis mettre l'ID de bannière dans `www/config.js` et l'ID d'**application** dans le secret `ADMOB_APP_ID` (ou `android/app/build.gradle`). Tant que les IDs de test sont là, ce sont des pubs de démonstration.
3. **Signature** : générer un keystore (`keytool -genkeypair -v -keystore release.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`) et le déclarer en secrets (`base64 -w0 release.jks` → `KEYSTORE_BASE64`).
4. **Politique de confidentialité** (obligatoire avec AdMob et les abonnements) et fiche Play Store.
5. Pour valider les abonnements côté serveur (anti-fraude), brancher un service de validation (RevenueCat, ou ton serveur) : pour l'instant l'appli fait confiance à Google Play sur l'appareil.

## Développer en local

```
npm ci
npx cap sync android        # copie www/ dans le projet Android
cd android && ./gradlew assembleDebug    # APK : android/app/build/outputs/apk/debug/
```
Prérequis : Node 22, JDK 21, SDK Android 36.

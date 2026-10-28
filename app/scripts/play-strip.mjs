// Google Play build: Play forbids apps that update themselves, so remove the in-app APK updater
// (ApkUpdaterPlugin + REQUEST_INSTALL_PACKAGES) from the Android project before `bundleRelease`.
// Run after the APK for direct download is built. Fails loudly if anything it expects has moved.
import { readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../android/app/src/main/", import.meta.url));
const pkg = root + "java/com/ewudiots/app/";
const cut = (file, re, what) => {
  const src = readFileSync(file, "utf8");
  if (!re.test(src)) throw new Error(`play-strip: ${what} not found in ${file}`);
  writeFileSync(file, src.replace(re, ""));
};

cut(root + "AndroidManifest.xml", /^[ \t]*<uses-permission android:name="android\.permission\.REQUEST_INSTALL_PACKAGES"\s*\/>\r?\n/m, "REQUEST_INSTALL_PACKAGES");
cut(pkg + "MainActivity.java", /^[ \t]*registerPlugin\(ApkUpdaterPlugin\.class\);.*\r?\n/m, "ApkUpdaterPlugin registration");
if (!existsSync(pkg + "ApkUpdaterPlugin.java")) throw new Error("play-strip: ApkUpdaterPlugin.java not found");
rmSync(pkg + "ApkUpdaterPlugin.java");
console.log("play-strip: in-app updater removed for the Google Play build");

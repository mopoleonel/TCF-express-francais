// Convertit les voix WAV produites par build-young-voice.ps1 en MP3 légers (environ 6 fois moins lourds).
// Usage : node scripts/compress-audio.mjs   (FFmpeg doit être installé)
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
const dir = new URL("../public/audio-young/", import.meta.url);
for (const f of readdirSync(dir).filter((f) => f.endsWith(".wav"))) {
  const src = new URL(f, dir).pathname, dst = src.replace(/\.wav$/, ".mp3");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", src, "-ac", "1", "-ar", "22050", "-b:a", "48k", dst]);
  unlinkSync(src);
}
const mf = new URL("manifest.json", dir);
writeFileSync(mf, readFileSync(mf, "utf8").replace(/\.wav"/g, '.mp3"'));
console.log("Voix converties en MP3.");

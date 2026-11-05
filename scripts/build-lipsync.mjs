// Calcule, pour chaque voix de Léo, le volume de la voix 25 fois par seconde.
// Le navigateur s'en sert pour ouvrir et fermer la bouche de Léo exactement quand il parle
// (synchronisation labiale), sans traitement audio sur le téléphone.
// Usage : node scripts/build-lipsync.mjs   (FFmpeg doit être installé ; à relancer après chaque changement de voix)
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const dir = new URL("../public/audio-young/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", dir), "utf8"));
const FPS = 25,
  RATE = 8000,
  WIN = RATE / FPS;
const out = {};
for (const file of new Set(Object.values(manifest))) {
  const pcm = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", new URL(file, dir).pathname, "-ac", "1", "-ar", String(RATE), "-f", "s16le", "-"],
    { maxBuffer: 64 << 20 },
  );
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2);
  const rms = [];
  for (let i = 0; i < samples.length; i += WIN) {
    let s = 0,
      n = 0;
    for (let j = i; j < Math.min(i + WIN, samples.length); j++, n++) s += samples[j] * samples[j];
    rms.push(Math.sqrt(s / Math.max(1, n)));
  }
  const peak = Math.max(
    ...rms
      .slice()
      .sort((a, b) => a - b)
      .slice(Math.floor(rms.length * 0.95)),
    1,
  );
  // Lissage léger, puis 10 niveaux (0 = bouche fermée, 9 = grande ouverture).
  out[file] = rms
    .map((v, i) => (v + (rms[i - 1] ?? v) * 0.5 + (rms[i + 1] ?? v) * 0.5) / 2)
    .map((v) => Math.max(0, Math.min(9, Math.round((v / peak) * 9 - (v / peak < 0.08 ? 9 : 0)))))
    .join("");
}
writeFileSync(new URL("lipsync.json", dir), JSON.stringify(out));
console.log(`Synchronisation labiale prête pour ${Object.keys(out).length} voix (${FPS} images/s).`);

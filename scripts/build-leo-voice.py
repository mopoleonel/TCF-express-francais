# Voix de Léo : synthèse neuronale gratuite (Kokoro-82M, licence Apache 2.0, voix française ff_siwis),
# rajeunie (hauteur ×1,18, formants ×1,10) pour un timbre d'enfant léger. Aucune voix de personne réelle.
#
# Préparer une fois :
#   pip install kokoro-onnx pyworld soundfile
#   npm pack kokoro-q8-shards kokoro-js   (modèle et voix, licence Apache 2.0)
#   cat kokoro-q8.part{0..5}.bin > model_quantized.onnx   (sha256 fbae9257…a1478)
# Puis : python3 scripts/build-leo-voice.py <model_quantized.onnx> <ff_siwis.bin>
#        node scripts/build-lipsync.mjs
import json, os, subprocess, sys, tempfile
import numpy as np, pyworld as pw, soundfile as sf
from kokoro_onnx import Kokoro

PITCH, FORMANT, SPEED = 1.18, 1.10, 0.95
model, voice = sys.argv[1], sys.argv[2]
root = os.path.join(os.path.dirname(__file__), "..", "public", "audio-young")
manifest = json.load(open(os.path.join(root, "manifest.json"), encoding="utf-8"))
tmp = tempfile.mkdtemp()
voices = os.path.join(tmp, "voices.npz")
np.savez(voices, ff_siwis=np.fromfile(voice, dtype=np.float32).reshape(-1, 1, 256))
k = Kokoro(model, voices)
# Voix chargée en mémoire avant le partage entre processus (le fichier .npz se lit en différé).
k.voices = {name: k.voices[name] for name in k.voices.files}

def younger(x, sr):
    x = x.astype(np.float64)
    # Harvest : analyse de hauteur lente mais très stable (pas de « couac » sur les voyelles).
    f0, t = pw.harvest(x, sr, f0_floor=80, f0_ceil=600, frame_period=5.0)
    sp, ap = pw.cheaptrick(x, f0, t, sr), pw.d4c(x, f0, t, sr)
    n = sp.shape[1]; idx = np.arange(n); src = np.clip(idx / FORMANT, 0, n - 1)
    sp = np.array([np.interp(src, idx, r) for r in sp]); ap = np.array([np.interp(src, idx, r) for r in ap])
    y = pw.synthesize(f0 * PITCH, sp, ap, sr, 5.0)
    # Volume régulier d'une phrase à l'autre, sans saturation.
    rms = np.sqrt(np.mean(y[np.abs(y) > 0.01 * np.abs(y).max()] ** 2)) or 1
    y = y * (0.12 / rms)
    return np.clip(y, -0.95, 0.95).astype(np.float32)

def render(item):
    text, file = item
    audio, sr = k.create(text, voice="ff_siwis", speed=SPEED, lang="fr-fr")
    # Petit silence au début et à la fin pour ne pas couper la première syllabe sur téléphone.
    pad = np.zeros(int(sr * 0.08), dtype=np.float32)
    wav = os.path.join(tmp, file + ".wav")
    sf.write(wav, np.concatenate([pad, younger(audio, sr), pad]), sr)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", wav, "-ac", "1", "-ar", "24000", "-b:a", "56k",
                    os.path.join(root, file)], check=True)
    os.remove(wav)
    return file

if __name__ == "__main__":
    from multiprocessing import Pool
    items = list(manifest.items())
    only = set(sys.argv[3:])  # facultatif : ne refaire que certains fichiers
    if only: items = [i for i in items if i[1] in only]
    with Pool(os.cpu_count() or 2) as pool:
        for n, _ in enumerate(pool.imap_unordered(render, items), 1):
            if n % 25 == 0: print(f"{n}/{len(items)} phrases", flush=True)
    print(f"Voix de Léo prête : {len(items)} phrases.")

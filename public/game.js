// Mécaniques de jeu : cœurs, objectif du jour, coffre, XP de l'oral.
// Gardées dans le navigateur pour répondre tout de suite, puis envoyées au serveur (POST /v1/me/state)
// pour suivre l'apprenant sur tous ses appareils. Les journées sont comptées à l'heure de Douala (UTC+1).
const KEY = "quest-game";
export const today = () => new Date(Date.now() + 60 * 60000).toISOString().slice(0, 10);
export const MAX_HEARTS = 5;
export const GOALS = [
  { value: 5, label: "Tranquille", desc: "5 activités par jour" },
  { value: 10, label: "Régulier", desc: "10 activités par jour" },
  { value: 20, label: "Intensif", desc: "20 activités par jour" },
];
let state = {};
try {
  state = JSON.parse(localStorage.getItem(KEY) || "{}");
} catch {}
// Ancien format (avant la synchronisation) : on le convertit.
if (state.oralEasy && !Array.isArray(state.oralEasy)) state.oralEasy = Object.keys(state.oralEasy);
if (state.oralChallengeDate && !state.oralChallengeDays) state.oralChallengeDays = [state.oralChallengeDate];
state = {
  goal: 5,
  hearts: MAX_HEARTS,
  heartsDate: today(),
  oralEasy: [],
  oralChallengeDays: [],
  chestDate: null,
  ...state,
};
let push = null,
  pushTimer = null;
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
  if (push) {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => push(snapshot()).catch(() => {}), 600);
  }
}
const snapshot = () => ({
  hearts: state.hearts,
  heartsDate: state.heartsDate,
  goal: state.goal,
  chestDate: state.chestDate,
  oralEasy: state.oralEasy,
  oralChallengeDays: state.oralChallengeDays,
});
function refreshDay() {
  if (state.heartsDate !== today()) {
    state.heartsDate = today();
    state.hearts = MAX_HEARTS;
    save();
  }
}
export const game = {
  // Branche la synchronisation : `send(state)` renvoie l'état fusionné par le serveur.
  connect(send) {
    push = async (st) => {
      const r = await send(st);
      if (r?.state) game.adopt(r.state);
      return r;
    };
  },
  adopt(server) {
    if (!server) return;
    state = { ...state, ...server };
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {}
  },
  sync() {
    return push ? push(snapshot()) : Promise.resolve(null);
  },
  get hearts() {
    refreshDay();
    return state.hearts;
  },
  loseHeart() {
    refreshDay();
    state.hearts = Math.max(0, state.hearts - 1);
    save();
    return state.hearts;
  },
  gainHeart(n = 1) {
    refreshDay();
    state.hearts = Math.min(MAX_HEARTS, state.hearts + n);
    save();
    return state.hearts;
  },
  get goal() {
    return state.goal;
  },
  setGoal(v) {
    state.goal = v;
    save();
  },
  chestOpenedToday() {
    return state.chestDate === today();
  },
  openChest() {
    state.chestDate = today();
    refreshDay();
    state.hearts = MAX_HEARTS;
    save();
  },
  // +5 XP la première fois qu'une phrase orale est marquée « à l'aise » (compté par le serveur).
  oralEasy(id) {
    if (state.oralEasy.includes(id)) return 0;
    state.oralEasy = [...state.oralEasy, id];
    save();
    return 5;
  },
  oralChallengeDone() {
    return state.oralChallengeDays.includes(today());
  },
  // +10 XP une fois par jour pour le défi oral ; il compte aussi pour la série de jours.
  completeOralChallenge() {
    if (this.oralChallengeDone()) return 0;
    state.oralChallengeDays = [...state.oralChallengeDays, today()];
    save();
    return 10;
  },
  oralChallengeIndex(total) {
    const [y, m, d] = today().split("-").map(Number);
    return (y * 372 + (m - 1) * 31 + d) % total;
  },
};

// Sons courts générés par le navigateur (pas de fichier à télécharger).
let audioCtx = null;
function tone(notes, { type = "sine", gain = 0.08, step = 0.1, length = 0.16 } = {}) {
  try {
    const C = window.AudioContext || window.webkitAudioContext;
    audioCtx ||= new C();
    const ctx = audioCtx;
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(),
        g = ctx.createGain(),
        t = ctx.currentTime + i * step;
      o.type = type;
      o.frequency.value = f;
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + length);
      o.start(t);
      o.stop(t + length + 0.02);
    });
  } catch {}
}
export const sfx = {
  correct: () => tone([659, 988], { type: "triangle", step: 0.09 }),
  combo: () => tone([659, 784, 988, 1319], { type: "triangle", step: 0.07 }),
  wrong: () => tone([220, 196], { type: "sawtooth", gain: 0.035, step: 0.12, length: 0.2 }),
  victory: () => tone([523, 659, 784, 1047, 784, 1047], { type: "triangle", step: 0.12, length: 0.22 }),
  chest: () => tone([392, 523, 659, 784, 1047, 1319], { type: "sine", step: 0.08 }),
  tap: () => tone([880], { type: "sine", gain: 0.03, length: 0.05 }),
};

const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
export function confetti(amount = 60) {
  if (reduced()) return;
  const layer = document.createElement("div");
  layer.className = "q-confetti";
  layer.setAttribute("aria-hidden", "true");
  const colors = ["#002395", "#ED2939", "#ffc800", "#58cc02", "#1cb0f6", "#ff86d0"];
  for (let i = 0; i < amount; i++) {
    const p = document.createElement("i");
    p.style.left = Math.random() * 100 + "vw";
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = Math.random() * 0.5 + "s";
    p.style.animationDuration = 1.6 + Math.random() * 1.4 + "s";
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    layer.appendChild(p);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 3600);
}
// « +10 XP » qui s'envole depuis un élément vers le compteur d'XP de l'en-tête.
export function flyXp(from, amount) {
  if (!amount) return;
  const chip = [...document.querySelectorAll("#hud-xp")].find((c) => c.offsetParent !== null);
  const el = document.createElement("span");
  el.className = "q-xp-fly";
  el.textContent = `+${amount} XP`;
  const r = (from || document.body).getBoundingClientRect();
  el.style.left = r.left + r.width / 2 + "px";
  el.style.top = r.top + 10 + "px";
  document.body.appendChild(el);
  if (!reduced()) {
    const c = chip?.getBoundingClientRect();
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        el.style.transform = c
          ? `translate(${c.left + c.width / 2 - (r.left + r.width / 2)}px, ${c.top - r.top - 10}px) scale(.6)`
          : "translateY(-90px) scale(1.2)";
        el.style.opacity = "0";
      }),
    );
  }
  setTimeout(() => {
    el.remove();
    chip?.classList.add("bump");
    setTimeout(() => chip?.classList.remove("bump"), 400);
  }, 900);
}

export const BADGES = [
  ["premier-pas", "🌱", "La première pousse", "Réussir un premier défi"],
  ["dix-victoires", "🌟", "La belle étoile", "Réussir 10 défis différents"],
  ["trente-victoires", "💫", "La constellation", "Réussir 30 défis différents"],
  ["tous-les-defis", "🏅", "Le grand chelem", "Réussir les 52 défis"],
  ["trois-jours", "🔥", "L’étincelle", "3 jours de suite"],
  ["sept-jours", "🔥", "La flamme", "7 jours de suite"],
  ["trente-jours", "☄️", "Le feu sacré", "30 jours de suite"],
  ["xp-100", "⚡", "Énergie 100", "Gagner 100 XP"],
  ["xp-500", "⚡", "Énergie 500", "Gagner 500 XP"],
  ["xp-1000", "🌩️", "Énergie 1000", "Gagner 1000 XP"],
  ["sans-faute", "🎯", "Dans le mille", "Une leçon sans aucune erreur"],
  ["cinq-sans-faute", "🏹", "Archer d’élite", "5 leçons sans erreur"],
  ["monde-1", "🧱", "Les fondations", "Terminer le monde 1"],
  ["monde-2", "🏗️", "Le bâtisseur", "Terminer le monde 2"],
  ["monde-3", "📜", "Le conteur", "Terminer le monde 3"],
  ["monde-4", "🗣️", "L’orateur", "Terminer le monde 4"],
  ["parcours-complet", "🏆", "Champion du parcours", "Terminer les 12 leçons"],
];
export const PRAISE = [
  "Excellent !",
  "Bravo !",
  "Parfait !",
  "Super !",
  "Bien joué !",
  "Génial !",
  "Impeccable !",
];
export const pick = (list) => list[Math.floor(Math.random() * list.length)];

// Rappel quotidien : un fichier agenda (.ics) que le téléphone importe dans son calendrier.
export function reminderFile(hour = 19) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const start = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(hour)}0000`;
  const end = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(hour)}1000`;
  const url = location.origin;
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TCF Express//Francais Quest//FR",
    "BEGIN:VEVENT",
    `UID:francais-quest-rappel-${Date.now()}@tcf-express`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    "RRULE:FREQ=DAILY",
    "SUMMARY:🔥 Léo t’attend sur Français Quest",
    `DESCRIPTION:5 minutes de français pour garder ta série ! ${url}`,
    `URL:${url}`,
    "BEGIN:VALARM",
    "TRIGGER:PT0M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Léo t’attend : garde ta série de jours !",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  a.download = "rappel-francais-quest.ics";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// Certificat de fin de parcours dessiné dans un canvas, téléchargeable en image.
export function certificateImage(name, xp) {
  const c = document.createElement("canvas");
  c.width = 1200;
  c.height = 850;
  const g = c.getContext("2d");
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 1200, 850);
  g.strokeStyle = "#002395";
  g.lineWidth = 18;
  g.strokeRect(30, 30, 1140, 790);
  g.strokeStyle = "#ED2939";
  g.lineWidth = 4;
  g.strokeRect(62, 62, 1076, 726);
  g.textAlign = "center";
  g.fillStyle = "#002395";
  g.font = "800 40px Inter, Arial";
  g.fillText("TCF EXPRESS · FRANÇAIS QUEST", 600, 160);
  g.font = "900 72px Inter, Arial";
  g.fillStyle = "#081b3e";
  g.fillText("Parcours terminé !", 600, 280);
  g.font = "500 34px Inter, Arial";
  g.fillStyle = "#334";
  g.fillText("Ce certificat est décerné à", 600, 370);
  g.font = "800 64px Inter, Arial";
  g.fillStyle = "#ED2939";
  g.fillText(name || "Champion du français", 600, 460);
  g.font = "500 30px Inter, Arial";
  g.fillStyle = "#334";
  g.fillText("pour avoir terminé les 12 leçons, de A1 à B2.", 600, 540);
  g.fillText(`${xp} XP gagnés · ${new Date().toLocaleDateString("fr-FR")}`, 600, 590);
  g.font = "90px serif";
  g.fillText("🏆", 600, 700);
  g.font = "400 20px Inter, Arial";
  g.fillStyle = "#889";
  g.fillText("Certificat de participation. Ne remplace pas une certification officielle TCF.", 600, 762);
  return c.toDataURL("image/png");
}

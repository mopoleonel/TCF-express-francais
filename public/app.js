import {
  oralPage,
  oralAfterRender,
  initLeo,
  avatarMarkup,
  cleanupOral,
  speakText,
  selectOral,
} from "./oral.js";
import {
  game,
  sfx,
  confetti,
  flyXp,
  BADGES,
  GOALS,
  PRAISE,
  pick,
  MAX_HEARTS,
  reminderFile,
  certificateImage,
} from "./game.js";
import { oralPhrases } from "./oral-content.js";
const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
// Le français est la langue par défaut ; l'anglais reste une aide que l'apprenant active lui-même.
let token = localStorage.getItem("quest-token"),
  locale = localStorage.getItem("quest-locale") || "fr",
  catalog = [],
  progress = {},
  page = "home",
  session = null,
  index = 0,
  result = null,
  choice = "",
  earned = 0,
  busy = false;
let tiles = [],
  pairMap = {},
  pairLeft = null,
  repairIndex = null,
  hintOpen = false,
  lessonData = null,
  wrongChoices = [],
  lockedPairs = [],
  notice = null,
  anim = "";
let report = null,
  reportPending = false,
  hintUsed = false,
  viewReport = false,
  pastReports = [];
// Mesures prises au début d'une session pour fêter ce qui a changé à la fin.
let waitingNet = false;
let leoMood = "",
  leoLine = "";
let combo = 0,
  bestCombo = 0,
  startedAt = 0,
  before = null;
// Le son fait partie du jeu : activé par défaut, l'apprenant peut le couper.
let sound = localStorage.getItem("quest-sound") !== "no";
const play = (name) => sound && sfx[name]?.();
const skillNames = {
  vocabulaire: "Les mots",
  conjugaison: "Les verbes",
  accords: "Les accords",
  syntaxe: "Les phrases",
  orthographe: "L’orthographe",
};
const gameInfo = {
  order: {
    icon: "▤",
    name: "La fabrique à phrases",
    color: "blue",
    desc: "Des mots en désordre ? Construis une phrase qui a du sens.",
  },
  repair: {
    icon: "⌕",
    name: "Détective des mots",
    color: "coral",
    desc: "Une petite erreur s’est cachée. À toi de la démasquer !",
  },
  pairs: {
    icon: "⇄",
    name: "Les duos malins",
    color: "purple",
    desc: "Associe les mots, les idées et les verbes. Chaque duo compte.",
  },
  listen: {
    icon: "◉",
    name: "L’oreille magique",
    color: "green",
    desc: "Ouvre grand les oreilles et retrouve le bon message.",
  },
};
const typeLabel = {
  choice: "Choisis",
  fill: "Écris",
  order: "Assemble",
  repair: "Répare",
  pairs: "Relie",
  listen: "Écoute",
};
// Le parcours est un voyage vers le Canada : chaque monde est une escale.
const worlds = [
  {
    name: "Les fondations du français",
    city: "Douala",
    flag: "🇨🇲",
    color: "green",
    desc: "Dire bonjour, se présenter et découvrir les mots.",
  },
  {
    name: "Construire ses phrases",
    city: "Paris",
    flag: "🇫🇷",
    color: "blue",
    desc: "Assembler, conjuguer et accorder, un morceau à la fois.",
  },
  {
    name: "Raconter et préciser",
    city: "Québec",
    flag: "⚜️",
    color: "coral",
    desc: "Raconter hier et donner du sens à ses idées.",
  },
  {
    name: "Exprimer ses idées",
    city: "Montréal",
    flag: "🍁",
    color: "purple",
    desc: "Relier ses pensées et gagner en précision.",
  },
];
const worldOf = (l) => worlds[Math.floor((l.order - 1) / 3)];
// Décalage horizontal des étapes : le chemin serpente comme sur une carte de jeu.
const SWAY = [0, 70, 95, 50, -40, -90, -70, 10, 85, 60, -30, -80];
const fox = () => avatarMarkup();
// Appels au serveur : messages compréhensibles en français, y compris quand le réseau coupe.
const OFFLINE_MSG = "Pas de connexion internet. Vérifie ton réseau : on réessaie dès qu’il revient.";
async function api(path, method = "GET", body) {
  let r;
  try {
    r = await fetch(path.replace(/^\//, ""), {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw Object.assign(new Error(OFFLINE_MSG), { offline: true });
  }
  let data = {};
  try {
    data = await r.json();
  } catch {}
  if (!r.ok) {
    const msg =
      r.status === 429
        ? data.error
        : r.status === 401
          ? "Ta session a expiré. Recharge la page pour continuer."
          : r.status === 409 && /retry/i.test(data.error || "")
            ? "Le serveur était occupé. Réessaie dans un instant."
            : r.status >= 500
              ? "Le serveur est momentanément indisponible. Réessaie dans un instant."
              : "Une erreur est survenue. Réessaie.";
    throw Object.assign(new Error(msg), { status: r.status });
  }
  return data;
}
// Petite mémoire locale pour afficher l'accueil tout de suite, même avec un réseau lent.
const cache = {
  get(k) {
    try {
      return JSON.parse(localStorage.getItem("quest-cache-" + k));
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem("quest-cache-" + k, JSON.stringify(v));
    } catch {}
  },
};
async function refreshProgress() {
  progress = await api("/v1/me/progress");
  cache.set("progress", progress);
  return progress;
}
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").style.display = "block";
  clearTimeout(toast.t);
  toast.t = setTimeout(() => ($("#toast").style.display = "none"), 3500);
}
const totalXp = () => progress.xp || 0;
const heading = (tag, title, sub) =>
  `<div class="heading"><div><span class="eyebrow">${tag}</span><h1>${title}</h1><p class="subtitle">${sub}</p></div></div>`;
const complete = (id) => progress.lessons?.find((l) => l.id === id) || { correct: 0, answered: 0, total: 1 };
// Une leçon s'ouvre quand la précédente a été jouée en entier (ou si l'apprenant l'a déjà commencée).
function unlocked(l) {
  if (l.order === 1) return true;
  const prev = catalog.find((x) => x.order === l.order - 1);
  const p = complete(prev.id),
    me = complete(l.id);
  return p.answered >= p.total || me.answered > 0;
}
const currentLesson = () =>
  catalog.find((l) => unlocked(l) && complete(l.id).correct < complete(l.id).total) || catalog[0];

/* ---------- En-tête de jeu : série, XP, cœurs ---------- */
// Quand un cœur est perdu, l'icône « se brise » pendant un court instant (même si l'écran est redessiné).
let lastHearts = null,
  heartHitUntil = 0;
const heartHit = () => {
  if (lastHearts !== null && game.hearts < lastHearts) heartHitUntil = Date.now() + 900;
  lastHearts = game.hearts;
  return Date.now() < heartHitUntil;
};
function hud() {
  const lit = (progress.dailyCompleted || 0) > 0;
  const el = $("#hud");
  if (!el) return;
  const hit = heartHit();
  el.innerHTML = `<span class="hud-chip streak ${lit ? "lit" : ""}" title="Jours de suite"><b>🔥</b>${progress.streakDays || 0}</span><span class="hud-chip xp" id="hud-xp" title="Points d’expérience"><b>⚡</b>${totalXp()}</span><span class="hud-chip hearts ${hit ? "hit" : ""}" title="Cœurs du jour"><b>❤️</b>${game.hearts}</span>`;
}

/* ---------- Pages ---------- */
function stats() {
  return `<div class="stats v-stats"><div class="stat"><span>🔥</span><div><strong data-count="${progress.streakDays || 0}">0</strong><small>jour${progress.streakDays > 1 ? "s" : ""} de suite</small></div></div><div class="stat"><span>⚡</span><div><strong data-count="${totalXp()}">0</strong><small>XP gagnés</small></div></div><div class="stat"><span>✓</span><div><strong>${progress.masteredExercises || 0}<em> / ${progress.totalExercises || 52}</em></strong><small>défis réussis</small></div></div><div class="stat"><span>🏅</span><div><strong>${progress.badges?.length || 0}<em> / ${BADGES.length}</em></strong><small>badges</small></div></div></div>`;
}
function gameCard([type, g]) {
  return `<button class="game-card ${g.color}" data-game="${type}"><span class="game-art">${g.icon}<i>✦</i></span><span class="game-copy"><small>MINI-JEU · 4 DÉFIS</small><strong>${g.name}</strong><span>${g.desc}</span></span><b class="play-circle">▶</b></button>`;
}
function goalCard() {
  const goal = game.goal,
    done = progress.dailyCompleted || 0,
    shown = Math.min(done, goal),
    reached = done >= goal,
    chest = reached && !game.chestOpenedToday();
  const pct = Math.round((shown / goal) * 100);
  return `<div class="quest-card goal-card"><span class="eyebrow">TON OBJECTIF DU JOUR</span><div class="goal-ring" style="--p:${pct}"><span>${reached ? (chest ? "🎁" : "✓") : `${shown}<small>/${goal}</small>`}</span></div><h3>${reached ? (chest ? "Objectif atteint !" : "Coffre ouvert, bravo !") : `${goal - shown} activité${goal - shown > 1 ? "s" : ""} pour ton coffre`}</h3><p>${chest ? "Ton coffre t’attend : il recharge tous tes cœurs." : "Chaque activité réussie remplit l’anneau."}</p>${chest ? '<button class="primary sunny" id="open-chest">🎁 Ouvrir mon coffre</button>' : '<button class="primary" data-start="daily">Je pratique →</button>'}<div class="goal-choices" role="group" aria-label="Choisir mon objectif">${GOALS.map((g) => `<button class="${g.value === goal ? "selected" : ""}" data-goal="${g.value}" title="${g.desc}">${g.label}<small>${g.value}/jour</small></button>`).join("")}</div></div>`;
}
function oralChallengeCard() {
  const i = game.oralChallengeIndex(oralPhrases.length),
    p = oralPhrases[i],
    done = game.oralChallengeDone();
  return `<div class="leo-tip oral-challenge ${done ? "done" : ""}">${fox()}<div><span class="eyebrow">DÉFI ORAL DU JOUR · +10 XP</span><h4>« ${esc(p.text)} »</h4><p>${done ? "Défi relevé aujourd’hui. Reviens demain pour une nouvelle phrase !" : "Écoute Léo, puis enregistre-toi une fois avec cette phrase."}</p>${done ? "" : `<button class="text-button" data-oral-challenge="${i}">Relever le défi →</button>`}</div></div>`;
}
function finishedHome() {
  return `<article class="boarding-pass done-pass" aria-label="Voyage terminé"><div class="bp-main"><div class="bp-route"><div><small>Départ</small><b>Douala</b></div><span class="bp-plane" aria-hidden="true">✈</span><div><small>Arrivée</small><b>Montréal</b></div></div><div class="bp-lesson"><small>🏆 Voyage accompli</small><strong>Les 12 étapes sont réussies !</strong></div><div class="bp-meta"><div><small>XP</small><b>${totalXp()}</b></div><div><small>Défis</small><b>${progress.masteredExercises}/${progress.totalExercises}</b></div><div><small>Tampons</small><b>${progress.badges?.length || 0}</b></div></div></div><div class="bp-stub"><p class="bp-next">Garde ton niveau : un entraînement par jour, un défi oral, et rejoue tes leçons préférées.</p><button class="v-btn v-red big" data-start="refill">M’entraîner</button><button class="quiet" data-nav="oral">Défi oral du jour</button><button class="text-button" data-nav="courses">Revoir la carte du voyage</button></div></article>`;
}
function home() {
  const next = currentLesson();
  const p = complete(next.id);
  const w = worldOf(next);
  const streak = progress.streakDays || 0,
    savedToday = (progress.dailyCompleted || 0) > 0;
  const greet = savedToday
    ? "Ta série est sauvée pour aujourd’hui. On continue ?"
    : streak
      ? `Joue aujourd’hui pour garder ta série de ${streak} jour${streak > 1 ? "s" : ""}.`
      : "Quelques minutes par jour, et ton français décolle.";
  return (
    `<section class="v-home"><div class="v-hello">${fox()}<div><p class="v-appname">L’Atelier de français <small>avec ton ami Léo</small></p><h1>${progress.attempts ? "Bon retour à bord !" : "Bienvenue à bord !"}</h1><p>${greet}</p></div><div class="v-flame ${savedToday ? "lit" : ""}" aria-label="Série de ${streak} jours"><span>🔥</span><b>${streak}</b><small>jour${streak > 1 ? "s" : ""}</small></div></div>` +
    (progress.lessonsDone === catalog.length && catalog.length
      ? finishedHome()
      : `<article class="boarding-pass" aria-label="Ta prochaine leçon"><div class="bp-main"><div class="bp-route"><div><small>Départ</small><b>Douala</b></div><span class="bp-plane" aria-hidden="true">✈</span><div><small>Destination</small><b>Montréal</b></div></div><div class="bp-lesson"><small>Prochaine escale · ${w.flag} ${w.city}</small><strong>${esc(next.title.fr)}</strong></div><div class="bp-meta"><div><small>Étape</small><b>${next.order}/${catalog.length}</b></div><div><small>Niveau</small><b>${next.level}</b></div><div><small>Défis</small><b>${p.correct}/${p.total}</b></div></div></div><div class="bp-stub"><div class="bp-trip" role="img" aria-label="Avancement du voyage : ${catalog.filter((l) => complete(l.id).correct === complete(l.id).total).length} étapes sur ${catalog.length}">${catalog.map((l) => `<i class="${complete(l.id).correct === complete(l.id).total ? "done" : l.id === next.id ? "now" : ""}"></i>`).join("")}</div><button class="v-btn v-red big" data-lesson="${next.id}">${p.answered ? "Reprendre le vol" : "Embarquer"}</button><button class="text-button" data-nav="courses">Voir la carte du voyage</button></div></article>`) +
    `</section>` +
    `<div class="home-grid"><section><div class="section-title"><h2>Mini-jeux express</h2><button class="text-button" data-nav="games">Tous les jeux</button></div><div class="games-grid">${Object.entries(gameInfo).map(gameCard).join("")}</div>${stats()}</section><aside class="home-rail">${goalCard()}${oralChallengeCard()}</aside></div>`
  );
}
function map() {
  const cur = catalog.find((l) => unlocked(l) && complete(l.id).correct < complete(l.id).total) || {};
  const done = catalog.filter((l) => complete(l.id).correct === complete(l.id).total).length;
  return `<section class="v-sky"><div class="v-clouds" aria-hidden="true"><i></i><i></i><i></i><i></i></div><div class="v-sky-head"><h1>Ton voyage vers le Canada</h1><p>${done}/${catalog.length} étapes réussies. Chaque leçon terminée ouvre la suivante.</p></div><div class="v-route" id="v-route"><svg class="v-trail" aria-hidden="true"></svg>${worlds
    .map(
      (w, i) =>
        `<div class="v-stopover ${w.color}"><span class="v-flag">${w.flag}</span><div><small>Escale ${i + 1}</small><b>${w.city}</b><span>${w.name}</span></div></div>${catalog
          .slice(i * 3, i * 3 + 3)
          .map((l) => {
            const p = complete(l.id),
              ok = p.correct === p.total,
              open = unlocked(l),
              isCur = l.id === cur.id;
            const stars = [1, 2, 3]
              .map((n) => `<i class="${p.correct / p.total >= n / 3 ? "lit" : ""}">★</i>`)
              .join("");
            return `<div class="v-stop ${ok ? "done" : ""} ${open ? "" : "locked"} ${isCur ? "current" : ""}" style="--x:${SWAY[l.order - 1]}px">${isCur ? `<span class="v-bubble">${p.answered ? "Reprendre" : "Commencer"}</span>` : ""}<button class="v-node" ${open ? `data-lesson="${l.id}"` : `data-locked="${l.id}"`} aria-label="${ok ? "★" : l.order} — ${esc(l.title.fr)}${ok ? " (réussie)" : open ? "" : " (verrouillée)"}"><span aria-hidden="true">${ok ? "★" : open ? l.order : "🔒"}</span></button><div class="v-label"><b>${esc(l.title.fr)}</b><span class="v-stars" aria-label="${p.correct} défis réussis sur ${p.total}">${stars}</span></div></div>`;
          })
          .join("")}`,
    )
    .join(
      "",
    )}<div class="v-arrival ${done === catalog.length ? "reached" : ""}"><span>🏆</span><b>Arrivée à Montréal</b><small>${done === catalog.length ? "Voyage accompli !" : "Termine les 12 étapes"}</small></div><span class="v-plane" id="v-plane" aria-hidden="true">✈️</span></div><p class="help-note">A1 à B2 indiquent la difficulté des activités. Ce parcours ne remplace pas une certification officielle.</p></section>`;
}
// Trace le chemin pointillé entre les étapes et fait voler l'avion jusqu'à l'étape en cours.
function drawRoute() {
  const route = $("#v-route");
  if (!route) return;
  const box = route.getBoundingClientRect();
  const pts = [...route.querySelectorAll(".v-node")].map((n) => {
    const r = n.getBoundingClientRect();
    return {
      x: r.left - box.left + r.width / 2,
      y: r.top - box.top + r.height / 2,
      done: n.closest(".v-stop").classList.contains("done"),
    };
  });
  if (pts.length < 2) return;
  const seg = (a, b) => {
    const my = (a.y + b.y) / 2;
    return `M${a.x},${a.y} C${a.x},${my} ${b.x},${my} ${b.x},${b.y}`;
  };
  const svg = route.querySelector(".v-trail");
  svg.setAttribute("viewBox", `0 0 ${box.width} ${route.scrollHeight}`);
  svg.style.height = route.scrollHeight + "px";
  svg.innerHTML = pts
    .slice(1)
    .map((b, i) => `<path class="${pts[i].done ? "flown" : ""}" d="${seg(pts[i], b)}"/>`)
    .join("");
  const curIdx = [...route.querySelectorAll(".v-stop")].findIndex((s) => s.classList.contains("current"));
  const plane = $("#v-plane");
  if (curIdx < 0) {
    plane.hidden = true;
    return;
  }
  const to = pts[curIdx],
    from = pts[Math.max(0, curIdx - 1)];
  const place = (p) => (plane.style.transform = `translate(${p.x + 46}px, ${p.y - 34}px)`);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // L'avion ne vole que lorsqu'une nouvelle étape vient d'être atteinte.
  let flown = 0;
  try {
    flown = Number(localStorage.getItem("quest-plane") || 0);
    localStorage.setItem("quest-plane", String(curIdx));
  } catch {}
  if (reduce || curIdx === 0 || curIdx <= flown) {
    place(to);
    setTimeout(() => route.querySelector(".v-stop.current")?.scrollIntoView({ block: "center" }), 50);
    return;
  }
  place(from);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      plane.classList.add("flying");
      place(to);
    }),
  );
  setTimeout(
    () =>
      route
        .querySelector(".v-stop.current")
        ?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" }),
    250,
  );
}
function games() {
  return (
    heading(
      "LES MINI-JEUX TCF EXPRESS",
      "Apprends en jouant.",
      "Quatre façons de faire travailler tes mots.",
    ) +
    `<div class="arcade-intro">${fox()}<p><b>Quel jeu te tente ?</b><br>Chaque partie contient 4 défis. Une erreur coûte un cœur ❤️, une bonne réponse rapporte 10 XP.</p><button class="quiet" data-start="game">🎲 Surprends-moi</button></div><div class="games-grid arcade">${Object.entries(gameInfo).map(gameCard).join("")}</div>`
  );
}
function reviewPage() {
  const due = progress.reviewsDue || 0,
    miss = progress.mistakes || 0;
  return (
    heading(
      "RÉVISIONS CIBLÉES",
      "Consolide tes acquis.",
      "Reprends tes erreurs : chaque bonne réponse te rend un cœur ❤️.",
    ) +
    `<section class="review-scene">${fox()}<div><div class="review-counts"><div><b>${miss}</b><span>question${miss > 1 ? "s" : ""} ratée${miss > 1 ? "s" : ""}</span></div><div><b>${due}</b><span>notion${due > 1 ? "s" : ""} à revoir aujourd’hui</span></div><div><b>${game.hearts}/${MAX_HEARTS}</b><span>cœurs</span></div></div><h2>${progress.attempts ? "Un petit entraînement ?" : "Rien à réviser pour l’instant"}</h2><p>${progress.attempts ? "On commence par les questions ratées, puis celles que tu n’as pas vues depuis longtemps." : "Joue ta première leçon : tes erreurs reviendront ici pour que tu les maîtrises."}</p>${progress.attempts ? '<button class="primary" data-start="refill">S’entraîner maintenant →</button>' : `<button class="primary" data-lesson="${currentLesson().id}">Commencer la première leçon →</button>`}</div></section>`
  );
}
function progressPage() {
  const badges = progress.badges || [];
  return (
    heading(
      "TON SUIVI D’APPRENTISSAGE",
      "Tes efforts font leur chemin.",
      "Pas besoin d’être parfait. Chaque découverte compte.",
    ) +
    stats() +
    `<div class="progress-layout"><section class="panel"><h2>Ton carnet de compétences</h2>${Object.entries(
      progress.skills || {},
    )
      .map(
        ([s, v]) =>
          `<div class="skill-row"><div><strong>${skillNames[s]}</strong><small>${v.correct} réussites / ${v.answered} réponses</small></div><div class="bar"><span style="width:${v.answered ? Math.round((v.correct / v.answered) * 100) : 0}%"></span></div></div>`,
      )
      .join(
        "",
      )}<p class="help-note">Réussite sur tes tentatives, sans estimation de niveau officiel. Meilleure série : ${progress.bestStreak || 0} jour${progress.bestStreak > 1 ? "s" : ""}.</p></section><section class="v-passport"><div class="v-passport-head"><span>🛂</span><div><h2>Mon passeport</h2><p>${badges.length} tampon${badges.length > 1 ? "s" : ""} sur ${BADGES.length}</p></div></div><div class="v-stamps">${BADGES.map(
      ([id, icon, name, desc], i) =>
        `<div class="v-stamp-cell ${badges.includes(id) ? "got" : ""}" title="${esc(desc)}"><span class="v-stamp" style="--r:${((i * 37) % 23) - 11}deg">${icon}</span><b>${name}</b><small>${desc}</small></div>`,
    ).join("")}</div></section></div>` +
    `<div class="progress-layout"><section class="panel"><h2>Garder ma progression</h2><p>Ta progression est liée à ce téléphone. Note ce code de sauvegarde pour la retrouver sur un autre appareil ou après avoir vidé ton navigateur. Garde-le pour toi, comme un mot de passe.</p><div class="save-code"><code id="save-code">${esc(token || "")}</code><button class="quiet" id="copy-code">Copier</button></div><details class="restore"><summary>J’ai déjà un code de sauvegarde</summary><div class="save-code"><input id="restore-code" placeholder="Colle ton code ici" autocomplete="off"><button class="primary" id="restore-btn">Récupérer</button></div></details></section><section class="panel"><h2>Ne casse pas ta série 🔥</h2><p>Ajoute un rappel quotidien à 19 h dans l’agenda de ton téléphone : Léo te préviendra chaque soir.</p><button class="primary" id="add-reminder">⏰ Ajouter le rappel</button><h3 class="spaced">Mon objectif du jour</h3><div class="goal-choices" role="group">${GOALS.map((g) => `<button class="${g.value === game.goal ? "selected" : ""}" data-goal="${g.value}">${g.label}<small>${g.value}/jour</small></button>`).join("")}</div></section></div>`
  );
}
function render() {
  document.body.dataset.page = page;
  document
    .querySelectorAll("nav button")
    .forEach((b) => b.classList.toggle("active", b.dataset.page === page));
  $("#page-name").textContent = {
    home: "Mon espace",
    courses: "Mon parcours",
    games: "Les mini-jeux",
    review: "Mes révisions",
    progress: "Ma progression",
    oral: "Mon studio oral",
    quiz: "À toi de jouer !",
  }[page];
  $("#language").innerHTML = locale === "en" ? "🇬🇧<em> Aide</em> EN" : "🇫🇷<em> Aide</em> FR";
  $("#sound").innerHTML = sound ? "🔊<em> Son</em>" : "🔇<em> Son</em>";
  $("#sound").setAttribute("aria-label", sound ? "Couper le son" : "Activer le son");
  $("#sound").setAttribute("aria-pressed", String(sound));
  hud();
  if (page === "oral") {
    $("#main").innerHTML = oralPage(locale);
    oralAfterRender();
    return;
  }
  if (page === "quiz") return renderQuiz();
  const m = $("#main");
  m.classList.remove("v-enter");
  void m.offsetWidth;
  m.classList.add("v-enter");
  $("#main").innerHTML =
    page === "courses"
      ? map()
      : page === "games"
        ? games()
        : page === "review"
          ? reviewPage()
          : page === "progress"
            ? progressPage()
            : home();
  if (page === "courses") requestAnimationFrame(drawRoute);
  countUp();
}
// Les chiffres importants défilent jusqu'à leur valeur (data-count).
function countUp() {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.querySelectorAll("[data-count]").forEach((el) => {
    const target = Number(el.dataset.count);
    if (reduce || !target) return (el.textContent = target);
    const t0 = performance.now(),
      dur = Math.min(1400, 500 + target * 4);
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      el.textContent = Math.round(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
async function navigate(p, { fromHistory = false } = {}) {
  if (busy) return;
  cleanupOral();
  if (page === "quiz") forgetSession();
  page = p;
  // Chaque écran entre dans l'historique : le bouton retour du téléphone revient à l'écran précédent.
  if (!fromHistory && location.hash !== "#" + p) history.pushState({ page: p }, "", "#" + p);
  session = null;
  render();
  window.scrollTo(0, 0);
  try {
    await refreshProgress();
    if (page === p) render();
  } catch (e) {
    if (!e.offline) toast(e.message);
  }
}
// Leçon en cours mémorisée pour la reprendre après un rechargement de la page.
const rememberSession = (id) => {
  try {
    localStorage.setItem("quest-session", id);
  } catch {}
};
const forgetSession = () => {
  try {
    localStorage.removeItem("quest-session");
  } catch {}
};

/* ---------- Dialogues ---------- */
function dialog(html, extraClass = "") {
  const d = $("#lesson-dialog");
  d.className = extraClass;
  $("#lesson-content").innerHTML = html;
  if (!d.open) d.showModal();
}
async function lesson(id) {
  lessonData = await api(`/v1/lessons/${id}`);
  const l = lessonData;
  dialog(
    `<div class="lesson-guide">${fox()}<span class="pill">${l.level} · ${skillNames[l.skill]}</span></div><span class="eyebrow">ÉTAPE ${l.order} · LA RÈGLE EN 20 SECONDES</span><h2>${esc(l.title.fr)}</h2><div class="rule-box"><b>📖 À retenir</b><p>${esc(l.rule.fr)}</p></div>${locale === "en" ? `<div class="english-help"><b>🇬🇧 A little help in English</b><p>${esc(l.rule.en)}</p></div>` : ""}<div class="lesson-promise">${l.exercises.length} défis · +10 XP par bonne réponse · bonus de 20 XP en fin de leçon</div><div class="dialog-actions"><button class="quiet" id="close-dialog">Plus tard</button><button class="primary sunny" data-practice="${id}">C’est parti ! →</button></div>`,
  );
}
function lockedDialog(id) {
  const l = catalog.find((x) => x.id === id),
    prev = catalog.find((x) => x.order === l.order - 1);
  dialog(
    `<div class="center-dialog"><div class="big-emoji">🔒</div><h2>${esc(l.title.fr)}</h2><p>Termine d’abord « ${esc(prev.title.fr)} » pour ouvrir cette leçon.</p><p class="help-note">Tu connais déjà ce point ? Fais la leçon directement : elle sert de test.</p><div class="dialog-actions"><button class="quiet" data-practice="${id}">Faire le test</button><button class="primary" data-lesson="${prev.id}">Aller à l’étape ${prev.order} →</button></div></div>`,
  );
}
function noHeartsDialog() {
  dialog(
    `<div class="center-dialog"><div class="big-emoji">💔</div><h2>Plus de cœurs pour aujourd’hui</h2><p>Chaque erreur coûte un cœur. Tu peux en regagner tout de suite : chaque bonne réponse en révision te rend un cœur. Ils se rechargent aussi chaque jour.</p><div class="dialog-actions"><button class="quiet" id="close-dialog">Plus tard</button><button class="primary" data-start="refill">S’entraîner pour regagner des cœurs →</button></div></div>`,
  );
}
function quitDialog() {
  dialog(
    `<div class="center-dialog">${fox()}<h2>Tu pars déjà ?</h2><p>Si tu quittes maintenant, ta progression dans cette leçon ne sera pas fêtée. Tes bonnes réponses restent comptées.</p><div class="dialog-actions"><button class="quiet" data-nav="courses" data-close="1">Quitter</button><button class="primary" id="close-dialog">Continuer la leçon</button></div></div>`,
  );
}
function chestDialog() {
  game.openChest();
  document.querySelectorAll("#open-chest").forEach((b) => {
    const done = document.createElement("p");
    done.className = "chest-done";
    done.textContent = "🎁 Coffre ouvert : cœurs rechargés !";
    b.replaceWith(done);
  });
  play("chest");
  confetti(90);
  hud();
  dialog(
    `<div class="center-dialog chest-open"><div class="big-emoji bounce">🎁</div><span class="eyebrow">OBJECTIF DU JOUR ATTEINT</span><h2>Coffre ouvert !</h2><p>Tes cœurs sont rechargés : ❤️ × ${MAX_HEARTS}. Reviens demain pour un nouveau coffre et garder ta série 🔥 ${progress.streakDays || 1}.</p><div class="dialog-actions"><button class="primary" id="close-dialog">Super !</button></div></div>`,
  );
}

/* ---------- Session de jeu ---------- */
function resetQuestion() {
  result = null;
  choice = "";
  tiles = [];
  pairMap = {};
  pairLeft = null;
  repairIndex = null;
  hintOpen = false;
  hintUsed = false;
  lessonData = null;
  wrongChoices = [];
  lockedPairs = [];
  notice = null;
}
// Mélange une fois par question l'ordre des choix, des tuiles et des paires : on apprend le français, pas une position.
function mixOnce(e) {
  if (e._mixed) return e;
  const mix = (a) => {
    const b = [...a];
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
  };
  if (e.choices) e.choices = mix(e.choices);
  if (e.right) e.right = mix(e.right);
  if (e.replacements) e.replacements = mix(e.replacements);
  if (e.tiles && e.tiles.length > 2) {
    let t = mix(e.tiles);
    for (let k = 0; k < 4 && t.join(" ") === e.tiles.join(" "); k++) t = mix(e.tiles);
    e.tiles = t;
  }
  e._mixed = true;
  return e;
}
function beginSession(s) {
  session = s;
  session.exercises.forEach(mixOnce);
  rememberSession(s.id);
  report = null;
  reportPending = false;
  viewReport = false;
  index = 0;
  earned = 0;
  combo = 0;
  bestCombo = 0;
  startedAt = Date.now();
  before = {
    xp: totalXp(),
    streak: progress.streakDays || 0,
    daily: progress.dailyCompleted || 0,
    badges: [...(progress.badges || [])],
  };
  resetQuestion();
  page = "quiz";
  if (location.hash !== "#jeu") history.pushState({ page: "quiz" }, "", "#jeu");
  render();
  autoListen();
  window.scrollTo(0, 0);
}
// Reprise d'une leçon interrompue (rechargement, appel, batterie…).
async function resumeSession(id) {
  const s = await api("/v1/sessions/" + id);
  const pos = s.answered.findIndex((a) => !a.finalized);
  if (pos < 0) return (forgetSession(), false);
  beginSession(s);
  index = pos;
  if (s.answered[pos].attempts === 1) {
    result = { correct: false, finalized: false };
    notice = { text: "Il te reste un essai. L’indice peut t’aider." };
  }
  renderQuiz();
  toast("On reprend ta leçon là où tu t’étais arrêté.");
  return true;
}
async function start(kind, lessonId, gameType) {
  if (busy) return;
  // Sans cœur, on peut toujours réviser (c'est ce qui en redonne), mais pas lancer une nouvelle leçon.
  if (kind !== "refill" && kind !== "review" && game.hearts <= 0) return noHeartsDialog();
  cleanupOral();
  busy = true;
  try {
    const s = await api("/v1/sessions", "POST", {
      kind,
      ...(lessonId ? { lessonId } : {}),
      ...(gameType ? { gameType } : {}),
    });
    beginSession(s);
  } finally {
    busy = false;
  }
}
const eNow = () => session.exercises[index];
function answerGame(e, locked) {
  if (e.type === "order")
    return `<div class="sentence-slots ${tiles.length ? "" : "empty-slots"}">${tiles.length ? tiles.map((n, i) => `<button type="button" data-remove="${i}" class="${i < (notice?.keep ?? 0) ? "good" : ""}" ${locked ? "disabled" : ""}>${esc(e.tiles[n])}</button>`).join("") : "Touche les mots ci-dessous."}</div><div class="tile-bank">${e.tiles.map((t, i) => `<button type="button" data-tile="${i}" ${locked || tiles.includes(i) ? "disabled" : ""} class="${tiles.includes(i) ? "used" : ""}">${esc(t)}</button>`).join("")}</div>`;
  if (e.type === "pairs")
    return `<div class="pairs-board"><div>${e.left.map((t, i) => `<button type="button" class="pair-tile ${pairLeft === i ? "selected" : ""} ${pairMap[i] !== undefined ? "paired c" + (i % 4) : ""} ${lockedPairs.includes(i) ? "good" : ""}" data-left="${i}" ${locked || lockedPairs.includes(i) ? "disabled" : ""}><span>${esc(t)}</span></button>`).join("")}</div><div>${e.right
      .map((t, i) => {
        const key = Object.keys(pairMap).find((k) => pairMap[k] === i);
        return `<button type="button" class="pair-tile ${key !== undefined ? "paired c" + (key % 4) : ""} ${key !== undefined && lockedPairs.includes(Number(key)) ? "good" : ""}" data-right="${i}" ${locked || pairLeft === null || (key !== undefined && lockedPairs.includes(Number(key))) ? "disabled" : ""}><span>${esc(t)}</span></button>`;
      })
      .join(
        "",
      )}</div></div><p class="game-helper">${Object.keys(pairMap).length} / ${e.left.length} duos · Touche un mot à gauche, puis son partenaire à droite.</p>`;
  if (e.type === "repair")
    return `<div class="repair-sentence">${e.words.map((t, i) => `<button type="button" data-word="${i}" class="${repairIndex === i ? "selected" : ""} ${notice?.notWord === i ? "bad" : ""}" ${locked ? "disabled" : ""}>${esc(t)}</button>`).join("")}</div>${repairIndex !== null ? `<p class="game-helper">Remplace « ${esc(e.words[repairIndex])} » par…</p><div class="repair-options">${e.replacements.map((t) => `<button type="button" data-replace="${esc(t)}" class="${choice === `${repairIndex}:${t}` ? "selected" : ""} ${wrongChoices.includes(`${repairIndex}:${t}`) ? "bad" : ""}" ${locked || wrongChoices.includes(`${repairIndex}:${t}`) ? "disabled" : ""}>${esc(t)}</button>`).join("")}</div>` : '<p class="game-helper">👆 Touche le mot qui te semble incorrect.</p>'}`;
  return `${e.type === "listen" ? `<div class="listen-stage"><button type="button" class="listen-button" id="listen" aria-label="Écouter la phrase">🔊</button><button type="button" class="listen-button slow" id="slow-listen" aria-label="Écouter lentement">🐢</button><details class="transcript" id="transcript"><summary>Je ne peux pas écouter maintenant</summary><p>${esc(e.speech)}</p></details></div>` : ""}${e.choices ? `<div class="choices">${e.choices.map((c, i) => `<button type="button" class="choice ${choice === c ? "selected" : ""} ${wrongChoices.includes(c) || (locked && !result.correct && choice === c) ? "bad" : ""} ${locked && result?.expected === c ? "good" : ""}" data-choice="${esc(c)}" ${locked || wrongChoices.includes(c) ? "disabled" : ""}><span>${i + 1}</span>${esc(c)}</button>`).join("")}</div>` : `<input id="answer" class="answer-input ${wrongChoices.length ? "bad" : ""}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Écris ta réponse…" value="${esc(choice)}" ${locked ? "disabled" : ""}><div class="accent-keys">${["é", "è", "ê", "à", "ç", "î", "ô", "ù", "’"].map((c) => `<button type="button" data-accent="${c}" ${locked ? "disabled" : ""}>${c}</button>`).join("")}</div>`}`;
}
function displayExpected(e, a) {
  if (e.type === "repair")
    return e.words.map((w, i) => (i === Number(a.split(":")[0]) ? a.slice(a.indexOf(":") + 1) : w)).join(" ");
  if (e.type === "pairs")
    return a
      .split("|")
      .map((s) => s.replace("=", " ↔ "))
      .join(" · ");
  return a;
}
function practiceSentence(e, r) {
  if (e.speech) return e.speech;
  if (e.type === "order") return r.expected;
  if (e.type === "repair") return displayExpected(e, r.expected);
  if (e.prompt.includes("___")) return e.prompt.replace("___", r.expected).replace(/\([^)]*\)/g, "");
  return r.expected;
}
// Ce que Léo dit avant la réponse, selon le type de défi.
function coachLine(e) {
  return (
    {
      choice: "Lis bien la phrase, puis choisis.",
      fill: "Écris le mot qui manque. Attention aux accents !",
      order: "Remets les mots dans l’ordre, du sujet au verbe.",
      repair: "Un mot s’est trompé de place… trouve-le !",
      pairs: "Relie chaque mot à son partenaire.",
      listen: "Écoute-moi bien, puis choisis la phrase.",
    }[e.type] || "À toi de jouer !"
  );
}
function footer(e, locked, second) {
  const hintBtn = `<button class="quiet" type="button" id="hint" ${locked ? "disabled" : ""}>💡 ${hintOpen ? "Masquer" : "Indice"}</button>`;
  if (locked) {
    const ok = result.correct;
    const expl = result.explanationTranslations?.[locale] || result.explanation || "";
    return `<div class="q-footer ${ok ? "is-correct" : "is-wrong"}" role="status"><div class="q-verdict"><span class="q-verdict-icon">${ok ? "✓" : "✕"}</span><div><b>${ok ? notice?.praise || "Excellent !" : "Bonne réponse :"}</b>${ok ? (result.xpEarned ? `<span class="q-xp">+${result.xpEarned} XP</span>` : "") + (combo >= 3 ? `<span class="q-combo">🔥 ${combo} d’affilée !</span>` : "") : `<p class="q-expected">${esc(displayExpected(e, result.expected))}</p>`}${expl && !ok ? `<p class="q-expl">${esc(expl)}</p>` : ""}</div>${!ok && e.type !== "pairs" ? `<button type="button" class="text-button" data-say="${esc(practiceSentence(e, result))}" aria-label="Écouter la bonne réponse">🔊</button>` : ""}</div><button class="primary big" id="next-q" type="button">Continuer</button></div>`;
  }
  const band = notice?.accent
    ? `<div class="q-band warn" role="status"><b>Presque ! Vérifie les accents.</b><span>Cet essai ne compte pas : corrige et valide.</span></div>`
    : second
      ? `<div class="q-band wrong" role="status"><b>Pas tout à fait… ❤️ −1</b><span>${esc(notice?.text || "Il te reste un essai. L’indice peut t’aider.")}</span></div>`
      : "";
  return `<div class="q-footer ${second ? "is-retry" : ""}">${band}<div class="q-actions">${hintBtn}<button class="primary big" id="validate" type="submit" form="answer-form" ${!choice.trim() ? "disabled" : ""}>${second ? "Dernier essai" : "Valider"}</button></div></div>`;
}
function renderQuiz() {
  $("#main").classList.remove("v-enter");
  $("#page-name").textContent = "À toi de jouer !";
  document.body.dataset.page = "quiz";
  hud();
  if (!session.exercises.length) {
    $("#main").innerHTML =
      `<div class="panel empty center-dialog"><div class="big-emoji">🌱</div><h2>Rien à réviser pour le moment.</h2><p>Joue une nouvelle leçon : tes erreurs reviendront ici.</p><button class="primary" data-nav="courses">Voir mon parcours →</button></div>`;
    return;
  }
  const total = session.exercises.length;
  if (index >= total) return renderSummary();
  const e = eNow(),
    g = e.id.startsWith("game-") ? gameInfo[e.type] : null,
    locked = !!result?.finalized,
    second = !!result && !result.finalized && !notice?.accent;
  const title =
    session.kind === "refill" || session.kind === "review"
      ? "Entraînement · chaque bonne réponse rend un cœur"
      : session.lesson
        ? `Étape ${session.lesson.order} · ${session.lesson.title.fr}`
        : g
          ? g.name
          : "Entraînement";
  $("#main").innerHTML =
    `<div class="q-screen"><div class="q-top"><button class="q-close" id="quit-q" aria-label="Quitter la leçon">✕</button><div class="q-progress" role="progressbar" aria-label="Progression de la leçon" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${index + (locked ? 1 : 0)}"><span style="width:${((index + (locked ? 1 : 0)) / total) * 100}%"></span></div><span class="q-hearts ${game.hearts <= 1 ? "low" : ""} ${heartHit() ? "hit" : ""}" aria-label="${game.hearts} cœurs">❤️ ${game.hearts}</span></div><h1 class="sr-only">${esc(title)}</h1><div class="v-coach ${leoMood}"><div class="v-coach-leo">${fox()}</div><p class="v-coach-say" aria-live="polite">${esc(leoLine || coachLine(e))}</p><button type="button" class="lang-toggle" aria-label="${locale === "en" ? "Retirer l’aide en anglais" : "Ajouter une aide en anglais"}" aria-pressed="${locale === "en"}">${locale === "en" ? "EN ✓" : "EN"}</button></div>${waitingNet ? '<p class="net-wait" role="status">📶 Pas de réseau : ta réponse partira dès que la connexion revient.</p>' : ""}<div class="q-meta"><span>${esc(title)}</span>${session.lesson ? `<details class="q-rule"><summary>📖 La règle</summary><p>${esc(session.lesson.rule[locale] || session.lesson.rule.fr)}</p></details>` : ""}${pastReports.length ? '<button class="text-button" id="past-report">Bilans précédents</button>' : ""}</div><section class="q-card ${anim}"><span class="q-type">${g ? g.icon + " " + g.name : typeLabel[e.type] || "Défi"} · ${e.level}</span><h2>${esc(e.prompt)}</h2>${e.instruction ? `<p class="question-instruction">${esc(e.instruction)}</p>` : ""}<form id="answer-form">${answerGame(e, locked)}${hintOpen ? `<div class="hint-box"><b>💡 Indice</b><p>${esc(e.hint?.[locale] || e.hint?.fr || lessonData?.rule?.[locale] || "Observe le sujet, le verbe et les accords dans la phrase.")}</p></div>` : ""}</form></section>${footer(e, locked, second)}</div>`;
  anim = "";
  leoMood = "";
  leoLine = "";
  $("#answer-form")?.addEventListener("submit", submit);
  const input = $("#answer");
  input?.addEventListener("input", (ev) => {
    choice = ev.target.value;
    $("#validate").disabled = !choice.trim();
  });
  if (input && !locked && window.matchMedia("(min-width: 700px)").matches) input.focus();
  $("#transcript")?.addEventListener("toggle", (ev) => {
    if (ev.target.open) hintUsed = true;
  });
  if (locked) $("#next-q")?.focus({ preventScroll: true });
}
// Lecture automatique de la phrase quand une question d'écoute apparaît (si le son est activé).
function autoListen() {
  const e = session?.exercises[index];
  if (sound && e?.type === "listen" && !result) setTimeout(() => speakText(e.speech), 350);
}
function nextQuestion() {
  cleanupOral();
  if (
    game.hearts <= 0 &&
    !["refill", "review"].includes(session.kind) &&
    index + 1 < session.exercises.length
  ) {
    page = "home";
    render();
    return noHeartsDialog();
  }
  index++;
  resetQuestion();
  renderQuiz();
  autoListen();
  window.scrollTo(0, 0);
}
async function submit(ev) {
  ev?.preventDefault();
  if (busy || result?.finalized || !choice.trim()) return;
  busy = true;
  $("#validate").disabled = true;
  const e = eNow();
  try {
    const r = await api("/v1/sessions/" + session.id + "/answers", "POST", {
      exerciseId: e.id,
      answer: choice,
      hintUsed,
    });
    progress = r.progress;
    if (r.accentCheck) {
      result = r;
      notice = { accent: true };
      leoMood = "think";
      leoLine = "Presque ! Il manque juste un accent.";
      if (r.hint) e.hint = r.hint;
      renderQuiz();
      return;
    }
    const firstTry = !result;
    result = r;
    earned += r.xpEarned || 0;
    cleanupOral();
    if (r.correct) {
      combo = firstTry ? combo + 1 : 0;
      bestCombo = Math.max(bestCombo, combo);
      if (["refill", "review"].includes(session.kind)) game.gainHeart();
      notice = { praise: pick(PRAISE) };
      play(combo >= 3 ? "combo" : "correct");
      anim = "pop";
      leoMood = "happy";
      leoLine =
        combo >= 3
          ? `${combo} bonnes réponses d’affilée, tu es en feu !`
          : pick(["Je le savais !", "Trop fort !", "C’est exactement ça !", "Tu progresses vite !"]);
      renderQuiz();
      flyXp($(".q-verdict"), r.xpEarned);
    } else {
      combo = 0;
      game.loseHeart();
      play("wrong");
      anim = "shake";
      leoMood = "sad";
      leoLine = r.finalized
        ? "Pas grave, retiens bien la correction en bas."
        : "Oups ! Regarde l’indice, tu vas y arriver.";
      if (r.finalized) {
        notice = null;
        renderQuiz();
      } else {
        // On garde le travail de l'apprenant et on ne retire que ce qui est faux.
        if (r.hint) e.hint = r.hint;
        const f = r.feedback || {};
        notice = { text: "Il te reste un essai. L’indice peut t’aider." };
        if (e.type === "choice" || e.type === "listen") {
          wrongChoices.push(choice);
          choice = "";
        } else if (e.type === "fill") {
          wrongChoices.push(choice);
        } else if (e.type === "order") {
          const keep = f.correctPrefix || 0;
          tiles = tiles.slice(0, keep);
          notice = {
            keep,
            text: keep
              ? `Les ${keep} premier${keep > 1 ? "s" : ""} mot${keep > 1 ? "s sont bien placés" : " est bien placé"}. Complète la suite.`
              : "Le premier mot n’est pas le bon. Recommence la phrase.",
          };
          choice = "";
        } else if (e.type === "pairs") {
          const wrong = new Set(f.wrongLeft || []);
          for (const k of Object.keys(pairMap)) if (wrong.has(e.left[k])) delete pairMap[k];
          lockedPairs = Object.keys(pairMap).map(Number);
          const good = lockedPairs.length;
          notice = {
            text: `${good} duo${good > 1 ? "s" : ""} juste${good > 1 ? "s" : ""}, gardé${good > 1 ? "s" : ""}. Refais les ${e.left.length - good} autres.`,
          };
          choice = "";
        } else if (e.type === "repair") {
          if (f.wordFound) {
            wrongChoices.push(choice);
            notice = { text: "C’est bien ce mot-là ! Choisis un autre remplacement." };
          } else {
            notice = {
              notWord: repairIndex,
              text: `« ${e.words[repairIndex]} » est correct. Cherche l’erreur ailleurs.`,
            };
            repairIndex = null;
          }
          choice = "";
        }
        renderQuiz();
      }
    }
    hud();
    waitingNet = false;
  } catch (err) {
    if (err.offline) {
      // La réponse est gardée : elle sera envoyée automatiquement au retour du réseau.
      waitingNet = true;
      renderQuiz();
    } else toast(err.message);
    if ($("#validate")) $("#validate").disabled = false;
  } finally {
    busy = false;
  }
}
window.addEventListener("online", () => {
  document.body.classList.remove("is-offline");
  if (waitingNet && page === "quiz" && choice.trim()) submit();
});
window.addEventListener("offline", () => document.body.classList.add("is-offline"));

/* ---------- Fin de leçon : célébration, puis bilan ---------- */
function correctionsMarkup(report) {
  return report.details
    .map(
      (d, i) =>
        `<article class="correction-card"><div class="correction-heading"><span>${String(i + 1).padStart(2, "0")}</span><div><small>${esc(skillNames[d.exercise.skill])} · ${d.exercise.level}</small><h3>${esc(d.exercise.prompt)}</h3></div><b class="result-tag ${d.correct ? "correct" : "incorrect"}">${d.correct ? (d.attempts.length === 1 ? "Premier essai" : "Deuxième essai") : "À revoir"}</b></div><div class="answer-history">${d.attempts.map((t) => `<div><small>Essai ${t.number}${t.hintUsed ? " · indice" : ""}</small><span>${esc(displayExpected(d.exercise, t.answer))}</span><b>${t.correct ? "✓" : "×"}</b></div>`).join("")}</div><div class="correction-answer"><small>RÉPONSE ATTENDUE</small><p>${esc(displayExpected(d.exercise, d.expected))}</p>${d.exercise.type !== "pairs" ? `<button class="text-button" data-say="${esc(practiceSentence(d.exercise, d))}">▶ Écouter la réponse</button>` : ""}</div><div class="correction-rule"><b>Pourquoi ?</b><p>${esc(d.explanationTranslations.fr)}</p>${locale === "en" ? `<p class="english-correction">🇬🇧 ${esc(d.explanationTranslations.en)}</p>` : ""}</div></article>`,
    )
    .join("");
}
function showPreviousReport(selected = pastReports.length - 1) {
  const previous = pastReports[selected];
  if (!previous) return;
  dialog(
    `<div class="archive-heading"><div><span class="eyebrow">BILANS CONSERVÉS</span><h2>${previous.correct} / ${previous.total} réponses trouvées</h2></div><button class="quiet" id="close-dialog">Reprendre →</button></div><label class="archive-chooser">Choisir un bilan<select id="report-history">${pastReports.map((p, i) => `<option value="${i}" ${i === selected ? "selected" : ""}>Bilan ${i + 1} · ${p.correct} / ${p.total}</option>`).join("")}</select></label>${correctionsMarkup(previous)}`,
    "report-dialog",
  );
}
document.addEventListener("change", (ev) => {
  if (ev.target.id === "report-history") showPreviousReport(Number(ev.target.value));
});
function loadReport() {
  if (reportPending) return;
  reportPending = true;
  const id = session.id;
  $("#main").innerHTML =
    '<div class="panel empty center-dialog"><div class="big-emoji bounce">⭐</div><h2>On compte tes points…</h2></div>';
  api("/v1/sessions/" + id + "/report")
    .then(async (data) => {
      if (page !== "quiz" || session?.id !== id) return;
      report = data;
      await refreshProgress();
      reportPending = false;
      renderSummary(true);
    })
    .catch((err) => {
      reportPending = false;
      toast(err.message);
      $("#main").innerHTML =
        '<div class="panel empty"><h2>Le bilan n’a pas pu être chargé.</h2><button class="primary" id="reload-report">Réessayer</button></div>';
    });
}
function renderSummary(fresh = false) {
  if (!report) return loadReport();
  if (!pastReports.some((p) => p.id === report.id)) pastReports.push(report);
  if (viewReport) return renderReport();
  // Parcours entièrement terminé : grand écran final.
  if (
    !report.nextLesson &&
    session.lesson?.order === catalog.length &&
    progress.lessonsDone === catalog.length
  )
    return renderFinale(fresh);
  renderVictory(fresh);
}
function renderVictory(fresh) {
  hud();
  const perfect = report.firstTry === report.total;
  const accuracy = Math.round((report.correct / report.total) * 100);
  const secs = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
  const gained = Math.max(0, totalXp() - before.xp);
  const streakUp = (progress.streakDays || 0) > before.streak;
  const newBadges = (progress.badges || []).filter((b) => !before.badges.includes(b));
  const goal = game.goal,
    daily = progress.dailyCompleted || 0,
    chestReady = daily >= goal && !game.chestOpenedToday();
  const isGame = !session.lesson && session.kind === "game";
  forgetSession();
  const title = perfect
    ? isGame
      ? "Partie parfaite !"
      : "Leçon parfaite !"
    : accuracy >= 60
      ? isGame
        ? "Partie terminée !"
        : "Leçon terminée !"
      : "Bien tenté !";
  const stars = perfect ? 3 : accuracy >= 80 ? 2 : accuracy >= 40 ? 1 : 0;
  $("#main").innerHTML =
    `<section class="victory"><div class="v-stars-big ${fresh ? "go" : "shown"}" aria-label="${stars} étoile${stars > 1 ? "s" : ""} sur 3">${[1, 2, 3].map((n) => `<span class="${n <= stars ? "lit" : ""}" style="--d:${0.35 + n * 0.35}s">★</span>`).join("")}</div><div class="victory-leo ${fresh ? "dance" : ""}">${fox()}</div><span class="eyebrow">${session.lesson ? `ÉTAPE ${session.lesson.order} / ${catalog.length}` : isGame ? "MINI-JEU" : "ENTRAÎNEMENT"}</span><h1>${title}</h1><p>${perfect ? (isGame ? "Zéro erreur, chapeau !" : "Zéro erreur, chapeau ! Bonus sans-faute débloqué.") : report.incorrect ? `${report.incorrect} question${report.incorrect > 1 ? "s" : ""} à revoir : elles reviendront dans tes révisions.` : "Toutes les réponses sont trouvées. Bravo !"}</p><div class="victory-cards"><div class="vc xp"><small>XP gagnés</small><b>⚡ <span data-count="${gained}">${fresh ? 0 : gained}</span></b></div><div class="vc acc ${accuracy >= 80 ? "great" : ""}"><small>Précision</small><b>🎯 <span data-count="${accuracy}">${fresh ? 0 : accuracy}</span>%</b></div><div class="vc time"><small>Temps</small><b>⏱ ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}</b></div></div>${bestCombo >= 3 ? `<p class="victory-extra">🔥 Meilleure série de bonnes réponses : ${bestCombo}</p>` : ""}${streakUp ? `<div class="streak-up"><span>🔥</span><div><b>${progress.streakDays} jour${progress.streakDays > 1 ? "s" : ""} de suite !</b><small>Ta série grandit. Reviens demain pour la garder.</small></div></div>` : ""}${newBadges
      .map((b) => BADGES.find((x) => x[0] === b))
      .filter(Boolean)
      .map(
        ([, icon, name, desc]) =>
          `<div class="new-badge"><span class="v-stamp mini">${icon}</span><div><small>Nouveau tampon dans ton passeport</small><b>${name}</b><span>${desc}</span></div></div>`,
      )
      .join(
        "",
      )}<div class="victory-goal"><div><small>OBJECTIF DU JOUR</small><b>${Math.min(daily, goal)} / ${goal}</b></div><div class="bar"><span style="width:${Math.min(100, (daily / goal) * 100)}%"></span></div>${chestReady ? '<button class="primary sunny" id="open-chest">🎁 Ouvrir mon coffre</button>' : ""}</div><div class="victory-actions">${report.nextLesson && session.lesson ? `<button class="primary big" data-nav="courses">Continuer le voyage</button><button class="quiet" id="continue-journey">Enchaîner : ${esc(report.nextLesson.title.fr)}</button>` : `<button class="primary big" data-nav="${isGame ? "games" : session.lesson ? "courses" : "home"}">Continuer</button>`}<button class="quiet" id="show-full-report">Voir mes corrections</button>${report.incorrect ? '<button class="text-button" id="restart-session">↻ Rejouer cette leçon</button>' : ""}</div></section>`;
  if (fresh) {
    play("victory");
    confetti(perfect ? 120 : 70);
    // Une note par étoile qui s'allume.
    [1, 2, 3].forEach((n) => n <= stars && setTimeout(() => sound && sfx.correct(), 350 + n * 350));
    setTimeout(countUp, 600);
  }
}
function renderFinale(fresh) {
  forgetSession();
  hud();
  $("#main").innerHTML =
    `<section class="victory finale"><div class="big-emoji bounce">🏆</div><span class="eyebrow">PARCOURS TERMINÉ</span><h1>Tu as terminé les 12 leçons !</h1><p>De « Bonjour » au subjonctif : tu as parcouru les 4 mondes, de A1 à B2.</p><div class="victory-cards"><div class="vc xp"><small>XP TOTAL</small><b>⚡ ${totalXp()}</b></div><div class="vc"><small>DÉFIS RÉUSSIS</small><b>✓ ${progress.masteredExercises} / ${progress.totalExercises}</b></div><div class="vc"><small>BADGES</small><b>🏅 ${progress.badges.length}</b></div></div><div class="certificate"><label>Ton prénom pour le certificat<input id="cert-name" maxlength="40" placeholder="Ex. : Aïcha" autocomplete="given-name"></label><div class="victory-actions"><button class="primary" id="cert-download">📜 Télécharger mon certificat</button><button class="quiet" id="cert-share">Partager sur WhatsApp</button></div></div><div class="victory-actions"><button class="primary big" data-nav="oral">Continuer à l’oral →</button><button class="quiet" id="show-full-report">Voir mes corrections</button><button class="text-button" data-start="refill">Réviser mes erreurs</button></div></section>`;
  if (fresh) {
    play("victory");
    confetti(160);
    setTimeout(() => confetti(120), 1200);
  }
}
function renderReport() {
  $("#main").innerHTML =
    `<div class="session-report"><section class="report-hero"><span class="eyebrow">TES CORRECTIONS</span><h1>${report.correct} / ${report.total} réponses trouvées</h1><div class="report-stats"><div><b>${report.firstTry}</b><span>au premier essai</span></div><div><b>${report.recovered}</b><span>au deuxième essai</span></div><div><b>${report.incorrect}</b><span>à retravailler</span></div></div><div class="report-actions"><button class="primary" id="back-victory">← Retour</button><button class="quiet" id="restart-session">↻ Rejouer</button></div></section>${correctionsMarkup(report)}</div>`;
  window.scrollTo(0, 0);
}
async function restartSession() {
  if (busy) return;
  busy = true;
  try {
    beginSession(await api("/v1/sessions/" + session.id + "/restart", "POST", {}));
  } catch (e) {
    toast(e.message);
  } finally {
    busy = false;
  }
}
async function continueJourney() {
  if (busy) return;
  if (game.hearts <= 0) return noHeartsDialog();
  busy = true;
  cleanupOral();
  try {
    const r = await api("/v1/sessions/" + session.id + "/next", "POST", {});
    if (r.finished) {
      viewReport = false;
      return renderSummary();
    }
    beginSession(r);
  } catch (e) {
    toast(e.message);
  } finally {
    busy = false;
  }
}
function updateGameAnswer() {
  const e = eNow();
  if (e.type === "order")
    choice = tiles.length === e.tiles.length ? tiles.map((n) => e.tiles[n]).join(" ") : "";
  if (e.type === "pairs")
    choice =
      Object.keys(pairMap).length === e.left.length
        ? e.left.map((l, i) => `${l}=${e.right[pairMap[i]]}`).join("|")
        : "";
  renderQuiz();
}

/* ---------- Événements ---------- */
document.addEventListener("click", async (ev) => {
  const b = ev.target.closest("button");
  if (!b) return;
  try {
    if (b.dataset.close) $("#lesson-dialog").close();
    if (b.dataset.page || b.dataset.nav) await navigate(b.dataset.page || b.dataset.nav);
    if (b.dataset.lesson) await lesson(b.dataset.lesson);
    if (b.dataset.locked) lockedDialog(b.dataset.locked);
    if (b.dataset.start) {
      if ($("#lesson-dialog").open) $("#lesson-dialog").close();
      await start(b.dataset.start);
    }
    if (b.dataset.game) await start("game", undefined, b.dataset.game);
    if (b.dataset.practice) {
      $("#lesson-dialog").close();
      await start("practice", b.dataset.practice);
    }
    if (b.id === "close-dialog") $("#lesson-dialog").close();
    if (b.dataset.goal) {
      game.setGoal(Number(b.dataset.goal));
      render();
      toast("Objectif mis à jour : " + b.dataset.goal + " activités par jour.");
    }
    if (b.id === "open-chest") chestDialog();
    if (b.dataset.oralChallenge !== undefined) {
      selectOral(Number(b.dataset.oralChallenge), true);
      await navigate("oral");
    }
    if (b.id === "quit-q") {
      if (index === 0 && !result) await navigate("courses");
      else quitDialog();
    }
    if (b.id === "next-q") nextQuestion();
    if (b.dataset.choice) {
      choice = b.dataset.choice;
      play("tap");
      renderQuiz();
    }
    if (b.dataset.tile !== undefined) {
      tiles.push(Number(b.dataset.tile));
      play("tap");
      updateGameAnswer();
    }
    if (b.dataset.remove !== undefined) {
      tiles.splice(Number(b.dataset.remove), 1);
      if (notice) notice.keep = Math.min(notice.keep ?? 0, tiles.length);
      updateGameAnswer();
    }
    if (b.dataset.left !== undefined) {
      pairLeft = Number(b.dataset.left);
      play("tap");
      renderQuiz();
    }
    if (b.dataset.right !== undefined && pairLeft !== null) {
      const r = Number(b.dataset.right);
      for (const k of Object.keys(pairMap)) if (pairMap[k] === r) delete pairMap[k];
      pairMap[pairLeft] = r;
      pairLeft = null;
      play("tap");
      updateGameAnswer();
    }
    if (b.dataset.word !== undefined) {
      repairIndex = Number(b.dataset.word);
      choice = "";
      play("tap");
      renderQuiz();
    }
    if (b.dataset.replace) {
      choice = `${repairIndex}:${b.dataset.replace}`;
      renderQuiz();
    }
    if (b.dataset.accent) {
      const input = $("#answer"),
        p = input.selectionStart ?? input.value.length;
      choice = input.value.slice(0, p) + b.dataset.accent + input.value.slice(input.selectionEnd ?? p);
      input.value = choice;
      input.focus();
      input.setSelectionRange(p + 1, p + 1);
      $("#validate").disabled = false;
    }
    if (b.id === "hint") {
      hintUsed = true;
      hintOpen = !hintOpen;
      if (hintOpen && !eNow().hint) lessonData = await api(`/v1/lessons/${eNow().lessonId}`);
      renderQuiz();
    }
    if (b.id === "listen" || b.id === "slow-listen")
      speakText(eNow().speech, { slow: b.id === "slow-listen" });
    if (b.id === "restart-session") await restartSession();
    if (b.id === "reload-report") renderSummary();
    if (b.id === "continue-journey") await continueJourney();
    if (b.id === "show-full-report") {
      viewReport = true;
      renderSummary();
    }
    if (b.id === "back-victory") {
      viewReport = false;
      renderSummary();
    }
    if (b.id === "past-report") showPreviousReport();
    if (b.id === "cert-download" || b.id === "cert-share") {
      const name = $("#cert-name")?.value.trim();
      if (b.id === "cert-download") {
        const a = document.createElement("a");
        a.href = certificateImage(name, totalXp());
        a.download = "certificat-francais-quest.png";
        a.click();
      } else {
        const text = `🏆 ${name || "J’"}${name ? " a" : "ai"} terminé les 12 leçons de L’Atelier de français (TCF Express), de A1 à B2 ! ${new URL(".", location.href).href}`;
        window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank", "noopener");
      }
    }
    if (b.id === "copy-code") {
      await navigator.clipboard?.writeText(token);
      toast("Code copié. Garde-le dans un endroit sûr.");
    }
    if (b.id === "restore-btn") {
      const code = $("#restore-code").value.trim();
      if (!code) return;
      const old = token;
      token = code;
      try {
        const st = await api("/v1/me/state");
        game.adopt(st.state);
        progress = st.progress;
        localStorage.setItem("quest-token", token);
        toast("Progression récupérée !");
        render();
      } catch {
        token = old;
        toast("Ce code ne correspond à aucune progression.");
      }
    }
    if (b.id === "add-reminder") reminderFile(19);
    if (b.id === "language" || b.classList.contains("lang-toggle")) {
      cleanupOral();
      locale = locale === "en" ? "fr" : "en";
      localStorage.setItem("quest-locale", locale);
      render();
      toast(
        locale === "en" ? "Léo ajoute maintenant une aide en anglais." : "Léo t’aide maintenant en français.",
      );
    }
    if (b.id === "sound") {
      if (page === "oral") cleanupOral();
      sound = !sound;
      localStorage.setItem("quest-sound", sound ? "yes" : "no");
      render();
      play("correct");
    }
  } catch (e) {
    toast(e.message);
  }
});
// Touche Entrée : valider, puis continuer — comme dans les applis de langue.
document.addEventListener("keydown", (ev) => {
  if (ev.key !== "Enter" || page !== "quiz" || $("#lesson-dialog").open) return;
  if ($("#next-q")) {
    ev.preventDefault();
    nextQuestion();
  }
});
// Récompenses de l'oral (envoyées par le studio).
document.addEventListener("quest:oral", (ev) => {
  const { kind, id } = ev.detail || {};
  let gained = 0;
  if (kind === "easy") gained = game.oralEasy(id);
  if (kind === "recorded" && id === oralPhrases[game.oralChallengeIndex(oralPhrases.length)].id) {
    gained = game.completeOralChallenge();
    if (gained) {
      confetti(60);
      toast("Défi oral du jour relevé ! +10 XP");
    }
  }
  if (gained) {
    play("correct");
    flyXp($("#record-panel") || $("#main"), gained);
    game
      .sync()
      .then((r) => {
        if (r?.progress) progress = r.progress;
        hud();
      })
      .catch(() => {});
  }
});
// Sur tcf-express.com/atelier/, l'élève connecté à son compte TCF Express retrouve la même progression
// sur tous ses appareils : le site officiel garde la clé d'élève liée à son compte (api/atelier/compte/).
// Ailleurs, ou sans compte connecté, rien ne change. Une erreur ici ne bloque jamais l'Atelier.
const TCF_API = "https://api.tcf-express.com/api/atelier/compte/";
let accountLinked = false,
  adoptFailed = false;
async function linkTcfAccount() {
  if (accountLinked || !/(^|\.)tcf-express\.com$/.test(location.hostname)) return;
  accountLinked = true;
  let access = null;
  try {
    access = localStorage.getItem("accessToken");
  } catch {}
  if (!access) return;
  const call = (method, body) =>
    fetch(TCF_API, {
      method,
      headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
      body: body && JSON.stringify(body),
      signal: AbortSignal.timeout?.(5000),
    }).then((r) => (r.ok ? r.json() : null));
  try {
    const saved = (await call("GET"))?.learner_token;
    if (saved && saved !== token && !adoptFailed) {
      // Ce compte a déjà une progression : on la reprend sur cet appareil.
      token = saved;
      localStorage.setItem("quest-token", token);
      localStorage.removeItem("quest-cache-progress");
    } else if (!saved || adoptFailed) {
      await call("PUT", { learner_token: token });
    }
  } catch {}
}
async function init() {
  // 1. Afficher tout de suite ce qu'on connaît déjà (visite précédente), sans attendre le réseau.
  const cachedCatalog = cache.get("catalog"),
    cachedProgress = cache.get("progress");
  if (token && cachedCatalog && cachedProgress) {
    catalog = cachedCatalog;
    progress = cachedProgress;
    if (page === "quiz") page = "home";
    render();
  }
  try {
    if (!token) {
      const r = await fetch("demo/register", { method: "POST" }).catch(() => null);
      if (!r) throw Object.assign(new Error(OFFLINE_MSG), { offline: true });
      if (!r.ok)
        throw new Error(
          (await r.json().catch(() => ({}))).error || "Impossible de créer ton profil. Réessaie.",
        );
      token = (await r.json()).token;
      localStorage.setItem("quest-token", token);
    }
    await linkTcfAccount();
    game.connect((st) => api("/v1/me/state", "POST", { state: st }));
    // 2. Progression, état de jeu et catalogue en même temps.
    const [st, cat] = await Promise.all([game.sync(), api("/v1/catalog")]);
    progress = st.progress;
    catalog = cat.lessons;
    cache.set("progress", progress);
    cache.set("catalog", catalog);
    // 3. Reprendre une leçon interrompue, sinon afficher la page demandée.
    const pending = localStorage.getItem("quest-session");
    if (pending && (await resumeSession(pending).catch(() => (forgetSession(), false)))) return;
    if (page === "quiz") page = "home";
    render();
  } catch (e) {
    if (e.status === 401) {
      // Clé refusée (ex. clé du compte expirée) : nouveau profil, puis on le lie au compte.
      if (accountLinked) [accountLinked, adoptFailed] = [false, true];
      localStorage.removeItem("quest-token");
      token = null;
      return init();
    }
    if (catalog.length) {
      toast(e.message);
      return;
    }
    $("#main").innerHTML =
      `<div class="panel empty center-dialog">${fox()}<h2>${e.offline ? "Pas de connexion" : "Léo a perdu le chemin…"}</h2><p>${esc(e.message)}</p><button class="primary" onclick="location.reload()">Réessayer</button></div>`;
  }
}
const pages = ["home", "courses", "games", "oral", "review", "progress"];
const initialPage = location.hash.slice(1);
if (pages.includes(initialPage)) page = initialPage;
if (initialPage === "jeu") page = "quiz";
history.replaceState({ page }, "", location.hash || "#home");
// Bouton retour du téléphone / du navigateur.
window.addEventListener("popstate", () => {
  const requested = location.hash.slice(1);
  if (page === "quiz" && session && index < session.exercises.length) {
    // Pendant une leçon : on reste et on demande confirmation.
    history.pushState({ page: "quiz" }, "", "#jeu");
    if (index === 0 && !result) navigate("courses");
    else quitDialog();
    return;
  }
  if ($("#lesson-dialog").open) $("#lesson-dialog").close();
  if (pages.includes(requested) && requested !== page)
    navigate(requested, { fromHistory: true }).catch((e) => toast(e.message));
});
window.addEventListener("resize", () => page === "courses" && drawRoute());
if (!navigator.onLine) document.body.classList.add("is-offline");
if (
  "serviceWorker" in navigator &&
  (location.protocol === "https:" || location.hostname === "127.0.0.1" || location.hostname === "localhost")
)
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
initLeo();
init();

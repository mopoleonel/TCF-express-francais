"""
API de L'Atelier de français, sous /api/atelier/ (mêmes routes et mêmes réponses que la version de test).

Authentification « Authorization: Bearer … » :
- un jeton de connexion TCF Express (JWT) → l'élève lié à ce compte ;
- sinon une clé d'élève anonyme « <uuid>.<43 caractères> » créée par POST demo/register.
"""
import base64
import hashlib
import json
import random
import re
import secrets
import uuid
from datetime import date, timedelta, timezone as dt_timezone
from functools import wraps

from django.conf import settings
from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from rest_framework_simplejwt.authentication import JWTAuthentication

from .content import (BY_ID, EXERCISES, LESSONS, LESSON_BY_ID, accepted, partial_feedback, public_exercise,
                      public_lesson, strip_accents)
from .models import Attempt, Eleve, Session, Submission

TOKEN_RE = re.compile(r'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.[A-Za-z0-9_-]{43}$')
DAY_OFFSET = timedelta(minutes=60)  # journées comptées à l'heure de Douala
REGISTRATION_LIMIT = 40  # nouveaux profils anonymes par réseau et par heure
KINDS = ['practice', 'diagnostic', 'review', 'daily', 'game', 'refill']
GAME_TYPES = ['order', 'repair', 'pairs', 'listen']


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def sha(value):
    return hashlib.sha256(value.encode()).hexdigest()


def iso(dt):
    return dt.astimezone(dt_timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.') + f'{dt.microsecond // 1000:03d}Z'


def day_key(dt):
    return (dt.astimezone(dt_timezone.utc) + DAY_OFFSET).date().isoformat()


def client_ip(request):
    fwd = request.META.get('HTTP_X_FORWARDED_FOR', '')
    return fwd.split(',')[0].strip() or request.META.get('HTTP_X_REAL_IP') or request.META.get('REMOTE_ADDR', '')


def allowed_origins():
    return set(getattr(settings, 'CORS_ALLOWED_ORIGINS', [])) | set(getattr(settings, 'ATELIER_ORIGINS', []))


def current_eleve(request):
    header = request.META.get('HTTP_AUTHORIZATION', '')
    if not header.startswith('Bearer '):
        return None
    token = header[7:].strip()
    if TOKEN_RE.match(token):
        return Eleve.objects.filter(id=token.split('.')[0], token_hash=sha(token), user__isnull=True).first()
    try:
        result = JWTAuthentication().authenticate(request)
    except Exception:
        return None
    if not result:
        return None
    eleve, _ = Eleve.objects.get_or_create(user=result[0])
    return eleve


def endpoint(*methods, auth=True):
    """Lit le JSON, vérifie la méthode et l'élève, et renvoie les erreurs au format {"error": "…"}."""
    def decorate(view):
        @csrf_exempt
        @wraps(view)
        def wrapper(request, *args, **kwargs):
            try:
                if request.method not in methods:
                    raise ApiError(405, 'Method not allowed')
                body = {}
                if request.method in ('POST', 'DELETE') and request.body:
                    if len(request.body) > 16384:
                        raise ApiError(413, 'Body too large')
                    if not request.content_type.startswith('application/json'):
                        raise ApiError(415, 'Use application/json')
                    try:
                        body = json.loads(request.body)
                    except ValueError:
                        raise ApiError(400, 'Invalid JSON')
                    if not isinstance(body, dict):
                        raise ApiError(400, 'Expected JSON object')
                if auth:
                    eleve = current_eleve(request)
                    if not eleve:
                        raise ApiError(401, 'Learner bearer token required')
                    args = (eleve, *args)
                status, data = view(request, body, *args, **kwargs)
            except ApiError as e:
                status, data = e.status, {'error': str(e)}
            response = JsonResponse(data, status=status, json_dumps_params={'ensure_ascii': False})
            response['Cache-Control'] = 'no-store'
            return response
        return wrapper
    return decorate


# ─── État de jeu (cœurs, objectif, coffre, oral) ────────────────────────────────────────────────

def clean_state(x):
    x = x if isinstance(x, dict) else {}

    def day(v):
        return v if isinstance(v, str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}', v) else None

    def ids(v):
        return [t for t in v if isinstance(t, str) and len(t) < 64][:200] if isinstance(v, list) else []

    hearts = x.get('hearts')
    return {
        'hearts': max(0, min(5, hearts)) if isinstance(hearts, int) and not isinstance(hearts, bool) else 5,
        'heartsDate': day(x.get('heartsDate')),
        'goal': x.get('goal') if x.get('goal') in (5, 10, 20) and not isinstance(x.get('goal'), bool) else 5,
        'chestDate': day(x.get('chestDate')),
        'oralEasy': ids(x.get('oralEasy')),
        'oralChallengeDays': [d for d in ids(x.get('oralChallengeDays')) if day(d)],
    }


def merge_state(a, b):
    a, b = clean_state(a), clean_state(b)
    hearts = b if (b['heartsDate'] or '') >= (a['heartsDate'] or '') else a
    chest = sorted(d for d in (a['chestDate'], b['chestDate']) if d)
    return {
        'hearts': hearts['hearts'],
        'heartsDate': hearts['heartsDate'],
        'goal': b['goal'],
        'chestDate': chest[-1] if chest else None,
        'oralEasy': list(dict.fromkeys(a['oralEasy'] + b['oralEasy'])),
        'oralChallengeDays': sorted(set(a['oralChallengeDays'] + b['oralChallengeDays']))[-200:],
    }


def oral_xp(st):
    return len(st['oralEasy']) * 5 + len(st['oralChallengeDays']) * 10


# ─── Progression ────────────────────────────────────────────────────────────────────────────────

def progress(eleve):
    rows = list(Attempt.objects.filter(eleve=eleve).order_by('created', 'id'))
    mastered = {r.exercise for r in rows if r.correct}
    skills = {}
    for e in EXERCISES:
        skills.setdefault(e['skill'], {'answered': 0, 'correct': 0})
    for r in rows:
        s = skills[BY_ID[r.exercise]['skill']]
        s['answered'] += 1
        s['correct'] += int(r.correct)
    state = clean_state(eleve.state)
    now = timezone.now()
    today = day_key(now)
    days = {day_key(r.created) for r in rows} | set(state['oralChallengeDays'])
    sorted_days = sorted(days)
    best_streak = run = 0
    for i, d in enumerate(sorted_days):
        consecutive = i and (date.fromisoformat(d) - date.fromisoformat(sorted_days[i - 1])).days == 1
        run = run + 1 if consecutive else 1
        best_streak = max(best_streak, run)
    answered = {r.exercise for r in rows}
    latest = {}
    for r in rows:
        latest[r.exercise] = r
    perfect = 0
    for s in Session.objects.filter(eleve=eleve).prefetch_related('attempts', 'submissions'):
        n = len(s.items)
        if n >= 3 and sum(a.correct for a in s.attempts.all()) == n and not any(
                u.number == 2 for u in s.submissions.all()):
            perfect += 1
    streak = 0
    d = date.fromisoformat(today)
    if d.isoformat() not in days:
        d -= timedelta(days=1)
    while d.isoformat() in days:
        streak += 1
        d -= timedelta(days=1)
    lesson_stats = [{
        'id': lesson['id'],
        'total': len(lesson['exercises']),
        'answered': sum(e['id'] in answered for e in lesson['exercises']),
        'correct': sum(e['id'] in mastered for e in lesson['exercises']),
    } for lesson in LESSONS]
    lessons_done = sum(ls['correct'] == ls['total'] for ls in lesson_stats)
    xp = len(mastered) * 10 + lessons_done * 20 + perfect * 5 + oral_xp(state)
    worlds_done = [w for w in range(4) if all(ls['correct'] == ls['total'] for ls in lesson_stats[w * 3:w * 3 + 3])]
    badge_rules = [
        ('premier-pas', len(mastered) >= 1),
        ('dix-victoires', len(mastered) >= 10),
        ('trente-victoires', len(mastered) >= 30),
        ('tous-les-defis', len(mastered) >= len(EXERCISES)),
        ('trois-jours', best_streak >= 3),
        ('sept-jours', best_streak >= 7),
        ('trente-jours', best_streak >= 30),
        ('xp-100', xp >= 100),
        ('xp-500', xp >= 500),
        ('xp-1000', xp >= 1000),
        ('sans-faute', perfect >= 1),
        ('cinq-sans-faute', perfect >= 5),
        *[(f'monde-{w + 1}', True) for w in worlds_done],
        ('parcours-complet', lessons_done == len(LESSONS)),
    ]
    return {
        'xp': xp,
        'bestStreak': best_streak,
        'oralXp': oral_xp(state),
        'today': today,
        'perfectSessions': perfect,
        'lessonsDone': lessons_done,
        'masteredExercises': len(mastered),
        'totalExercises': len(EXERCISES),
        'attempts': len(rows),
        'streakDays': streak,
        'dailyCompleted': len({r.exercise for r in rows if r.correct and day_key(r.created) == today}),
        'lessons': lesson_stats,
        'reviewsDue': sum(r.due <= now for r in latest.values()),
        'mistakes': sum(not r.correct for r in latest.values()),
        'skills': skills,
        'badges': [b for b, ok in badge_rules if ok],
    }


# ─── Séances ────────────────────────────────────────────────────────────────────────────────────

def next_lesson(session):
    orders = [LESSON_BY_ID[BY_ID[i]['lessonId']]['order'] for i in session.items if i in BY_ID]
    order = max([0, *orders])
    return next((lesson for lesson in LESSONS if lesson['order'] > order), None)


def session_payload(session):
    items = [BY_ID[i] for i in session.items]
    same = bool(items) and all(e['lessonId'] == items[0]['lessonId'] for e in items)
    return {
        'id': str(session.id),
        'kind': session.kind,
        'exercises': [public_exercise(e) for e in items],
        'lesson': public_lesson(LESSON_BY_ID[items[0]['lessonId']]) if same else None,
        'journeyTotal': len(LESSONS),
    }


def own_session(eleve, session_id):
    session = Session.objects.filter(id=session_id, eleve=eleve).first()
    if not session:
        raise ApiError(404, 'Session not found')
    return session


def finished(session):
    return session.attempts.count() == len(session.items)


# ─── Routes ─────────────────────────────────────────────────────────────────────────────────────

@endpoint('GET', auth=False)
def health(request, body):
    return 200, {'status': 'ok', 'storage': 'django'}


@endpoint('POST', auth=False)
def demo_register(request, body):
    origin = request.META.get('HTTP_ORIGIN')
    if not origin or origin not in allowed_origins():
        raise ApiError(403, 'Same-origin registration required')
    locale = body.get('locale', 'en')
    if locale not in ('fr', 'en') or body.get('track', 'foundation') not in ('foundation', 'refresher'):
        raise ApiError(400, 'Invalid learner profile')
    ip_hash = sha('register:' + client_ip(request))[:32]
    if Eleve.objects.filter(ip_hash=ip_hash, created__gte=timezone.now() - timedelta(hours=1)).count() >= REGISTRATION_LIMIT:
        raise ApiError(429, 'Trop de nouveaux profils depuis ce réseau. Réessaie dans une heure.')
    eleve_id = uuid.uuid4()
    token = f'{eleve_id}.{base64.urlsafe_b64encode(secrets.token_bytes(32)).decode().rstrip("=")}'
    Eleve.objects.create(id=eleve_id, locale=locale, token_hash=sha(token), ip_hash=ip_hash)
    return 201, {'id': str(eleve_id), 'locale': locale, 'track': body.get('track', 'foundation'), 'token': token}


@endpoint('GET')
def catalog(request, body, eleve):
    return 200, {
        'name': 'L’Atelier de français',
        'version': '0.1.0',
        'lessons': [{**{k: v for k, v in lesson.items() if k != 'exercises'}, 'exerciseCount': len(lesson['exercises'])}
                    for lesson in LESSONS],
        'levelNotice': 'Exercise difficulty only; not an official CEFR or TCF assessment.',
    }


@endpoint('GET')
def lesson_detail(request, body, eleve, lesson_id):
    lesson = LESSON_BY_ID.get(lesson_id)
    if not lesson:
        raise ApiError(404, 'Lesson not found')
    return 200, {**lesson, 'exercises': [public_exercise(e) for e in lesson['exercises']]}


@endpoint('DELETE')
def me(request, body, eleve):
    if eleve.user_id:
        # Compte TCF Express : on efface la progression de l'Atelier, pas le compte.
        eleve.sessions.all().delete()
        eleve.state = {}
        eleve.save(update_fields=['state'])
    else:
        eleve.delete()
    return 200, {'deleted': True}


@endpoint('GET')
def me_progress(request, body, eleve):
    return 200, progress(eleve)


@endpoint('GET', 'POST')
def me_state(request, body, eleve):
    if request.method == 'POST':
        if not isinstance(body.get('state'), dict):
            raise ApiError(400, 'Invalid state')
        with transaction.atomic():
            eleve = Eleve.objects.select_for_update().get(pk=eleve.pk)
            eleve.state = merge_state(eleve.state, body['state'])
            eleve.save(update_fields=['state'])
    return 200, {'state': clean_state(eleve.state), 'progress': progress(eleve)}


@endpoint('GET')
def me_account(request, body, eleve):
    """Indique si l'Atelier est lié à un compte TCF Express (pour l'affichage)."""
    user = eleve.user
    return 200, {'account': bool(user), 'firstName': (user.first_name if user else '') or ''}


@endpoint('POST')
def me_link(request, body, eleve):
    """Après connexion : reprend la progression anonyme de ce téléphone si le compte n'en a pas encore."""
    if not eleve.user_id:
        raise ApiError(403, 'Connexion TCF Express requise')
    token = body.get('token')
    if not isinstance(token, str) or not TOKEN_RE.match(token):
        raise ApiError(400, 'Invalid learner token')
    anon = Eleve.objects.filter(id=token.split('.')[0], token_hash=sha(token), user__isnull=True).first()
    if not anon:
        return 200, {'linked': False}
    with transaction.atomic():
        if eleve.sessions.exists():
            # Le compte a déjà sa progression : on garde celle du compte et on y ajoute l'état de jeu.
            eleve.state = merge_state(anon.state, eleve.state)
            eleve.save(update_fields=['state'])
            return 200, {'linked': False}
        user = eleve.user
        eleve.delete()
        anon.user, anon.token_hash = user, ''
        anon.save(update_fields=['user', 'token_hash'])
    return 200, {'linked': True}


@endpoint('POST')
def sessions_create(request, body, eleve):
    kind, lesson_id, game_type = body.get('kind', 'practice'), body.get('lessonId'), body.get('gameType')
    if kind not in KINDS:
        raise ApiError(400, 'Invalid session kind')
    if game_type is not None and game_type not in GAME_TYPES:
        raise ApiError(400, 'Invalid game type')
    if lesson_id is not None and lesson_id not in LESSON_BY_ID:
        raise ApiError(400, 'Unknown lesson')
    pool = [e for e in EXERCISES if e['lessonId'] == lesson_id] if lesson_id else list(EXERCISES)
    rows = list(Attempt.objects.filter(eleve=eleve).order_by('created', 'id'))
    if not lesson_id and kind in ('practice', 'daily'):
        seen = {r.exercise for r in rows}
        first = next((lesson for lesson in LESSONS if any(e['id'] not in seen for e in lesson['exercises'])), LESSONS[-1])
        pool = list(first['exercises'])
    if kind == 'game':
        pool = [e for e in pool if e['id'].startswith('game-')]
    if game_type:
        pool = [e for e in pool if e['type'] == game_type]
    latest = {}
    for r in rows:
        latest[r.exercise] = r
    now = timezone.now()
    if kind == 'diagnostic':
        pool = [lesson['exercises'][0] for lesson in LESSONS]
    elif kind == 'refill':
        # Entraînement : d'abord les questions ratées, puis les plus anciennes déjà vues.
        pool = sorted([e for e in EXERCISES if e['id'] in latest],
                      key=lambda e: (latest[e['id']].correct, latest[e['id']].created))
    elif kind == 'review':
        pool = [e for e in pool if e['id'] in latest and latest[e['id']].due <= now]
    else:
        # Une leçon garde son ordre ; jeux et entraînements sont mélangés à chaque partie.
        if not lesson_id:
            random.shuffle(pool)
        pool.sort(key=lambda e: e['id'] in latest)
    selected = pool[:12 if kind == 'diagnostic' else 4 if kind == 'game' else 5]
    session = Session.objects.create(eleve=eleve, kind=kind, items=[e['id'] for e in selected])
    return 201, {**session_payload(session), 'message': None if selected else 'No reviews due yet.'}


@endpoint('GET')
def session_detail(request, body, eleve, session_id):
    s = own_session(eleve, session_id)
    tries = {}
    for u in s.submissions.filter(number__gt=0):
        tries[u.exercise] = tries.get(u.exercise, 0) + 1
    finals = set(s.attempts.values_list('exercise', flat=True))
    return 200, {**session_payload(s), 'answered': [
        {'id': i, 'attempts': tries.get(i, 0), 'finalized': i in finals} for i in s.items]}


@endpoint('GET')
def session_report(request, body, eleve, session_id):
    s = own_session(eleve, session_id)
    finals = {a.exercise: a for a in s.attempts.all()}
    if len(finals) != len(s.items):
        return 200, {'completed': False, 'answered': len(finals), 'total': len(s.items)}
    details = []
    for i in s.items:
        e, final = BY_ID[i], finals[i]
        tries = [{'number': u.number, 'answer': u.answer, 'correct': u.correct, 'hint_used': int(u.hint_used),
                  'hintUsed': u.hint_used}
                 for u in s.submissions.filter(exercise=i, number__gt=0).order_by('number')]
        if not tries:
            tries = [{'number': 1, 'answer': final.answer, 'correct': final.correct, 'hint_used': 0, 'hintUsed': False}]
        details.append({
            'exercise': public_exercise(e),
            'expected': e['answer'],
            'explanationTranslations': e['explanation'],
            'correct': final.correct,
            'attempts': tries,
        })
    return 200, {
        'id': str(s.id),
        'kind': s.kind,
        'completed': True,
        'total': len(s.items),
        'correct': sum(d['correct'] for d in details),
        'firstTry': sum(d['attempts'][0]['correct'] for d in details),
        'recovered': sum(d['correct'] and len(d['attempts']) == 2 for d in details),
        'incorrect': sum(not d['correct'] for d in details),
        'details': details,
        'nextLesson': public_lesson(next_lesson(s)),
        'journeyTotal': len(LESSONS),
    }


@endpoint('POST')
def session_next(request, body, eleve, session_id):
    previous = own_session(eleve, session_id)
    if not finished(previous):
        raise ApiError(409, 'Finish this session before continuing')
    if previous.next_session_id:
        return 200, {'finished': False, **session_payload(previous.next_session)}
    lesson = next_lesson(previous)
    if not lesson:
        return 200, {'finished': True, 'message': 'Last lesson completed. Your reports remain available.'}
    with transaction.atomic():
        nxt = Session.objects.create(eleve=eleve, kind='practice', items=[e['id'] for e in lesson['exercises']])
        previous.next_session = nxt
        previous.save(update_fields=['next_session'])
    return 201, {'finished': False, **session_payload(nxt)}


@endpoint('POST')
def session_restart(request, body, eleve, session_id):
    previous = own_session(eleve, session_id)
    if not finished(previous):
        raise ApiError(409, 'Finish this session before restarting')
    s = Session.objects.create(eleve=eleve, kind=previous.kind, items=previous.items)
    return 201, session_payload(s)


@endpoint('POST')
def session_answer(request, body, eleve, session_id):
    s = own_session(eleve, session_id)
    exercise_id, answer, hint_used = body.get('exerciseId'), body.get('answer'), body.get('hintUsed', False)
    if (not isinstance(answer, str) or not answer.strip() or len(answer) > 500 or not isinstance(hint_used, bool)
            or exercise_id not in s.items):
        raise ApiError(400, 'Invalid exercise or answer')
    if s.attempts.filter(exercise=exercise_id).exists():
        raise ApiError(409, 'Exercise already answered in this session')
    e = BY_ID[exercise_id]
    correct = accepted(e, answer)
    accent_slip = (not correct and e['type'] == 'fill'
                   and any(strip_accents(answer) == strip_accents(a) for a in [e['answer'], *e.get('alternatives', [])]))
    count = s.submissions.filter(exercise=exercise_id, number__gt=0).count()
    if count >= 2:
        raise ApiError(409, 'No attempts remaining')
    hint = e.get('hint') or LESSON_BY_ID[e['lessonId']]['rule']
    now = timezone.now()
    try:
        with transaction.atomic():
            if accent_slip and not s.submissions.filter(exercise=exercise_id, number=0).exists():
                # Essai « gratuit » (numéro 0) : ne compte ni comme essai ni dans le bilan.
                Submission.objects.create(session=s, exercise=exercise_id, number=0, answer=answer, correct=False,
                                          hint_used=hint_used, created=now)
                return 200, {'correct': False, 'finalized': False, 'accentCheck': True, 'hint': hint,
                             'attempt': count, 'attemptsRemaining': 2 - count, 'xpEarned': 0,
                             'completed': False, 'progress': progress(eleve)}
            attempt = count + 1
            final = correct or attempt == 2
            Submission.objects.create(session=s, exercise=exercise_id, number=attempt, answer=answer,
                                      correct=correct, hint_used=hint_used, created=now)
            if not final:
                return 200, {'correct': False, 'finalized': False, 'attempt': attempt, 'attemptsRemaining': 1,
                             'hint': hint, 'feedback': partial_feedback(e, answer), 'xpEarned': 0,
                             'completed': False, 'progress': progress(eleve)}
            prior_success = Attempt.objects.filter(eleve=eleve, exercise=exercise_id, correct=True).exists()
            due = now + timedelta(days=3 if correct else 1)
            Attempt.objects.create(session=s, eleve=eleve, exercise=exercise_id, correct=correct, answer=answer,
                                   created=now, due=due)
    except IntegrityError:
        raise ApiError(409, 'Concurrent update; please retry')
    return 200, {
        'correct': correct,
        'finalized': True,
        'attempt': attempt,
        'attemptsRemaining': 0,
        'expected': e['answer'],
        'explanation': e['explanation'].get(eleve.locale),
        'explanationTranslations': e['explanation'],
        'xpEarned': 10 if correct and not prior_success else 0,
        'reviewAt': iso(due),
        'completed': finished(s),
        'progress': progress(eleve),
    }

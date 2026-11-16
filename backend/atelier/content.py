"""Leçons et exercices de l'Atelier (content.json), et règles de correction."""
import json
import re
import unicodedata
from pathlib import Path

LESSONS = json.loads((Path(__file__).with_name('content.json')).read_text(encoding='utf-8'))['lessons']
EXERCISES = [e for lesson in LESSONS for e in lesson['exercises']]
BY_ID = {e['id']: e for e in EXERCISES}
LESSON_BY_ID = {lesson['id']: lesson for lesson in LESSONS}


def normalize(s):
    s = unicodedata.normalize('NFC', s).lower().replace('’', "'").replace('‘', "'")
    s = re.sub(r'[.!?]+$', '', s).strip()
    return re.sub(r'\s+', ' ', s)


def strip_accents(s):
    return ''.join(c for c in unicodedata.normalize('NFD', normalize(s)) if unicodedata.category(c) != 'Mn')


def accepted(e, answer):
    return any(normalize(a) == normalize(answer) for a in [e['answer'], *e.get('alternatives', [])])


def public_exercise(e):
    return {k: v for k, v in e.items() if k not in ('answer', 'explanation', 'alternatives')}


def public_lesson(lesson):
    if not lesson:
        return None
    return {k: lesson[k] for k in ('id', 'title', 'level', 'order', 'rule')}


def partial_feedback(e, answer):
    """Ce qui est déjà juste après une 1re erreur, sans révéler la solution."""
    if e['type'] == 'pairs':
        good = {normalize(p) for p in e['answer'].split('|')}
        return {'wrongLeft': [p.split('=')[0] for p in answer.split('|') if normalize(p) not in good]}
    if e['type'] == 'order':
        a, x = normalize(answer).split(' '), normalize(e['answer']).split(' ')
        i = 0
        while i < len(a) and i < len(x) and a[i] == x[i]:
            i += 1
        return {'correctPrefix': i}
    if e['type'] == 'repair':
        return {'wordFound': answer.split(':')[0] == e['answer'].split(':')[0]}
    return None

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from .content import BY_ID, LESSONS
from .models import Eleve

ORIGIN = 'https://tcf-express.com'
API = '/api/atelier'


@override_settings(ATELIER_ORIGINS=[ORIGIN])
class AtelierTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(username='amina', email='amina@example.com', password='x',
                                                         first_name='Amina')

    def register(self, ip='10.0.0.1'):
        r = self.client.post(f'{API}/demo/register', HTTP_ORIGIN=ORIGIN, HTTP_X_FORWARDED_FOR=ip)
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()['token']

    def as_bearer(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def as_account(self, user=None):
        self.as_bearer(AccessToken.for_user(user or self.user))

    def finish_lesson(self, lesson):
        s = self.client.post(f'{API}/v1/sessions', {'lessonId': lesson['id']}, format='json').json()
        for ex in s['exercises']:
            r = self.client.post(f"{API}/v1/sessions/{s['id']}/answers",
                                 {'exerciseId': ex['id'], 'answer': BY_ID[ex['id']]['answer']}, format='json')
            self.assertTrue(r.json()['correct'])
        return s

    def test_sans_cle_refuse(self):
        self.assertEqual(self.client.get(f'{API}/v1/catalog').status_code, 401)
        self.as_bearer('0f8fad5b-d9cb-469f-a165-70867728950e.' + 'A' * 43)
        self.assertEqual(self.client.get(f'{API}/v1/catalog').status_code, 401)

    def test_inscription_anonyme_origine_et_limite(self):
        self.assertEqual(self.client.post(f'{API}/demo/register').status_code, 403)
        self.assertEqual(self.client.post(f'{API}/demo/register', HTTP_ORIGIN='https://autre.com').status_code, 403)
        for _ in range(40):
            self.register('10.0.0.9')
        r = self.client.post(f'{API}/demo/register', HTTP_ORIGIN=ORIGIN, HTTP_X_FORWARDED_FOR='10.0.0.9')
        self.assertEqual(r.status_code, 429)
        self.register('10.0.0.10')  # autre réseau : accepté

    def test_parcours_anonyme(self):
        self.as_bearer(self.register())
        self.assertEqual(len(self.client.get(f'{API}/v1/catalog').json()['lessons']), len(LESSONS))
        s = self.finish_lesson(LESSONS[0])
        report = self.client.get(f"{API}/v1/sessions/{s['id']}/report").json()
        self.assertTrue(report['completed'])
        self.assertEqual(report['nextLesson']['id'], LESSONS[1]['id'])
        progress = self.client.get(f'{API}/v1/me/progress').json()
        self.assertEqual(progress['lessonsDone'], 1)
        self.assertIn('premier-pas', progress['badges'])

    def test_compte_tcf_express(self):
        self.as_account()
        self.finish_lesson(LESSONS[0])
        self.assertEqual(self.client.get(f'{API}/v1/me/account').json(), {'account': True, 'firstName': 'Amina'})
        # Autre appareil, même compte : même progression
        other = APIClient()
        other.credentials(HTTP_AUTHORIZATION=f'Bearer {AccessToken.for_user(self.user)}')
        self.assertEqual(other.get(f'{API}/v1/me/progress').json()['lessonsDone'], 1)
        # Effacer la progression ne supprime pas le compte
        self.assertEqual(self.client.delete(f'{API}/v1/me').status_code, 200)
        self.assertTrue(get_user_model().objects.filter(pk=self.user.pk).exists())
        self.assertEqual(self.client.get(f'{API}/v1/me/progress').json()['lessonsDone'], 0)

    def test_connexion_reprend_la_progression_anonyme(self):
        token = self.register()
        self.as_bearer(token)
        self.finish_lesson(LESSONS[0])
        self.as_account()
        r = self.client.post(f'{API}/v1/me/link', {'token': token}, format='json')
        self.assertEqual(r.json(), {'linked': True})
        self.assertEqual(self.client.get(f'{API}/v1/me/progress').json()['lessonsDone'], 1)
        # La clé anonyme ne donne plus accès : la progression appartient maintenant au compte
        self.as_bearer(token)
        self.assertEqual(self.client.get(f'{API}/v1/catalog').status_code, 401)
        self.assertEqual(Eleve.objects.count(), 1)

    def test_compte_deja_avance_garde_sa_progression(self):
        self.as_account()
        self.finish_lesson(LESSONS[0])
        self.finish_lesson(LESSONS[1])
        token = self.register()
        self.as_bearer(token)
        self.finish_lesson(LESSONS[0])
        self.as_account()
        self.assertEqual(self.client.post(f'{API}/v1/me/link', {'token': token}, format='json').json(), {'linked': False})
        self.assertEqual(self.client.get(f'{API}/v1/me/progress').json()['lessonsDone'], 2)

    def test_lien_reserve_aux_comptes(self):
        token = self.register()
        self.as_bearer(token)
        self.assertEqual(self.client.post(f'{API}/v1/me/link', {'token': token}, format='json').status_code, 403)

    def test_seance_d_un_autre_eleve_introuvable(self):
        self.as_account()
        s = self.client.post(f'{API}/v1/sessions', {'lessonId': LESSONS[0]['id']}, format='json').json()
        other = get_user_model().objects.create_user(username='paul', email='paul@example.com', password='x')
        self.as_account(other)
        self.assertEqual(self.client.get(f"{API}/v1/sessions/{s['id']}").status_code, 404)

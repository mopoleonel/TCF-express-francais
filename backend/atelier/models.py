"""
L'Atelier de français : module de remise à niveau en français (A1 → B2) servi sur tcf-express.com/atelier/.

Un « élève » de l'Atelier est soit lié à un compte TCF Express (connexion JWT habituelle),
soit anonyme (clé d'élève gardée sur son téléphone). Un élève anonyme qui se connecte garde sa progression.
"""
import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class Eleve(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE,
                                related_name='atelier_eleve')
    locale = models.CharField(max_length=2, default='en')
    token_hash = models.CharField(max_length=64, blank=True, db_index=True)
    ip_hash = models.CharField(max_length=32, blank=True, db_index=True)
    # Cœurs, objectif du jour, coffre, oral : synchronisés entre appareils
    state = models.JSONField(default=dict, blank=True)
    created = models.DateTimeField(default=timezone.now)

    class Meta:
        verbose_name = "Élève de l'Atelier"
        verbose_name_plural = "Élèves de l'Atelier"

    def __str__(self):
        return f"Atelier · {self.user or 'anonyme'}"


class Session(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    eleve = models.ForeignKey(Eleve, on_delete=models.CASCADE, related_name='sessions')
    kind = models.CharField(max_length=16)
    items = models.JSONField(default=list)
    created = models.DateTimeField(default=timezone.now)
    next_session = models.OneToOneField('self', null=True, blank=True, on_delete=models.SET_NULL,
                                        related_name='previous_session')

    class Meta:
        verbose_name = "Séance de l'Atelier"


class Attempt(models.Model):
    """Résultat final d'un exercice dans une séance."""
    session = models.ForeignKey(Session, on_delete=models.CASCADE, related_name='attempts')
    eleve = models.ForeignKey(Eleve, on_delete=models.CASCADE, related_name='attempts')
    exercise = models.CharField(max_length=64)
    correct = models.BooleanField()
    answer = models.TextField()
    created = models.DateTimeField()
    due = models.DateTimeField()

    class Meta:
        constraints = [models.UniqueConstraint(fields=['session', 'exercise'], name='atelier_attempt_unique')]
        ordering = ['created', 'id']


class Submission(models.Model):
    """Chaque essai (numéro 1 ou 2 ; 0 = essai « accent » gratuit)."""
    session = models.ForeignKey(Session, on_delete=models.CASCADE, related_name='submissions')
    exercise = models.CharField(max_length=64)
    number = models.PositiveSmallIntegerField()
    answer = models.TextField()
    correct = models.BooleanField()
    hint_used = models.BooleanField(default=False)
    created = models.DateTimeField()

    class Meta:
        constraints = [models.UniqueConstraint(fields=['session', 'exercise', 'number'],
                                               name='atelier_submission_unique')]

from django.urls import path

from . import views

# Routes identiques à la version de test de l'Atelier (sans « / » final), sous /api/atelier/
urlpatterns = [
    path('health', views.health),
    path('demo/register', views.demo_register),
    path('v1/catalog', views.catalog),
    path('v1/lessons/<str:lesson_id>', views.lesson_detail),
    path('v1/me', views.me),
    path('v1/me/progress', views.me_progress),
    path('v1/me/state', views.me_state),
    path('v1/me/account', views.me_account),
    path('v1/me/link', views.me_link),
    path('v1/sessions', views.sessions_create),
    path('v1/sessions/<uuid:session_id>', views.session_detail),
    path('v1/sessions/<uuid:session_id>/report', views.session_report),
    path('v1/sessions/<uuid:session_id>/next', views.session_next),
    path('v1/sessions/<uuid:session_id>/restart', views.session_restart),
    path('v1/sessions/<uuid:session_id>/answers', views.session_answer),
]

from django.contrib import admin

from .models import Eleve


@admin.register(Eleve)
class EleveAdmin(admin.ModelAdmin):
    list_display = ('__str__', 'user', 'created')
    search_fields = ('user__email', 'user__username')
    readonly_fields = ('id', 'token_hash', 'ip_hash', 'state', 'created')
    list_select_related = ('user',)

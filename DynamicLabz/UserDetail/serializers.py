from rest_framework import serializers
from .models import *


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    initials = serializers.SerializerMethodField()
    profile_image_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'email', 'first_name', 'last_name', 'full_name', 'initials', 'role', 'role_display',
            'contact_number', 'designation', 'date_of_joining', 'profile_image_url',
            'is_active', 'last_login', 'created_at',
        ]

    def get_initials(self, obj):
        parts = [p for p in [obj.first_name, obj.last_name] if p]
        if not parts:
            return obj.email[:2].upper()
        return ''.join(p[0] for p in parts[:2]).upper()

    def get_profile_image_url(self, obj):
        return obj.profile_image.url if obj.profile_image else None


class TeamMemberSerializer(serializers.ModelSerializer):
    """Minimal public view of a teammate used for assignee / owner dropdowns."""
    full_name = serializers.CharField(read_only=True)
    role_display = serializers.CharField(source='get_role_display', read_only=True)

    class Meta:
        model = User
        fields = ['id', 'full_name', 'email', 'role', 'role_display', 'designation']

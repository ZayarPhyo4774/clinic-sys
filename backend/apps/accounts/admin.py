from django import forms
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.forms import UserChangeForm as DjangoUserChangeForm

from apps.accounts.models import Permission, Role, User, UserRole


class UserCreationForm(forms.ModelForm):
    password1 = forms.CharField(label="Password", widget=forms.PasswordInput)
    password2 = forms.CharField(label="Password confirmation", widget=forms.PasswordInput)

    class Meta:
        model = User
        fields = ("email", "full_name", "clinic")

    def clean_password2(self):
        password1 = self.cleaned_data.get("password1")
        password2 = self.cleaned_data.get("password2")
        if password1 and password2 and password1 != password2:
            raise forms.ValidationError("Passwords do not match.")
        return password2

    def save(self, commit=True):
        user = super().save(commit=False)
        user.set_password(self.cleaned_data["password1"])
        if commit:
            user.save()
        return user


class UserChangeForm(DjangoUserChangeForm):
    class Meta:
        model = User
        fields = ("email", "full_name", "clinic", "is_active", "is_staff", "is_superuser")


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    form = UserChangeForm
    add_form = UserCreationForm
    model = User
    ordering = ("email",)
    list_display = ("email", "full_name", "clinic", "is_active", "is_staff")
    search_fields = ("email", "full_name")
    readonly_fields = ("id", "date_joined", "last_login")
    filter_horizontal = ("groups", "user_permissions")
    fieldsets = (
        (None, {"fields": ("id", "email", "password")}),
        ("Profile", {"fields": ("full_name", "clinic")}),
        (
            "Access",
            {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")},
        ),
        ("Dates", {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("email", "full_name", "clinic", "password1", "password2"),
            },
        ),
    )


@admin.register(Permission)
class PermissionAdmin(admin.ModelAdmin):
    list_display = ("code", "description")
    search_fields = ("code",)


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "clinic")
    list_filter = ("clinic",)
    search_fields = ("name", "code")
    filter_horizontal = ("permissions",)


@admin.register(UserRole)
class UserRoleAdmin(admin.ModelAdmin):
    list_display = ("user", "role", "branch", "created_at")
    list_filter = ("role__clinic",)

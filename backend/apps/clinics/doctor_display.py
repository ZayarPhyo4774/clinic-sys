def staff_user_display_name(staff) -> str:
    if staff is None:
        return ""
    user = getattr(staff, "user", None)
    if user is None:
        return ""
    name = (user.full_name or "").strip()
    if name:
        return name
    return (user.email or "").strip()


def doctor_profile_display_name(profile) -> str:
    if profile is None:
        return ""
    return staff_user_display_name(getattr(profile, "staff", None))


def doctor_field_display_name(doctor) -> str:
    if doctor is None:
        return ""
    return staff_user_display_name(getattr(doctor, "staff", None))

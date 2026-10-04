from apps.notifications.models import Notification


def record_notification(
    *,
    recipient,
    clinic,
    title: str,
    message: str = "",
    branch=None,
    kind: str = Notification.Kind.INFO,
) -> Notification:
    return Notification.objects.create(
        recipient=recipient,
        clinic=clinic,
        branch=branch,
        title=title,
        message=message,
        kind=kind,
    )

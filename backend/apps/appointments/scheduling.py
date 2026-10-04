from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from django.core.exceptions import ValidationError
from django.utils import timezone


def duration_minutes(start_time, end_time) -> int:
    start = datetime.combine(date.min, start_time)
    end = datetime.combine(date.min, end_time)
    return int((end - start).total_seconds() // 60)


def dates_overlap(first_from, first_until, second_from, second_until) -> bool:
    start_a = first_from or date.min
    end_a = first_until or date.max
    start_b = second_from or date.min
    end_b = second_until or date.max
    return start_a <= end_b and start_b <= end_a


def times_overlap(first_start, first_end, second_start, second_end) -> bool:
    return first_start < second_end and second_start < first_end


def local_bounds(starts_at, ends_at, timezone_name):
    zone = ZoneInfo(timezone_name)
    start = starts_at.astimezone(zone)
    end = ends_at.astimezone(zone)
    return start, end


def fits_schedule(schedule, starts_at, ends_at, timezone_name) -> bool:
    """True when the visit is one aligned slot inside this schedule window."""
    if not schedule.is_active:
        return False
    start, end = local_bounds(starts_at, ends_at, timezone_name)
    if start.date() != end.date() or end <= start:
        return False
    if start.weekday() != schedule.weekday:
        return False
    if schedule.effective_from and start.date() < schedule.effective_from:
        return False
    if schedule.effective_until and start.date() > schedule.effective_until:
        return False
    if start.time() < schedule.start_time or end.time() > schedule.end_time:
        return False
    slot = timedelta(minutes=schedule.slot_minutes)
    if (end - start) != slot:
        return False
    window_start = start.replace(
        hour=schedule.start_time.hour,
        minute=schedule.start_time.minute,
        second=schedule.start_time.second,
        microsecond=0,
    )
    elapsed = (start - window_start).total_seconds()
    return elapsed >= 0 and elapsed % slot.total_seconds() == 0


def next_available_slot(doctor, branch, *, patient=None, after=None, days_ahead=7):
    """Return the next bookable slot for a doctor at a branch."""
    from apps.appointments.models import Appointment, DoctorSchedule

    tz = ZoneInfo(branch.clinic.timezone)
    now = (after or timezone.now()).astimezone(tz)
    today = now.date()
    schedules = list(
        DoctorSchedule.objects.filter(
            doctor=doctor,
            branch=branch,
            is_active=True,
        )
    )
    if not schedules:
        raise ValidationError({"doctor": "No active schedule for this doctor at this branch."})

    for day_offset in range(days_ahead + 1):
        local_date = today + timedelta(days=day_offset)
        weekday = local_date.weekday()
        for schedule in schedules:
            if schedule.weekday != weekday:
                continue
            if schedule.effective_from and local_date < schedule.effective_from:
                continue
            if schedule.effective_until and local_date > schedule.effective_until:
                continue

            window_start = datetime.combine(local_date, schedule.start_time, tzinfo=tz)
            window_end = datetime.combine(local_date, schedule.end_time, tzinfo=tz)
            step = timedelta(minutes=schedule.slot_minutes)
            cursor = window_start
            while cursor + step <= window_end:
                slot_end = cursor + step
                if slot_end <= now or cursor <= timezone.now():
                    cursor = slot_end
                    continue
                if not fits_schedule(schedule, cursor, slot_end, branch.clinic.timezone):
                    cursor = slot_end
                    continue
                doctor_clash = Appointment.objects.filter(
                    doctor_id=doctor.pk,
                    starts_at__lt=slot_end,
                    ends_at__gt=cursor,
                    status__in=Appointment.BLOCKING,
                ).exists()
                patient_clash = False
                if patient is not None:
                    patient_clash = Appointment.objects.filter(
                        patient_id=patient.pk,
                        starts_at__lt=slot_end,
                        ends_at__gt=cursor,
                        status__in=Appointment.BLOCKING,
                    ).exists()
                if not doctor_clash and not patient_clash:
                    return cursor, slot_end, schedule
                cursor = slot_end

    raise ValidationError({"starts_at": "No available slots for this doctor."})

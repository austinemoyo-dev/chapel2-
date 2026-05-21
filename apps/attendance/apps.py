import logging
import threading
from django.apps import AppConfig

logger = logging.getLogger(__name__)


class AttendanceConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.attendance'
    verbose_name = 'Attendance Engine'

    def ready(self):
        import apps.attendance.signals  # noqa: F401 — register post_save signal
        threading.Thread(target=self._warmup_face_model, daemon=True).start()

    @staticmethod
    def _warmup_face_model():
        try:
            from apps.core.face import get_face_app
            get_face_app()
            logger.info('InsightFace buffalo_l model loaded and cached.')
        except Exception as exc:
            logger.warning('InsightFace model warmup skipped: %s', exc)

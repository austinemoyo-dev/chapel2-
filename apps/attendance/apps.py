import os
import logging
import threading
from django.apps import AppConfig

logger = logging.getLogger(__name__)


class AttendanceConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.attendance'
    verbose_name = 'Attendance Engine'

    def ready(self):
        # Suppress Windows cp1252 encoding crash in DeepFace's emoji-heavy logger.
        # This must happen before DeepFace is imported.
        os.environ.setdefault('PYTHONIOENCODING', 'utf-8')

        # Warm the Facenet512 model in a background thread so the first
        # attendance sign-in request doesn't block for 3-5 seconds.
        threading.Thread(target=self._warmup_face_model, daemon=True).start()

    @staticmethod
    def _warmup_face_model():
        try:
            from deepface.modules import modeling
            modeling.build_model(task='facial_recognition', model_name='Facenet512')
            modeling.build_model(task='face_detector',      model_name='opencv')
            logger.info('DeepFace Facenet512 + OpenCV models loaded and cached.')
        except Exception as exc:
            logger.warning('DeepFace model warmup skipped: %s', exc)

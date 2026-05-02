"""
Chapel Attendance Management System — Django Settings
Production-grade configuration for PostgreSQL, JWT, and DeepFace integration.
"""
import os
from pathlib import Path
from datetime import timedelta

# =============================================================================
# BASE CONFIGURATION
# =============================================================================
BASE_DIR = Path(__file__).resolve().parent.parent

# SECRET_KEY must be set via DJANGO_SECRET_KEY environment variable.
# There is no insecure fallback — the app will refuse to start without it.
_secret_key = os.environ.get('DJANGO_SECRET_KEY', '')
if not _secret_key:
    raise RuntimeError(
        'DJANGO_SECRET_KEY environment variable is not set. '
        'Generate one with: python -c "import secrets; print(secrets.token_urlsafe(50))"'
    )
SECRET_KEY = _secret_key

# Default to False — debug must be explicitly enabled in development.
DEBUG = os.environ.get('DJANGO_DEBUG', 'False').lower() in ('true', '1', 'yes')

ALLOWED_HOSTS = os.environ.get(
    'DJANGO_ALLOWED_HOSTS',
    'localhost,127.0.0.1'
).split(',')

# =============================================================================
# APPLICATION DEFINITION
# =============================================================================
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third-party
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    # Local apps
    'apps.accounts',
    'apps.students',
    'apps.services',
    'apps.attendance',
    'apps.reports',
    'apps.audit',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'chapel.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'chapel.wsgi.application'

# =============================================================================
# DATABASE — PostgreSQL
# =============================================================================
_db_password = os.environ.get('DB_PASSWORD', '')
if not _db_password:
    raise RuntimeError(
        'DB_PASSWORD environment variable is not set. '
        'Set it in your .env file before starting the application.'
    )

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('DB_NAME', 'chapel_attendance'),
        'USER': os.environ.get('DB_USER', 'postgres'),
        'PASSWORD': _db_password,
        'HOST': os.environ.get('DB_HOST', 'localhost'),
        'PORT': os.environ.get('DB_PORT', '5432'),
        'OPTIONS': {
            'connect_timeout': 10,
        },
    }
}

# =============================================================================
# CUSTOM USER MODEL
# =============================================================================
AUTH_USER_MODEL = 'accounts.AdminUser'

# =============================================================================
# PASSWORD VALIDATION
# =============================================================================
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# =============================================================================
# INTERNATIONALIZATION
# =============================================================================
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# =============================================================================
# STATIC & MEDIA FILES
# =============================================================================
STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

# Media root for face samples and profile photos — NOT publicly served
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Face samples stored in: media/face_samples/{semester_id}/{student_id}/
FACE_SAMPLES_DIR = 'face_samples'

# =============================================================================
# DJANGO REST FRAMEWORK
# =============================================================================
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 50,
    'DEFAULT_RENDERER_CLASSES': (
        'rest_framework.renderers.JSONRenderer',
    ),
    'EXCEPTION_HANDLER': 'rest_framework.views.exception_handler',
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '30/minute',
        'user': '120/minute',
        # Tight throttle for computationally expensive face processing endpoints.
        # Applied explicitly on FaceSampleUploadView and SignInView.
        'face_upload': '5/minute',
    },
}

# =============================================================================
# JWT CONFIGURATION (Simple JWT)
# =============================================================================
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=2),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'AUTH_TOKEN_CLASSES': ('rest_framework_simplejwt.tokens.AccessToken',),
    'TOKEN_OBTAIN_SERIALIZER': 'apps.accounts.serializers.CustomTokenObtainPairSerializer',
}

# =============================================================================
# CORS CONFIGURATION
# =============================================================================
CORS_ALLOWED_ORIGINS = os.environ.get(
    'CORS_ALLOWED_ORIGINS',
    'http://localhost:3000,http://127.0.0.1:3000'
).split(',')
CORS_ALLOW_CREDENTIALS = True

# =============================================================================
# INSIGHTFACE CONFIGURATION (replaces DeepFace / TensorFlow)
# =============================================================================
os.environ.setdefault('PYTHONIOENCODING', 'utf-8')

# Model pack — 'buffalo_l' (best, ~500 MB), 'buffalo_m' (~150 MB), 'buffalo_s' (~90 MB).
INSIGHTFACE_MODEL_NAME = os.environ.get('INSIGHTFACE_MODEL_NAME', 'buffalo_l')

# Detector input resolution. Higher = more accurate on small/distant faces.
# (640, 640) is the default and works well for a phone-held portrait frame.
INSIGHTFACE_DET_SIZE = (
    int(os.environ.get('INSIGHTFACE_DET_W', '640')),
    int(os.environ.get('INSIGHTFACE_DET_H', '640')),
)

# Cosine DISTANCE threshold for face matching (lower = stricter).
# ArcFace default for buffalo_l is ~0.40.
# Raise to 0.45 for more lenient matching (fewer false rejects).
# Lower to 0.35 for stricter matching (fewer false accepts).
INSIGHTFACE_MATCH_THRESHOLD = float(
    os.environ.get('INSIGHTFACE_MATCH_THRESHOLD', '0.40')
)

# Minimum RetinaFace detection confidence to accept a face.
# Faces below this threshold are considered blurry / poorly lit.
INSIGHTFACE_DET_SCORE_MIN = float(
    os.environ.get('INSIGHTFACE_DET_SCORE_MIN', '0.50')
)

# Minimum face bounding-box size in pixels.
# Faces smaller than this are rejected as "too far from camera".
INSIGHTFACE_MIN_FACE_PX = int(
    os.environ.get('INSIGHTFACE_MIN_FACE_PX', '80')
)

# =============================================================================
# DUPLICATE DETECTION CONFIGURATION
# =============================================================================
FUZZY_NAME_MATCH_THRESHOLD = int(os.environ.get('FUZZY_NAME_MATCH_THRESHOLD', '85'))

# =============================================================================
# GEO-FENCE DEFAULTS
# =============================================================================
DEFAULT_GEOFENCE_RADIUS_METERS = 200

# =============================================================================
# MATRIC UPDATE TOKEN EXPIRY
# =============================================================================
MATRIC_UPDATE_TOKEN_EXPIRY_HOURS = int(
    os.environ.get('MATRIC_UPDATE_TOKEN_EXPIRY_HOURS', '48')
)

# =============================================================================
# FACE UPLOAD VALIDATION
# =============================================================================
FACE_UPLOAD_MAX_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB
FACE_UPLOAD_ALLOWED_TYPES = {'image/jpeg', 'image/png', 'image/webp'}

# =============================================================================
# SECURITY SETTINGS (production — active when DEBUG=False)
# =============================================================================
if not DEBUG:
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_SSL_REDIRECT = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# =============================================================================
# DEFAULT PRIMARY KEY TYPE
# =============================================================================
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# =============================================================================
# LOGGING
# =============================================================================
_log_handlers = ['console']
_log_dir = Path('/var/log/chapel')

# Add file handler in production when the log directory is available
if not DEBUG and _log_dir.exists():
    _log_handlers.append('file')

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
        'file': {
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': '/var/log/chapel/django.log' if _log_dir.exists() else 'django-local.log',
            'maxBytes': 10 * 1024 * 1024,  # 10 MB per file
            'backupCount': 5,
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': _log_handlers,
        'level': 'INFO',
    },
    'loggers': {
        'django': {
            'handlers': _log_handlers,
            'level': 'INFO',
            'propagate': False,
        },
        'apps': {
            'handlers': _log_handlers,
            'level': 'DEBUG' if DEBUG else 'INFO',
            'propagate': False,
        },
    },
}

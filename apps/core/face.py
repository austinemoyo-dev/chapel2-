"""
InsightFace singleton and all face-recognition operations.

Replaces DeepFace + TensorFlow with:
  - Detector  : RetinaFace (det_10g.onnx)   — handles low light, angles, all skin tones
  - Recogniser: ArcFace R50 (buffalo_l)      — 99.83 % LFW, better than Facenet512
  - Runtime   : ONNX (CPU)                   — 3× faster start, no TF dependency

Thread-safe singleton — the FaceAnalysis app is heavy to load (~500 MB models)
so it is initialised once and reused across all requests.
"""
import threading
import logging
import os
import tempfile

import cv2
import numpy as np
from django.conf import settings

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_app  = None


def get_face_app():
    """
    Return the shared FaceAnalysis instance, creating it on the first call.
    Subsequent calls return the cached object without any I/O.
    """
    global _app
    if _app is not None:
        return _app

    with _lock:
        if _app is not None:           # re-check after acquiring the lock
            return _app

        try:
            from insightface.app import FaceAnalysis
        except ImportError:
            logger.error(
                'insightface is not installed. '
                'Run: pip install insightface onnxruntime'
            )
            return None

        model_name = getattr(settings, 'INSIGHTFACE_MODEL_NAME', 'buffalo_l')
        det_size   = getattr(settings, 'INSIGHTFACE_DET_SIZE', (640, 640))

        logger.info(f'[InsightFace] Loading model "{model_name}" …')
        app = FaceAnalysis(
            name=model_name,
            providers=['CPUExecutionProvider'],
        )
        app.prepare(ctx_id=0, det_size=det_size)
        _app = app
        logger.info('[InsightFace] Model ready.')
    return _app


# ─────────────────────────────────────────────────────────────────────────────
# Image helpers
# ─────────────────────────────────────────────────────────────────────────────

def _load_bgr(path: str):
    """Read an image file as a BGR numpy array (InsightFace's expected format)."""
    img = cv2.imread(path)
    if img is None:
        # Try PIL fallback for unusual formats (WebP, etc.)
        try:
            from PIL import Image
            pil = Image.open(path).convert('RGB')
            img = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
        except Exception:
            return None
    return img


def _load_bgr_from_django_file(django_file) -> str | None:
    """
    Write a Django InMemoryUploadedFile / TemporaryUploadedFile to a temp path
    and return that path, or None on failure.
    Caller is responsible for deleting the temp file.
    """
    try:
        suffix = os.path.splitext(django_file.name)[-1] or '.jpg'
        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=suffix,
            dir=settings.MEDIA_ROOT,
        ) as tmp:
            for chunk in django_file.chunks():
                tmp.write(chunk)
            return tmp.name
    except Exception as e:
        logger.error(f'[InsightFace] Failed to write temp file: {e}')
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Core operations
# ─────────────────────────────────────────────────────────────────────────────

def process_face_sample(image_path: str) -> dict:
    """
    Analyse a face image and return an embedding or a rejection reason.

    Auto-rejection rules (matches spec §5.2):
      - No face detected
      - Multiple faces detected
      - Face too small (< INSIGHTFACE_MIN_FACE_PX pixels wide/tall)
      - Low detection confidence (blurry / dark image)

    Returns:
        {
          'status':           'approved' | 'rejected',
          'embedding':        list[float] (512-dim) or [],
          'rejection_reason': str or None,
        }
    """
    app = get_face_app()
    if app is None:
        return {
            'status': 'rejected',
            'embedding': [],
            'rejection_reason': 'Face recognition service is not available.',
        }

    img = _load_bgr(image_path)
    if img is None:
        return {
            'status': 'rejected',
            'embedding': [],
            'rejection_reason': 'Could not read the image file.',
        }

    faces = app.get(img)

    if len(faces) == 0:
        return {
            'status': 'rejected',
            'embedding': [],
            'rejection_reason': (
                'No face detected. Position your face in the centre of the frame.'
            ),
        }

    if len(faces) > 1:
        return {
            'status': 'rejected',
            'embedding': [],
            'rejection_reason': (
                'Multiple faces detected. Ensure only your face is visible.'
            ),
        }

    face = faces[0]

    # Detection confidence — low score means blurry / poor lighting
    min_score = getattr(settings, 'INSIGHTFACE_DET_SCORE_MIN', 0.50)
    if face.det_score < min_score:
        return {
            'status': 'rejected',
            'embedding': [],
            'rejection_reason': (
                'Poor lighting or image quality. '
                'Move to a brighter area and hold the phone steady.'
            ),
        }

    # Face bounding box size — small face means person is too far away
    x1, y1, x2, y2 = face.bbox.astype(int)
    face_w = x2 - x1
    face_h = y2 - y1
    min_px = getattr(settings, 'INSIGHTFACE_MIN_FACE_PX', 80)
    if face_w < min_px or face_h < min_px:
        return {
            'status': 'rejected',
            'embedding': [],
            'rejection_reason': 'Move closer to the camera.',
        }

    return {
        'status': 'approved',
        'embedding': face.embedding.tolist(),
        'rejection_reason': None,
    }


def extract_embedding_from_django_file(django_file) -> list[float] | None:
    """
    Extract a face embedding from an uploaded Django file object.
    Returns the 512-dim embedding list, or None on failure.
    Used by SignInView / SignOutView for real-time attendance marking.
    """
    temp_path = _load_bgr_from_django_file(django_file)
    if temp_path is None:
        return None
    try:
        result = process_face_sample(temp_path)
        if result['status'] == 'approved':
            return result['embedding']
        logger.warning(f'[InsightFace] Embedding rejected: {result["rejection_reason"]}')
        return None
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


def match_1_to_n(
    probe_embedding: list[float],
    candidate_samples,             # QuerySet of FaceSample with embedding_vector
    threshold: float | None = None,
) -> dict:
    """
    Compare a probe embedding against a list of stored embeddings.

    Uses cosine distance (1 − cosine_similarity).
    Threshold: lower = stricter. ArcFace default ≈ 0.40.

    Args:
        probe_embedding:   512-dim list from the live camera frame.
        candidate_samples: Django QuerySet of FaceSample objects.
        threshold:         Override settings.INSIGHTFACE_MATCH_THRESHOLD.

    Returns:
        {
          'matched':      bool,
          'student_id':   UUID or None,
          'student_name': str or None,
          'confidence':   float (cosine similarity, higher = better match),
          'message':      str,
        }
    """
    if threshold is None:
        threshold = float(
            getattr(settings, 'INSIGHTFACE_MATCH_THRESHOLD', 0.40)
        )

    if not probe_embedding:
        return {
            'matched': False, 'student_id': None,
            'student_name': None, 'confidence': 0.0,
            'message': 'Invalid face embedding.',
        }

    probe = np.array(probe_embedding, dtype=np.float64)
    probe_norm = np.linalg.norm(probe)
    if probe_norm == 0:
        return {
            'matched': False, 'student_id': None,
            'student_name': None, 'confidence': 0.0,
            'message': 'Zero-norm embedding — invalid capture.',
        }
    probe = probe / probe_norm

    valid_samples = []
    rows = []
    for sample in candidate_samples:
        if not sample.embedding_vector:
            continue
        vec = np.array(sample.embedding_vector, dtype=np.float64)
        n = np.linalg.norm(vec)
        if n == 0:
            continue
        rows.append(vec / n)
        valid_samples.append(sample)

    if not valid_samples:
        return {
            'matched': False, 'student_id': None,
            'student_name': None, 'confidence': 0.0,
            'message': 'No valid embeddings in this service pool.',
        }

    # Single BLAS matrix-vector multiply: (N, 512) @ (512,) → (N,)
    matrix       = np.vstack(rows)
    similarities = matrix @ probe
    best_idx     = int(np.argmax(similarities))
    best_sim     = float(similarities[best_idx])
    best_sample  = valid_samples[best_idx]

    cosine_dist = 1.0 - best_sim

    if cosine_dist < threshold:
        return {
            'matched':      True,
            'student_id':   best_sample.student.id,
            'student_name': best_sample.student.full_name,
            'confidence':   best_sim,
            'message': (
                f'Matched: {best_sample.student.full_name} '
                f'(similarity {best_sim:.4f})'
            ),
        }

    return {
        'matched':      False,
        'student_id':   None,
        'student_name': None,
        'confidence':   best_sim,
        'message':      'No matching face found in this service pool.',
    }


def check_face_duplicate(
    embedding_vector: list[float],
    current_student,
    semester,
) -> dict | None:
    """
    Compare a new embedding against all other approved samples in the semester.
    Returns a match dict if a duplicate is found, or None.
    """
    from apps.students.models import FaceSample

    threshold = float(
        getattr(settings, 'INSIGHTFACE_MATCH_THRESHOLD', 0.40)
    )

    other_samples = (
        FaceSample.objects
        .filter(semester=semester, status='approved')
        .exclude(student=current_student)
        .select_related('student')
    )

    if not other_samples.exists():
        return None

    result = match_1_to_n(embedding_vector, other_samples, threshold=threshold)
    if result['matched']:
        return {
            'student_id':   result['student_id'],
            'student_name': result['student_name'],
            'confidence':   result['confidence'],
        }
    return None

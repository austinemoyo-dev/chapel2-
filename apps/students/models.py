"""
Students Models — Student registration and face sample storage.

Student: Core entity with duplicate detection fields, service assignment,
         and semester-scoped activation.
FaceSample: Individual face capture with DeepFace embedding vectors.
            Minimum 3 approved samples required for activation.
"""
import uuid
from django.db import models
from django.conf import settings


class StudentTypeChoices(models.TextChoices):
    OLD = 'old', 'Old Student'
    NEW = 'new', 'New Student'


class LevelChoices(models.TextChoices):
    L100 = '100', '100 Level'
    L200 = '200', '200 Level'
    L300 = '300', '300 Level'
    L400 = '400', '400 Level'


class GenderChoices(models.TextChoices):
    MALE = 'male', 'Male'
    FEMALE = 'female', 'Female'


class ServiceGroupChoices(models.TextChoices):
    """Reused from services app for consistency."""
    S1 = 'S1', 'Service 1'
    S2 = 'S2', 'Service 2'
    S3 = 'S3', 'Service 3'


class Student(models.Model):
    """
    Student registration record, semester-scoped.
    
    Key design decisions:
    - full_name stored in title case (auto-capitalized on save)
    - full_name_normalized stored in lowercase for fuzzy matching
    - system_id auto-generated for new students, retained after matric update
    - is_active = False until face_registered=True AND duplicate_flag=False
    - service_group assigned randomly respecting capacity caps
    """
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
    )
    student_type = models.CharField(
        max_length=5,
        choices=StudentTypeChoices.choices,
        help_text='Old students have matric numbers; new students get system IDs'
    )
    matric_number = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        db_index=True,
        help_text='Required for old students. Updated later for new students.'
    )
    system_id = models.CharField(
        max_length=20,
        unique=True,
        db_index=True,
        help_text='Auto-generated unique ID for new students'
    )
    full_name = models.CharField(
        max_length=255,
        help_text='Stored in title case (auto-capitalized)'
    )
    full_name_normalized = models.CharField(
        max_length=255,
        db_index=True,
        help_text='Lowercase version for fuzzy matching'
    )
    phone_number = models.CharField(
        max_length=20,
        db_index=True,
        help_text='Required. Checked for exact duplicates.'
    )
    department = models.CharField(
        max_length=100,
        help_text='Student department'
    )
    faculty = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text='Student faculty'
    )
    level = models.CharField(
        max_length=5,
        choices=LevelChoices.choices,
        help_text='Academic level: 100, 200, 300, or 400'
    )
    gender = models.CharField(
        max_length=10,
        choices=GenderChoices.choices,
        help_text='Student gender'
    )
    profile_photo = models.ImageField(
        upload_to='profile_photos/%Y/%m/',
        blank=True,
        null=True,
        help_text='Profile display photo (separate from face samples)'
    )
    face_registered = models.BooleanField(
        default=False,
        help_text='True when minimum 3 face samples are approved'
    )
    service_group = models.CharField(
        max_length=5,
        choices=ServiceGroupChoices.choices,
        blank=True,
        null=True,
        help_text='Assigned service group (S1/S2/S3)'
    )
    semester = models.ForeignKey(
        'services.Semester',
        on_delete=models.CASCADE,
        related_name='students',
        help_text='Current semester scope'
    )
    is_active = models.BooleanField(
        default=False,
        db_index=True,
        help_text='Active when face registered and no duplicate flags'
    )
    duplicate_flag = models.BooleanField(
        default=False,
        db_index=True,
        help_text='Flagged for Superadmin review if potential duplicate detected'
    )
    duplicate_details = models.JSONField(
        default=dict,
        blank=True,
        help_text='Details of duplicate detection matches'
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='registered_students',
        help_text='Set when manually added by admin/superadmin'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'students'
        ordering = ['-created_at']
        constraints = [
            # Matric number must be unique within a semester (when not null)
            models.UniqueConstraint(
                fields=['matric_number', 'semester'],
                name='unique_matric_per_semester',
                condition=models.Q(matric_number__isnull=False),
            ),
            # Phone number must be unique within a semester
            models.UniqueConstraint(
                fields=['phone_number', 'semester'],
                name='unique_phone_per_semester',
            ),
        ]
        indexes = [
            models.Index(
                fields=['semester', 'service_group', 'is_active'],
                name='idx_student_service_pool'
            ),
        ]

    def __str__(self):
        identifier = self.matric_number or self.system_id
        return f'{self.full_name} ({identifier})'

    def save(self, *args, **kwargs):
        """
        Auto-capitalize full_name to title case and generate normalized version.
        Generate system_id for new students if not set.
        """
        # Auto-capitalize name
        if self.full_name:
            self.full_name = self.full_name.strip().title()
            self.full_name_normalized = self.full_name.lower().strip()

        # Generate system_id if not set
        if not self.system_id:
            self.system_id = self._generate_system_id()

        super().save(*args, **kwargs)

    @staticmethod
    def _generate_system_id():
        """Generate a unique system ID in format: CHP-XXXXXXXX"""
        import secrets
        return f'CHP-{secrets.token_hex(4).upper()}'

    def update_activation_status(self):
        """
        Recalculate is_active based on face_registered and duplicate_flag.
        Called after face sample approval or duplicate resolution.
        """
        self.is_active = self.face_registered and not self.duplicate_flag
        self.save(update_fields=['is_active'])


class FaceSampleStatusChoices(models.TextChoices):
    APPROVED = 'approved', 'Approved'
    REJECTED = 'rejected', 'Rejected'


class FaceSample(models.Model):
    """
    Individual face capture stored during registration.
    
    - DeepFace extracts embedding_vector at capture time
    - Auto-rejection rules evaluate each capture immediately
    - Face data is semester-scoped and deleted on archive
    - Sample files stored in non-public directory
    """
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
    )
    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name='face_samples',
        help_text='Student this face sample belongs to'
    )
    sample_file = models.FileField(
        upload_to='',  # Path set dynamically in save()
        help_text='Face capture image file — stored in non-public directory'
    )
    embedding_vector = models.JSONField(
        default=list,
        help_text='DeepFace Facenet512 embedding vector (512-dimensional)'
    )
    status = models.CharField(
        max_length=10,
        choices=FaceSampleStatusChoices.choices,
        default=FaceSampleStatusChoices.APPROVED,
        help_text='Auto-evaluated on capture'
    )
    rejection_reason = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text='Specific rejection reason shown to student'
    )
    semester = models.ForeignKey(
        'services.Semester',
        on_delete=models.CASCADE,
        related_name='face_samples',
        help_text='Semester scope — deleted on archive'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'face_samples'
        ordering = ['-created_at']

    def __str__(self):
        return f'FaceSample for {self.student.full_name} [{self.status}]'

    def save(self, *args, **kwargs):
        """Set upload path to: face_samples/{semester_id}/{student_id}/"""
        if self.sample_file and not self.sample_file.name.startswith('face_samples/'):
            semester_id = str(self.semester_id) if self.semester_id else 'unknown'
            student_id = str(self.student_id) if self.student_id else 'unknown'
            original_name = self.sample_file.name.split('/')[-1]
            self.sample_file.name = f'face_samples/{semester_id}/{student_id}/{original_name}'
        super().save(*args, **kwargs)

"""
Management command: reset_mock_embeddings

Clears face samples that contain the zero-vector mock embedding produced
when DeepFace was not installed.  After running this command affected
students will need to re-register their faces.

Usage:
    python manage.py reset_mock_embeddings
    python manage.py reset_mock_embeddings --dry-run   # preview only
"""
from django.core.management.base import BaseCommand
from apps.students.models import FaceSample, Student


class Command(BaseCommand):
    help = 'Delete zero-vector (mock) face samples and reset affected students'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be deleted without making any changes',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']

        # A zero-vector embedding has all values == 0
        all_samples = FaceSample.objects.filter(status='approved').only(
            'id', 'student_id', 'embedding_vector'
        )

        mock_ids = []
        for sample in all_samples:
            emb = sample.embedding_vector
            if isinstance(emb, list) and len(emb) > 0:
                if all(v == 0.0 for v in emb[:10]):  # check first 10 values
                    mock_ids.append(sample.id)

        self.stdout.write(
            f'Found {len(mock_ids)} mock face sample(s) with zero-vector embeddings.'
        )

        if not mock_ids:
            self.stdout.write(self.style.SUCCESS('Nothing to clean.'))
            return

        if dry_run:
            self.stdout.write(self.style.WARNING(
                f'DRY RUN — would delete {len(mock_ids)} sample(s). '
                'Re-run without --dry-run to apply.'
            ))
            return

        # Delete mock samples
        deleted_count, _ = FaceSample.objects.filter(id__in=mock_ids).delete()
        self.stdout.write(f'Deleted {deleted_count} mock face sample(s).')

        # Reset face_registered and is_active for students who no longer
        # have enough approved real samples
        affected_students = Student.objects.filter(
            face_samples__id__in=mock_ids
        ).distinct()

        reset_count = 0
        for student in Student.objects.all():
            approved = student.face_samples.filter(status='approved').count()
            if approved < 3 and student.face_registered:
                student.face_registered = False
                student.is_active = False
                student.save(update_fields=['face_registered', 'is_active'])
                reset_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f'Reset face registration for {reset_count} student(s). '
                'These students must re-register their faces.'
            )
        )

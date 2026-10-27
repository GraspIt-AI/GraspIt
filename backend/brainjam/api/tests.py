from unittest import mock

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from .models import Course, Flashcard
from .views import AIRateThrottle, AuthRateThrottle


class RegisterTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def test_register_returns_tokens_and_seeds_demo_courses(self):
        r = self.client.post('/api/auth/register/', {
            'email': 'ada@example.com', 'username': 'ada', 'password': 'longenough1',
        }, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertIn('access', r.data['tokens'])
        self.assertEqual(Course.objects.filter(user__username='ada').count(), 2)
        self.assertTrue(Flashcard.objects.filter(lecture__course__user__username='ada').exists())

    def test_ai_endpoints_require_login(self):
        self.assertEqual(self.client.post('/api/process/').status_code, 401)
        self.assertEqual(self.client.post('/api/courses/1/chat/').status_code, 401)


class ThrottleTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        r = self.client.post('/api/auth/register/', {
            'email': 'ada@example.com', 'username': 'ada', 'password': 'longenough1',
        }, format='json')
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['tokens']['access']}")

    @mock.patch.object(AIRateThrottle, 'rate', '2/hour', create=True)
    def test_ai_requests_are_capped_per_user(self):
        # A missing course 404s before any model call, but still counts against the cap.
        codes = [self.client.post('/api/courses/999999/chat/', {'message': 'hi'}, format='json').status_code
                 for _ in range(3)]
        self.assertEqual(codes, [404, 404, 429])

    @mock.patch.object(AIRateThrottle, 'rate', '1/hour', create=True)
    def test_reads_do_not_count(self):
        course = Course.objects.filter(user__username='ada').first()
        for _ in range(3):
            self.assertNotEqual(self.client.get(f'/api/courses/{course.pk}/exam/').status_code, 429)

    @mock.patch.object(AuthRateThrottle, 'rate', '2/hour', create=True)
    def test_login_attempts_are_capped(self):
        cache.clear()  # register and login share one per-IP bucket; setUp already used a slot
        anon = APIClient()
        codes = [anon.post('/api/auth/login/', {'email': 'ada@example.com', 'password': 'wrong'},
                           format='json').status_code for _ in range(3)]
        self.assertEqual(codes, [401, 401, 429])

from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from . import views

urlpatterns = [
    # Auth
    path('auth/register/', views.register, name='auth-register'),
    path('auth/login/', views.login_view, name='auth-login'),
    path('auth/logout/', views.logout_view, name='auth-logout'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='auth-refresh'),
    path('auth/me/', views.me, name='auth-me'),
    # Process
    path('process/', views.process, name='process'),
    # Courses
    path('courses/', views.courses_list, name='courses-list'),
    path('courses/<int:pk>/', views.course_detail, name='course-detail'),
    path('courses/<int:pk>/exam/', views.course_exam, name='course-exam'),
    path('courses/<int:pk>/topic/', views.course_topic, name='course-topic'),
    # Search
    path('search/', views.search, name='search'),
    # Anki export
    path('courses/<int:pk>/anki/', views.course_anki, name='course-anki'),
    path('lectures/<int:pk>/anki/', views.lecture_anki, name='lecture-anki'),
    # Lectures
    path('lectures/', views.lectures_create, name='lectures-create'),
    path('lectures/<int:pk>/', views.lecture_detail, name='lecture-detail'),
    path('lectures/<int:pk>/regenerate/', views.lecture_regenerate, name='lecture-regenerate'),
]

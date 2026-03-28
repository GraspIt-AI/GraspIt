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
    # Folders
    path('course-folders/', views.course_folders, name='course-folders'),
    path('course-folders/<int:pk>/', views.course_folder_detail, name='course-folder-detail'),
    path('courses/<int:course_pk>/lecture-folders/', views.lecture_folders, name='lecture-folders'),
    path('lecture-folders/<int:pk>/', views.lecture_folder_detail, name='lecture-folder-detail'),
    # Courses
    path('courses/', views.courses_list, name='courses-list'),
    path('courses/default/', views.default_course, name='default-course'),
    path('courses/<int:pk>/', views.course_detail, name='course-detail'),
    path('courses/<int:pk>/exam/', views.course_exam, name='course-exam'),
    path('courses/<int:pk>/topic/', views.course_topic, name='course-topic'),
    # Search
    path('search/', views.search, name='search'),
    # Chat
    path('courses/<int:pk>/chat/', views.course_chat, name='course-chat'),
    # Anki export
    path('courses/<int:pk>/anki/', views.course_anki, name='course-anki'),
    path('lectures/<int:pk>/anki/', views.lecture_anki, name='lecture-anki'),
    # Lectures
    path('lectures/recent/', views.lectures_recent, name='lectures-recent'),
    path('lectures/', views.lectures_create, name='lectures-create'),
    path('lectures/<int:pk>/', views.lecture_detail, name='lecture-detail'),
    path('lectures/<int:pk>/regenerate/', views.lecture_regenerate, name='lecture-regenerate'),
    path('lectures/<int:pk>/append/', views.lecture_append, name='lecture-append'),
    path('lectures/<int:pk>/clear/', views.lecture_clear, name='lecture-clear'),
    path('flashcards/<int:pk>/', views.flashcard_detail, name='flashcard-detail'),
]

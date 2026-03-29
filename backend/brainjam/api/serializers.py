from rest_framework import serializers
from .models import Course, CourseFolder, Lecture, LectureFolder, Flashcard


class CourseFolderSerializer(serializers.ModelSerializer):
    course_count = serializers.IntegerField(source='courses.count', read_only=True)

    class Meta:
        model = CourseFolder
        fields = ['id', 'name', 'created_at', 'course_count']


class LectureFolderSerializer(serializers.ModelSerializer):
    lecture_count = serializers.IntegerField(source='lectures_in_folder.count', read_only=True)

    class Meta:
        model = LectureFolder
        fields = ['id', 'name', 'created_at', 'lecture_count']


class FlashcardSerializer(serializers.ModelSerializer):
    class Meta:
        model = Flashcard
        fields = ['id', 'front', 'back', 'order', 'is_manual']


class LectureListSerializer(serializers.ModelSerializer):
    flashcard_count = serializers.IntegerField(source='flashcards.count', read_only=True)

    class Meta:
        model = Lecture
        fields = ['id', 'title', 'summary', 'tags', 'created_at', 'flashcard_count', 'folder_id']


class LectureDetailSerializer(serializers.ModelSerializer):
    flashcards = FlashcardSerializer(many=True)

    class Meta:
        model = Lecture
        fields = ['id', 'course', 'title', 'summary', 'tags', 'transcript', 'notes', 'created_at', 'flashcards', 'folder_id']

    def create(self, validated_data):
        flashcards_data = validated_data.pop('flashcards', [])
        lecture = Lecture.objects.create(**validated_data)
        for i, fc in enumerate(flashcards_data):
            Flashcard.objects.create(lecture=lecture, order=i, front=fc['front'], back=fc['back'])
        return lecture


class CourseListSerializer(serializers.ModelSerializer):
    lecture_count = serializers.IntegerField(source='lectures.count', read_only=True)

    class Meta:
        model = Course
        fields = ['id', 'name', 'description', 'color', 'created_at', 'updated_at', 'lecture_count', 'folder_id']


class CourseDetailSerializer(serializers.ModelSerializer):
    lectures = LectureListSerializer(many=True, read_only=True)

    class Meta:
        model = Course
        fields = ['id', 'name', 'description', 'color', 'created_at', 'updated_at', 'lectures', 'folder_id']

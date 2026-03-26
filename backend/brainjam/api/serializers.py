from rest_framework import serializers
from .models import Course, Lecture, Flashcard


class FlashcardSerializer(serializers.ModelSerializer):
    class Meta:
        model = Flashcard
        fields = ['id', 'front', 'back', 'order']


class LectureListSerializer(serializers.ModelSerializer):
    flashcard_count = serializers.IntegerField(source='flashcards.count', read_only=True)

    class Meta:
        model = Lecture
        fields = ['id', 'title', 'summary', 'created_at', 'flashcard_count']


class LectureDetailSerializer(serializers.ModelSerializer):
    flashcards = FlashcardSerializer(many=True)

    class Meta:
        model = Lecture
        fields = ['id', 'course', 'title', 'summary', 'transcript', 'notes', 'created_at', 'flashcards']

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
        fields = ['id', 'name', 'description', 'color', 'created_at', 'updated_at', 'lecture_count']


class CourseDetailSerializer(serializers.ModelSerializer):
    lectures = LectureListSerializer(many=True, read_only=True)

    class Meta:
        model = Course
        fields = ['id', 'name', 'description', 'color', 'created_at', 'updated_at', 'lectures']

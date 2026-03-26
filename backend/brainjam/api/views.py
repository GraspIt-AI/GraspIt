import json
import concurrent.futures
from django.conf import settings
from django.shortcuts import get_object_or_404
from django.contrib.auth import get_user_model
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import MultiPartParser, JSONParser
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken
from openai import OpenAI
from google import genai
from google.genai import types
from .models import Course, Lecture, Flashcard
from .serializers import (
    CourseListSerializer, CourseDetailSerializer,
    LectureDetailSerializer,
)
from PIL import Image
import io

User = get_user_model()

_SYSTEM_PROMPT = (
    'You are a study assistant. Given a lecture transcript and optional context materials '
    '(photos, slides, PDFs, documents), '
    'output ONLY valid JSON with exactly this shape — no markdown fences, no extra keys:\n'
    '{"title": "short lecture title", "summary": "1-2 sentence overview", '
    '"flashcards": [{"front": "question", "back": "answer"}], "notes": "markdown string"}\n\n'
    'TITLE: A concise descriptive title for this lecture (5-10 words, e.g. "Introduction to Photosynthesis").\n'
    'SUMMARY: 1-2 sentences summarising what the lecture covered.\n\n'
    'FLASHCARD RULES:\n'
    '- Generate 10-20 flashcards covering the key concepts.\n'
    '- Prefer concept-understanding questions over simple trivia (ask "why" and "how", not just "what").\n'
    '- Always create a dedicated flashcard for every equation, formula, or definition mentioned.\n'
    '- Avoid duplicating overlapping topics — merge similar cards into one.\n'
    '- If context documents (slides, PDFs) are provided, prioritise concepts from them.\n\n'
    'NOTES RULES:\n'
    '- Start with a "## Key Takeaways" section (3-5 bullet points summarising the most important ideas).\n'
    '- Then use ## H2 section headers for each major topic.\n'
    '- Use bullet points under each header. Bold (**like this**) all key terms and important concepts.\n'
    '- The notes should be a complete, well-structured markdown document a student can study from.\n'
)


def _run_gemini(parts):
    """Run Gemini generation on the given parts list. Returns parsed JSON dict. Raises on error."""
    gemini_client = genai.Client(api_key=settings.GEMINI_API_KEY)

    def _generate():
        return gemini_client.models.generate_content(
            model='gemini-2.5-flash',
            contents=parts,
            config=types.GenerateContentConfig(
                system_instruction=_SYSTEM_PROMPT,
                max_output_tokens=8192,
                temperature=0.4,
            ),
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(_generate)
        try:
            response = future.result(timeout=60)
        except concurrent.futures.TimeoutError:
            raise TimeoutError('Generation timed out.')

    raw = response.text.strip()
    print(f'[GEMINI] raw response (first 300): {repr(raw[:300])}')
    if raw.startswith('```'):
        raw = raw.split('```')[1]
        if raw.startswith('json'):
            raw = raw[4:]
    return json.loads(raw)


def _user_tokens(user):
    refresh = RefreshToken.for_user(user)
    return {'refresh': str(refresh), 'access': str(refresh.access_token)}


def _user_data(user):
    return {'id': user.id, 'email': user.email, 'username': user.username}


# ── Auth ──────────────────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([AllowAny])
def register(request):
    email = (request.data.get('email') or '').strip().lower()
    username = (request.data.get('username') or '').strip()
    password = request.data.get('password') or ''

    if not email or not username or not password:
        return Response({'error': 'Email, username, and password are required.'}, status=400)
    if len(password) < 8:
        return Response({'error': 'Password must be at least 8 characters.'}, status=400)
    if User.objects.filter(email=email).exists():
        return Response({'error': 'An account with this email already exists.'}, status=400)
    if User.objects.filter(username__iexact=username).exists():
        return Response({'error': 'This username is already taken.'}, status=400)

    user = User.objects.create_user(email=email, username=username, password=password)
    return Response({'tokens': _user_tokens(user), 'user': _user_data(user)}, status=201)


@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    from django.contrib.auth import authenticate
    email = (request.data.get('email') or '').strip().lower()
    password = request.data.get('password') or ''
    user = authenticate(request, email=email, password=password)
    if user is None:
        return Response({'error': 'Invalid email or password.'}, status=401)
    return Response({'tokens': _user_tokens(user), 'user': _user_data(user)})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me(request):
    return Response(_user_data(request.user))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_view(request):
    try:
        token = RefreshToken(request.data.get('refresh'))
        token.blacklist()
    except Exception:
        pass  # token may already be invalid
    return Response(status=204)


@api_view(['POST'])
@parser_classes([MultiPartParser])
def process(request):
    audio_file = request.FILES.get('audio')
    image_files = request.FILES.getlist('images')
    context_files = request.FILES.getlist('files')

    if not audio_file:
        return Response({'error': 'No audio file provided.'}, status=status.HTTP_400_BAD_REQUEST)

    # Reject files over 25 MB before reading
    if audio_file.size and audio_file.size > 25 * 1024 * 1024:
        return Response(
            {'error': 'Audio file too large (max 25 MB). Please record in shorter segments.'},
            status=413,
        )

    # 1. Transcribe audio with Groq (Whisper large v3) — 30s timeout
    # Detect correct MIME type from content-type or filename extension
    _MIME_FIXES = {
        'audio/x-m4a': 'audio/m4a',
        'audio/x-wav': 'audio/wav',
        'audio/x-flac': 'audio/flac',
        'audio/x-ogg': 'audio/ogg',
        'audio/mpeg': 'audio/mpeg',   # mp3
        'audio/webm': 'audio/webm',
    }
    _EXT_MIME = {
        '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/m4a',
        '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.aac': 'audio/aac',
        '.webm': 'audio/webm', '.mp4': 'audio/mp4', '.mpeg': 'audio/mpeg',
        '.mpga': 'audio/mpeg',
    }
    raw_mime = (audio_file.content_type or '').split(';')[0].strip()
    ext = '.' + audio_file.name.rsplit('.', 1)[-1].lower() if '.' in audio_file.name else ''
    audio_mime = (
        _MIME_FIXES.get(raw_mime)
        or raw_mime
        or _EXT_MIME.get(ext, 'audio/webm')
    )
    if not audio_mime or audio_mime == 'application/octet-stream':
        audio_mime = _EXT_MIME.get(ext, 'audio/webm')
    print(f'[GROQ] audio file: {audio_file.name}, raw_mime: {raw_mime}, resolved: {audio_mime}')

    try:
        groq_client = OpenAI(
            api_key=settings.GROQ_API_KEY,
            base_url='https://api.groq.com/openai/v1',
            timeout=30.0,
        )
        transcript_response = groq_client.audio.transcriptions.create(
            model='whisper-large-v3',
            file=(audio_file.name, audio_file.read(), audio_mime),
        )
        transcript = transcript_response.text.strip()
        print(f'[GROQ] transcript length: {len(transcript)}, preview: {repr(transcript[:200])}')
        if not transcript:
            return Response(
                {'error': 'Whisper could not detect any speech in the recording. Please speak clearly and try again.'},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
    except Exception as e:
        print(f'[GROQ ERROR] {e}')
        return Response({'error': f'Transcription failed: {str(e)}'}, status=status.HTTP_502_BAD_GATEWAY)

    # 2. Build Gemini prompt parts
    parts: list = [f'Lecture transcript:\n\n{transcript}']

    for img in image_files:
        img_bytes = img.read()
        pil_img = Image.open(io.BytesIO(img_bytes))
        parts.append(pil_img)

    if image_files:
        parts.append('The images above are whiteboard/slide photos taken during the lecture. Use them as additional context.')

    # Handle arbitrary context files (PDFs, text, Office docs, images)
    for cf in context_files:
        cf_bytes = cf.read()
        mime_type = (cf.content_type or '').split(';')[0].strip() or 'application/octet-stream'
        name_lower = cf.name.lower()
        print(f'[CONTEXT FILE] name={cf.name}, mime={mime_type}, size={len(cf_bytes)}')
        try:
            # ── Images: pass as PIL directly ──────────────────────────────────
            if mime_type.startswith('image/') or name_lower.endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp', '.heic', '.heif')):
                pil_img = Image.open(io.BytesIO(cf_bytes))
                parts.append(pil_img)

            # ── PDF: pass as inline bytes (Gemini natively supports PDFs) ─────
            elif mime_type == 'application/pdf' or name_lower.endswith('.pdf'):
                parts.append(types.Part.from_bytes(data=cf_bytes, mime_type='application/pdf'))

            # ── Plain text / CSV / JSON / Markdown / code ─────────────────────
            elif (
                mime_type.startswith('text/')
                or mime_type in ('application/json', 'application/xml')
                or name_lower.endswith(('.txt', '.md', '.csv', '.json', '.xml', '.yaml', '.yml', '.py', '.js', '.ts', '.html', '.htm'))
            ):
                text_content = cf_bytes.decode('utf-8', errors='replace')
                parts.append(f'Context document "{cf.name}":\n\n{text_content}')

            # ── PowerPoint (PPTX / PPT) ───────────────────────────────────────
            elif (
                mime_type in (
                    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                    'application/vnd.ms-powerpoint',
                )
                or name_lower.endswith(('.pptx', '.ppt'))
            ):
                from pptx import Presentation
                prs = Presentation(io.BytesIO(cf_bytes))
                slides_text = []
                for i, slide in enumerate(prs.slides, 1):
                    slide_parts = []
                    for shape in slide.shapes:
                        if hasattr(shape, 'text') and shape.text.strip():
                            slide_parts.append(shape.text.strip())
                    if slide_parts:
                        slides_text.append(f'[Slide {i}]\n' + '\n'.join(slide_parts))
                extracted = '\n\n'.join(slides_text) if slides_text else '(no readable text found in slides)'
                parts.append(f'Context slides "{cf.name}" ({len(prs.slides)} slides):\n\n{extracted}')
                print(f'[CONTEXT FILE] Extracted {len(prs.slides)} slides, {len(extracted)} chars from {cf.name}')

            # ── Word (DOCX / DOC) ─────────────────────────────────────────────
            elif (
                mime_type in (
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'application/msword',
                )
                or name_lower.endswith(('.docx', '.doc'))
            ):
                from docx import Document
                doc = Document(io.BytesIO(cf_bytes))
                paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
                extracted = '\n\n'.join(paragraphs) if paragraphs else '(no readable text found in document)'
                parts.append(f'Context document "{cf.name}":\n\n{extracted}')
                print(f'[CONTEXT FILE] Extracted {len(paragraphs)} paragraphs from {cf.name}')

            # ── Excel (XLSX / XLS) ────────────────────────────────────────────
            elif (
                mime_type in (
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'application/vnd.ms-excel',
                )
                or name_lower.endswith(('.xlsx', '.xls'))
            ):
                import openpyxl
                wb = openpyxl.load_workbook(io.BytesIO(cf_bytes), read_only=True, data_only=True)
                sheets_text = []
                for sheet_name in wb.sheetnames:
                    ws = wb[sheet_name]
                    rows = []
                    for row in ws.iter_rows(values_only=True):
                        cells = [str(c) for c in row if c is not None]
                        if cells:
                            rows.append('\t'.join(cells))
                    if rows:
                        sheets_text.append(f'[Sheet: {sheet_name}]\n' + '\n'.join(rows))
                extracted = '\n\n'.join(sheets_text) if sheets_text else '(no readable data found)'
                parts.append(f'Context spreadsheet "{cf.name}":\n\n{extracted}')

            # ── Fallback: try UTF-8 decode, then skip ─────────────────────────
            else:
                try:
                    text_content = cf_bytes.decode('utf-8', errors='strict')
                    parts.append(f'Context document "{cf.name}":\n\n{text_content}')
                    print(f'[CONTEXT FILE] Decoded {cf.name} as UTF-8 fallback')
                except UnicodeDecodeError:
                    print(f'[CONTEXT FILE] Skipping unsupported binary file: {cf.name} ({mime_type})')

        except Exception as e:
            print(f'[CONTEXT FILE ERROR] Failed to process {cf.name}: {e}')

    if context_files:
        parts.append('The documents above are context materials provided by the student (lecture slides, notes, PDFs). Use them as primary reference material alongside the transcript.')

    # 3. Generate flashcards + notes with Gemini
    try:
        result = _run_gemini(parts)
        print(f'[GEMINI] flashcards count: {len(result.get("flashcards", []))}')
    except TimeoutError:
        return Response({'error': 'Generation timed out. Please try again.'}, status=status.HTTP_504_GATEWAY_TIMEOUT)
    except json.JSONDecodeError as e:
        print(f'[GEMINI JSON ERROR] {e}')
        return Response({'error': 'Gemini returned malformed JSON. Try again.'}, status=status.HTTP_502_BAD_GATEWAY)
    except Exception as e:
        print(f'[GEMINI ERROR] {e}')
        return Response({'error': f'Generation failed: {str(e)}'}, status=status.HTTP_502_BAD_GATEWAY)

    # Include transcript so the frontend can display it
    result['transcript'] = transcript
    return Response(result)


# ── Courses ──────────────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def courses_list(request):
    if request.method == 'GET':
        courses = Course.objects.filter(user=request.user)
        return Response(CourseListSerializer(courses, many=True).data)

    serializer = CourseListSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.save(user=request.user)
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(['GET', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
def course_detail(request, pk):
    course = get_object_or_404(Course, pk=pk, user=request.user)

    if request.method == 'GET':
        return Response(CourseDetailSerializer(course).data)

    if request.method == 'PUT':
        serializer = CourseListSerializer(course, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    course.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


# ── Lectures ──────────────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def lectures_create(request):
    # Ensure the course belongs to the requesting user
    course_id = request.data.get('course')
    get_object_or_404(Course, pk=course_id, user=request.user)

    serializer = LectureDetailSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    lecture = serializer.save()
    lecture.course.save()  # bump updated_at so course sorts to top
    return Response(LectureDetailSerializer(lecture).data, status=status.HTTP_201_CREATED)


@api_view(['GET', 'PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def lecture_detail(request, pk):
    lecture = get_object_or_404(Lecture, pk=pk, course__user=request.user)

    if request.method == 'GET':
        return Response(LectureDetailSerializer(lecture).data)

    if request.method == 'PATCH':
        if 'transcript' in request.data:
            lecture.transcript = request.data['transcript']
            lecture.save(update_fields=['transcript'])
        return Response(LectureDetailSerializer(lecture).data)

    lecture.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def lecture_regenerate(request, pk):
    lecture = get_object_or_404(Lecture, pk=pk, course__user=request.user)
    if not lecture.transcript:
        return Response({'error': 'Lecture has no transcript to regenerate from.'}, status=400)

    try:
        result = _run_gemini([f'Lecture transcript:\n\n{lecture.transcript}'])
    except TimeoutError:
        return Response({'error': 'Generation timed out. Please try again.'}, status=status.HTTP_504_GATEWAY_TIMEOUT)
    except json.JSONDecodeError:
        return Response({'error': 'Gemini returned malformed JSON. Try again.'}, status=status.HTTP_502_BAD_GATEWAY)
    except Exception as e:
        return Response({'error': f'Generation failed: {str(e)}'}, status=status.HTTP_502_BAD_GATEWAY)

    lecture.title = result.get('title', lecture.title)
    lecture.summary = result.get('summary', lecture.summary)
    lecture.notes = result.get('notes', lecture.notes)
    lecture.save(update_fields=['title', 'summary', 'notes'])

    lecture.flashcards.all().delete()
    for i, fc in enumerate(result.get('flashcards', [])):
        Flashcard.objects.create(lecture=lecture, order=i, front=fc['front'], back=fc['back'])

    print(f'[REGENERATE] lecture {pk}: {len(result.get("flashcards", []))} flashcards')
    return Response(LectureDetailSerializer(lecture).data)

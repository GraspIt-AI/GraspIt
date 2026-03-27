import json
import re
import os
import tempfile
import concurrent.futures
from django.conf import settings
from django.http import HttpResponse, StreamingHttpResponse
from django.shortcuts import get_object_or_404
from django.contrib.auth import get_user_model
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import MultiPartParser, JSONParser
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.db.models import F
from rest_framework_simplejwt.tokens import RefreshToken
from openai import OpenAI
from google import genai
from google.genai import types
from .models import Course, CourseFolder, Lecture, LectureFolder, Flashcard, TopicExam
from .serializers import (
    CourseListSerializer, CourseDetailSerializer,
    CourseFolderSerializer, LectureFolderSerializer,
    LectureDetailSerializer,
)
from PIL import Image
import io
import genanki

User = get_user_model()

_SYSTEM_PROMPT = (
    'You are a study assistant. Given a lecture transcript and optional context materials '
    '(photos, slides, PDFs, documents), '
    'output ONLY valid JSON — no markdown fences, no extra keys.\n\n'
    'IMPORTANT: If the provided content is too vague, too short, or lacks enough subject matter to generate '
    'meaningful study materials WITHOUT hallucinating or inventing facts, output this instead:\n'
    '{"insufficient_content": true, "reason": "one sentence explaining what is missing"}\n\n'
    'Otherwise output exactly this shape:\n'
    '{"title": "short lecture title", "summary": "1-2 sentence overview", '
    '"tags": ["tag1", "tag2"], '
    '"flashcards": [{"front": "question", "back": "answer"}], "notes": "markdown string"}\n\n'
    'TITLE: A concise descriptive title for this lecture (5-10 words, e.g. "Introduction to Photosynthesis").\n'
    'SUMMARY: 1-2 sentences summarising what the lecture covered.\n'
    'TAGS: Generate up to 6 short topic tags (2-4 words each) naming the key subjects covered, e.g. "Krebs Cycle", "ATP Synthesis", "Cell Respiration". Use as few as needed — if the lecture only covers one or two topics, one or two tags is fine. These will be used to filter and group lectures.\n\n'
    'FLASHCARD RULES:\n'
    '- Generate 10-20 flashcards covering the key concepts.\n'
    '- Prefer concept-understanding questions over simple trivia (ask "why" and "how", not just "what").\n'
    '- Always create a dedicated flashcard for every equation, formula, or definition mentioned.\n'
    '- Avoid duplicating overlapping topics — merge similar cards into one.\n'
    '- If context documents (slides, PDFs) are provided, prioritise concepts from them.\n'
    '- Do NOT invent or assume facts not present in the provided content.\n\n'
    'NOTES RULES:\n'
    '- Start with a "## Key Takeaways" section (3-5 bullet points summarising the most important ideas).\n'
    '- Then use ## H2 section headers for each major topic.\n'
    '- Use bullet points under each header. Bold (**like this**) all key terms and important concepts.\n'
    '- The notes should be a complete, well-structured markdown document a student can study from.\n'
    '- Do NOT invent or assume facts not present in the provided content.\n'
)


def _extract_json(raw: str):
    """
    Robustly extract and parse JSON from Gemini output, with intelligent fallbacks.

    gemini-2.5-flash is a thinking model — it can prefix its answer with
    reasoning text that itself contains '{' or '[' characters. Strategy:
      1. If markdown fences are present, extract the content inside the LAST fence block.
      2. If the text still doesn't start with '{' or '[', find the LAST '{...}' or '[...]'
         block (last, not first, because thinking text comes before the answer).
      3. Try to parse JSON. If it fails, attempt to fix common issues (trailing commas, etc.)
      4. If still failing, try extracting just the JSON fields we care about.
    """
    raw = raw.strip()
    print(f'[GEMINI] raw response (first 500): {repr(raw[:500])}')

    # Step 1: strip markdown fences — use the last match in case thinking text has fences too
    if '```' in raw:
        matches = re.findall(r'```(?:json)?\s*([\s\S]*?)```', raw)
        if matches:
            raw = matches[-1].strip()

    # Step 2: if still not starting with a JSON delimiter, grab the last {..} or [..]
    if not raw.startswith(('{', '[')):
        # Find the last occurrence of a top-level JSON structure
        obj_match = None
        arr_match = None
        for m in re.finditer(r'\{[\s\S]*\}', raw):
            obj_match = m
        for m in re.finditer(r'\[[\s\S]*\]', raw):
            arr_match = m
        # Pick whichever starts later in the string (closer to the real answer)
        if obj_match and arr_match:
            raw = (obj_match if obj_match.start() > arr_match.start() else arr_match).group(0)
        elif obj_match:
            raw = obj_match.group(0)
        elif arr_match:
            raw = arr_match.group(0)

    # Step 3: Try to parse JSON
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        print(f'[GEMINI] JSON parse error: {e}. Attempting fallback fixes...')

        # Try to fix common issues: trailing commas, missing quotes, etc.
        try:
            # Remove trailing commas before } or ]
            fixed = re.sub(r',(\s*[}\]])', r'\1', raw)
            return json.loads(fixed)
        except json.JSONDecodeError:
            pass

        # If all else fails, try to construct JSON from expected fields
        try:
            result = {}
            # Try to extract flashcards array
            fc_match = re.search(r'"flashcards"\s*:\s*\[(.*?)\](?:,|\})', raw, re.DOTALL)
            result['flashcards'] = json.loads('[' + (fc_match.group(1) if fc_match else '') + ']') if fc_match else []

            # Extract other fields with regex fallback
            for field in ['title', 'summary', 'notes', 'transcript']:
                match = re.search(rf'"{field}"\s*:\s*"(.*?)"(?:,|\}})', raw, re.DOTALL)
                result[field] = match.group(1) if match else ''

            # Extract tags array
            tags_match = re.search(r'"tags"\s*:\s*\[(.*?)\]', raw, re.DOTALL)
            if tags_match:
                tags_str = '[' + tags_match.group(1) + ']'
                try:
                    result['tags'] = json.loads(tags_str)
                except:
                    result['tags'] = []
            else:
                result['tags'] = []

            print(f'[GEMINI] Fallback extraction succeeded')
            return result
        except Exception as fallback_e:
            print(f'[GEMINI] All fallbacks failed: {fallback_e}')
            raise json.JSONDecodeError(
                f'Could not parse Gemini response as JSON (original: {e})',
                raw, 0
            )


def _run_gemini(parts):
    """Run Gemini generation on the given parts list. Returns parsed JSON. Raises on error."""
    gemini_client = genai.Client(api_key=settings.GEMINI_API_KEY)

    def _generate():
        return gemini_client.models.generate_content(
            model='gemini-2.5-flash',
            contents=parts,
            config=types.GenerateContentConfig(
                system_instruction=_SYSTEM_PROMPT,
                max_output_tokens=150000,
                temperature=0.4,
            ),
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(_generate)
        try:
            response = future.result(timeout=60)
        except concurrent.futures.TimeoutError:
            raise TimeoutError('Generation timed out.')

    return _extract_json(response.text)


def _convert_to_pdf(file_bytes: bytes, filename: str) -> bytes | None:
    """Convert a document (PPTX, DOCX, etc.) to PDF using LibreOffice headless.
    Returns PDF bytes on success, None on failure."""
    import subprocess, tempfile, pathlib
    suffix = pathlib.Path(filename).suffix.lower() or '.tmp'
    with tempfile.TemporaryDirectory() as tmp:
        src = pathlib.Path(tmp) / f'input{suffix}'
        src.write_bytes(file_bytes)
        try:
            result = subprocess.run(
                ['libreoffice', '--headless', '--convert-to', 'pdf', '--outdir', tmp, str(src)],
                capture_output=True, timeout=30,
            )
            if result.returncode != 0:
                print(f'[LIBREOFFICE] conversion failed: {result.stderr.decode(errors="replace")}')
                return None
            pdf_path = src.with_suffix('.pdf')
            if not pdf_path.exists():
                print(f'[LIBREOFFICE] output PDF not found at {pdf_path}')
                return None
            return pdf_path.read_bytes()
        except Exception as e:
            print(f'[LIBREOFFICE] error: {e}')
            return None


def _scaling_instruction(transcript_words: int, context_words: int, image_count: int) -> str:
    """Return a dynamic scale hint to prepend to Gemini parts."""
    total = transcript_words + context_words + image_count * 400
    if total < 300:
        fc = '10-15'
        notes = 'concise notes: 3-5 bullet points per section'
    elif total < 800:
        fc = '15-25'
        notes = 'thorough notes: 5-8 bullet points per section'
    elif total < 2500:
        fc = '25-40'
        notes = 'detailed notes: 8-12 bullet points per section, cover every subtopic'
    elif total < 6000:
        fc = '40-60'
        notes = 'comprehensive notes: cover every concept, formula, and example; 10-15 bullets per section'
    else:
        fc = '60-80'
        notes = 'exhaustive notes: maximum depth — capture every concept, formula, derivation, and example; no important detail omitted'
    print(f'[SCALE] transcript_words={transcript_words}, context_words={context_words}, images={image_count}, total={total} → flashcards={fc}')
    return (
        f'[SCALE INSTRUCTION — Estimated input size: ~{total} words. '
        f'FLASHCARDS: Generate {fc} flashcards to match this volume. '
        f'NOTES: Write {notes}. Scale depth proportionally to the input — more content = more output.]'
    )


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

    if not audio_file and not image_files and not context_files:
        return Response(
            {'error': 'Please provide at least an audio recording, a photo, or a file.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # 1. Transcribe audio with Groq (Whisper large v3) — 30s timeout (skipped if no audio)
    transcript = ''
    if audio_file:
        # Reject files over 25 MB before reading
        if audio_file.size and audio_file.size > 25 * 1024 * 1024:
            return Response(
                {'error': 'Audio file too large (max 25 MB). Please record in shorter segments.'},
                status=413,
            )

        _MIME_FIXES = {
            'audio/x-m4a': 'audio/m4a',
            'audio/x-wav': 'audio/wav',
            'audio/x-flac': 'audio/flac',
            'audio/x-ogg': 'audio/ogg',
            'audio/mpeg': 'audio/mpeg',
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
        audio_mime = _MIME_FIXES.get(raw_mime) or raw_mime or _EXT_MIME.get(ext, 'audio/webm')
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
            if not transcript and not image_files and not context_files:
                return Response(
                    {'error': 'Whisper could not detect any speech in the recording. Please speak clearly and try again.'},
                    status=status.HTTP_422_UNPROCESSABLE_ENTITY,
                )
        except Exception as e:
            print(f'[GROQ ERROR] {e}')
            return Response({'error': f'Transcription failed: {str(e)}'}, status=status.HTTP_502_BAD_GATEWAY)

    # 2. Build Gemini prompt parts
    if len(transcript) >= 10:
        parts: list = [f'Lecture transcript:\n\n{transcript}']
    else:
        parts: list = ['No audio transcript is available. Generate flashcards, notes, title, summary, and tags based solely on the provided images and context files.']

    _scale_image_count = len(image_files)
    _scale_context_words = 0

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
                _scale_image_count += 1

            # ── PDF: pass as inline bytes (Gemini natively supports PDFs) ─────
            elif mime_type == 'application/pdf' or name_lower.endswith('.pdf'):
                parts.append(types.Part.from_bytes(data=cf_bytes, mime_type='application/pdf'))

            # ── Audio: pass directly to Gemini (supports audio natively) ────────
            elif (
                mime_type.startswith('audio/')
                or name_lower.endswith(('.mp3', '.wav', '.m4a', '.ogg', '.flac', '.aac', '.webm', '.mp4', '.mpeg'))
            ):
                _AUDIO_MIME_MAP = {
                    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
                    '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.aac': 'audio/aac',
                    '.webm': 'audio/webm', '.mp4': 'audio/mp4', '.mpeg': 'audio/mpeg',
                }
                ext = '.' + name_lower.rsplit('.', 1)[-1] if '.' in name_lower else ''
                resolved_mime = mime_type if mime_type.startswith('audio/') else _AUDIO_MIME_MAP.get(ext, 'audio/mpeg')
                parts.append(types.Part.from_bytes(data=cf_bytes, mime_type=resolved_mime))
                _scale_context_words += len(cf_bytes) // 150  # rough word estimate from audio size
                print(f'[CONTEXT FILE] Audio file {cf.name} passed to Gemini as {resolved_mime}')

            # ── Plain text / CSV / JSON / Markdown / code ─────────────────────
            elif (
                mime_type.startswith('text/')
                or mime_type in ('application/json', 'application/xml')
                or name_lower.endswith(('.txt', '.md', '.csv', '.json', '.xml', '.yaml', '.yml', '.py', '.js', '.ts', '.html', '.htm'))
            ):
                text_content = cf_bytes.decode('utf-8', errors='replace')
                parts.append(f'Context document "{cf.name}":\n\n{text_content}')
                _scale_context_words += len(text_content.split())

            # ── PowerPoint (PPTX / PPT) — convert to PDF for full visual fidelity ─
            elif (
                mime_type in (
                    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                    'application/vnd.ms-powerpoint',
                )
                or name_lower.endswith(('.pptx', '.ppt'))
            ):
                pdf_bytes = _convert_to_pdf(cf_bytes, cf.name)
                if pdf_bytes:
                    parts.append(types.Part.from_bytes(data=pdf_bytes, mime_type='application/pdf'))
                    _scale_context_words += len(cf_bytes) // 5  # rough word estimate from file size
                    print(f'[CONTEXT FILE] Converted {cf.name} to PDF ({len(pdf_bytes)} bytes) for Gemini')
                else:
                    # Fallback: extract text with python-pptx
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
                    _scale_context_words += len(extracted.split())
                    print(f'[CONTEXT FILE] PDF conversion failed, extracted text from {len(prs.slides)} slides')

            # ── Word (DOCX / DOC) — convert to PDF for full fidelity ────────────
            elif (
                mime_type in (
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'application/msword',
                )
                or name_lower.endswith(('.docx', '.doc'))
            ):
                pdf_bytes = _convert_to_pdf(cf_bytes, cf.name)
                if pdf_bytes:
                    parts.append(types.Part.from_bytes(data=pdf_bytes, mime_type='application/pdf'))
                    _scale_context_words += len(cf_bytes) // 5
                    print(f'[CONTEXT FILE] Converted {cf.name} to PDF ({len(pdf_bytes)} bytes) for Gemini')
                else:
                    # Fallback: extract text with python-docx
                    from docx import Document
                    doc = Document(io.BytesIO(cf_bytes))
                    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
                    extracted = '\n\n'.join(paragraphs) if paragraphs else '(no readable text found in document)'
                    parts.append(f'Context document "{cf.name}":\n\n{extracted}')
                    _scale_context_words += len(extracted.split())
                    print(f'[CONTEXT FILE] PDF conversion failed, extracted {len(paragraphs)} paragraphs from {cf.name}')

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
                _scale_context_words += len(extracted.split())

            # ── Fallback: try UTF-8 decode, then skip ─────────────────────────
            else:
                try:
                    text_content = cf_bytes.decode('utf-8', errors='strict')
                    parts.append(f'Context document "{cf.name}":\n\n{text_content}')
                    _scale_context_words += len(text_content.split())
                    print(f'[CONTEXT FILE] Decoded {cf.name} as UTF-8 fallback')
                except UnicodeDecodeError:
                    print(f'[CONTEXT FILE] Skipping unsupported binary file: {cf.name} ({mime_type})')

        except Exception as e:
            print(f'[CONTEXT FILE ERROR] Failed to process {cf.name}: {e}')

    if context_files:
        parts.append('The documents above are context materials provided by the student (lecture slides, notes, PDFs). Use them as primary reference material alongside the transcript.')

    # 3. Generate flashcards + notes with Gemini
    _transcript_words = len(transcript.split()) if transcript else 0
    _scale_hint = _scaling_instruction(_transcript_words, _scale_context_words, _scale_image_count)
    parts = [_scale_hint] + parts

    try:
        result = _run_gemini(parts)
        if result.get('insufficient_content'):
            reason = result.get('reason', 'Not enough content to generate study materials.')
            return Response(
                {'error': f'Not enough content to generate flashcards: {reason} Please add more audio, photos, or files.'},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
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


# ── Folders ──────────────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def course_folders(request):
    if request.method == 'GET':
        folders = CourseFolder.objects.filter(user=request.user)
        return Response(CourseFolderSerializer(folders, many=True).data)
    serializer = CourseFolderSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.save(user=request.user)
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def course_folder_detail(request, pk):
    folder = get_object_or_404(CourseFolder, pk=pk, user=request.user)
    folder.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def lecture_folders(request, course_pk):
    course = get_object_or_404(Course, pk=course_pk, user=request.user)
    if request.method == 'GET':
        return Response(LectureFolderSerializer(course.lecture_folders.all(), many=True).data)
    serializer = LectureFolderSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.save(course=course)
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def lecture_folder_detail(request, pk):
    folder = get_object_or_404(LectureFolder, pk=pk, course__user=request.user)
    folder.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


# ── Courses ──────────────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def courses_list(request):
    if request.method == 'GET':
        courses = Course.objects.filter(user=request.user)
        folders = CourseFolder.objects.filter(user=request.user)
        return Response({
            'courses': CourseListSerializer(courses, many=True).data,
            'folders': CourseFolderSerializer(folders, many=True).data,
        })

    serializer = CourseListSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.save(user=request.user)
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(['GET', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
def course_detail(request, pk):
    course = get_object_or_404(Course, pk=pk, user=request.user)

    if request.method == 'GET':
        data = CourseDetailSerializer(course).data
        data['exam_scores'] = list(
            course.exams.values('tag', 'last_score', 'last_total', 'attempts')
        )
        data['lecture_folders'] = LectureFolderSerializer(course.lecture_folders.all(), many=True).data
        return Response(data)

    if request.method == 'PUT':
        # Handle folder_id separately (user-scoped validation)
        folder_id = request.data.get('folder_id')
        if 'folder_id' in request.data:
            if folder_id is None:
                course.folder = None
            else:
                course.folder = get_object_or_404(CourseFolder, pk=folder_id, user=request.user)
            course.save(update_fields=['folder'])
        serializer = CourseListSerializer(course, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    course.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


# ── Lectures ──────────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def default_course(request):
    """Find or create the user's Miscellaneous catch-all course."""
    course, _ = Course.objects.get_or_create(
        user=request.user,
        name='Miscellaneous',
        defaults={'color': '#6b7280', 'description': 'Auto-saved lectures'},
    )
    return Response({'id': course.id, 'name': course.name})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def lectures_recent(request):
    lectures = (
        Lecture.objects.filter(course__user=request.user)
        .select_related('course')
        .order_by('-created_at')[:4]
    )
    return Response([{
        'id': l.id,
        'title': l.title,
        'created_at': l.created_at,
        'course_id': l.course.id,
        'course_name': l.course.name,
        'course_color': l.course.color,
        'flashcard_count': l.flashcards.count(),
    } for l in lectures])


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
        fields = []
        if 'transcript' in request.data:
            lecture.transcript = request.data['transcript']
            fields.append('transcript')
        if 'tags' in request.data:
            lecture.tags = request.data['tags']
            fields.append('tags')
        if 'notes' in request.data:
            lecture.notes = request.data['notes']
            fields.append('notes')
        if 'folder_id' in request.data:
            folder_id = request.data['folder_id']
            if folder_id is None:
                lecture.folder = None
            else:
                lecture.folder = get_object_or_404(LectureFolder, pk=folder_id, course=lecture.course)
            fields.append('folder')
        if fields:
            lecture.save(update_fields=fields)
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

    if result.get('insufficient_content'):
        reason = result.get('reason', 'Not enough content to regenerate study materials.')
        return Response({'error': f'Not enough content to regenerate: {reason}'}, status=422)

    lecture.title = result.get('title', lecture.title)
    lecture.summary = result.get('summary', lecture.summary)
    lecture.notes = result.get('notes', lecture.notes)
    lecture.tags = result.get('tags', lecture.tags)
    lecture.save(update_fields=['title', 'summary', 'notes', 'tags'])

    lecture.flashcards.all().delete()
    for i, fc in enumerate(result.get('flashcards', [])):
        Flashcard.objects.create(lecture=lecture, order=i, front=fc['front'], back=fc['back'])

    print(f'[REGENERATE] lecture {pk}: {len(result.get("flashcards", []))} flashcards')
    return Response(LectureDetailSerializer(lecture).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def lecture_clear(request, pk):
    """Delete all flashcards and clear notes + transcript for a lecture."""
    lecture = get_object_or_404(Lecture, pk=pk, course__user=request.user)
    lecture.flashcards.all().delete()
    lecture.notes = ''
    lecture.transcript = ''
    lecture.save(update_fields=['notes', 'transcript'])
    return Response(LectureDetailSerializer(lecture).data)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def flashcard_delete(request, pk):
    """Delete a single flashcard."""
    flashcard = get_object_or_404(Flashcard, pk=pk, lecture__course__user=request.user)
    flashcard.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def lecture_append(request, pk):
    """Process new audio/images/files and append the results to an existing lecture."""
    lecture = get_object_or_404(Lecture, pk=pk, course__user=request.user)

    audio_file = request.FILES.get('audio')
    image_files = request.FILES.getlist('images')
    context_files = request.FILES.getlist('files')

    if not audio_file and not image_files and not context_files:
        return Response({'error': 'At least one of audio, images, or files is required.'}, status=400)

    transcript = ''

    # 1. Transcribe new audio if provided
    if audio_file:
        _MIME_FIXES = {
            'audio/x-m4a': 'audio/m4a', 'audio/x-wav': 'audio/wav',
            'audio/x-flac': 'audio/flac', 'audio/x-ogg': 'audio/ogg',
            'audio/mpeg': 'audio/mpeg', 'audio/webm': 'audio/webm',
        }
        _EXT_MIME = {
            '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/m4a',
            '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.aac': 'audio/aac',
            '.webm': 'audio/webm', '.mp4': 'audio/mp4', '.mpeg': 'audio/mpeg',
        }
        raw_mime = (audio_file.content_type or '').split(';')[0].strip()
        ext = '.' + audio_file.name.rsplit('.', 1)[-1].lower() if '.' in audio_file.name else ''
        audio_mime = _MIME_FIXES.get(raw_mime) or raw_mime or _EXT_MIME.get(ext, 'audio/webm')
        if not audio_mime or audio_mime == 'application/octet-stream':
            audio_mime = _EXT_MIME.get(ext, 'audio/webm')
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
        except Exception as e:
            return Response({'error': f'Transcription failed: {str(e)}'}, status=status.HTTP_502_BAD_GATEWAY)

    # 2. Build parts (same pipeline as process view)
    existing_tags = ', '.join(lecture.tags) if lecture.tags else 'none yet'
    append_hint = (
        f'This is ADDITIONAL content to append to an existing lecture titled "{lecture.title}". '
        f'The lecture already covers these topics: {existing_tags}. '
        f'Generate NEW flashcards and notes that ADD TO and complement the existing content — '
        f'do not repeat what is already covered.'
    )

    if len(transcript) >= 10:
        parts: list = [append_hint, f'New audio transcript:\n\n{transcript}']
    else:
        parts: list = [append_hint, 'No new audio transcript. Generate from images/context files only.']

    _scale_image_count = len(image_files)
    _scale_context_words = 0

    for img in image_files:
        pil_img = Image.open(io.BytesIO(img.read()))
        parts.append(pil_img)
    if image_files:
        parts.append('The images above are additional photos provided for this lecture.')

    for cf in context_files:
        cf_bytes = cf.read()
        mime_type = (cf.content_type or '').split(';')[0].strip() or 'application/octet-stream'
        name_lower = cf.name.lower()
        try:
            if mime_type.startswith('image/') or name_lower.endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp', '.heic', '.heif')):
                parts.append(Image.open(io.BytesIO(cf_bytes)))
                _scale_image_count += 1
            elif mime_type == 'application/pdf' or name_lower.endswith('.pdf'):
                parts.append(types.Part.from_bytes(data=cf_bytes, mime_type='application/pdf'))
            elif mime_type.startswith('audio/') or name_lower.endswith(('.mp3', '.wav', '.m4a', '.ogg', '.flac', '.aac', '.webm')):
                _AUDIO_MIME_MAP = {'.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.aac': 'audio/aac', '.webm': 'audio/webm'}
                ext2 = '.' + name_lower.rsplit('.', 1)[-1] if '.' in name_lower else ''
                resolved_mime = mime_type if mime_type.startswith('audio/') else _AUDIO_MIME_MAP.get(ext2, 'audio/mpeg')
                parts.append(types.Part.from_bytes(data=cf_bytes, mime_type=resolved_mime))
                _scale_context_words += len(cf_bytes) // 150
            elif name_lower.endswith(('.pptx', '.ppt')):
                pdf_bytes = _convert_to_pdf(cf_bytes, cf.name)
                if pdf_bytes:
                    parts.append(types.Part.from_bytes(data=pdf_bytes, mime_type='application/pdf'))
                else:
                    from pptx import Presentation
                    prs = Presentation(io.BytesIO(cf_bytes))
                    slides_text = [f'[Slide {i}]\n' + '\n'.join(s.text.strip() for s in slide.shapes if hasattr(s, 'text') and s.text.strip()) for i, slide in enumerate(prs.slides, 1)]
                    extracted = '\n\n'.join(t for t in slides_text if t.strip())
                    parts.append(f'Context slides "{cf.name}":\n\n{extracted}')
                    _scale_context_words += len(extracted.split())
            elif name_lower.endswith(('.docx', '.doc')):
                pdf_bytes = _convert_to_pdf(cf_bytes, cf.name)
                if pdf_bytes:
                    parts.append(types.Part.from_bytes(data=pdf_bytes, mime_type='application/pdf'))
                else:
                    from docx import Document
                    doc = Document(io.BytesIO(cf_bytes))
                    extracted = '\n\n'.join(p.text for p in doc.paragraphs if p.text.strip())
                    parts.append(f'Context document "{cf.name}":\n\n{extracted}')
                    _scale_context_words += len(extracted.split())
            else:
                try:
                    text_content = cf_bytes.decode('utf-8', errors='strict')
                    parts.append(f'Context document "{cf.name}":\n\n{text_content}')
                    _scale_context_words += len(text_content.split())
                except UnicodeDecodeError:
                    pass
        except Exception as e:
            print(f'[APPEND CONTEXT FILE ERROR] {cf.name}: {e}')

    _transcript_words = len(transcript.split()) if transcript else 0
    scale_hint = _scaling_instruction(_transcript_words, _scale_context_words, _scale_image_count)
    parts = [scale_hint] + parts

    # 3. Run Gemini
    try:
        result = _run_gemini(parts)
        if result.get('insufficient_content'):
            reason = result.get('reason', 'Not enough content.')
            return Response({'error': f'Not enough content to append: {reason}'}, status=422)
    except TimeoutError:
        return Response({'error': 'Generation timed out. Please try again.'}, status=status.HTTP_504_GATEWAY_TIMEOUT)
    except json.JSONDecodeError:
        return Response({'error': 'Gemini returned malformed JSON. Try again.'}, status=status.HTTP_502_BAD_GATEWAY)
    except Exception as e:
        return Response({'error': f'Generation failed: {str(e)}'}, status=status.HTTP_502_BAD_GATEWAY)

    # 4. Append results to lecture
    new_flashcards = result.get('flashcards', [])
    new_notes = result.get('notes', '')
    new_transcript_part = result.get('transcript', transcript)

    # Append flashcards
    last_order = lecture.flashcards.order_by('-order').values_list('order', flat=True).first() or 0
    for i, fc in enumerate(new_flashcards):
        Flashcard.objects.create(lecture=lecture, order=last_order + i + 1, front=fc['front'], back=fc['back'])

    # Append notes as a new section
    if new_notes:
        separator = '\n\n---\n\n## Additional Content\n\n'
        lecture.notes = (lecture.notes + separator + new_notes) if lecture.notes else new_notes
        lecture.save(update_fields=['notes'])

    # Append transcript
    if new_transcript_part:
        lecture.transcript = ((lecture.transcript + '\n\n[Additional Recording]\n' + new_transcript_part)
                              if lecture.transcript else new_transcript_part)
        lecture.save(update_fields=['transcript'])

    print(f'[APPEND] lecture {pk}: +{len(new_flashcards)} flashcards')
    return Response(LectureDetailSerializer(lecture).data)


_EXAM_PROMPT = (
    'You are an expert exam writer. Given lecture transcripts and notes on a specific topic, '
    'generate a challenging exam that closely resembles a real university exam.\n\n'
    'Output ONLY valid JSON — an array with NO markdown fences. Each question must have a "type" field.\n\n'
    'MCQ format (conceptual, reasoning, comparison questions):\n'
    '{"type": "mcq", "question": "...", "options": ["A) ...", "B) ...", "C) ...", "D) ..."], "correct": 0, '
    '"explanation": "Why the correct answer is right and why each wrong option is incorrect."}\n\n'
    'Numeric format (calculations, derivations, specific values):\n'
    '{"type": "numeric", "question": "... (Show all working.)", "answer": "42.5 kJ/mol", '
    '"explanation": "Full step-by-step worked solution: state the formula, substitute values, show every step, final answer with units."}\n\n'
    'Short answer format (explain, describe, compare, analyse — anything needing a written response):\n'
    '{"type": "short_answer", "question": "...", '
    '"answer": "A comprehensive model answer covering all key points a student should mention."}\n\n'
    'RULES:\n'
    '- Generate 8-12 questions total.\n'
    '- Choose types based on what fits the content naturally. A well-rounded exam uses all three types.\n'
    '- "correct" in MCQ is the 0-based index of the correct option.\n'
    '- Questions should test deep understanding: reasoning, application, multi-step problems.\n'
    '- Numeric explanations must show every step; short_answer model answers must be thorough.\n'
    '- Vary difficulty: roughly 30% easy, 50% medium, 20% hard.\n'
    '- All MCQ distractors should be plausible — common mistakes or close values, not obviously wrong.\n'
)


@api_view(['GET', 'POST', 'PATCH'])
@permission_classes([IsAuthenticated])
def course_exam(request, pk):
    course = get_object_or_404(Course, pk=pk, user=request.user)

    if request.method == 'GET':
        tag = (request.query_params.get('tag') or '').strip()
        if not tag:
            return Response({'error': 'Tag is required.'}, status=400)
        try:
            exam = TopicExam.objects.get(course=course, tag=tag)
        except TopicExam.DoesNotExist:
            return Response({'found': False})
        current_ids = sorted(l.pk for l in course.lectures.all() if tag in (l.tags or []))
        stale = current_ids != sorted(exam.lecture_snapshot)
        return Response({
            'found': True,
            'questions': exam.questions,
            'stale': stale,
            'generated_at': exam.updated_at,
        })

    if request.method == 'PATCH':
        tag = (request.data.get('tag') or '').strip()
        score = request.data.get('score')
        total = request.data.get('total')
        if not tag or score is None or total is None:
            return Response({'error': 'tag, score, and total are required.'}, status=400)
        exam = get_object_or_404(TopicExam, course=course, tag=tag)
        exam.last_score = int(score)
        exam.last_total = int(total)
        exam.attempts = F('attempts') + 1
        exam.save(update_fields=['last_score', 'last_total', 'attempts'])
        return Response(status=status.HTTP_204_NO_CONTENT)

    # POST: generate (and save/overwrite)
    tag = (request.data.get('tag') or '').strip()
    if not tag:
        return Response({'error': 'Tag is required.'}, status=400)

    lectures = [l for l in course.lectures.all() if tag in (l.tags or [])]
    if not lectures:
        return Response({'error': f'No lectures found with tag "{tag}".'}, status=404)

    parts = [f'Topic: {tag}\n\nYou are generating an exam covering the following lecture materials on this topic.\n']
    for lec in lectures:
        parts.append(f'--- Lecture: {lec.title} ---\nTranscript:\n{lec.transcript}\n\nNotes:\n{lec.notes}\n')

    try:
        gemini_client = genai.Client(api_key=settings.GEMINI_API_KEY)

        def _generate():
            return gemini_client.models.generate_content(
                model='gemini-2.5-flash',
                contents=['\n\n'.join(parts)],
                config=types.GenerateContentConfig(
                    system_instruction=_EXAM_PROMPT,
                    max_output_tokens=65536,
                    temperature=0.5,
                ),
            )

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_generate)
            try:
                response = future.result(timeout=90)
            except concurrent.futures.TimeoutError:
                raise TimeoutError('Exam generation timed out.')

        questions = _extract_json(response.text)

        TopicExam.objects.update_or_create(
            course=course,
            tag=tag,
            defaults={
                'questions': questions,
                'lecture_snapshot': sorted(l.pk for l in lectures),
            },
        )
        print(f'[EXAM] course {pk}, tag="{tag}", lectures={len(lectures)}, questions={len(questions)}')
        return Response({'found': True, 'questions': questions, 'stale': False})

    except TimeoutError:
        return Response({'error': 'Exam generation timed out. Please try again.'}, status=status.HTTP_504_GATEWAY_TIMEOUT)
    except json.JSONDecodeError:
        return Response({'error': 'Gemini returned malformed JSON. Try again.'}, status=status.HTTP_502_BAD_GATEWAY)
    except Exception as e:
        print(f'[EXAM ERROR] {e}')
        return Response({'error': f'Exam generation failed: {str(e)}'}, status=status.HTTP_502_BAD_GATEWAY)


_ANKI_MODEL = genanki.Model(
    1607392319,  # fixed ID so repeated imports don't create duplicate model definitions in Anki
    'GraspIt Basic',
    fields=[{'name': 'Front'}, {'name': 'Back'}],
    templates=[{
        'name': 'Card 1',
        'qfmt': '{{Front}}',
        'afmt': '{{FrontSide}}<hr id=answer>{{Back}}',
    }],
)


def _make_anki_pkg(deck_name: str, cards: list[dict]) -> bytes:
    """Return .apkg bytes for a list of {'front': ..., 'back': ...} dicts."""
    import random
    deck = genanki.Deck(random.randrange(1 << 30, 1 << 31), deck_name)
    for c in cards:
        deck.add_note(genanki.Note(model=_ANKI_MODEL, fields=[c['front'], c['back']]))
    pkg = genanki.Package(deck)
    with tempfile.NamedTemporaryFile(suffix='.apkg', delete=False) as f:
        tmp = f.name
    try:
        pkg.write_to_file(tmp)
        with open(tmp, 'rb') as f:
            return f.read()
    finally:
        os.unlink(tmp)


def _safe_filename(name: str) -> str:
    return re.sub(r'[^\w\s-]', '', name).strip().replace(' ', '_') or 'brainjam'


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def lecture_anki(request, pk):
    lecture = get_object_or_404(Lecture, pk=pk, course__user=request.user)
    cards = [{'front': fc.front, 'back': fc.back} for fc in lecture.flashcards.order_by('order')]
    if not cards:
        return Response({'error': 'No flashcards to export.'}, status=400)
    deck_name = f'{lecture.course.name} — {lecture.title}'
    apkg = _make_anki_pkg(deck_name, cards)
    filename = _safe_filename(lecture.title) + '.apkg'
    resp = HttpResponse(apkg, content_type='application/octet-stream')
    resp['Content-Disposition'] = f'attachment; filename="{filename}"'
    return resp


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def course_anki(request, pk):
    course = get_object_or_404(Course, pk=pk, user=request.user)
    tag = (request.query_params.get('tag') or '').strip()
    if tag:
        lectures = [l for l in course.lectures.prefetch_related('flashcards') if tag in (l.tags or [])]
        deck_name = f'{course.name} — {tag}'
        filename = _safe_filename(f'{course.name}_{tag}') + '.apkg'
    else:
        lectures = list(course.lectures.prefetch_related('flashcards'))
        deck_name = course.name
        filename = _safe_filename(course.name) + '.apkg'
    cards = [
        {'front': fc.front, 'back': fc.back}
        for lec in lectures
        for fc in lec.flashcards.order_by('order')
    ]
    if not cards:
        return Response({'error': 'No flashcards to export.'}, status=400)
    apkg = _make_anki_pkg(deck_name, cards)
    resp = HttpResponse(apkg, content_type='application/octet-stream')
    resp['Content-Disposition'] = f'attachment; filename="{filename}"'
    return resp


_CHAT_SYSTEM_PROMPT = (
    'You are a study assistant for this course. '
    'Answer questions based only on the course content provided. '
    'Be concise but thorough. Reference specific lecture titles when relevant. '
    "If a topic isn't covered in the lectures, say so clearly."
)


def _build_course_context(course):
    parts = []
    for lec in course.lectures.all():
        chunk = f'=== Lecture: {lec.title} ===\n'
        if lec.summary:
            chunk += f'Summary: {lec.summary}\n'
        if lec.transcript:
            chunk += f'\nTranscript:\n{lec.transcript}\n'
        if lec.notes:
            chunk += f'\nNotes:\n{lec.notes}\n'
        parts.append(chunk)
    return '\n\n'.join(parts)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def course_chat(request, pk):
    course = get_object_or_404(Course, pk=pk, user=request.user)
    messages = request.data.get('messages', [])
    if not messages:
        return Response({'error': 'messages required.'}, status=400)

    context = _build_course_context(course)
    first_content = f'Course: {course.name}\n\nMaterials:\n\n{context}\n\n---\n\n{messages[0]["content"]}'
    contents = [
        types.Content(role='user', parts=[types.Part.from_text(text=first_content)])
    ]
    for msg in messages[1:]:
        role = 'user' if msg['role'] == 'user' else 'model'
        contents.append(types.Content(role=role, parts=[types.Part.from_text(text=msg['content'])]))

    def event_stream():
        try:
            gemini_client = genai.Client(api_key=settings.GEMINI_API_KEY)
            for chunk in gemini_client.models.generate_content_stream(
                model='gemini-2.5-flash',
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=_CHAT_SYSTEM_PROMPT,
                    max_output_tokens=2048,
                    temperature=0.7,
                ),
            ):
                if chunk.text:
                    yield f'data: {json.dumps({"text": chunk.text})}\n\n'
        except Exception as e:
            yield f'data: {json.dumps({"error": str(e)})}\n\n'
        yield 'data: [DONE]\n\n'

    resp = StreamingHttpResponse(event_stream(), content_type='text/event-stream')
    resp['Cache-Control'] = 'no-cache'
    resp['X-Accel-Buffering'] = 'no'
    return resp


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def search(request):
    q = (request.query_params.get('q') or '').strip()
    if len(q) < 2:
        return Response({'topics': [], 'lectures': [], 'flashcards': []})

    q_lower = q.lower()

    lecture_qs = Lecture.objects.filter(course__user=request.user).select_related('course')
    try:
        course_id = int(request.query_params.get('course_id') or 0)
        if course_id:
            lecture_qs = lecture_qs.filter(course_id=course_id)
    except (ValueError, TypeError):
        pass

    matched_lectures = []
    matched_tags: dict = {}

    for lec in lecture_qs:
        for tag in (lec.tags or []):
            if q_lower in tag.lower():
                key = (lec.course_id, tag)
                if key not in matched_tags:
                    matched_tags[key] = {
                        'tag': tag,
                        'course_id': lec.course_id,
                        'course_name': lec.course.name,
                        'lecture_count': 0,
                    }
                matched_tags[key]['lecture_count'] += 1

        if (
            q_lower in lec.title.lower()
            or q_lower in (lec.summary or '').lower()
            or q_lower in (lec.notes or '').lower()
            or any(q_lower in tag.lower() for tag in (lec.tags or []))
        ):
            matched_lectures.append({
                'id': lec.id,
                'title': lec.title,
                'summary': lec.summary or '',
                'course_id': lec.course_id,
                'course_name': lec.course.name,
                'tags': lec.tags or [],
            })

    flashcard_qs = Flashcard.objects.filter(
        lecture__course__user=request.user
    ).select_related('lecture__course')
    if course_id:
        flashcard_qs = flashcard_qs.filter(lecture__course_id=course_id)

    matched_flashcards = []
    for fc in flashcard_qs:
        if q_lower in fc.front.lower() or q_lower in fc.back.lower():
            matched_flashcards.append({
                'id': fc.id,
                'front': fc.front,
                'back': fc.back,
                'lecture_id': fc.lecture_id,
                'lecture_title': fc.lecture.title,
                'course_id': fc.lecture.course_id,
                'course_name': fc.lecture.course.name,
            })
        if len(matched_flashcards) >= 5:
            break

    return Response({
        'topics': list(matched_tags.values())[:6],
        'lectures': matched_lectures[:6],
        'flashcards': matched_flashcards[:5],
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def course_topic(request, pk):
    course = get_object_or_404(Course, pk=pk, user=request.user)
    tag = (request.query_params.get('tag') or '').strip()
    if not tag:
        return Response({'error': 'Tag is required.'}, status=400)

    lectures = [l for l in course.lectures.all() if tag in (l.tags or [])]
    result = []
    for lec in lectures:
        result.append({
            'id': lec.id,
            'title': lec.title,
            'notes': lec.notes,
            'flashcards': [
                {'front': fc.front, 'back': fc.back}
                for fc in lec.flashcards.order_by('order')
            ],
        })
    return Response({'tag': tag, 'course_name': course.name, 'lectures': result})

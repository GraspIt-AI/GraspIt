import json
import concurrent.futures
from django.conf import settings
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework import status
from openai import OpenAI
from google import genai
from google.genai import types
from PIL import Image
import io


@api_view(['POST'])
@parser_classes([MultiPartParser])
def process(request):
    audio_file = request.FILES.get('audio')
    image_files = request.FILES.getlist('images')

    if not audio_file:
        return Response({'error': 'No audio file provided.'}, status=status.HTTP_400_BAD_REQUEST)

    # Reject files over 25 MB before reading
    if audio_file.size and audio_file.size > 25 * 1024 * 1024:
        return Response(
            {'error': 'Audio file too large (max 25 MB). Please record in shorter segments.'},
            status=413,
        )

    # 1. Transcribe audio with Groq (Whisper large v3) — 30s timeout
    try:
        groq_client = OpenAI(
            api_key=settings.GROQ_API_KEY,
            base_url='https://api.groq.com/openai/v1',
            timeout=30.0,
        )
        transcript_response = groq_client.audio.transcriptions.create(
            model='whisper-large-v3',
            file=(audio_file.name, audio_file.read(), 'audio/webm'),
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
    system_prompt = (
        'You are a study assistant. Given a lecture transcript and optional board/slide photos, '
        'output ONLY valid JSON with exactly this shape — no markdown fences, no extra keys:\n'
        '{"flashcards": [{"front": "question", "back": "answer"}], "notes": "markdown string"}\n\n'
        'FLASHCARD RULES:\n'
        '- Generate 10-20 flashcards covering the key concepts.\n'
        '- Prefer concept-understanding questions over simple trivia (ask "why" and "how", not just "what").\n'
        '- Always create a dedicated flashcard for every equation, formula, or definition mentioned.\n'
        '- Avoid duplicating overlapping topics — merge similar cards into one.\n\n'
        'NOTES RULES:\n'
        '- Start with a "## Key Takeaways" section (3-5 bullet points summarising the most important ideas).\n'
        '- Then use ## H2 section headers for each major topic.\n'
        '- Use bullet points under each header. Bold (**like this**) all key terms and important concepts.\n'
        '- The notes should be a complete, well-structured markdown document a student can study from.\n'
    )

    parts = [f'Lecture transcript:\n\n{transcript}']

    for img in image_files:
        img_bytes = img.read()
        pil_img = Image.open(io.BytesIO(img_bytes))
        parts.append(pil_img)

    if image_files:
        parts.append('The images above are photos taken during the lecture (whiteboards, slides, figures). Use them as additional context.')

    # 3. Generate flashcards + notes with Gemini — 60s timeout via ThreadPoolExecutor
    try:
        gemini_client = genai.Client(api_key=settings.GEMINI_API_KEY)

        def _generate():
            return gemini_client.models.generate_content(
                model='gemini-2.5-flash',
                contents=parts,
                config=types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    max_output_tokens=8192,
                    temperature=0.4,
                ),
            )

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_generate)
            try:
                response = future.result(timeout=60)
            except concurrent.futures.TimeoutError:
                return Response(
                    {'error': 'Generation timed out. Please try again.'},
                    status=status.HTTP_504_GATEWAY_TIMEOUT,
                )

        raw = response.text.strip()
        print(f'[GEMINI] raw response (first 300): {repr(raw[:300])}')
        # Strip markdown code fences if Gemini wraps output in ```json
        if raw.startswith('```'):
            raw = raw.split('```')[1]
            if raw.startswith('json'):
                raw = raw[4:]
        result = json.loads(raw)
        print(f'[GEMINI] flashcards count: {len(result.get("flashcards", []))}')
    except json.JSONDecodeError:
        print(f'[GEMINI JSON ERROR] raw was: {repr(raw[:500])}')
        return Response({'error': 'Gemini returned malformed JSON. Try again.'}, status=status.HTTP_502_BAD_GATEWAY)
    except Exception as e:
        print(f'[GEMINI ERROR] {e}')
        return Response({'error': f'Generation failed: {str(e)}'}, status=status.HTTP_502_BAD_GATEWAY)

    # Include transcript so the frontend can display it
    result['transcript'] = transcript
    return Response(result)

import json
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

    # 1. Transcribe audio with Groq (Whisper large v3)
    try:
        groq_client = OpenAI(
            api_key=settings.GROQ_API_KEY,
            base_url='https://api.groq.com/openai/v1',
        )
        transcript_response = groq_client.audio.transcriptions.create(
            model='whisper-large-v3',
            file=(audio_file.name, audio_file.read(), 'audio/webm'),
        )
        transcript = transcript_response.text.strip()
        print(f'[GROQ] transcript length: {len(transcript)}, preview: {repr(transcript[:200])}')
        if not transcript:
            return Response({'error': 'Whisper could not detect any speech in the recording. Please speak clearly and try again.'}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
    except Exception as e:
        print(f'[GROQ ERROR] {e}')
        return Response({'error': f'Transcription failed: {str(e)}'}, status=status.HTTP_502_BAD_GATEWAY)

    # 2. Build Gemini prompt parts
    system_prompt = (
        'You are a study assistant. Given a lecture transcript and optional board/slide photos, '
        'output ONLY valid JSON with exactly this shape — no markdown, no extra keys:\n'
        '{"flashcards": [{"front": "question", "back": "answer"}], "notes": "markdown string"}\n'
        'Generate 10-20 flashcards covering the key concepts. '
        'The notes field should be a well-structured markdown summary with headers and bullet points.'
    )

    parts = [f'Lecture transcript:\n\n{transcript}']

    for img in image_files:
        img_bytes = img.read()
        pil_img = Image.open(io.BytesIO(img_bytes))
        parts.append(pil_img)

    if image_files:
        parts.append('The images above are photos taken during the lecture (whiteboards, slides, figures). Use them as additional context.')

    # 3. Generate flashcards + notes with Gemini
    try:
        gemini_client = genai.Client(api_key=settings.GEMINI_API_KEY)
        response = gemini_client.models.generate_content(
            model='gemini-2.5-flash',
            contents=parts,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                max_output_tokens=4096,
            ),
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

    return Response(result)

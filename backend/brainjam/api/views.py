import json
import re
import os
import tempfile
import concurrent.futures
import threading
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
    LectureDetailSerializer, FlashcardSerializer,
)
from PIL import Image
import io
import genanki

User = get_user_model()

_SYSTEM_PROMPT = (
    'You are a study assistant. Given a lecture transcript and optional context materials '
    '(photos, slides, PDFs, documents), '
    'output ONLY valid JSON — no markdown fences, no extra keys.\n\n'
    'IMPORTANT: Only output {"insufficient_content": true, "reason": "..."} if there is literally no usable content at all (e.g. a blank file or pure noise). '
    'If there is ANY subject matter — even multiple unrelated topics — generate flashcards and notes for all of it. '
    'For mixed or unrelated topics, use separate sections in notes and generate flashcards covering each topic.\n\n'
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
    '- Do NOT invent or assume facts not present in the provided content.\n\n'
    'MATH FORMATTING RULES (apply everywhere — flashcard fronts/backs, notes, all fields):\n'
    '- Use LaTeX for ALL mathematical expressions, equations, and formulas — never plain text or backticks.\n'
    '- Inline math: wrap with single dollar signs, e.g. $F = ma$ or $E = mc^2$.\n'
    '- Display math (standalone equations): wrap with double dollar signs on their own line.\n'
    '  Always put a blank line before AND after a $$ block, even inside a list item. Never place consecutive $$ blocks without a blank line between them.\n'
    '- CRITICAL — JSON escaping: you are outputting a JSON string, so every LaTeX backslash MUST be doubled.\n'
    '  Write \\\\frac, \\\\text, \\\\theta, \\\\vec, \\\\sum, \\\\int, \\\\Delta, \\\\tau, \\\\rho etc.\n'
    '  Single backslash (\\text, \\frac) is WRONG inside JSON strings — it produces garbage characters.\n'
    '- Never use backtick code spans for math. Never write equations as plain text like "F_net = sum(F)".\n'
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

    # Step 0: fix LaTeX backslashes that JSON silently misinterprets as control characters.
    # Gemini often writes \text, \theta, \frac, \beta, \right etc. with a single backslash.
    # JSON treats \t→TAB, \f→formfeed, \b→backspace, \r→carriage-return — all wrong for LaTeX.
    # Use a negative lookbehind so already-correct \\text is left untouched.
    raw = re.sub(r'(?<!\\)\\([tfbr])(?=[a-zA-Z{])', r'\\\\\1', raw)

    # Step 1: strip markdown fences — use the last match in case thinking text has fences too
    if '```' in raw:
        matches = re.findall(r'```(?:json)?\s*([\s\S]*?)```', raw)
        if matches:
            raw = matches[-1].strip()

    # Step 2: if still not starting with a JSON delimiter, grab from the last { or [
    # Thinking text always comes first, so the last { is the actual JSON response
    if not raw.startswith(('{', '[')):
        last_obj = raw.rfind('{')
        last_arr = raw.rfind('[')
        if last_obj >= 0 and last_obj >= last_arr:
            raw = raw[last_obj:]
        elif last_arr >= 0:
            raw = raw[last_arr:]

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

        # Try to fix invalid LaTeX backslash sequences that are not valid JSON escapes.
        # JSON only allows: \" \\ \/ \b \f \n \r \t \uXXXX
        # LaTeX commands like \vec, \tau, \frac, \Delta produce invalid sequences like \v, \t, \f, \D.
        try:
            fixed = re.sub(r'\\([^"\\/bfnrtu\s])', r'\\\\\1', raw)
            fixed = re.sub(r',(\s*[}\]])', r'\1', fixed)  # also strip trailing commas
            return json.loads(fixed)
        except json.JSONDecodeError:
            pass

        # If all else fails, try to construct JSON from expected fields
        try:
            result = {}
            # Try to extract flashcards array
            fc_match = re.search(r'"flashcards"\s*:\s*\[(.*?)\](?:,|\})', raw, re.DOTALL)
            result['flashcards'] = json.loads('[' + (fc_match.group(1) if fc_match else '') + ']') if fc_match else []

            # Extract other fields with regex — use pattern that handles escaped chars inside strings,
            # then JSON-decode the captured value so \n → newline, \\vec → \vec, etc.
            for field in ['title', 'summary', 'notes', 'transcript']:
                match = re.search(rf'"{field}"\s*:\s*"((?:[^"\\]|\\.)*)"', raw, re.DOTALL)
                if match:
                    try:
                        result[field] = json.loads('"' + match.group(1) + '"')
                    except json.JSONDecodeError:
                        # Last resort: manually decode the most common escape sequences
                        result[field] = (match.group(1)
                            .replace('\\n', '\n').replace('\\t', '\t')
                            .replace('\\r', '\r').replace('\\"', '"')
                            .replace('\\\\', '\\'))
                else:
                    result[field] = ''

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
                max_output_tokens=8192,
                temperature=0.4,
            ),
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(_generate)
        try:
            response = future.result(timeout=180)
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
        fc = '5-10'
        notes = 'concise notes: 3-5 bullet points per section'
    elif total < 800:
        fc = '10-15'
        notes = 'concise notes: 4-6 bullet points per section'
    elif total < 2500:
        fc = '15-20'
        notes = 'thorough notes: 5-8 bullet points per section'
    else:
        fc = '20-25'
        notes = 'thorough notes: 5-8 bullet points per section, one section per major topic'
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


# ── Demo data seed ────────────────────────────────────────────────────────────

def _seed_demo_data(user):
    """Create two sample courses with lectures, flashcards, notes, tags, and a completed exam."""

    # ── Course 1: Biology ─────────────────────────────────────────────────────
    bio = Course.objects.create(
        user=user,
        name='Introduction to Biology',
        description='Foundational concepts in cell biology and metabolism.',
        color='#10b981',
    )

    lec1 = Lecture.objects.create(
        course=bio,
        title='Cell Structure and Function',
        summary='An overview of eukaryotic cell organelles and their roles in maintaining cell homeostasis.',
        transcript=(
            'Today we are going to talk about the cell — the fundamental unit of life. '
            'Every organism is made of cells, and eukaryotic cells have a number of specialised compartments called organelles. '
            'The nucleus houses the DNA and acts as the control centre. '
            'The mitochondria produce ATP through oxidative phosphorylation and are often called the powerhouse of the cell. '
            'The endoplasmic reticulum exists in two forms: rough ER, which is studded with ribosomes and synthesises proteins destined for secretion or membrane insertion, '
            'and smooth ER, which is involved in lipid synthesis and detoxification. '
            'The Golgi apparatus sorts and packages proteins, adding carbohydrate tags before shipping them to their final destination. '
            'Lysosomes contain digestive enzymes and handle waste disposal. '
            'The cell membrane is a phospholipid bilayer with embedded proteins that controls what enters and leaves the cell.'
        ),
        notes=(
            '## Key Takeaways\n\n'
            '- Eukaryotic cells contain membrane-bound organelles that divide labour within the cell.\n'
            '- The nucleus is the control centre; mitochondria produce energy as ATP.\n'
            '- The endomembrane system (ER → Golgi → vesicles) handles protein and lipid trafficking.\n'
            '- The cell membrane is selectively permeable, maintaining internal conditions.\n'
            '- Each organelle has a distinct structure that directly supports its function.\n\n'
            '## The Nucleus\n\n'
            '- Contains **DNA** wound around **histone** proteins forming **chromatin**.\n'
            '- Surrounded by the **nuclear envelope** (double membrane) with **nuclear pores** for transport.\n'
            '- Houses the **nucleolus**, where ribosomal RNA (rRNA) is synthesised.\n\n'
            '## Mitochondria\n\n'
            '- Double-membrane organelle; inner membrane forms **cristae** to maximise surface area.\n'
            '- Site of **oxidative phosphorylation** — produces the majority of cellular **ATP**.\n'
            '- Contains its own DNA (circular), evidence for the **endosymbiotic theory**.\n\n'
            '## Endoplasmic Reticulum\n\n'
            '- **Rough ER**: studded with ribosomes; synthesises secretory and membrane proteins.\n'
            '- **Smooth ER**: no ribosomes; involved in **lipid synthesis**, calcium storage, and detoxification.\n\n'
            '## Golgi Apparatus\n\n'
            '- Receives vesicles from the ER (**cis face**) and dispatches them (**trans face**).\n'
            '- Modifies proteins by adding **oligosaccharide** chains (**glycosylation**).\n'
            '- Sorts proteins to lysosomes, plasma membrane, or secretion.\n\n'
            '## Cell Membrane\n\n'
            '- **Fluid mosaic model**: phospholipid bilayer with freely moving proteins.\n'
            '- **Integral proteins** span the bilayer; **peripheral proteins** attach to the surface.\n'
            '- **Selective permeability** controlled by channel proteins, carrier proteins, and pumps.\n'
        ),
        tags=['Cell Biology', 'Organelles', 'Cell Membrane'],
    )

    flashcards1 = [
        ('What is the function of the mitochondria?',
         'To produce ATP through oxidative phosphorylation — the "powerhouse of the cell".'),
        ('What distinguishes rough ER from smooth ER?',
         'Rough ER is studded with ribosomes and synthesises secretory proteins; smooth ER lacks ribosomes and is involved in lipid synthesis and detoxification.'),
        ('What is the fluid mosaic model?',
         'A model describing the cell membrane as a phospholipid bilayer with freely moving embedded proteins, giving it both fluid and mosaic properties.'),
        ('What is the role of the Golgi apparatus?',
         'To sort, modify (e.g. glycosylation), and package proteins received from the ER for delivery to lysosomes, the plasma membrane, or secretion.'),
        ('What structural feature increases the surface area of mitochondria?',
         'Cristae — folds of the inner mitochondrial membrane that greatly increase the surface area available for ATP synthesis.'),
        ('What is the nucleolus and what does it produce?',
         'A dense region within the nucleus that synthesises ribosomal RNA (rRNA) and assembles ribosome subunits.'),
        ('What evidence supports the endosymbiotic theory for mitochondria?',
         'Mitochondria have their own circular DNA, replicate by binary fission, and have double membranes — all consistent with an ancient bacterial ancestor.'),
        ('What is selective permeability?',
         'The property of the cell membrane allowing only certain molecules to pass through, controlled by channel proteins, carrier proteins, and pumps.'),
    ]
    for i, (front, back) in enumerate(flashcards1):
        Flashcard.objects.create(lecture=lec1, front=front, back=back, order=i)

    lec2 = Lecture.objects.create(
        course=bio,
        title='Photosynthesis and Cellular Respiration',
        summary='How cells convert light energy into chemical energy (photosynthesis) and extract it from glucose (cellular respiration), including the key stages and molecules involved.',
        transcript=(
            'In this lecture we cover energy metabolism — specifically photosynthesis and cellular respiration. '
            'Photosynthesis occurs in the chloroplast and has two stages. '
            'The light-dependent reactions occur in the thylakoid membrane. '
            'Light energy is captured by chlorophyll and used to split water, producing oxygen as a by-product and generating ATP and NADPH. '
            'The light-independent reactions, or the Calvin cycle, occur in the stroma. '
            'They use ATP and NADPH to fix CO2 into glucose via the enzyme RuBisCO. '
            'Cellular respiration is essentially the reverse — glucose is broken down to release energy as ATP. '
            'Glycolysis in the cytoplasm converts glucose to pyruvate, yielding 2 ATP and 2 NADH. '
            'Pyruvate then enters the mitochondrial matrix for the Krebs cycle, generating NADH, FADH2, and a small amount of ATP. '
            'Finally, the electron transport chain on the inner mitochondrial membrane uses NADH and FADH2 to pump protons and drive ATP synthase, '
            'producing approximately 32–34 ATP per glucose molecule.'
        ),
        notes=(
            '## Key Takeaways\n\n'
            '- Photosynthesis converts light energy → chemical energy (glucose); cellular respiration converts glucose → ATP.\n'
            '- Photosynthesis has two stages: light-dependent reactions (thylakoid) and the Calvin cycle (stroma).\n'
            '- Cellular respiration has three stages: glycolysis (cytoplasm), Krebs cycle (mitochondrial matrix), ETC (inner membrane).\n'
            '- Net ATP yield from one glucose: ~2 from glycolysis, ~2 from Krebs, ~32–34 from oxidative phosphorylation.\n'
            '- NADH and FADH2 are electron carriers that shuttle energy to the ETC.\n\n'
            '## Photosynthesis\n\n'
            '**Overall equation:**\n\n'
            '$$6CO_2 + 6H_2O \\xrightarrow{\\text{light}} C_6H_{12}O_6 + 6O_2$$\n\n'
            '### Light-Dependent Reactions (Thylakoid Membrane)\n\n'
            '- **Chlorophyll** absorbs light (mainly red and blue wavelengths).\n'
            '- **Photolysis of water** releases $O_2$ as a by-product.\n'
            '- Products: **ATP** (via photophosphorylation) and **NADPH**.\n\n'
            '### Calvin Cycle (Stroma)\n\n'
            '- **RuBisCO** catalyses carbon fixation: $CO_2 + RuBP \\rightarrow$ 3-phosphoglycerate.\n'
            '- ATP and NADPH are consumed to regenerate RuBP and produce **G3P** (building block for glucose).\n\n'
            '## Cellular Respiration\n\n'
            '**Overall equation:**\n\n'
            '$$C_6H_{12}O_6 + 6O_2 \\rightarrow 6CO_2 + 6H_2O + \\text{ATP}$$\n\n'
            '### Glycolysis (Cytoplasm)\n\n'
            '- Glucose ($C_6$) → 2 Pyruvate ($C_3$).\n'
            '- Net yield: **2 ATP** + **2 NADH**.\n\n'
            '### Krebs Cycle (Mitochondrial Matrix)\n\n'
            '- Each pyruvate converted to **acetyl-CoA** (releasing $CO_2$).\n'
            '- Per glucose: **2 ATP**, **6 NADH**, **2 FADH2**.\n\n'
            '### Electron Transport Chain (Inner Mitochondrial Membrane)\n\n'
            '- NADH and FADH2 donate electrons; $O_2$ is the final electron acceptor.\n'
            '- Proton gradient drives **ATP synthase** (chemiosmosis).\n'
            '- Yield: **~32–34 ATP** per glucose.\n'
        ),
        tags=['Photosynthesis', 'Krebs Cycle', 'ATP Synthesis', 'Cell Respiration'],
    )

    flashcards2 = [
        ('What are the two main stages of photosynthesis and where do they occur?',
         'Light-dependent reactions (thylakoid membrane) produce ATP and NADPH. The Calvin cycle (stroma) uses these to fix CO₂ into glucose.'),
        ('What is the overall equation for photosynthesis?',
         '$6CO_2 + 6H_2O \\xrightarrow{\\text{light}} C_6H_{12}O_6 + 6O_2$'),
        ('What enzyme catalyses carbon fixation in the Calvin cycle?',
         'RuBisCO (ribulose-1,5-bisphosphate carboxylase/oxygenase) — the most abundant enzyme on Earth.'),
        ('What is the net ATP yield of glycolysis?',
         '2 ATP (plus 2 NADH) per molecule of glucose; glucose is converted to 2 pyruvate.'),
        ('What happens during the Krebs cycle?',
         'Acetyl-CoA is oxidised in the mitochondrial matrix, generating CO₂, NADH, FADH₂, and 2 ATP per glucose.'),
        ('How does the electron transport chain produce ATP?',
         'NADH and FADH₂ donate electrons along the chain; released energy pumps protons across the inner membrane, and the resulting gradient drives ATP synthase (chemiosmosis).'),
        ('What is the approximate total ATP yield from one glucose molecule?',
         '~36–38 ATP: 2 from glycolysis, 2 from Krebs cycle, ~32–34 from oxidative phosphorylation via the ETC.'),
        ('Why is oxygen the final electron acceptor in cellular respiration?',
         'Oxygen has a very high electronegativity, making it an excellent electron acceptor; it combines with electrons and protons to form water, allowing the ETC to continue.'),
        ('What are NADH and FADH₂?',
         'Electron carriers (coenzymes) that collect high-energy electrons during glycolysis and the Krebs cycle and deliver them to the electron transport chain.'),
    ]
    for i, (front, back) in enumerate(flashcards2):
        Flashcard.objects.create(lecture=lec2, front=front, back=back, order=i)

    # Pre-seeded exam for the "Photosynthesis" topic with a score
    TopicExam.objects.create(
        course=bio,
        tag='Photosynthesis',
        lecture_snapshot=sorted([lec2.pk]),
        last_score=7,
        last_total=8,
        attempts=1,
        questions=[
            {
                'type': 'mcq',
                'question': 'Where do the light-dependent reactions of photosynthesis take place?',
                'options': ['Stroma', 'Thylakoid membrane', 'Mitochondrial matrix', 'Cytoplasm'],
                'correct': 1,
                'explanation': 'Light-dependent reactions occur in the thylakoid membrane, where chlorophyll captures light energy.',
            },
            {
                'type': 'mcq',
                'question': 'Which molecule is the primary CO₂ acceptor in the Calvin cycle?',
                'options': ['ATP', 'NADPH', 'RuBP', 'G3P'],
                'correct': 2,
                'explanation': 'RuBP (ribulose-1,5-bisphosphate) is carboxylated by RuBisCO to begin each turn of the Calvin cycle.',
            },
            {
                'type': 'mcq',
                'question': 'What is released as a by-product of the light-dependent reactions?',
                'options': ['Carbon dioxide', 'Glucose', 'Oxygen', 'NADPH'],
                'correct': 2,
                'explanation': 'Water is split (photolysis) during the light reactions, releasing O₂ as a by-product.',
            },
            {
                'type': 'numeric',
                'question': 'How many CO₂ molecules must be fixed to produce one net G3P molecule in the Calvin cycle?',
                'answer': '3',
                'explanation': 'Three turns of the Calvin cycle fix 3 CO₂, producing 6 G3P molecules, but 5 are recycled to regenerate RuBP — leaving 1 net G3P.',
            },
            {
                'type': 'short_answer',
                'question': 'Explain why increasing light intensity only improves the rate of photosynthesis up to a certain point.',
                'model_answer': 'Beyond a saturation point, the light-independent (Calvin cycle) reactions become the limiting factor — there is more ATP and NADPH than the Calvin cycle enzymes can use. The rate then plateaus regardless of further increases in light intensity.',
            },
            {
                'type': 'mcq',
                'question': 'Which pigment is primarily responsible for capturing light energy in plants?',
                'options': ['Carotenoid', 'Chlorophyll a', 'Xanthophyll', 'Phytochrome'],
                'correct': 1,
                'explanation': 'Chlorophyll a is the primary photosynthetic pigment; it absorbs red and blue light most strongly.',
            },
            {
                'type': 'mcq',
                'question': 'What is the direct energy source for the regeneration of RuBP in the Calvin cycle?',
                'options': ['Glucose', 'FADH₂', 'ATP', 'NADH'],
                'correct': 2,
                'explanation': 'ATP (produced in the light reactions) provides the phosphate groups needed to regenerate RuBP from G3P.',
            },
            {
                'type': 'short_answer',
                'question': 'Describe how the structure of the chloroplast is adapted for photosynthesis.',
                'model_answer': 'The thylakoid membrane provides a large surface area for light-harvesting complexes and the ETC. Thylakoids stack into grana, maximising membrane surface in a small volume. The stroma surrounds the thylakoids, providing the aqueous environment for the Calvin cycle enzymes.',
            },
        ],
    )

    # ── Course 2: Physics ─────────────────────────────────────────────────────
    phys = Course.objects.create(
        user=user,
        name='Physics 101',
        description='Classical mechanics — forces, motion, energy, and momentum.',
        color='#6366f1',
    )

    lec3 = Lecture.objects.create(
        course=phys,
        title="Newton's Laws of Motion",
        summary="A detailed walkthrough of Newton's three laws of motion, free-body diagrams, and applications to real-world force problems.",
        transcript=(
            "Today we cover Newton's three laws of motion, which are the foundation of classical mechanics. "
            "The first law, the law of inertia, states that an object at rest stays at rest and an object in motion stays in motion "
            "with the same speed and in the same direction unless acted upon by an unbalanced force. "
            "The second law defines force quantitatively: F equals ma, where F is the net force in newtons, "
            "m is the mass in kilograms, and a is the acceleration in metres per second squared. "
            "The third law states that for every action there is an equal and opposite reaction — "
            "when object A exerts a force on object B, object B exerts an equal and opposite force on object A. "
            "Free-body diagrams are essential tools. You draw all forces acting on an object as vectors from the object's centre. "
            "Common forces include weight (mg downward), normal force (perpendicular to surface), friction (opposing motion), and tension. "
            "On an inclined plane the weight component parallel to the slope is mg sin theta and perpendicular is mg cos theta."
        ),
        notes=(
            "## Key Takeaways\n\n"
            "- Newton's three laws describe inertia, the force–acceleration relationship, and action–reaction pairs.\n"
            "- Net force equals mass times acceleration: $F_{\\text{net}} = ma$.\n"
            "- Free-body diagrams isolate an object and show all forces as labelled vectors.\n"
            "- On inclined planes, weight is resolved into components parallel and perpendicular to the slope.\n"
            "- Action–reaction forces act on *different* objects and never cancel each other.\n\n"
            "## Newton's First Law — Inertia\n\n"
            "- An object remains at rest or moves at constant velocity unless a **net force** acts on it.\n"
            "- **Inertia** is the resistance of an object to a change in its state of motion; proportional to mass.\n"
            "- A net force of zero does **not** mean no forces — it means all forces are balanced.\n\n"
            "## Newton's Second Law — $F = ma$\n\n"
            "$$F_{\\text{net}} = ma$$\n\n"
            "- $F_{\\text{net}}$ = vector sum of all forces (N), $m$ = mass (kg), $a$ = acceleration (m s$^{-2}$).\n"
            "- Doubling the force doubles the acceleration; doubling the mass halves the acceleration.\n"
            "- Always apply separately to each axis: $\\sum F_x = ma_x$, $\\sum F_y = ma_y$.\n\n"
            "## Newton's Third Law — Action–Reaction\n\n"
            "- Forces always come in **equal and opposite pairs** acting on *different* objects.\n"
            "- Example: you push the floor down; the floor pushes you up (the normal force).\n"
            "- Action–reaction pairs do **not** cancel because they act on different objects.\n\n"
            "## Free-Body Diagrams\n\n"
            "- Draw a dot or box representing the object.\n"
            "- Add arrows for every force: **weight** $W = mg$ (down), **normal force** $N$ (perpendicular to surface), **friction** $f$ (opposing motion), **tension** $T$ (along string).\n"
            "- Label magnitude and direction; resolve into components before applying $F = ma$.\n\n"
            "## Inclined Planes\n\n"
            "- Tilt the coordinate axes to align with the slope.\n"
            "- Weight components:\n"
            "  - Parallel to slope: $mg\\sin\\theta$ (causes acceleration down the slope)\n"
            "  - Perpendicular to slope: $mg\\cos\\theta$ (balanced by normal force $N = mg\\cos\\theta$)\n"
        ),
        tags=["Newton's Laws", 'Classical Mechanics', 'Free-Body Diagrams'],
    )

    flashcards3 = [
        ("State Newton's First Law of Motion.",
         "An object at rest remains at rest, and an object in motion continues at constant velocity, unless acted on by a net external force (the law of inertia)."),
        ("State Newton's Second Law as an equation and define each term.",
         "$F_{\\text{net}} = ma$ — net force (N) equals mass (kg) times acceleration (m s$^{-2}$). The acceleration is in the same direction as the net force."),
        ("State Newton's Third Law of Motion.",
         "For every action force, there is an equal and opposite reaction force acting on a different object. Forces always occur in action–reaction pairs."),
        ("On an inclined plane at angle θ, what are the components of weight parallel and perpendicular to the slope?",
         "Parallel (down the slope): $mg\\sin\\theta$. Perpendicular (into the slope): $mg\\cos\\theta$. The normal force $N = mg\\cos\\theta$ when the object is on a frictionless slope."),
        ("Why do action–reaction force pairs not cancel each other out?",
         "Because they act on *different* objects. Newton's second law applies to forces on a single object — forces from different objects cannot cancel."),
        ("What is inertia and how is it measured?",
         "Inertia is an object's resistance to changes in its state of motion. It is measured by mass — the greater the mass, the greater the inertia."),
        ("A 5 kg box is pushed with a 20 N force on a frictionless surface. What is its acceleration?",
         "$a = F/m = 20\\text{ N} / 5\\text{ kg} = 4\\text{ m s}^{-2}$"),
        ("What four forces are commonly drawn on a free-body diagram for an object on a surface?",
         "Weight ($mg$ downward), normal force ($N$, perpendicular to surface), friction ($f$, opposing motion), and any applied force or tension."),
    ]
    for i, (front, back) in enumerate(flashcards3):
        Flashcard.objects.create(lecture=lec3, front=front, back=back, order=i)

    lec4 = Lecture.objects.create(
        course=phys,
        title='Work, Energy, and Conservation Laws',
        summary='Definitions of work, kinetic and potential energy, the work–energy theorem, and conservation of mechanical energy with application to frictionless systems.',
        transcript=(
            'In this lecture we look at energy — specifically work, kinetic energy, potential energy, and conservation. '
            'Work is done when a force causes displacement. The formula is W = Fd cos theta, '
            'where theta is the angle between the force vector and the displacement vector. '
            'If the force is perpendicular to displacement, no work is done. '
            'Kinetic energy is the energy of motion: KE = one half m v squared. '
            'Gravitational potential energy is the energy stored by height: PE = mgh, '
            'where g is 9.8 metres per second squared on Earth. '
            'The work–energy theorem states that the net work done on an object equals its change in kinetic energy. '
            'Conservation of mechanical energy says that in the absence of friction, '
            'the total mechanical energy — kinetic plus potential — remains constant. '
            'So you can set KE1 + PE1 equal to KE2 + PE2 to solve problems. '
            'Power is the rate of doing work: P = W over t, measured in watts.'
        ),
        notes=(
            '## Key Takeaways\n\n'
            '- Work = force × displacement × cos θ; only the component of force along the displacement does work.\n'
            '- Kinetic energy: $KE = \\frac{1}{2}mv^2$; gravitational PE: $U = mgh$.\n'
            '- Work–energy theorem: net work = change in KE.\n'
            '- Conservation of mechanical energy: $KE_1 + U_1 = KE_2 + U_2$ (no friction).\n'
            '- Power is the rate of energy transfer: $P = W/t$ (watts).\n\n'
            '## Work\n\n'
            '$$W = Fd\\cos\\theta$$\n\n'
            '- $F$ = applied force (N), $d$ = displacement (m), $\\theta$ = angle between force and displacement.\n'
            '- Work is a **scalar** (no direction); can be positive, negative, or zero.\n'
            '- Zero work examples: carrying a bag horizontally ($\\theta = 90°$), holding a weight still ($d = 0$).\n\n'
            '## Kinetic Energy\n\n'
            '$$KE = \\frac{1}{2}mv^2$$\n\n'
            '- Always **non-negative**; increases with the square of speed.\n\n'
            '## Gravitational Potential Energy\n\n'
            '$$U_g = mgh$$\n\n'
            '- $h$ is measured from an arbitrary reference height.\n'
            '- As an object falls, $U_g$ decreases and $KE$ increases.\n\n'
            '## Work–Energy Theorem\n\n'
            '$$W_{\\text{net}} = \\Delta KE = KE_f - KE_i$$\n\n'
            '- Net work done on an object equals its change in kinetic energy.\n'
            '- A negative net work means the object slows down.\n\n'
            '## Conservation of Mechanical Energy\n\n'
            '$$KE_1 + U_1 = KE_2 + U_2$$\n\n'
            '- Valid when only **conservative forces** (gravity, springs) do work — no friction or air resistance.\n'
            '- Useful for finding speeds at different heights without knowing the path.\n\n'
            '## Power\n\n'
            '$$P = \\frac{W}{t} = Fv$$\n\n'
            '- Measured in **watts** (W = J s$^{-1}$).\n'
            '- Average power = total work ÷ total time.\n'
        ),
        tags=['Kinetic Energy', 'Potential Energy', 'Conservation of Energy', 'Work-Energy Theorem'],
    )

    flashcards4 = [
        ('What is the formula for work and what does each symbol represent?',
         '$W = Fd\\cos\\theta$ — $F$ is the applied force (N), $d$ is the displacement (m), and $\\theta$ is the angle between the force and displacement vectors.'),
        ('Under what condition is zero work done by a force?',
         'When the force is perpendicular to the displacement ($\\theta = 90°$, $\\cos 90° = 0$), or when there is no displacement ($d = 0$).'),
        ('What is the formula for kinetic energy?',
         '$KE = \\frac{1}{2}mv^2$ — where $m$ is mass (kg) and $v$ is speed (m s$^{-1}$).'),
        ('State the work–energy theorem.',
         'The net work done on an object equals its change in kinetic energy: $W_{\\text{net}} = \\Delta KE = KE_f - KE_i$.'),
        ('What is gravitational potential energy and how is it calculated?',
         'Energy stored due to an object\'s height above a reference level: $U_g = mgh$, where $g \\approx 9.8$ m s$^{-2}$.'),
        ('State the law of conservation of mechanical energy.',
         'In the absence of friction, total mechanical energy is constant: $KE_1 + U_1 = KE_2 + U_2$.'),
        ('A 2 kg ball falls from a height of 5 m. What is its speed just before it hits the ground? (g = 10 m/s²)',
         'Using conservation of energy: $mgh = \\frac{1}{2}mv^2$ → $v = \\sqrt{2gh} = \\sqrt{2 \\times 10 \\times 5} = 10$ m s$^{-1}$.'),
        ('What is power and what are its SI units?',
         'Power is the rate of doing work: $P = W/t = Fv$. SI unit is the **watt** (W = J s$^{-1}$).'),
    ]
    for i, (front, back) in enumerate(flashcards4):
        Flashcard.objects.create(lecture=lec4, front=front, back=back, order=i)


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
    _seed_demo_data(user)
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

    def _stream():
        result_holder = [None]
        error_holder = [None]
        done = threading.Event()

        def _worker():
            try:
                result_holder[0] = _run_gemini(parts)
            except Exception as e:
                error_holder[0] = e
            finally:
                done.set()

        threading.Thread(target=_worker, daemon=True).start()

        # Yield keep-alive newlines every 3s so Railway's edge proxy doesn't time out
        while not done.wait(timeout=3):
            yield b'\n'

        if error_holder[0]:
            e = error_holder[0]
            if isinstance(e, TimeoutError):
                yield json.dumps({'error': 'Generation timed out. Please try again.'}).encode()
            elif isinstance(e, json.JSONDecodeError):
                yield json.dumps({'error': 'Gemini returned malformed JSON. Try again.'}).encode()
            else:
                print(f'[GEMINI ERROR] {e}')
                yield json.dumps({'error': f'Generation failed: {str(e)}'}).encode()
            return

        result = result_holder[0]
        if result.get('insufficient_content'):
            reason = result.get('reason', 'Not enough content to generate study materials.')
            yield json.dumps({'error': f'Not enough content to generate flashcards: {reason} Please add more audio, photos, or files.'}).encode()
            return

        print(f'[GEMINI] flashcards count: {len(result.get("flashcards", []))}')
        result['transcript'] = transcript
        yield json.dumps(result).encode()

    return StreamingHttpResponse(_stream(), content_type='application/json')


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


@api_view(['DELETE', 'PATCH'])
@permission_classes([IsAuthenticated])
def flashcard_detail(request, pk):
    """Delete or update a single flashcard."""
    flashcard = get_object_or_404(Flashcard, pk=pk, lecture__course__user=request.user)
    if request.method == 'DELETE':
        flashcard.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    # PATCH
    serializer = FlashcardSerializer(flashcard, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


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
    '- MATH FORMATTING: Use LaTeX for all equations — inline $...$ and display $$...$$. '
    'CRITICAL: this is a JSON string, so every backslash must be doubled: \\\\frac, \\\\text, \\\\theta, \\\\vec, \\\\sum, \\\\int etc. '
    'Single backslash (\\frac) inside a JSON string produces garbage — always use \\\\frac.\n'
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
    "If a topic isn't covered in the lectures, say so clearly. "
    'Format your responses in markdown. '
    'For ALL mathematical expressions use LaTeX: inline $...$ and display $$...$$. '
    'Backslashes in LaTeX commands do NOT need to be doubled here (e.g. write \\frac, \\theta, \\text normally).'
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

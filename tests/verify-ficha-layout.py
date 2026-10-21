"""Render DOCX fixtures and verify page-one layout. Requires LibreOffice and pypdf."""
from pathlib import Path
import json
import shutil
import subprocess
import tempfile
from pypdf import PdfReader

root = Path(__file__).resolve().parents[1]
folder = root / 'tmp' / 'ficha'
headings = ['RECOMMENDATION', 'WARNINGS', 'GEMSTONE DETAILS', 'DIAMOND DETAILS',
            'METAL / VALUE', 'PERIOD / WORKMANSHIP / MAKER', 'SIZE / NOTES', 'CONDITION']
soffice = shutil.which('soffice')
if not soffice:
    raise SystemExit('LibreOffice soffice is required on PATH for rendered layout checks.')

def normalise(text):
    return ' '.join(text.split())

with tempfile.TemporaryDirectory() as profile:
    for name, pages in [('ring', 2), ('pearls', 2), ('long', 3)]:
        rendered = folder / 'word-rendered'
        rendered.mkdir(exist_ok=True)
        subprocess.run([soffice, f'-env:UserInstallation={Path(profile).as_uri()}', '--headless',
                        '--convert-to', 'pdf', '--outdir', str(rendered), str(folder / f'{name}.docx')],
                       check=True, timeout=60)
        record = json.loads((folder / f'{name}.json').read_text())
        for path in [folder / f'{name}.pdf', rendered / f'{name}.pdf']:
            reader = PdfReader(path)
            assert len(reader.pages) == pages, (path, len(reader.pages))
            first = normalise(reader.pages[0].extract_text())
            previous = -1
            for heading in headings:
                position = first.index(heading)
                assert position > previous, (path, heading)
                previous = position
            assert len(reader.pages[0].images) >= 1, (path, 'missing photograph')
            assert normalise(record['report']['predictedHammer']) in first
            assert normalise(record['report']['auctionHouseEstimate']) in first
            all_text = normalise(' '.join(page.extract_text() for page in reader.pages))
            for key in ['catalogueInformation', 'specialistAssessment', 'valuationRationale', 'conditionAndFollowUp']:
                assert normalise(record['report'][key]) in all_text, (path, key, 'text lost')
            for page in reader.pages:
                assert abs(float(page.mediabox.width) - 595.28) < 1
                assert abs(float(page.mediabox.height) - 841.89) < 1
            print(f'PASS {path.relative_to(root)}: {pages} A4 pages, photo, ordered tables, distinct prices, full text')

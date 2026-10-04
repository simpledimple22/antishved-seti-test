#!/usr/bin/env python3
"""
Разбор Test2.pdf (КМ-2) → questions_km2.json + images/km2/*  (+ отчёт для проверки).

PDF текстовый: «Вопрос: N - й» / «Ответ:» / варианты. Правильный вариант отмечен
зелёной галочкой — маленькой картинкой 15×12 слева от строки (или от картинки-варианта).
Схемы и варианты-формулы — картинки.

Особенности исходника, которые здесь исправляются:
  • визуальная строка разрезана на несколько «строк» (индексы, скобки) → склеиваем по рядам;
    нижние индексы пишем как _{нб}, верхние как ^{3} (рисует app.js);
  • в местах переноса в исходнике слова слиплись («верныйзнак», «Вкаком») → расклеиваем
    по морфологическому словарю (pymorphy3) + список исключений (термины предметной области);
  • часть формул в самом PDF потеряна → такие вопросы попадают в отчёт, а не в банк.

Запуск:  python3 scripts/extract_km2.py [--pdf Test2.pdf] [--out questions_km2.json]
Нужны: PyMuPDF, Pillow, pymorphy3, pymorphy3-dicts-ru.
"""
import json, re, os, collections, argparse, math
import pymupdf

ap = argparse.ArgumentParser()
ap.add_argument('--pdf', default='Test2.pdf')
ap.add_argument('--out', default='questions_km2.json')
ap.add_argument('--imgdir', default='images/km2')
ap.add_argument('--review', default='scripts/km2_review.json')
ap.add_argument('--no-glue', action='store_true', help='не расклеивать слова')
args = ap.parse_args()

doc = pymupdf.open(args.pdf)
os.makedirs(args.imgdir, exist_ok=True)

CHECK_MAX = 20            # галочка 15×12
RIGHT = 569.0             # правая граница текстовой колонки
SPACE_W = 3.2             # ширина пробела (11 pt)
RE_Q = re.compile(r'^Вопрос:\s*(\d+)\s*-\s*й')
WATERMARK = re.compile(r'123xyz\.ru', re.I)

# ───────── 1. строки → визуальные ряды ─────────
def page_lines(page, pno):
    out = []
    for b in page.get_text('rawdict')['blocks']:
        if b['type'] != 0:
            continue
        for l in b['lines']:
            sp = []
            for s in l['spans']:
                t = ''.join(c['c'] for c in s['chars'])
                if t != '':
                    sp.append(dict(s, text=t))
            if not sp or not ''.join(s['text'] for s in sp).strip():
                continue
            if max(s['size'] for s in sp) > 50 or WATERMARK.search(''.join(s['text'] for s in sp)):
                continue
            # ширина первого слова (до первого пробела) — нужна, чтобы отличить мягкий перенос от явного
            chars = [c for s in sp for c in s['chars']]
            first = []
            for c in chars:
                if c['c'].isspace():
                    if first: break
                    continue
                first.append(c)
            fw = (first[-1]['bbox'][2] - first[0]['bbox'][0]) if first else 0.0
            out.append(dict(page=pno, bbox=list(l['bbox']), spans=sp, first_w=fw))
    return out

def vover(a, b):
    lo, hi = max(a[1], b[1]), min(a[3], b[3])
    return max(0.0, hi - lo) / max(1e-6, min(a[3] - a[1], b[3] - b[1]))

def rows_of(lines):
    """Склеиваем «строки», лежащие в одном визуальном ряду и стыкующиеся по x."""
    n = len(lines)
    parent = list(range(n))
    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]; i = parent[i]
        return i
    for i in range(n):
        for j in range(n):
            if i == j: continue
            A, B = lines[i]['bbox'], lines[j]['bbox']
            if -1.5 <= B[0] - A[2] <= 3.5 and vover(A, B) >= 0.4:
                parent[find(i)] = find(j)
    groups = collections.defaultdict(list)
    for i in range(n):
        groups[find(i)].append(lines[i])
    rows = []
    for g in groups.values():
        g.sort(key=lambda l: l['bbox'][0])
        spans = [s for l in g for s in l['spans']]
        big = [s for s in spans if s['size'] >= 8]
        base = (max(big, key=lambda s: s['size']) if big else max(spans, key=lambda s: s['size']))['origin'][1]
        text = ''
        for s in spans:
            t = s['text']
            if 5 < s['size'] < 8 and big:
                dy = s['origin'][1] - base
                text += (f'_{{{t.strip()}}}' if dy > 0.8 else f'^{{{t.strip()}}}')
            else:
                text += t
        text = re.sub(r'\s+([_^]\{)', r'\1', text)
        bb = [min(l['bbox'][0] for l in g), min(l['bbox'][1] for l in g), max(l['bbox'][2] for l in g), max(l['bbox'][3] for l in g)]
        size = max(s['size'] for s in spans)
        rows.append(dict(kind='text', page=g[0]['page'], y=bb[1], y1=bb[3], x0=bb[0], x1=bb[2], text=text.strip(), size=size, first_w=g[0]['first_w']))
    return rows

items = []
for pno, page in enumerate(doc):
    rows = rows_of(page_lines(page, pno))
    for im in page.get_image_info(xrefs=True):
        bb = im['bbox']
        small = im['width'] <= CHECK_MAX and im['height'] <= CHECK_MAX
        rows.append(dict(kind='check' if small else 'img', page=pno, y=bb[1], y1=bb[3], x0=bb[0], x1=bb[2], xref=im['xref'], w=im['width'], h=im['height']))
    rows.sort(key=lambda d: (round(d['y']), d['x0']))
    items.extend(rows)

# заголовок «КМ-2_осень_2023» вверху файла
items = [it for it in items if not (it['kind'] == 'text' and re.match(r'^КМ-\d', it['text']) and it['size'] >= 10.5)]

# ───────── 2. галочки → ближайшая строка/картинка (один раз) ─────────
checks = [it for it in items if it['kind'] == 'check']
used_checks = set()
def attach_checks():
    cand = [it for it in items if it['kind'] != 'check']
    for i, c in enumerate(checks):
        cy = (c['y'] + c['y1']) / 2
        best, best_d = None, 1e9
        for it in cand:
            if it['page'] != c['page'] or abs(c['x1'] - it['x0']) >= 3 or it.get('correct'):
                continue
            if it['kind'] == 'text':
                d = abs(cy - (it['y'] + it['y1']) / 2)
            else:
                d = 0 if it['y'] - 4 <= cy <= it['y1'] + 4 else min(abs(cy - it['y']), abs(cy - it['y1']))
            if d < 10 and d < best_d:
                best, best_d = it, d
        if best is not None:
            best['correct'] = True
            used_checks.add(i)
attach_checks()

# ───────── 3. конечный автомат ─────────
# Сначала раскладываем строки по вопросам (без склейки вариантов), затем решаем, какие
# строки вариантов — продолжения предыдущих.
questions, cur, mode = [], None, None
for it in items:
    if it['kind'] == 'check':
        continue
    if it['kind'] == 'text':
        m = RE_Q.match(it['text'])
        if m:
            cur = dict(n=int(m.group(1)), page=it['page'] + 1, stem_lines=[], figures=[], rows=[])
            questions.append(cur); mode = 'stem'
            continue
        if cur is None:
            continue
        if it['text'].startswith('Ответ:') and it['size'] < 10:
            mode = 'opts'
            continue
        if mode == 'stem':
            cur['stem_lines'].append(it['text'])
        else:
            cur['rows'].append(dict(kind='text', text=it['text'], correct=bool(it.get('correct')), x1=it['x1'], first_w=it['first_w']))
    elif it['kind'] == 'img' and cur is not None:
        if mode == 'stem':
            cur['figures'].append(it)
        else:
            cur['rows'].append(dict(kind='img', it=it, correct=bool(it.get('correct')), x1=it['x1'], first_w=0))

# Склейка строк вариантов. Геометрия (слово физически не влезало) — необходимое условие переноса,
# но не достаточное: длинные варианты на всю ширину дают ложные срабатывания. Поэтому решения
# по каждому стыку (вопрос.номер_строки) приняты просмотром текста и зафиксированы явным списком.
# Галочка на хвосте склеенного варианта относится ко всему варианту.
MERGE = set("""
15.1 15.3 15.6
19.3 19.5 19.7 19.9
20.4 20.6 20.8 20.10
37.2
49.1 49.3 49.5 49.7
57.2 58.2
116.1 116.3 116.5 116.7 116.8 116.10 116.12 116.14
162.5
179.1 179.3 179.5 179.7 179.8 179.10 179.12 179.14
180.1 180.3 180.5 180.7 180.8 180.10 180.12 180.14
292.2 293.3
302.3 302.5
319.1 320.1 321.1
349.2 350.1 350.5 351.1 351.5 352.1 352.3
371.3 372.3
379.1 379.3 379.6
403.1 403.3 403.5 403.7
405.4 406.4
417.1 417.3 417.5 417.6 417.8 417.10 417.11 417.13
418.1 418.3 418.4 418.6 418.7 418.9 418.11 418.12 418.14
""".split())
MERGE |= set(os.environ.get('KM2_EXTRA_MERGE', '').split())

merge_log = []
for q in questions:
    rows = q['rows']
    opts = []
    for idx, r in enumerate(rows):
        prev = opts[-1] if opts else None
        if prev and prev['kind'] == 'text' and r['kind'] == 'text' and f"{q['n']}.{idx}" in MERGE:
            prev['text'] += ' ' + r['text']; prev['_x1'] = r['x1']; prev['wrapped'] = True
            prev['correct'] = prev['correct'] or r['correct']
            merge_log.append(f"{q['n']}.{idx}")
            continue
        opts.append(dict(kind=r['kind'], text=r.get('text'), it=r.get('it'), correct=r['correct'], _x1=r['x1']))
    q['options'] = opts

# ───────── 4. расклейка слов ─────────
DOMAIN_OK = set()   # слова предметной области, неизвестные словарю, но верные
if os.path.exists('questions.json'):
    for q in json.load(open('questions.json', encoding='utf-8')):
        for t in [q['q']] + [o for o in q['options'] if isinstance(o, str)]:
            DOMAIN_OK.update(w.lower() for w in re.findall(r'[А-Яа-яЁё]+', t))

splits_log = collections.Counter()
unknown_log = collections.Counter()

# Настоящие слова предметной области, которых нет в общем словаре: считаем известными
# (иначе они либо «расклеятся» зря, либо помешают расклеить соседей).
CUSTOM_KNOWN = set("""
шунтирующий шунтирующих шунтирующего шунтирующие шунтирующей шунтовых шунтовые шунтовым шунтовой шунтовая
электроприемник электроприемника электроприемнику электроприемником электроприемнике
электроприемники электроприемников электроприемникам электроприемниками электроприемниках
цепность шинопроводах шинопроводы северо недовозбуждения недовозбуждение недовозбужден недоотпуск
перевозбуждения перевозбуждение послеаварийный послеаварийного послеаварийном послеаварийная послеаварийной
послеаварийные послеаварийных послеаварийному послеаварийным
высокоманевренные низкоманевренные двухсменного односменного односменной трехсменного
полупиковая полупиковой полупиковые полупиковых теплосистемы двухцепной одноцепной двухцепные одноцепные
автотрансформатор автотрансформатора автотрансформаторов автотрансформаторах автотрансформаторы
электросистемы электросистема энергосистем энергосистема энергосистеме энергосистемы энергосистему
энергообъединение энергообъединения электроэнергетическая электроэнергетическое электроэнергетика
электроэнергетики электроэнергетическую электросетевой электросетевая электросетевые электросетевых
""".split())
# сокращения: допускаются как части склейки, выводятся ЗАГЛАВНЫМИ
ABBR = set('рпн нн вн сн пс пбв лэп тп кэс тэц гэс аэс гаэс тэс эс птэ пуэ гост'.split())
PROPER = {'россии': 'России', 'россия': 'Россия', 'кольской': 'Кольской', 'гоэлро': 'ГОЭЛРО'}
ONE_FIRST = set('вксуояаи')      # односимвольный предлог в начале склейки («Вкаком»)
ONE_LAST = set('вксуои')         # односимвольный предлог/союз в конце склейки («приводитк»)

def make_fixer():
    import pymorphy3
    morph = pymorphy3.MorphAnalyzer()
    cache = {}
    def known(w):
        if w not in cache:
            cache[w] = (w in CUSTOM_KNOWN) or (w in ABBR) or morph.word_is_known(w)
        return cache[w]
    freq = collections.Counter()
    for r in questions:
        for t in r['stem_lines'] + [o['text'] for o in r['options'] if o['kind'] == 'text']:
            for w in re.findall(r'[а-яё]+', t.lower()):
                if known(w): freq[w] += 1

    def good(piece, first, last):
        if len(piece) == 1:
            return (first and piece in ONE_FIRST) or (last and piece in ONE_LAST)
        return known(piece)

    def split(word):
        w = word.lower(); n = len(w)
        best = {0: (0, 0.0, [])}
        for i in range(n):
            if i not in best: continue
            cnt, score, parts = best[i]
            for j in range(i + 1, n + 1):
                piece = w[i:j]
                if not good(piece, i == 0, j == n):
                    continue
                cand = (cnt + 1, score - math.log(1 + freq[piece]), parts + [piece])
                if j not in best or cand[:2] < best[j][:2]:
                    best[j] = cand
        if n in best and 2 <= len(best[n][2]) <= 3:
            return best[n][2]
        return None

    def fix_token(tok):
        low = tok.lower()
        if low in PROPER and len(tok) > 1:
            return PROPER[low]
        if len(low) < 5 or tok.isupper() or low in DOMAIN_OK or known(low):
            return tok
        parts = split(low)
        if not parts:
            unknown_log[low] += 1
            return tok
        splits_log[f'{low} → {" ".join(parts)}'] += 1
        parts = [p.upper() if p in ABBR else PROPER.get(p, p) for p in parts]
        if tok[0].isupper() and not parts[0][0].isupper():
            parts[0] = parts[0].capitalize()
        elif tok[0].isupper() and parts[0].isupper() and len(parts[0]) > 1 and parts[0] not in {p.upper() for p in ABBR}:
            pass
        return ' '.join(parts)

    return lambda text: re.sub(r'[А-Яа-яЁё]+', lambda m: fix_token(m.group(0)), text)

fix_text = (lambda s: s) if args.no_glue else make_fixer()
tidy = lambda s: re.sub(r'\s+', ' ', s).strip()

# ───────── 5. картинки ─────────
def save_image(it, name):
    xref = it['xref']
    path = f'{args.imgdir}/{name}.jpg'
    pix = pymupdf.Pixmap(doc, xref)
    info = doc.extract_image(xref)
    from PIL import Image
    if info.get('smask'):
        pix = pymupdf.Pixmap(pix, pymupdf.Pixmap(doc, info['smask']))
    if pix.alpha:
        im = Image.frombytes('RGBA', (pix.width, pix.height), pix.samples)
        base = Image.new('RGB', im.size, (255, 255, 255)); base.paste(im, mask=im.split()[3])
        base.save(path, quality=88)
    else:
        if pix.colorspace and pix.colorspace.n > 3:
            pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
        pix.pil_save(path, format='JPEG', quality=88)
    return path

# ───────── 6. сборка записей ─────────
out = []
for q in questions:
    stem = tidy(fix_text(' '.join(q['stem_lines'])))
    rec = dict(id=len(out) + 1, n=q['n'], q=stem, options=[], correct=[], page=q['page'])
    if q['figures']:
        rec['figures'] = [save_image(f, f"q{q['n']:03d}" + (f'_{k + 1}' if len(q['figures']) > 1 else '')) for k, f in enumerate(q['figures'])]
    for j, o in enumerate(q['options']):
        if o['kind'] == 'text':
            rec['options'].append(tidy(fix_text(o['text'])))
        else:
            rec['options'].append({'img': save_image(o['it'], f"q{q['n']:03d}_o{j + 1}")})
        if o['correct']:
            rec['correct'].append(j)
    if any(o.get('wrapped') for o in q['options'] if o['kind'] == 'text'):
        rec['wrapped'] = True
    out.append(rec)

# ───────── 7. финализация: исключаем неотвеченные, помечаем повреждённые, делим на разделы ─────────
SECTION_SIZE = 30
KIND_HINT = [(r'Поставьте в соответствии', 'задание на соответствие (пары заданы списком, ответа нет)'),
             (r'Упорядочите', 'задание на упорядочивание (списка-ответа в файле нет)')]

def damage_reason(r):
    """Признаки того, что в исходном PDF потеряна часть формулы/вариантов."""
    texts = [o for o in r['options'] if isinstance(o, str)]
    if re.search(r'\(\s*\)', r['q']):
        return 'в формулировке потеряна часть формулы'
    if re.search(r'соотношени', r['q']) and all(len(o) <= 3 for o in texts):
        return 'в формулировке потеряна часть формулы (какие величины сравниваются)'
    if len(set(texts)) < len(texts):
        return 'часть знаков (диапазонов, выражений) потеряна, поэтому разные варианты выглядят одинаково'
    short = [o for o in texts if len(o) <= 4]
    if len(short) >= 3 and not r.get('figures') and any(re.search(r'нет верного|нет правильного', o, re.I) for o in texts):
        return 'варианты (диапазоны, выражения) потеряли знаки'
    return None

active, skipped = [], []
for r in out:
    r['id'] = r['n']
    if not r['correct']:
        why = next((h for pat, h in KIND_HINT if re.search(pat, r['q'])), 'в файле у вопроса нет отметки правильного ответа')
        skipped.append(dict(n=r['n'], page=r['page'], q=r['q'][:160], reason=why))
        continue
    r['section'] = (r['n'] - 1) // SECTION_SIZE + 1
    lo, hi = (r['section'] - 1) * SECTION_SIZE + 1, r['section'] * SECTION_SIZE
    r['section_title'] = f'Вопросы {lo}–{min(hi, len(out))}'
    why = damage_reason(r)
    if why:
        r['uncertain'] = True
        r['note'] = f'В исходном файле {why}. Ответ стоит перепроверить по своему ключу.'
    r.pop('wrapped', None)
    active.append(r)

json.dump(active, open(args.out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
review = dict(splits=dict(splits_log), unknown=dict(unknown_log), skipped=skipped,
              uncertain=[dict(n=r['n'], page=r['page'], note=r['note'], q=r['q'][:120]) for r in active if r.get('uncertain')])
json.dump(review, open(args.review, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
out = active

md = ['# КМ-2: что проверить', '',
      f'В банк вошло **{len(active)}** из {len(active) + len(skipped)} вопросов. Источник — Test2.pdf (правильные ответы = зелёные галочки в файле).', '',
      f'## Исключено: {len(skipped)} (в файле нет правильного ответа)', '',
      'Чтобы вернуть их в тест, нужен ключ ответов — пришли его, и я добавлю.', '']
for x in skipped:
    md.append(f"- **№{x['n']}** (стр. {x['page']} PDF) — {x['reason']}. «{x['q'][:90]}»")
md += ['', f"## С пометкой ⚠: {sum(1 for r in active if r.get('uncertain'))} (в самом PDF потеряна часть формулы или знаков)", '',
       'В приложении они помечены ⚠ и собраны в режиме «Спорные вопросы». Ответ взят из галочки в файле, но условие в файле неполное.', '']
for r in active:
    if r.get('uncertain'):
        md.append(f"- **№{r['n']}** (стр. {r['page']} PDF) — {r['note']} «{r['q'][:90]}»")
open('ПРОВЕРИТЬ_КМ2.md', 'w', encoding='utf-8').write('\n'.join(md) + '\n')
print(f'в банк: {len(active)}; исключено без ключа: {len(skipped)}; с пометкой ⚠: {sum(1 for r in active if r.get("uncertain"))}')

nq = len(out)
print(f'вопросов: {nq}; галочек: {len(checks)}; привязано: {len(used_checks)}')
print('верных ответов у вопроса:', dict(sorted(collections.Counter(len(r["correct"]) for r in out).items())))
ns = [r['n'] for r in out]
print('номера:', min(ns), '…', max(ns), '| дубли:', [k for k, v in collections.Counter(ns).items() if v > 1], '| пропуски:', [k for k in range(min(ns), max(ns) + 1) if k not in ns])
print('с рисунком:', sum(1 for r in out if r.get('figures')), '| варианты-картинки:', sum(1 for r in out if any(isinstance(o, dict) for o in r['options'])), '| перенос внутри варианта:', sum(1 for r in out if r.get('wrapped')))
print('расклеено разных слов:', len(splits_log), '(вхождений', sum(splits_log.values()), ') | неизвестных токенов без разбиения:', len(unknown_log))

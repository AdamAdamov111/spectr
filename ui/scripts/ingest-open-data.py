#!/usr/bin/env python3
"""Ingest open datasets into ui/src/data/real/*.json (see SOURCES.md).

Usage: PYTHONPATH=<dir with openpyxl,xlrd> python3 scripts/ingest-open-data.py [SOURCE_DIR]
SOURCE_DIR must contain: jodi_ru.csv, f7.xls (EIA RBRTE), f8.xls (EIA RWTC), volve_q3.xlsx, ne50.geojson,
fields_wiki.txt, refin.txt. Missing raw files are downloaded (except Wikipedia wikitext, fetched via the API).
"""
import csv, json, math, os, re, sys, urllib.parse, urllib.request, zipfile, io, datetime as dt
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'src', 'data', 'real')
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', '.cache', 'open-data')
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) SPECTR-ingest/1.0'}
os.makedirs(OUT, exist_ok=True); os.makedirs(SRC, exist_ok=True)

def fetch(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 0: return dest
    print('download', url); req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, 'wb') as f: f.write(r.read())
    return dest

def wiki_raw(title, dest):
    if os.path.exists(dest): return dest
    url = 'https://ru.wikipedia.org/w/index.php?title=' + urllib.parse.quote(title) + '&action=raw'
    return fetch(url, dest)

def api(params):
    url = 'https://ru.wikipedia.org/w/api.php?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r: return json.load(r)

CACHE_FILE = os.path.join(SRC, 'wiki_coords_cache.json')
_coord_cache = json.load(open(CACHE_FILE, encoding='utf-8')) if os.path.exists(CACHE_FILE) else {}
def api_retry(params, tries=6):
    import time
    for k in range(tries):
        try: return api(params)
        except urllib.error.HTTPError as e:
            if e.code == 429 and k < tries - 1: time.sleep(3 * (k + 1)); continue
            raise
def coords(titles):
    """title -> (lat, lon) via MediaWiki GeoData; follows redirects; cached on disk."""
    todo = [t for t in titles if t not in _coord_cache]
    for i in range(0, len(todo), 12):
        chunk = todo[i:i + 12]
        d = api_retry({'action': 'query', 'prop': 'coordinates', 'titles': '|'.join(chunk), 'redirects': 1, 'format': 'json', 'coprimary': 'primary', 'colimit': 50})
        q = d.get('query', {})
        redir = {r['from']: r['to'] for r in q.get('redirects', [])}
        norm = {r['from']: r['to'] for r in q.get('normalized', [])}
        found = {}
        for p in q.get('pages', {}).values():
            c = p.get('coordinates')
            if c: found[p['title']] = (c[0]['lat'], c[0]['lon'])
        for t in chunk:
            t2 = norm.get(t, t); t2 = redir.get(t2, t2)
            _coord_cache[t] = found.get(t2)
        json.dump(_coord_cache, open(CACHE_FILE, 'w', encoding='utf-8'), ensure_ascii=False)
    return {t: tuple(_coord_cache[t]) if _coord_cache.get(t) else None for t in titles}

def clean(s):
    s = re.sub(r'<ref[^>]*/>', '', s); s = re.sub(r'<ref[^>]*>.*?</ref>', '', s, flags=re.S)
    s = re.sub(r'\{\{[^}]*\}\}', '', s); s = re.sub(r'<br\s*/?>', ' ', s)
    s = re.sub(r'\[\[([^\]|]*)\|([^\]]*)\]\]', r'\2', s); s = re.sub(r'\[\[([^\]]*)\]\]', r'\1', s)
    s = s.replace("'''", '').replace("''", ''); s = re.sub(r'<[^>]+>', '', s)
    return s.strip()

def link_title(cell):
    m = re.search(r'\[\[([^\]|]*)(?:\|[^\]]*)?\]\]', cell)
    return m.group(1).strip() if m else None

def num_year(cell):
    """Pick the (value, year) with the latest year; else the first number."""
    s = clean(cell).replace('\xa0', ' ')
    pairs = re.findall(r'(\d[\d\s]*(?:[.,]\d+)?)\s*\((\d{4})\)', s)
    if pairs:
        v, y = max(pairs, key=lambda p: int(p[1]))
        return float(v.replace(' ', '').replace(',', '.')), int(y)
    m = re.search(r'\d[\d\s]*(?:[.,]\d+)?', s)
    if not m: return None, None
    return float(m.group(0).replace(' ', '').replace(',', '.')), None

def table_rows(text, start_pat):
    i = text.find(start_pat)
    if i < 0: raise SystemExit('table not found: ' + start_pat)
    j = text.find('\n|}', i)
    body = text[i:j]
    body = re.sub(r'<ref[^>]*/>', '', body)                       # self-closing refs first (else the next regex swallows rows)
    body = re.sub(r'<ref[^>]*>.*?</ref>', '', body, flags=re.S)  # refs may span lines; drop them before splitting
    rows = re.split(r'\n\|-[^\n]*', body)[1:]
    out = []
    for r in rows:
        cells = []
        for line in r.strip().split('\n'):
            if line.startswith('|'):
                cells.extend(line[1:].split('||'))       # "| a || b" or one cell per line; empties preserved
            elif cells:
                cells[-1] += ' ' + line                  # continuation of the previous cell
        out.append([x.strip() for x in cells])
    return out

# ---------------------------------------------------------------- fields
def build_fields():
    txt = open(wiki_raw('Список нефтяных месторождений России', os.path.join(SRC, 'fields_wiki.txt')), encoding='utf-8').read()
    rows = table_rows(txt, '{| class="wikitable"')
    items = []
    for cells in rows:
        if len(cells) < 8 or not cells[0].startswith('[['): continue
        name = short_field_name(clean(cells[0])); title = link_title(cells[0])
        disc = num_year(cells[1])[0]; res = num_year(cells[3]); rem = num_year(cells[4]); prod = num_year(cells[5]); cum = num_year(cells[6])
        op = clean(cells[7]) if len(cells) > 7 else ''
        items.append({'name': name, 'wiki': title, 'discovered': int(disc) if disc else None, 'operator': op or None,
                      'reserves_mt': res[0], 'remaining_mt': rem[0], 'remaining_year': rem[1], 'production_ktd': prod[0], 'production_year': prod[1],
                      'cumulative_mt': cum[0], 'cumulative_year': cum[1]})
    cc = coords([f['wiki'] for f in items if f['wiki']])
    out = []
    for f in items:
        c = cc.get(f['wiki'])
        if not c: c = APPROX_FIELDS.get(f['name']) or APPROX_FIELDS.get(f['name'].split(' ')[0])
        if not c: print('  field without coordinates, skipped:', f['name'], '|', f['wiki']); continue
        f['lat'], f['lon'] = round(c[0], 4), round(c[1], 4)
        f['geo_source'] = 'wikipedia' if cc.get(f['wiki']) else 'approx'
        f['region'] = region_for(f['lat'], f['lon'], f['name'])
        out.append(f)
    out.sort(key=lambda f: -(f['reserves_mt'] or 0))
    return out

FIELD_DESCRIPTORS = ('нефтяное', 'нефтегазоконденсатное', 'нефтегазовое', 'газоконденсатное', 'нефтеконденсатное', 'вязконефтяное', 'газовое', 'газонефтяное', 'газонефтеконденсатное', 'нефтегазоконденсатного', 'месторождение', 'месторождения', 'месторождений')
def short_field_name(name):
    words = [w for w in name.replace('(', ' (').split(' ') if w]
    out = []
    for w in words:
        if w.lower().strip('(),') in FIELD_DESCRIPTORS: break
        out.append(w)
    return ' '.join(out) or name

APPROX_FIELDS = {  # fallbacks for pages without GeoData (lat, lon)
    'Лянторское': (61.6, 72.2), 'Салымская группа': (60.1, 71.5), 'Мамонтовское': (60.85, 72.3), 'Русское': (67.9, 78.7),
    'Тевлинско-Русскинское': (62.3, 73.9), 'Малобалыкское': (60.7, 71.9), 'Западно-Сургутское': (61.3, 73.2), 'Уренгойское': (66.2, 76.6),
    'Ванкорское': (67.8, 83.6), 'Талаканское': (59.9, 111.7), 'Верхнечонское': (58.8, 110.9), 'Юрубчено-Тохомское': (60.9, 100.6),
    'Куюмбинское': (61.4, 96.2), 'Арланское': (56.1, 54.9), 'Туймазинское': (54.6, 53.7), 'Шаимское': (60.2, 64.7), 'Приразломное': (69.25, 57.3),
    'Новопортовское': (67.7, 72.9), 'Сузунское': (68.9, 84.5), 'Тагульское': (68.5, 85.4), 'Пякяхинское': (67.6, 77.3), 'Ярегское': (63.3, 53.4),
    'Усинское': (66.2, 57.6), 'Возейское': (66.7, 57.5), 'Харьягинское': (67.2, 56.6), 'Южно-Хыльчуюское': (68.2, 57.0), 'Требса': (69.0, 56.5),
    'Титова': (68.9, 56.2), 'Имилорское': (61.9, 73.6), 'Северо-Даниловское': (58.3, 109.2), 'Ковыктинское': (55.8, 104.9), 'Среднеботуобинское': (61.6, 113.4),
    'Чаяндинское': (60.4, 118.0), 'Восточно-Мессояхское': (69.0, 78.6), 'Ромашкинское': (54.9, 52.3), 'Самотлорское': (61.1167, 76.75), 'Приобское': (61.0, 70.5),
    'Фёдоровское': (61.9, 73.9), 'Красноленинское': (61.8, 66.3), 'Повховское': (62.5, 74.8), 'Ватьёганское': (62.0, 74.8), 'Северо-Комсомольское': (63.9, 74.1),
    'Пограничное': (60.4, 74.3), 'Южно-Приобское': (60.8, 70.3), 'Восточно-Сургутское': (61.4, 73.6), 'Правдинское': (60.5, 72.1), 'Ромашкино': (54.9, 52.3),
    'Бавлинское': (54.4, 53.3), 'Новоелховское': (54.9, 52.0), 'Мухановское': (53.2, 51.5), 'Оренбургское': (51.6, 54.9), 'Астраханское': (46.9, 48.3),
    'Сахалин-1 (Чайво)': (52.5, 143.4), 'Пильтун-Астохское': (52.9, 143.4), 'Одопту': (53.1, 143.3), 'Лунское': (51.9, 143.7),
}

def region_for(lat, lon, name):
    if 143 < lon < 145 and 50 < lat < 54: return 'Сахалинская область'
    if lon > 105: return 'Республика Саха (Якутия)' if lat > 58 else 'Иркутская область'
    if 95 < lon <= 105: return 'Красноярский край' if lat > 57 else 'Иркутская область'
    if 80 < lon <= 95: return 'Красноярский край' if lat > 63 else 'Томская область'
    if 72 < lon <= 80 and lat > 65: return 'ЯНАО'
    if 60 < lon <= 80 and 59 <= lat <= 65: return 'ХМАО — Югра'
    if 60 < lon <= 80 and lat > 65: return 'ЯНАО'
    if 60 < lon <= 80 and lat < 59: return 'Тюменская область'
    if 50 < lon <= 60 and lat > 65: return 'Ненецкий АО'
    if 50 < lon <= 60 and 61 < lat <= 65: return 'Республика Коми'
    if 54.2 < lat < 56.7 and 47.5 < lon <= 54.2: return 'Республика Татарстан'
    if lat <= 52.2 and 50 < lon <= 62: return 'Оренбургская область'
    if 52.2 < lat <= 56.5 and 53.2 < lon <= 60: return 'Республика Башкортостан'
    if 52.2 < lat <= 56.5 and 47 < lon <= 53.2: return 'Самарская область'
    if 56.5 < lat <= 61 and 50 < lon <= 60: return 'Пермский край' if lon > 54 else 'Удмуртская Республика'
    if lon <= 50 and lat < 48: return 'Астраханская область'
    return ''

# ---------------------------------------------------------------- refineries
def build_refineries():
    txt = open(wiki_raw('Нефтеперерабатывающая промышленность России', os.path.join(SRC, 'refin.txt')), encoding='utf-8').read()
    i = txt.find('! НПЗ !! Контролирующий акционер'); start = txt.rfind('{|', 0, i)
    rows = table_rows(txt[start:], '{|')
    items = []
    for cells in rows:
        if len(cells) < 6 or not cells[0].startswith('[['): continue
        name = clean(cells[0]); title = link_title(cells[0])
        owner = clean(cells[1]); cap = num_year(cells[2])[0]; depth = num_year(cells[3])[0]
        district = clean(cells[4]); region = clean(cells[5]) if len(cells) > 5 else ''
        year = num_year(cells[6])[0] if len(cells) > 6 else None
        items.append({'name': name, 'wiki': title, 'owner': owner, 'capacity_mt': cap, 'depth': depth, 'district': district, 'region': region, 'commissioned': int(year) if year else None})
    cc = coords([r['wiki'] for r in items])
    out = []
    for r in items:
        c = cc.get(r['wiki']) or APPROX_REF.get(r['name'])
        if not c: print('  no coords for refinery', r['name']); continue
        r['lat'], r['lon'] = round(c[0], 4), round(c[1], 4); r['geo_source'] = 'wikipedia' if cc.get(r['wiki']) else 'approx'
        out.append(r)
    return out

APPROX_REF = {'Киришинефтеоргсинтез': (59.45, 32.05), 'Рязанский НПЗ': (54.58, 39.8), 'Лукойл-Нижегороднефтеоргсинтез': (56.2, 43.6), 'Ярославнефтеоргсинтез': (57.55, 39.95),
    'Лукойл-Волгограднефтепереработка': (48.5, 44.55), 'Лукойл-Пермьнефтеоргсинтез': (57.9, 56.1), 'Ангарская нефтехимическая компания': (52.5, 103.85), 'Газпром нефтехим Салават': (53.35, 55.95),
    'Башнефть-Уфанефтехим': (54.85, 56.1), 'Танеко': (55.6, 51.9), 'ТАИФ-НК': (55.6, 51.85), 'Башнефть-УНПЗ': (54.83, 56.07), 'Ново-Уфимский НПЗ (Новойл)': (54.84, 56.1), 'Афипский НПЗ': (44.9, 38.85),
    'Марийский НПЗ': (56.35, 47.6), 'Ильский НПЗ': (44.85, 38.55), 'Антипинский НПЗ': (57.1, 65.7), 'Орскнефтеоргсинтез': (51.2, 58.6), 'Ухтинский НПЗ': (63.55, 53.7), 'Хабаровский НПЗ': (48.5, 135.1),
    'Краснодарский НПЗ': (45.05, 39.05), 'Астраханский ГПЗ': (46.75, 48.25), 'Куйбышевский НПЗ': (53.1, 50.1), 'Нижнекамский НПЗ': (55.6, 51.9), 'Яйский НПЗ': (56.15, 86.45), 'Новошахтинский НПЗ': (47.7, 39.9),
    'Туапсинский НПЗ': (44.1, 39.08), 'Комсомольский НПЗ': (50.55, 137.0), 'Новокуйбышевский НПЗ': (53.1, 49.95), 'Тюменский НПЗ': (57.1, 65.7), 'Саратовский НПЗ': (51.47, 46.05), 'Новошахтинский ЗНП': (47.7, 39.9),
    'Сургутский ЗСК': (61.25, 73.5), 'Славянский НПЗ': (45.25, 38.1), 'Нижневартовское НПО': (60.9, 76.7), 'Анжерский НПЗ': (56.1, 86.05), 'Усинский НПЗ': (66.0, 57.5), 'Николаевский НПЗ': (53.15, 140.7), 'Итатский НПЗ': (56.15, 89.0), 'Стрежевской НПЗ': (60.73, 77.6)}

# ---------------------------------------------------------------- pipelines (curated; waypoints geolocated by settlement page)
PIPES = [
    dict(name='ВСТО-1', full='Восточная Сибирь — Тихий океан, 1-я очередь', operator='Транснефть', length_km=2694, diameter_mm=1220, capacity_mt=80, commissioned=2009,
         route=[('ГНПС-1 «Тайшет»', 'ГНПС', 'Тайшет'), ('НПС · Усть-Кут', 'НПС', 'Усть-Кут'), ('НПС · Ленск', 'НПС', 'Ленск'), ('НПС · Олёкминск', 'НПС', 'Олёкминск'), ('НПС · Алдан', 'НПС', 'Алдан'), ('НПС · Нерюнгри', 'НПС', 'Нерюнгри'), ('НПС · Тында', 'НПС', 'Тында'), ('НПС-21 «Сковородино»', 'НПС', 'Сковородино')]),
    dict(name='ВСТО-2', full='Восточная Сибирь — Тихий океан, 2-я очередь', operator='Транснефть', length_km=2046, diameter_mm=1067, capacity_mt=50, commissioned=2012,
         route=[('НПС-21 «Сковородино»', 'НПС', 'Сковородино'), ('НПС · Белогорск', 'НПС', 'Белогорск (Амурская область)'), ('НПС · Биробиджан', 'НПС', 'Биробиджан'), ('НПС · Хабаровск', 'НПС', 'Хабаровск'), ('НПС · Дальнереченск', 'НПС', 'Дальнереченск'), ('Порт Козьмино', 'терминал', 'Козьмино (Приморский край)')]),
    dict(name='Сковородино — Мохэ', full='Отвод ВСТО в КНР (Сковородино — Мохэ — Дацин)', operator='Транснефть', length_km=64, diameter_mm=720, capacity_mt=30, commissioned=2011,
         route=[('НПС-21 «Сковородино»', 'НПС', 'Сковородино'), ('Джалинда (граница с КНР)', 'узел', 'Джалинда (Амурская область)')]),
    dict(name='Дружба', full='Магистральный нефтепровод «Дружба», российский участок', operator='Транснефть', length_km=1400, diameter_mm=1220, capacity_mt=66, commissioned=1964,
         route=[('ГНПС «Лопатино» (Самара)', 'ГНПС', 'Самара'), ('НПС · Пенза', 'НПС', 'Пенза'), ('НПС «Никольское»', 'НПС', 'Никольское (Тамбовская область)'), ('НПС «Унеча»', 'НПС', 'Унеча'), ('Граница с Беларусью (Клинцы)', 'узел', 'Клинцы')]),
    dict(name='БТС-1', full='Балтийская трубопроводная система', operator='Транснефть', length_km=1450, diameter_mm=1020, capacity_mt=74, commissioned=2001,
         route=[('НПС «Ярославль-3»', 'ГНПС', 'Ярославль'), ('НПС · Кириши', 'НПС', 'Кириши'), ('Порт Приморск', 'терминал', 'Приморск (Ленинградская область)')]),
    dict(name='БТС-2', full='Балтийская трубопроводная система — 2', operator='Транснефть', length_km=998, diameter_mm=1067, capacity_mt=30, commissioned=2012,
         route=[('НПС «Унеча»', 'ГНПС', 'Унеча'), ('НПС «Андреаполь»', 'НПС', 'Андреаполь'), ('Порт Усть-Луга', 'терминал', 'Усть-Луга')]),
    dict(name='Заполярье — Пурпе — Самотлор', full='Заполярье — Пурпе — Самотлор', operator='Транснефть', length_km=1000, diameter_mm=1020, capacity_mt=45, commissioned=2016,
         route=[('ГНПС «Заполярье»', 'ГНПС', 'Тазовский'), ('НПС «Пурпе»', 'НПС', 'Пурпе'), ('НПС «Самотлор»', 'НПС', 'Нижневартовск')]),
    dict(name='Куюмба — Тайшет', full='Куюмба — Тайшет', operator='Транснефть', length_km=700, diameter_mm=720, capacity_mt=15, commissioned=2017,
         route=[('ГНПС «Куюмба»', 'ГНПС', 'Куюмба'), ('ГНПС-1 «Тайшет»', 'НПС', 'Тайшет')]),
    dict(name='Сургут — Полоцк', full='Сургут — Полоцк, российский участок', operator='Транснефть', length_km=3250, diameter_mm=1020, capacity_mt=45, commissioned=1981,
         route=[('ГНПС «Сургут»', 'ГНПС', 'Сургут'), ('НПС · Тобольск', 'узел', 'Тобольск'), ('НПС · Пермь', 'НПС', 'Пермь'), ('НПС · Нижний Новгород', 'НПС', 'Нижний Новгород'), ('НПС «Ярославль»', 'НПС', 'Ярославль'), ('НПС «Андреаполь»', 'НПС', 'Андреаполь'), ('Граница с Беларусью (Полоцк)', 'узел', 'Полоцк')]),
    dict(name='Нижневартовск — Курган — Самара', full='Нижневартовск — Курган — Куйбышев', operator='Транснефть', length_km=2150, diameter_mm=1220, capacity_mt=70, commissioned=1976,
         route=[('ГНПС «Самотлор»', 'ГНПС', 'Нижневартовск'), ('НПС · Тюмень', 'узел', 'Тюмень'), ('НПС · Курган', 'НПС', 'Курган'), ('НПС · Уфа', 'НПС', 'Уфа'), ('ГНПС «Лопатино» (Самара)', 'НПС', 'Самара')]),
    dict(name='Усть-Балык — Омск', full='Усть-Балык — Омск', operator='Транснефть', length_km=964, diameter_mm=1020, capacity_mt=25, commissioned=1967,
         route=[('ГНПС «Усть-Балык»', 'ГНПС', 'Нефтеюганск'), ('НПС · Тобольск', 'НПС', 'Тобольск'), ('Омский НПЗ', 'НПЗ', 'Омск')]),
    dict(name='Омск — Иркутск', full='Туймазы — Омск — Новосибирск — Иркутск (ТОН-2)', operator='Транснефть', length_km=2600, diameter_mm=720, capacity_mt=20, commissioned=1964,
         route=[('Омский НПЗ', 'НПЗ', 'Омск'), ('НПС · Новосибирск', 'НПС', 'Новосибирск'), ('НПС · Красноярск', 'НПС', 'Красноярск'), ('Ангарская НХК', 'НПЗ', 'Ангарск')]),
    dict(name='Туймазы — Омск', full='Туймазы — Уфа — Челябинск — Омск (ТОН-1)', operator='Транснефть', length_km=1330, diameter_mm=720, capacity_mt=15, commissioned=1955,
         route=[('ГНПС «Туймазы»', 'ГНПС', 'Туймазы'), ('НПС · Уфа', 'НПС', 'Уфа'), ('НПС · Челябинск', 'НПС', 'Челябинск'), ('Омский НПЗ', 'НПЗ', 'Омск')]),
    dict(name='Холмогоры — Клин', full='Холмогоры — Клин', operator='Транснефть', length_km=2430, diameter_mm=1220, capacity_mt=65, commissioned=1979,
         route=[('ГНПС «Холмогоры»', 'ГНПС', 'Ноябрьск'), ('НПС · Сургут', 'НПС', 'Сургут'), ('НПС · Пермь', 'НПС', 'Пермь'), ('НПС · Нижний Новгород', 'НПС', 'Нижний Новгород'), ('НПС «Клин» (Московский НПЗ)', 'НПС', 'Клин')]),
    dict(name='Тихорецк — Новороссийск', full='Тихорецк — Новороссийск', operator='Транснефть', length_km=270, diameter_mm=1020, capacity_mt=40, commissioned=1978,
         route=[('НПС «Тихорецкая»', 'ГНПС', 'Тихорецк'), ('НПС · Крымск', 'НПС', 'Крымск'), ('Порт Новороссийск (Шесхарис)', 'терминал', 'Новороссийск')]),
    dict(name='Баку — Новороссийск', full='Баку — Новороссийск, российский участок', operator='Транснефть', length_km=830, diameter_mm=720, capacity_mt=5, commissioned=1997,
         route=[('ГНПС · Махачкала', 'ГНПС', 'Махачкала'), ('НПС · Будённовск', 'НПС', 'Будённовск'), ('НПС «Тихорецкая»', 'НПС', 'Тихорецк'), ('Порт Новороссийск (Шесхарис)', 'терминал', 'Новороссийск')]),
    dict(name='КТК', full='Каспийский трубопроводный консорциум, Тенгиз — Новороссийск', operator='КТК', length_km=1511, diameter_mm=1016, capacity_mt=67, commissioned=2001,
         route=[('НПС «Тенгиз»', 'ГНПС', 'Тенгиз'), ('НПС · Атырау', 'НПС', 'Атырау'), ('НПС «Астраханская»', 'НПС', 'Астрахань'), ('НПС «Кропоткинская»', 'НПС', 'Кропоткин (Краснодарский край)'), ('Морской терминал КТК (Южная Озереевка)', 'терминал', 'Новороссийск')]),
]
APPROX_WP = {'Тайшет': (55.93, 98.02), 'Усть-Кут': (56.79, 105.77), 'Ленск': (60.73, 114.93), 'Олёкминск': (60.37, 120.42), 'Алдан': (58.6, 125.4), 'Нерюнгри': (56.66, 124.72), 'Тында': (55.15, 124.72),
    'Сковородино': (54.0, 123.94), 'Белогорск (Амурская область)': (50.92, 128.47), 'Биробиджан': (48.79, 132.92), 'Хабаровск': (48.48, 135.07), 'Дальнереченск': (45.93, 133.73), 'Козьмино (Приморский край)': (42.73, 133.05),
    'Джалинда (Амурская область)': (53.47, 123.9), 'Самара': (53.2, 50.15), 'Пенза': (53.2, 45.0), 'Никольское (Тамбовская область)': (52.4, 41.6), 'Унеча': (52.85, 32.68), 'Клинцы': (52.75, 32.24),
    'Ярославль': (57.63, 39.87), 'Кириши': (59.45, 32.02), 'Приморск (Ленинградская область)': (60.37, 28.61), 'Андреаполь': (56.65, 32.26), 'Усть-Луга': (59.67, 28.3), 'Тазовский': (67.47, 78.72), 'Пурпе': (64.48, 76.7),
    'Нижневартовск': (60.94, 76.57), 'Куюмба': (61.4, 96.2), 'Сургут': (61.25, 73.42), 'Тобольск': (58.2, 68.26), 'Пермь': (58.01, 56.23), 'Нижний Новгород': (56.33, 44.0), 'Полоцк': (55.49, 28.77),
    'Тюмень': (57.15, 65.53), 'Курган': (55.44, 65.34), 'Уфа': (54.74, 55.97), 'Нефтеюганск': (61.1, 72.6), 'Омск': (54.99, 73.37), 'Новосибирск': (55.03, 82.92), 'Красноярск': (56.01, 92.87), 'Ангарск': (52.54, 103.89),
    'Туймазы': (54.6, 53.7), 'Челябинск': (55.16, 61.4), 'Ноябрьск': (63.2, 75.45), 'Клин': (56.33, 36.73), 'Тихорецк': (45.85, 40.13), 'Крымск': (44.93, 37.98), 'Новороссийск': (44.72, 37.77), 'Махачкала': (42.98, 47.5),
    'Будённовск': (44.78, 44.15), 'Тенгиз': (46.25, 53.4), 'Атырау': (47.1, 51.9), 'Астрахань': (46.35, 48.04), 'Кропоткин (Краснодарский край)': (45.43, 40.58)}

def build_pipelines():
    titles = sorted({wp[2] for p in PIPES for wp in p['route']})
    cc = coords(titles)
    out = []
    for p in PIPES:
        route = []
        for name, kind, title in p['route']:
            c = cc.get(title); src = 'wikipedia'
            if not c: c = APPROX_WP[title]; src = 'approx'
            route.append({'name': name, 'kind': kind, 'lat': round(c[0], 3), 'lon': round(c[1], 3), 'geo_source': src, 'place': title.split(' (')[0]})
        q = dict(p); q['route'] = route; out.append(q)
    return out

# ---------------------------------------------------------------- series
def build_series():
    jodi_csv = os.path.join(SRC, 'jodi_ru.csv')
    if not os.path.exists(jodi_csv):
        z = fetch('https://www.jodidata.org/_resources/files/downloads/oil-data/world_Primary_CSV.zip', os.path.join(SRC, 'jodi.zip'))
        with zipfile.ZipFile(z) as zf, open(jodi_csv, 'w', encoding='utf-8') as out:
            name = [n for n in zf.namelist() if n.endswith('.csv')][0]
            with io.TextIOWrapper(zf.open(name), encoding='utf-8') as f:
                for line in f:
                    if line.startswith('RU,'): out.write(line)
    flows = {'INDPROD': 'production_kt', 'REFINOBS': 'refinery_intake_kt', 'TOTEXPSB': 'exports_kt'}
    data = defaultdict(dict)
    with open(jodi_csv, encoding='utf-8') as f:
        for row in csv.reader(f):
            if len(row) < 6 or row[2] != 'TOTCRUDE' or row[4] != 'KTONS' or row[3] not in flows: continue
            try: data[row[1]][flows[row[3]]] = round(float(row[5]), 1)
            except ValueError: pass
    months = sorted(m for m in data if re.match(r'^\d{4}-\d{2}$', m))
    jodi = {'source': 'JODI-Oil World Primary database (Joint Organisations Data Initiative)', 'url': 'https://www.jodidata.org/_resources/files/downloads/oil-data/world_Primary_CSV.zip', 'file_date': '2026-08-19',
            'country': 'RU', 'product': 'TOTCRUDE', 'unit': 'KTONS', 'months': months}
    for k in flows.values(): jodi[k] = [data[m].get(k) for m in months]
    import xlrd
    def eia(fname, url):
        path = fetch(url, os.path.join(SRC, fname)); b = xlrd.open_workbook(path); s = b.sheet_by_index(1)
        dates, vals = [], []
        for r in range(3, s.nrows):
            d, v = s.row_values(r)[:2]
            if not d or v in ('', None): continue
            day = dt.date(1899, 12, 30) + dt.timedelta(days=int(d)); dates.append(day.isoformat()); vals.append(round(float(v), 2))
        return dates, vals
    bd, bv = eia('f7.xls', 'https://www.eia.gov/dnav/pet/hist_xls/RBRTEd.xls'); wd, wv = eia('f8.xls', 'https://www.eia.gov/dnav/pet/hist_xls/RWTCd.xls')
    cut = '2023-09-01'
    brent = {'source': 'EIA, Europe Brent Spot Price FOB (RBRTE), daily', 'url': 'https://www.eia.gov/dnav/pet/hist_xls/RBRTEd.xls', 'unit': 'USD/bbl', 'dates': [d for d in bd if d >= cut], 'values': [v for d, v in zip(bd, bv) if d >= cut]}
    wti = {'source': 'EIA, Cushing OK WTI Spot Price FOB (RWTC), daily', 'url': 'https://www.eia.gov/dnav/pet/hist_xls/RWTCd.xls', 'unit': 'USD/bbl', 'dates': [d for d in wd if d >= cut], 'values': [v for d, v in zip(wd, wv) if d >= cut]}
    acc = defaultdict(list)
    for d, v in zip(bd, bv):
        if d >= '2000-01': acc[d[:7]].append(v)
    bm = sorted(acc); brent_monthly = {'months': bm, 'values': [round(sum(acc[m]) / len(acc[m]), 2) for m in bm]}
    steo = build_steo()
    return {'jodi': jodi, 'brent': brent, 'wti': wti, 'brent_monthly': brent_monthly, 'steo': steo}

def build_steo():
    """EIA Short-Term Energy Outlook: Russia petroleum & other liquids production, monthly history + forecast (mb/d)."""
    import openpyxl
    try:
        path = fetch('https://www.eia.gov/outlooks/steo/xls/STEO_m.xlsx', os.path.join(SRC, 'STEO_m.xlsx'))
    except Exception as e:
        print('  STEO not available:', e); return None
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    for ws in wb.worksheets:
        if not ws.title.startswith('3b'): continue
        rows = list(ws.iter_rows(values_only=True))
        # row with year labels (only at January columns) and the row with month names below it
        MON = {'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'}
        yr_row = next((r for r in rows[:6] if r and any(re.fullmatch(r'\d{4}', str(x)) for x in r[2:6])), None)
        mo_row = next((r for r in rows[:6] if r and str(r[2]) in MON), None)
        if not yr_row or not mo_row: continue
        header = []; year = None
        for y, mth in zip(yr_row, mo_row):
            if y and re.fullmatch(r'\d{4}', str(y)): year = str(y)
            header.append(f'{year}-{MON[str(mth)]}' if year and str(mth) in MON else None)
        for r in rows:
            if not r or str(r[0]).strip() != 'papr_RS': continue
            months, vals = [], []
            for h, v in zip(header, r):
                if h and isinstance(v, (int, float)): months.append(h); vals.append(round(float(v), 2))
            if len(months) > 12:
                return {'source': f'EIA Short-Term Energy Outlook ({rows[3][0] if rows[3] and rows[3][0] else "monthly"}), table 3b, series papr_RS: Russia petroleum and other liquids production (history + forecast)', 'url': 'https://www.eia.gov/outlooks/steo/xls/STEO_m.xlsx', 'unit': 'mb/d', 'months': months, 'values': vals}
    print('  STEO: Russia row not found'); return None

# ---------------------------------------------------------------- volve
def build_volve():
    import openpyxl
    path = fetch('https://raw.githubusercontent.com/Philliec459/Altair-used-to-Visualize-and-Interrogate-well-by-well-Production-Data-from-Volve-Field/master/Query3.xlsx', os.path.join(SRC, 'volve_q3.xlsx'))
    wb = openpyxl.load_workbook(path, read_only=True); ws = wb.worksheets[0]
    wells = defaultdict(dict); xy = {}
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0: continue
        date, well, bopm, gpm, bwpm = row[0], row[1], row[2], row[3], row[4]
        if not (date and well): continue
        m = date.strftime('%Y-%m') if hasattr(date, 'strftime') else str(date)[:7]
        rec = wells[well].setdefault(m, {'oil': 0.0, 'gas': 0.0, 'water': 0.0, 'bhp': None})
        rec['oil'] = float(bopm or 0); rec['gas'] = float(gpm or 0); rec['water'] = float(bwpm or 0)
        if row[15] not in (None, ''): rec['bhp'] = float(row[15])
        if row[9] and row[10]: xy[well] = (float(row[9]), float(row[10]))
    out = []
    for w in sorted(wells):
        months = sorted(wells[w])
        out.append({'name': w, 'x': round(xy.get(w, (0, 0))[0], 2), 'y': round(xy.get(w, (0, 0))[1], 2), 'months': months,
                    'oil_bbl': [round(wells[w][m]['oil'], 1) for m in months], 'gas_bbl_eq': [round(wells[w][m]['gas'], 1) for m in months],
                    'water_bbl': [round(wells[w][m]['water'], 1) for m in months], 'bhp': [None if wells[w][m]['bhp'] is None else round(wells[w][m]['bhp'], 1) for m in months]})
    return {'source': 'Equinor Volve data village, monthly production per well (2008–2016)', 'licence': 'Equinor Open Data Licence (based on CC BY 4.0; attribution required; may not be sold)',
            'attribution': 'Volve data, Equinor and the former Volve licence partners', 'wells': out}

# ---------------------------------------------------------------- basemap
COUNTRIES = ['Russia', 'Kazakhstan', 'Belarus', 'Ukraine', 'Finland', 'Mongolia', 'China', 'Georgia', 'Azerbaijan', 'Norway', 'Sweden', 'Estonia', 'Latvia', 'Lithuania', 'Poland', 'Turkey', 'Japan', 'North Korea', 'South Korea', 'Iran', 'Uzbekistan', 'Turkmenistan', 'Kyrgyzstan', 'Armenia']
def dp(points, tol):
    if len(points) < 3: return points
    def dist(p, a, b):
        ax, ay = a; bx, by = b; px, py = p; dx, dy = bx - ax, by - ay
        if dx == dy == 0: return math.hypot(px - ax, py - ay)
        t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
        return math.hypot(px - (ax + t * dx), py - (ay + t * dy))
    stack = [(0, len(points) - 1)]; keep = [False] * len(points); keep[0] = keep[-1] = True
    while stack:
        i, j = stack.pop(); md, mi = 0, -1
        for k in range(i + 1, j):
            d = dist(points[k], points[i], points[j])
            if d > md: md, mi = d, k
        if md > tol: keep[mi] = True; stack.append((i, mi)); stack.append((mi, j))
    return [p for p, k in zip(points, keep) if k]

def build_basemap(tol=0.12):
    path = fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson', os.path.join(SRC, 'ne50.geojson'))
    d = json.load(open(path, encoding='utf-8'))
    out = []
    for f in d['features']:
        name = f['properties'].get('ADMIN')
        if name not in COUNTRIES: continue
        g = f['geometry']; polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        rings = []
        for poly in polys:
            ring = [(round(x, 2), round(y, 2)) for x, y in poly[0]]
            ring = dp(ring, tol)
            if len(ring) >= 12: rings.append([[x, y] for x, y in ring])
        iso = f['properties'].get('ISO_A2') or ''
        if iso in ('-99', ''): iso = {'Norway': 'NO', 'France': 'FR'}.get(name, name[:2].upper())
        out.append({'name': name, 'iso': iso, 'rings': rings})
    return {'source': 'Natural Earth 1:50m admin-0 countries (public domain)', 'tolerance_deg': tol, 'countries': out}

def dump(name, obj):
    p = os.path.join(OUT, name)
    with open(p, 'w', encoding='utf-8') as f: json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
    print(f'{name}: {os.path.getsize(p) / 1024:.0f} KB')

if __name__ == '__main__':
    fields = build_fields(); dump('fields.json', fields); print('  fields', len(fields), 'approx:', [f['name'] for f in fields if f['geo_source'] == 'approx'])
    refs = build_refineries(); dump('refineries.json', refs); print('  refineries', len(refs), 'approx:', [r['name'] for r in refs if r['geo_source'] == 'approx'])
    pipes = build_pipelines(); dump('pipelines.json', pipes); print('  pipelines', len(pipes), 'approx waypoints:', [w['name'] for p in pipes for w in p['route'] if w['geo_source'] == 'approx'])
    series = build_series(); dump('series.json', series); print('  jodi months', len(series['jodi']['months']), series['jodi']['months'][-1], 'brent days', len(series['brent']['dates']), series['brent']['dates'][-1])
    volve = build_volve(); dump('volve.json', volve); print('  volve wells', [(w['name'], len(w['months'])) for w in volve['wells']])
    bm = build_basemap(); dump('basemap.json', bm); print('  basemap countries', len(bm['countries']))

#!/usr/bin/env python3
"""
Plants one defect per failure class the OSM page gate claims to catch, runs the gate, and reports
whether the gate noticed. A check that has never failed on a planted defect is not a check.
"""
import pathlib
import shutil
import subprocess
import sys

# One line per plant at the top of the output, so a reader can see what is being proved.

# Resolved from this file, not from the caller's directory or a hard-coded checkout path.
REPO = pathlib.Path(__file__).resolve().parent.parent
MAP_KT = REPO / 'android-app/feature/market/src/main/kotlin/bd/info/bsdc/app/feature/market/MkOsmPinMap.kt'
LOGIC_KT = REPO / 'android-app/feature/market/src/main/kotlin/bd/info/bsdc/app/feature/market/MkLogic.kt'
ASSET = REPO / 'android-app/feature/market/src/main/assets/leaflet/leaflet.js'

PLANTS = [
    {
        'name': 'page prints a status line the parser cannot read',
        'file': str(MAP_KT),
        'from': "+ ' errors=' + tileErrors",
        'to': "+ ' errors:' + tileErrors",
        'expect': 'status line is parsed',
    },
    {
        'name': 'one page loses the CSS that sizes #map',
        'file': str(MAP_KT),
        'from': '  #map{position:absolute;inset:0;background:#e5e3df;font-family:sans-serif}\n  .leaflet-control-attribution{font-size:9px}\n</style>\n</head>\n<body>\n<div id="map"></div>\n<script src="${mapAssetUrl(MkLogic.OSM_MAP_JS_PATH)}"></script>\n<script>\n  var map = L.map(\'map\', { zoomControl: true, tap: true })',
        'to': '  #map{background:#e5e3df}\n  .leaflet-control-attribution{font-size:9px}\n</style>\n</head>\n<body>\n<div id="map"></div>\n<script src="${mapAssetUrl(MkLogic.OSM_MAP_JS_PATH)}"></script>\n<script>\n  var map = L.map(\'map\', { zoomControl: true, tap: true })',
        'expect': '#map is sized by the page',
    },
    {
        'name': 'tiles move to a host the interceptor blocks',
        'file': str(MAP_KT),
        'from': "L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png'",
        'to': "L.tileLayer('https://tile.internal.example/{z}/{x}/{y}.png'",
        'expect': 'tile URL template',
    },
    {
        'name': 'the read-only map grows a write-back bridge',
        'file': str(MAP_KT),
        'from': '  var marker = L.marker([$lat, $lng], { icon: readonlyIcon }).addTo(map);',
        'to': '  BsdcPin.pinChanged($lat, $lng);\n  var marker = L.marker([$lat, $lng], { icon: readonlyIcon }).addTo(map);',
        'expect': 'bridge presence matches',
    },
    {
        'name': 'the bundled library stops defining an entry point the page calls',
        'file': str(ASSET),
        'from': 'tileLayer',
        'to': 'TileLyr',
        'expect': 'defines L.tileLayer()',
    },
    {
        'name': 'the classifier stops accepting the asset path the page requests',
        'file': str(LOGIC_KT),
        'from': 'return path == OSM_MAP_JS_PATH || path == OSM_MAP_CSS_PATH',
        'to': 'return path == OSM_MAP_CSS_PATH',
        'expect': 'classifier accepts OSM_MAP_JS_PATH',
    },
]


def run_gate():
    proc = subprocess.run(
        ['node', 'scripts/osm-page-check.mjs'], cwd=REPO, capture_output=True, text=True
    )
    return proc.returncode, proc.stdout + proc.stderr


def main():
    backups = {}
    for path in {p['file'] for p in PLANTS}:
        backups[path] = pathlib.Path(path).read_bytes()
    results = []
    try:
        code, out = run_gate()
        results.append({'plant': 'clean tree', 'bit': code == 0, 'note': f'exit {code}, no failures expected'})
        if code != 0:
            print('clean tree already failing — fix that first\n', out)
            return 1
        for plant in PLANTS:
            f = pathlib.Path(plant['file'])
            s = f.read_text()
            n = s.count(plant['from'])
            if n < 1:
                results.append({'plant': plant['name'], 'bit': False, 'note': 'PLANT FAILED: anchor not found'})
                continue
            f.write_text(s.replace(plant['from'], plant['to'], 1))
            code, out = run_gate()
            hit = plant['expect'] in out
            results.append(
                {
                    'plant': plant['name'],
                    'bit': code != 0 and hit,
                    'note': f'exit {code}; expected substring {plant["expect"]!r} {"seen" if hit else "NOT SEEN"}',
                }
            )
            f.write_bytes(backups[plant['file']])
    finally:
        for path, data in backups.items():
            pathlib.Path(path).write_bytes(data)
        if ASSET.exists():
            pass

    width = max(len(r['plant']) for r in results)
    failed = 0
    for r in results:
        print(f"{'bit  ' if r['bit'] else 'MISS '} {r['plant']:<{width}}  {r['note']}")
        failed += 0 if r['bit'] else 1
    code, out = run_gate()
    print(f"\nrestored tree: exit {code}")
    if code != 0:
        print(out)
        return 1
    print(f'{len(results) - failed}/{len(results)} plants caught')
    return 0 if failed == 0 else 1


sys.exit(main())

#!/usr/bin/env python3
"""css/js 를 index.html 안으로 합쳐 단일 파일(당구연습.html)을 만든다.

사용법:  python3 -I ".../당구연습앱/build.py"
(구글드라이브 폴더에서는 cwd 접근이 막히므로 -I 옵션과 절대경로를 쓴다)
"""
import base64
import os
import re
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, '당구연습.html')


def read(rel):
    with open(os.path.join(BASE, rel), encoding='utf-8') as f:
        return f.read()


html = read('index.html')

css_tag = re.compile(r'[ \t]*<link rel="stylesheet" href="([^"]+)">\s*\n')
js_tag = re.compile(r'[ \t]*<script src="([^"]+)"></script>\s*\n')


def css_sub(m):
    return '<style>\n' + read(m.group(1)).strip() + '\n</style>\n'


def js_sub(m):
    return ('<script>\n/* ' + m.group(1) + ' */\n' +
            read(m.group(1)).strip() + '\n</script>\n')


html, n_css = css_tag.subn(css_sub, html)
html, n_js = js_tag.subn(js_sub, html)

if n_css != 1 or n_js < 1:
    sys.exit('인라인 대상을 찾지 못했습니다 (css %d, js %d)' % (n_css, n_js))

# 아이콘은 data URI 로 심는다. 단일 파일에는 sw.js 가 없으므로 manifest 는 뺀다
# (아이폰 '홈 화면에 추가'는 apple-touch-icon 과 apple-mobile-web-app-capable 만 있으면 된다).
with open(os.path.join(BASE, 'icons', 'apple-touch-icon.png'), 'rb') as f:
    icon_uri = 'data:image/png;base64,' + base64.b64encode(f.read()).decode()

html = re.sub(r'[ \t]*<link rel="manifest"[^>]*>\s*\n', '', html)
html = re.sub(r'(<link rel="(?:apple-touch-icon|icon)" href=")[^"]+(">)',
              lambda m: m.group(1) + icon_uri + m.group(2), html)
html = html.replace('<body>', '<body>\n<script>window.SINGLE_FILE = true;</script>', 1)

with open(OUT, 'w', encoding='utf-8') as f:
    f.write(html)

print('생성: %s  (%.0f KB, css %d / js %d 인라인)'
      % (OUT, len(html.encode('utf-8')) / 1024, n_css, n_js))

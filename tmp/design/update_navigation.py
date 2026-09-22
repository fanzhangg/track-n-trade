from pathlib import Path
import re

root = Path(__file__).resolve().parents[2]
pages = [
    ('index.html', '游戏原型'),
    ('docs/tracks_trade_mvp_design.html', '概念设计'),
    ('docs/tracks_trade_gameplay_spec.html', '玩法规格'),
]
for filename, label in pages:
    path = root / filename
    source = path.read_text(encoding='utf-8')
    prefix = '../' if filename.startswith('docs/') else ''
    links = []
    for target, title in pages:
        active = ' aria-current="page"' if target == filename else ''
        links.append(f'<a href="{prefix}{target}"{active}>{title}</a>')
    game_class = ' game-nav' if filename == 'index.html' else ''
    navigation = (f'<nav class="site-nav{game_class}" aria-label="页面导航">'
                  f'<a class="site-brand" href="{prefix}index.html">Tracks &amp; Trade</a>'
                  '<div class="site-pages">' + ''.join(links) + '</div></nav>')
    if filename == 'index.html':
        source = source.replace('<body>', '<body>\n' + navigation, 1)
    else:
        old = re.search(r'<nav>.*?</nav>', source, re.S)
        assert old, filename
        section_links = re.findall(r'<a href="#[^"]+">.*?</a>', old.group(), re.S)
        navigation += '\n<div class="page-sections" role="navigation" aria-label="本页章节">' + ''.join(section_links) + '</div>'
        source = source[:old.start()] + navigation + source[old.end():]
    source = source.replace('</head>', f'<link rel="stylesheet" href="{prefix}site-nav.css">\n</head>', 1)
    path.write_text(source, encoding='utf-8')
    print('Updated header:', filename)

from pathlib import Path
from html.parser import HTMLParser
import math

ROOT = Path(__file__).resolve().parents[2]
VOID = {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}

class Check(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids, self.links, self.stack, self.errors = [], [], [], []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs:
            self.ids.append(attrs['id'])
        if tag == 'a':
            self.links.append(attrs.get('href', ''))
        if tag not in VOID:
            self.stack.append(tag)

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if not self.stack or self.stack[-1] != tag:
            self.errors.append((tag, self.stack[-3:]))
        else:
            self.stack.pop()

for name in ['tracks_trade_gameplay_spec.html', 'tracks_trade_mvp_design.html']:
    path = ROOT / 'docs' / name
    source = path.read_text(encoding='utf-8')
    parser = Check()
    parser.feed(source)
    assert not parser.errors and not parser.stack, (name, parser.errors, parser.stack)
    assert len(parser.ids) == len(set(parser.ids)), name
    assert '{{' not in source, name
    for href in parser.links:
        if href.startswith('http'):
            continue
        relative, _, fragment = href.partition('#')
        target = path.parent / relative if relative else path
        assert target.exists(), href
        if fragment:
            other = Check()
            other.feed(target.read_text(encoding='utf-8'))
            assert fragment in other.ids, href
    print(name, ': HTML structure, unique anchors and local links OK')

coords = {(q,r) for q in range(-3,4) for r in range(-3,4) if max(abs(q),abs(r),abs(q+r)) <= 3}
assert len(coords) == 37
paths = [[(0,-1),(0,0)], [(-1,0),(0,0)], [(-1,0),(-2,1)],
         [(-2,1),(-1,1),(0,0)], [(0,0),(1,0),(2,-1)]]
directions = {(1,0),(1,-1),(0,-1),(-1,0),(-1,1),(0,1)}
for path in paths:
    assert all(c in coords and c not in {(-1,2),(1,-2)} for c in path)
    assert all((b[0]-a[0],b[1]-a[1]) in directions for a,b in zip(path,path[1:]))
assert math.ceil(12 * 1.15) == 14 and math.ceil(4 * 1.15) == 5
for capacity, expected in [(.5,30),(2,120)]:
    credit = sent = 0
    for _ in range(480):
        credit = min(.25, credit + capacity * .125)
        if credit >= .25:
            credit -= .25
            sent += .25
    assert sent == expected, (capacity, sent)
print('37-tile map, walkthrough adjacency, example prices and edge capacity arithmetic OK')

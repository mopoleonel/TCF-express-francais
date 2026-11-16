"""
Génère public/dark.css : le thème sombre de L'Atelier, calculé à partir des 4 feuilles de style.

Chaque règle qui contient une couleur est recopiée sous « html.atelier-dark … » avec ses couleurs
transformées (fonds clairs → sombres, textes sombres → clairs). Toutes les règles reçoivent le même
préfixe et gardent leur ordre : la cascade d'origine (états, :hover, .selected…) est donc respectée.
Relancer après une modification des CSS :  python3 scripts/build-dark.py
"""
import colorsys
import re
import sys
from pathlib import Path

import tinycss2

ROOT = Path(__file__).resolve().parent.parent / 'public'
SHEETS = ['style.css', 'theme.css', 'quest.css', 'voyage.css']
PREFIX = 'html.atelier-dark'

NAMED = {'white': '#ffffff', 'black': '#000000'}
COLOR_RE = re.compile(r'#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|\b(?:white|black)\b')

ROLE_BY_PROP = [
    (re.compile(r'^(color|-webkit-text-fill-color|caret-color|fill|stroke|text-decoration-color|accent-color)$'), 'text'),
    (re.compile(r'^(background|background-color|background-image)$'), 'bg'),
    (re.compile(r'^(border.*|outline.*|column-rule.*)$'), 'border'),
    (re.compile(r'^(box-shadow|text-shadow|filter)$'), 'shadow'),
]
VAR_ROLES = [
    (re.compile(r'shadow'), 'shadow'),
    (re.compile(r'(ink|text|muted|fg|title|label|copy)'), 'text'),
    (re.compile(r'(line|border|edge|ring|stroke|rule)'), 'border'),
    (re.compile(r'(bg|background|surface|paper|tint|soft|card|panel|wash|pale|cream|sky|light|chip|track)'), 'bg'),
]


def parse(c):
    c = NAMED.get(c.lower(), c)
    if c.startswith('#'):
        h = c[1:]
        if len(h) in (3, 4):
            h = ''.join(x * 2 for x in h)
        r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
        a = int(h[6:8], 16) / 255 if len(h) == 8 else 1.0
        return r, g, b, a
    nums = re.findall(r'[\d.]+%?', c)
    vals = [float(n[:-1]) * 2.55 if n.endswith('%') else float(n) for n in nums[:3]]
    a = nums[3] if len(nums) > 3 else '1'
    a = float(a[:-1]) / 100 if a.endswith('%') else float(a)
    return vals[0] / 255, vals[1] / 255, vals[2] / 255, a


def fmt(r, g, b, a):
    h = '#' + ''.join(f'{round(max(0, min(1, x)) * 255):02x}' for x in (r, g, b))
    return h if a >= 0.999 else h + f'{round(a * 255):02x}'


def transform(color, role):
    r, g, b, a = parse(color)
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    if role == 'auto':
        role = 'bg' if l > 0.82 else 'text' if (l < 0.35 and s < 0.45) else 'keep'
    if role == 'bg':
        if l > 0.55:
            if s < 0.08:  # blanc et gris neutres → bleu nuit, comme le tableau de bord TCF Express
                h, s = 0.61, 0.32
            l, s = 0.11 + (1 - l) * 0.9, min(s * 0.55, 0.45) if s >= 0.08 and h != 0.61 else s
    elif role == 'text':
        if l < 0.5 and s < 0.35:
            l = 0.95 - l * 0.5
        elif l < 0.45:
            l = 0.72 + (0.45 - l) * 0.3
    elif role == 'border':
        if l > 0.7:
            if s < 0.08:
                h, s = 0.61, 0.25
            l, s = 0.22 + (1 - l) * 0.6, min(s * 0.5, 0.35) if s >= 0.08 and h != 0.61 else s
    elif role == 'shadow':
        if l > 0.7:
            l, s = 0.05 + (1 - l) * 0.3, s * 0.4
    r, g, b = colorsys.hls_to_rgb(h, l, s)
    return fmt(r, g, b, a)


def role_for(prop):
    if prop.startswith('--'):
        for rx, role in VAR_ROLES:
            if rx.search(prop):
                return role
        return 'auto'
    for rx, role in ROLE_BY_PROP:
        if rx.match(prop):
            return role
    return None


def prefix_selectors(prelude):
    out = []
    for sel in tinycss2.serialize(prelude).split(','):
        sel = sel.strip()
        if not sel:
            continue
        if sel.startswith(':root'):
            out.append(PREFIX + sel[5:])
        elif re.match(r'^html\b', sel):
            out.append(PREFIX + sel[4:])
        else:
            out.append(f'{PREFIX} {sel}')
    return ', '.join(out)


VAR_RE = re.compile(r'var\(\s*(--[\w-]+)\s*(?:,[^()]*)?\)')
VAR_DEFS = {}   # --nom → ensemble des valeurs (couleurs simples)
VAR_USES = {}   # --nom → ensemble des rôles où la variable est utilisée


def walk(rules):
    for rule in rules:
        if rule.type == 'qualified-rule':
            yield rule
        elif rule.type == 'at-rule' and rule.lower_at_keyword in ('media', 'supports') and rule.content:
            yield from walk(tinycss2.parse_rule_list(rule.content, skip_comments=True, skip_whitespace=True))


def collect(rules):
    for rule in walk(rules):
        for d in tinycss2.parse_declaration_list(rule.content, skip_comments=True, skip_whitespace=True):
            if d.type != 'declaration':
                continue
            value = tinycss2.serialize(d.value).strip()
            if d.name.startswith('--'):
                if re.fullmatch(COLOR_RE.pattern, value):
                    VAR_DEFS.setdefault(d.name, set()).add(value.lower())
                continue
            role = role_for(d.lower_name)
            if role:
                for name in VAR_RE.findall(value):
                    VAR_USES.setdefault(name, set()).add(role)


def single(name):
    vals = VAR_DEFS.get(name)
    return next(iter(vals)) if vals and len(vals) == 1 else None


def convert_value(value, role):
    # Variable à valeur unique : on la remplace par sa couleur transformée selon l'usage (texte, fond…).
    value = VAR_RE.sub(lambda m: single(m.group(1)) or m.group(0), value) if role else value
    return COLOR_RE.sub(lambda m: transform(m.group(0), role), value)


def convert_rules(rules, depth=0):
    out = []
    for rule in rules:
        if rule.type == 'qualified-rule':
            decls = []
            for d in tinycss2.parse_declaration_list(rule.content, skip_comments=True, skip_whitespace=True):
                if d.type != 'declaration':
                    continue
                value = tinycss2.serialize(d.value).strip()
                if d.name.startswith('--'):
                    if single(d.name) or not re.fullmatch(COLOR_RE.pattern, value):
                        continue  # remplacée directement là où elle sert
                    uses = VAR_USES.get(d.name, set())
                    role = next(iter(uses)) if len(uses) == 1 else role_for(d.name)
                else:
                    role = role_for(d.lower_name)
                if not role:
                    continue
                if not COLOR_RE.search(value) and not any(single(n) for n in VAR_RE.findall(value)):
                    continue
                new = convert_value(value, role)
                decls.append(f'{d.name}: {new}{" !important" if d.important else ""};')
            if decls:
                out.append(f'{prefix_selectors(rule.prelude)} {{ {" ".join(decls)} }}')
        elif rule.type == 'at-rule' and rule.lower_at_keyword in ('media', 'supports') and rule.content:
            inner = convert_rules(tinycss2.parse_rule_list(rule.content, skip_comments=True, skip_whitespace=True), depth + 1)
            if inner:
                out.append(f'@{rule.at_keyword} {tinycss2.serialize(rule.prelude).strip()} {{\n' + '\n'.join(inner) + '\n}')
    return out


def main():
    parts = ['/* Généré par scripts/build-dark.py — ne pas modifier à la main. */',
             f'{PREFIX} {{ color-scheme: dark; }}']
    sheets = {n: tinycss2.parse_stylesheet((ROOT / n).read_text(encoding='utf-8'), skip_comments=True, skip_whitespace=True) for n in SHEETS}
    for rules in sheets.values():
        collect(rules)
    for name in SHEETS:
        rules = sheets[name] or tinycss2.parse_stylesheet((ROOT / name).read_text(encoding='utf-8'), skip_comments=True, skip_whitespace=True)
        parts.append(f'/* ── {name} ── */')
        parts.extend(convert_rules(rules))
    extra = ROOT / 'dark-extra.css'
    if extra.exists():
        parts.append('/* ── dark-extra.css (retouches manuelles) ── */')
        parts.append(extra.read_text(encoding='utf-8'))
    (ROOT / 'dark.css').write_text('\n'.join(parts) + '\n', encoding='utf-8')
    print('dark.css:', sum(p.count('{') for p in parts), 'règles')


if __name__ == '__main__':
    sys.exit(main())

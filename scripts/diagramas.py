#!/usr/bin/env python3
"""Genera los diagramas SVG animados de la documentación (docs/diagrams).

Animaciones SMIL (<animate>, <animateMotion>): GitHub las reproduce dentro del README.
Paleta del sistema de diseño de la extensión: lienzo negro, texto blanco, líneas de 1 px y la
franja tricolor (azul claro, azul, rojo) como único acento.

Uso: python3 scripts/diagramas.py
"""
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "docs" / "diagrams"

BG, CARD, CARD2, LINE = "#000000", "#141414", "#1f1f1f", "#3c3c3c"
INK, BODY, MUTED = "#ffffff", "#bbbbbb", "#7e7e7e"
B1, B2, RED, OK, WARN = "#0066b1", "#1c69d4", "#e22718", "#0fa336", "#f4b400"
SANS = "Inter, 'Segoe UI', Arial, Helvetica, sans-serif"
MONO = "Consolas, 'Courier New', monospace"


def svg(w, h, label, desc, body):
    return f'''<svg viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="{label}">
  <desc>{desc}</desc>
  <defs>
    <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#ffffff" stroke-opacity="0.05" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="{w}" height="{h}" fill="{BG}"/>
  <rect width="{w}" height="{h}" fill="url(#grid)"/>
{body}
</svg>
'''


def stripe(x, y, w, h=4, grow=None):
    """Franja tricolor; con grow=segundos se dibuja de izquierda a derecha."""
    t = w / 3
    anim = ""
    if grow is not None:
        anim = f'<animate attributeName="width" from="0" to="{w}" dur="{grow}s" fill="freeze"/>'
    return f'''  <g>
    <clipPath id="clip{x}{y}"><rect x="{x}" y="{y}" width="{w}" height="{h}">{anim}</rect></clipPath>
    <g clip-path="url(#clip{x}{y})">
      <rect x="{x}" y="{y}" width="{t:.1f}" height="{h}" fill="{B1}"/>
      <rect x="{x + t:.1f}" y="{y}" width="{t:.1f}" height="{h}" fill="{B2}"/>
      <rect x="{x + 2 * t:.1f}" y="{y}" width="{t:.1f}" height="{h}" fill="{RED}"/>
    </g>
  </g>'''


def label(x, y, txt, color=MUTED, size=13, anchor="start"):
    return f'  <text x="{x}" y="{y}" font-family="{MONO}" font-size="{size}" letter-spacing="2.5" fill="{color}" text-anchor="{anchor}">{txt}</text>'


def title(x, y, txt, size=30, color=INK, anchor="start", weight=800):
    return f'  <text x="{x}" y="{y}" font-family="{SANS}" font-size="{size}" font-weight="{weight}" fill="{color}" text-anchor="{anchor}">{txt}</text>'


def text(x, y, txt, size=15, color=BODY, anchor="start", weight=400):
    return f'  <text x="{x}" y="{y}" font-family="{SANS}" font-size="{size}" font-weight="{weight}" fill="{color}" text-anchor="{anchor}">{txt}</text>'


def fade(begin, dur=0.5):
    return f'<animate attributeName="opacity" values="0;1" dur="{dur}s" begin="{begin}s" fill="freeze"/>'


def loop_show(cycle, t0, t1):
    """Visible entre t0 y t1 (segundos) dentro de un ciclo que se repite."""
    a, b = t0 / cycle, min(t1 / cycle, 0.98)
    return (f'<animate attributeName="opacity" values="0;0;1;1;0;0" '
            f'keyTimes="0;{a:.3f};{min(a + 0.03, b):.3f};{max(b - 0.03, a):.3f};{b:.3f};1" dur="{cycle}s" repeatCount="indefinite"/>')


def doc_icon(x, y, s=1.0, color=INK, tag="PDF", tagcolor=RED):
    w, h, f = 60 * s, 78 * s, 16 * s
    return f'''  <g>
    <path d="M {x} {y} L {x + w - f} {y} L {x + w} {y + f} L {x + w} {y + h} L {x} {y + h} Z" fill="{CARD2}" stroke="{color}" stroke-width="2"/>
    <path d="M {x + w - f} {y} L {x + w - f} {y + f} L {x + w} {y + f}" fill="none" stroke="{color}" stroke-width="2"/>
    <rect x="{x - 8 * s}" y="{y + h - 30 * s}" width="{46 * s}" height="{18 * s}" fill="{tagcolor}"/>
    <text x="{x + 15 * s}" y="{y + h - 16.5 * s}" font-family="{SANS}" font-size="{11 * s}" font-weight="800" fill="#fff" text-anchor="middle">{tag}</text>
  </g>'''


def dot(path_id, color, dur, begin):
    return f'''  <circle r="4.5" fill="{color}" opacity="0">
    <animateMotion dur="{dur}s" begin="{begin}s" repeatCount="indefinite"><mpath href="#{path_id}"/></animateMotion>
    <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" dur="{dur}s" begin="{begin}s" repeatCount="indefinite"/>
  </circle>'''


# ---------------------------------------------------------------------------------------------
def hero():
    W, H = 1200, 480
    outs = [("WORD", "Diseño original", B2), ("EXCEL", "Números reales", OK), ("OCR", "Escaneado a Word", B1),
            ("JPG", "Páginas a imagen", WARN), ("FIRMA", "Firma y rellena", RED), ("−80 %", "Comprime", INK)]
    b = [stripe(0, 0, W, 4, grow=1.2),
         label(48, 64, "EXTENSIÓN PARA CHROME · 100 % LOCAL"),
         title(48, 128, "SANPDF", 72),
         text(50, 168, "Convierte, edita, firma y comprime tus PDF", 22, INK, weight=300),
         text(50, 198, "en tu navegador. Ningún archivo sale de tu ordenador.", 22, INK, weight=300)]
    # documento de entrada y "motor"
    b.append(doc_icon(110, 250, 1.1))
    b.append(f'  <rect x="250" y="250" width="200" height="86" fill="{CARD}" stroke="{LINE}"/>')
    b.append(title(350, 288, "PDF G", 22, anchor="middle"))
    b.append(text(350, 314, "28 herramientas", 13, BODY, "middle"))
    b.append(f'  <path id="h0" d="M 185 293 L 248 293" stroke="{LINE}" stroke-width="2" stroke-dasharray="5 5"/>')
    b.append(dot("h0", INK, 1.6, 0.8))
    # salidas
    for i, (tag, sub, col) in enumerate(outs):
        cx, cy = 560 + (i % 3) * 205, 236 + (i // 3) * 104
        pid = f"hp{i}"
        b.append(f'  <path id="{pid}" d="M 452 293 C 500 293, 510 {cy + 34}, {cx - 4} {cy + 34}" fill="none" stroke="{LINE}" stroke-width="1.5" stroke-dasharray="4 6"/>')
        b.append(dot(pid, col, 2.4, 1.0 + i * 0.35))
        b.append(f'''  <g opacity="0">{fade(0.6 + i * 0.25)}
    <rect x="{cx}" y="{cy}" width="185" height="68" fill="{CARD}" stroke="{LINE}"/>
    <rect x="{cx}" y="{cy}" width="4" height="68" fill="{col}"/>
{title(cx + 20, cy + 32, tag, 18)}
{text(cx + 20, cy + 54, sub, 13)}
  </g>''')
    b.append(f'  <line x1="48" y1="430" x2="1152" y2="430" stroke="{LINE}"/>')
    b.append(label(48, 458, "CONVERTIR · ORGANIZAR · EDITAR Y FIRMAR · OPTIMIZAR Y PROTEGER · CREAR", MUTED, 12))
    return svg(W, H, "SanPDF: extensión de Chrome que convierte, edita, firma y comprime PDF sin subir nada",
               "Un PDF entra en PDF G y salen, uno tras otro, Word, Excel, OCR, imágenes, firma y compresión.", "\n".join(b))


def como_funciona():
    W, H = 1200, 380
    steps = [("1", "Instala", ["Doble clic en", "Instalar PDF G.cmd", "y dos clics en Chrome"], B1),
             ("2", "Suelta tu PDF", ["Arrástralo a la herramienta", "o elige uno con un clic"], B2),
             ("3", "Descarga", ["Word, Excel, PDF…", "en Descargas/PDF G"], OK)]
    b = [label(40, 56, "EN TRES PASOS"),
         f'  <line x1="250" y1="51" x2="1160" y2="51" stroke="{LINE}"/>',
         title(40, 100, "Instalar → soltar → descargar.", 26, BODY, weight=600)]
    for i, (n, t, lines, col) in enumerate(steps):
        x = 40 + i * 385
        if i:
            pid = f"cf{i}"
            b.append(f'  <path id="{pid}" d="M {x - 50} 230 L {x - 4} 230" stroke="{LINE}" stroke-width="2" stroke-dasharray="5 5"/>')
            b.append(dot(pid, col, 2.2, 1.2 + i * 0.4))
        b.append(f'''  <g opacity="0">{fade(0.2 + i * 0.5)}
    <rect x="{x}" y="140" width="335" height="180" fill="{CARD}" stroke="{LINE}"/>
    <rect x="{x}" y="140" width="335" height="4" fill="{col}"/>
    <circle cx="{x + 40}" cy="190" r="20" fill="none" stroke="{INK}" stroke-width="2"/>
{title(x + 40, 197, n, 18, anchor="middle")}
{title(x + 76, 198, t.upper(), 20)}
''' + "\n".join(text(x + 28, 248 + k * 26, l, 15) for k, l in enumerate(lines)) + "\n  </g>")
    # check final que late
    b.append(f'''  <g opacity="0">{fade(1.8)}
    <circle cx="1120" cy="190" r="14" fill="{OK}"><animate attributeName="r" values="14;17;14" dur="1.6s" begin="2.2s" repeatCount="indefinite"/></circle>
    <path d="M 1113 190 L 1118 196 L 1128 184" stroke="#fff" stroke-width="2.5" fill="none"/>
  </g>''')
    return svg(W, H, "Cómo se usa: instala la extensión, suelta tu PDF y descarga el resultado",
               "Tres tarjetas aparecen de izquierda a derecha y un punto recorre los conectores en bucle.", "\n".join(b))


def page(x, y, w, h, fill="#ffffff"):
    return f'  <rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}"/>'


def pdf_a_word():
    W, H, C = 1200, 470, 8
    b = [label(40, 56, "PDF A WORD · DISEÑO ORIGINAL"),
         f'  <line x1="380" y1="51" x2="1160" y2="51" stroke="{LINE}"/>',
         title(40, 100, "El mismo aspecto, con el texto editable.", 26, BODY, weight=600)]
    # PDF original
    def poster(x, y, textcol=True):
        g = [page(x, y, 220, 290, "#eef3f9"), f'  <rect x="{x}" y="{y}" width="220" height="44" fill="{B1}"/>',
             f'  <rect x="{x + 14}" y="{y + 64}" width="90" height="70" fill="#d7e3f2"/>',
             f'  <rect x="{x + 116}" y="{y + 64}" width="90" height="70" fill="#f6dada"/>',
             f'  <circle cx="{x + 40}" cy="{y + 172}" r="16" fill="{OK}"/>']
        if textcol:
            g += [f'  <rect x="{x + 14}" y="{y + 16}" width="130" height="12" fill="#ffffff"/>',
                  f'  <rect x="{x + 22}" y="{y + 78}" width="70" height="8" fill="#123"/>',
                  f'  <rect x="{x + 22}" y="{y + 94}" width="60" height="6" fill="#456"/>',
                  f'  <rect x="{x + 124}" y="{y + 78}" width="60" height="8" fill="{RED}"/>',
                  f'  <rect x="{x + 66}" y="{y + 166}" width="130" height="8" fill="#123"/>',
                  f'  <rect x="{x + 14}" y="{y + 210}" width="190" height="6" fill="#456"/>',
                  f'  <rect x="{x + 14}" y="{y + 224}" width="170" height="6" fill="#456"/>',
                  f'  <rect x="{x + 14}" y="{y + 238}" width="180" height="6" fill="#456"/>']
        return "\n".join(g)
    b.append(poster(40, 140))
    b.append(doc_icon(210, 372, 0.6))
    # capa fondo
    b.append(f'''  <g opacity="0">{loop_show(C, 0.8, 8)}
{poster(345, 140, False)}
{text(455, 452, "Fondo: la página sin el texto", 14, BODY, "middle")}
  </g>''')
    # capa texto
    tx = [(404, 162, 130, "#fff"), (412, 224, 70, "#123"), (514, 224, 60, RED), (456, 312, 130, "#123"),
          (404, 356, 190, "#456"), (404, 370, 170, "#456"), (404, 384, 180, "#456")]
    tg = []
    for i, (x, y, w, c) in enumerate(tx):
        x2 = x - 390 + 650
        tg.append(f'''    <g opacity="0">{loop_show(C, 1.6 + i * 0.25, 8)}
      <rect x="{x2 - 4}" y="{y - 6}" width="{w + 8}" height="20" fill="none" stroke="{B2}" stroke-dasharray="3 3"/>
      <rect x="{x2}" y="{y}" width="{w}" height="8" fill="{c}"/>
    </g>''')
    b.append(f'  <rect x="650" y="140" width="220" height="290" fill="none" stroke="{LINE}" stroke-dasharray="6 6"/>')
    b.append("\n".join(tg))
    b.append(text(760, 452, "Texto: marcos editables en su sitio", 14, BODY, "middle"))
    # resultado
    b.append(f'''  <g opacity="0">{loop_show(C, 4.2, 8)}
{poster(950, 140)}
    <rect x="1038" y="306" width="2" height="16" fill="{B2}"><animate attributeName="opacity" values="1;0;1" dur="1s" repeatCount="indefinite"/></rect>
{text(1060, 452, "Word: igual que el PDF", 14, INK, "middle", 700)}
  </g>''')
    for x, sym in ((292, "→"), (597, "+"), (910, "→")):
        b.append(f'  <text x="{x}" y="292" font-family="{SANS}" font-size="28" fill="{MUTED}" text-anchor="middle">{sym}</text>')
    return svg(W, H, "PDF a Word con el diseño original: fondo sin texto más el texto en marcos editables",
               "La página se separa en dos capas: el fondo con imágenes y colores, y el texto en marcos editables; juntas forman el Word.", "\n".join(b))


def ocr_a_word():
    W, H, C = 1200, 470, 9
    b = [label(40, 56, "OCR · ESCANEADO A WORD EDITABLE"),
         f'  <line x1="420" y1="51" x2="1160" y2="51" stroke="{LINE}"/>',
         title(40, 100, "Reconoce, borra y coloca el texto.", 26, BODY, weight=600)]
    px, py = 60, 140
    lines = [(px + 16, py + 22, 150, 13, "#ffffff"), (px + 16, py + 70, 190, 14, "#0b1f3a"), (px + 16, py + 92, 210, 14, RED),
             (px + 16, py + 128, 170, 7, "#333"), (px + 16, py + 172, 120, 9, B1), (px + 16, py + 190, 200, 6, "#333"),
             (px + 16, py + 202, 190, 6, "#333"), (px + 150, py + 240, 70, 18, OK)]
    scan = [page(px, py, 250, 290, "#f4f7fb"), f'  <rect x="{px}" y="{py}" width="250" height="48" fill="{B1}"/>',
            f'  <rect x="{px + 12}" y="{py + 160}" width="226" height="60" fill="#ffffff"/>',
            f'  <rect x="{px + 12}" y="{py + 232}" width="226" height="42" fill="#ffffff"/>']
    scan += [f'  <rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{c}" opacity="0.9"/>' for x, y, w, h, c in lines]
    b.append("\n".join(scan))
    # línea de escaneo
    b.append(f'''  <rect x="{px - 6}" y="{py}" width="262" height="3" fill="{B2}" opacity="0.9">
    <animate attributeName="y" values="{py};{py + 287};{py + 287}" keyTimes="0;0.3;1" dur="{C}s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0.9;0.9;0;0" keyTimes="0;0.3;0.31;1" dur="{C}s" repeatCount="indefinite"/>
  </rect>''')
    # cajas de palabras reconocidas
    for i, (x, y, w, h, c) in enumerate(lines):
        t0 = 0.3 + i * 0.3
        b.append(f'''  <rect x="{x - 3}" y="{y - 3}" width="{w + 6}" height="{h + 6}" fill="none" stroke="{WARN}" stroke-width="1.5" opacity="0">
    {loop_show(C, t0, 8.6)}
  </rect>''')
    b.append(text(px + 125, 452, "1 · Reconoce las palabras", 14, BODY, "middle"))
    # paso 2: fondo limpio
    qx = 470
    clean = [page(qx, py, 250, 290, "#f4f7fb"), f'  <rect x="{qx}" y="{py}" width="250" height="48" fill="{B1}"/>',
             f'  <rect x="{qx + 12}" y="{py + 160}" width="226" height="60" fill="#ffffff"/>',
             f'  <rect x="{qx + 12}" y="{py + 232}" width="226" height="42" fill="#ffffff"/>']
    b.append(f'  <g opacity="0">{loop_show(C, 3.0, 8.6)}\n' + "\n".join(clean) + "\n" + text(qx + 125, 452, "2 · Lo borra de la imagen", 14, BODY, "middle") + "\n  </g>")
    # paso 3: texto editable encima
    rx = 880
    res = [page(rx, py, 250, 290, "#f4f7fb"), f'  <rect x="{rx}" y="{py}" width="250" height="48" fill="{B1}"/>',
           f'  <rect x="{rx + 12}" y="{py + 160}" width="226" height="60" fill="#ffffff"/>',
           f'  <rect x="{rx + 12}" y="{py + 232}" width="226" height="42" fill="#ffffff"/>']
    b.append(f'  <g opacity="0">{loop_show(C, 4.6, 8.6)}\n' + "\n".join(res) + "\n  </g>")
    for i, (x, y, w, h, c) in enumerate(lines):
        x2 = x - px + rx
        b.append(f'''  <g opacity="0">{loop_show(C, 5.0 + i * 0.25, 8.6)}
    <rect x="{x2}" y="{y}" width="{w}" height="{h}" fill="{c}"/>
    <rect x="{x2 - 3}" y="{y - 3}" width="{w + 6}" height="{h + 6}" fill="none" stroke="{B2}" stroke-dasharray="3 3"/>
  </g>''')
    b.append(f'  <rect x="{rx + 220}" y="{py + 380 - 240}" width="2" height="16" fill="{B2}" opacity="0">{loop_show(C, 7.0, 8.6)}</rect>')
    b.append(f'  <g opacity="0">{loop_show(C, 4.6, 8.6)}' + text(rx + 125, 452, "3 · Lo coloca editable encima", 14, INK, "middle", 700) + "</g>")
    for x in (340, 750):
        b.append(f'  <text x="{x + 55}" y="292" font-family="{SANS}" font-size="28" fill="{MUTED}" text-anchor="middle">→</text>')
    return svg(W, H, "OCR a Word: reconoce el texto de un escaneado, lo borra de la imagen y lo coloca editable encima",
               "Una línea recorre el escaneado y marca cada palabra; la página queda limpia y el texto aparece editable en su posición.", "\n".join(b))


def pdf_a_excel():
    W, H, C = 1200, 440, 7
    b = [label(40, 56, "PDF A EXCEL"),
         f'  <line x1="200" y1="51" x2="1160" y2="51" stroke="{LINE}"/>',
         title(40, 100, "Tablas con números y fechas de verdad.", 26, BODY, weight=600)]
    rows = [("01/03/2026", "Servicio 1", "123,45 €"), ("02/03/2026", "Servicio 2", "246,90 €"),
            ("03/03/2026", "Servicio 3", "370,35 €"), ("04/03/2026", "Servicio 4", "493,80 €")]
    x0, y0 = 40, 140
    b.append(page(x0, y0, 420, 250, "#ffffff"))
    b.append(f'  <text x="{x0 + 20}" y="{y0 + 34}" font-family="{SANS}" font-size="16" font-weight="700" fill="#111">Factura de prueba</text>')
    for i, r in enumerate([("Fecha", "Concepto", "Importe")] + rows):
        y = y0 + 60 + i * 34
        fill = "#cfe2f3" if i == 0 else "#ffffff"
        b.append(f'  <rect x="{x0 + 20}" y="{y}" width="380" height="34" fill="{fill}" stroke="#999"/>')
        for k, (cx, val) in enumerate(zip((x0 + 30, x0 + 150, x0 + 390), r)):
            anchor = "end" if k == 2 else "start"
            b.append(f'  <text x="{cx}" y="{y + 22}" font-family="{SANS}" font-size="14" fill="#111" text-anchor="{anchor}">{val}</text>')
        if i:
            b.append(f'  <rect x="{x0 + 20}" y="{y}" width="380" height="34" fill="{OK}" opacity="0">'
                     f'<animate attributeName="opacity" values="0;0;0.25;0;0" keyTimes="0;{(0.4 + i * 0.6) / C:.3f};{(0.7 + i * 0.6) / C:.3f};{(1.2 + i * 0.6) / C:.3f};1" dur="{C}s" repeatCount="indefinite"/></rect>')
    # hoja de cálculo
    gx, gy = 640, 140
    b.append(f'  <rect x="{gx}" y="{gy}" width="520" height="250" fill="{CARD}" stroke="{LINE}"/>')
    for k, col in enumerate("ABC"):
        b.append(text(gx + 90 + k * 160, gy + 24, col, 13, MUTED, "middle", 700))
    b.append(f'  <line x1="{gx}" y1="{gy + 36}" x2="{gx + 520}" y2="{gy + 36}" stroke="{LINE}"/>')
    for i, r in enumerate([("Fecha", "Concepto", "Importe")] + rows):
        y = gy + 36 + i * 40
        b.append(f'  <line x1="{gx}" y1="{y + 40}" x2="{gx + 520}" y2="{y + 40}" stroke="{LINE}" stroke-opacity="0.6"/>')
        cells = []
        for k, val in enumerate(r):
            x = gx + 20 + k * 160 + (140 if k == 2 else 0)
            anchor = "end" if (k == 2 or (k == 0 and i)) else "start"
            if k == 0 and i:
                x = gx + 150
            color = INK if i == 0 else (OK if k == 2 else BODY)
            cells.append(text(x, y + 26, val, 14, color, anchor, 700 if i == 0 else 400))
        t0 = 0.6 + i * 0.6
        b.append(f'  <g opacity="0">{loop_show(C, t0, 6.6)}\n' + "\n".join(cells) + "\n  </g>")
    b.append(f'  <path id="xl" d="M 465 265 L 632 265" stroke="{LINE}" stroke-width="2" stroke-dasharray="5 5"/>')
    b.append(dot("xl", OK, 1.4, 0.5))
    b.append(text(gx + 260, 420, "Fechas como fechas, importes como números: se pueden sumar y filtrar", 14, BODY, "middle"))
    return svg(W, H, "PDF a Excel: cada fila de la tabla del PDF pasa a la hoja con fechas e importes reales",
               "Las filas de la factura se iluminan una a una y aparecen en la hoja de cálculo con los importes alineados como números.", "\n".join(b))


def herramientas():
    W, H = 1200, 470
    cats = [("CONVERTIR", B1, ["PDF a Excel", "PDF a Word", "PDF a imágenes", "PDF a texto", "Imágenes a PDF", "Word a PDF", "Excel a PDF", "Página web a PDF"]),
            ("ORGANIZAR", B2, ["Unir PDF", "Dividir PDF", "Organizar páginas", "Extraer páginas", "Girar PDF", "Eliminar páginas"]),
            ("EDITAR Y FIRMAR", RED, ["Editar PDF", "Firmar PDF", "Rellenar formulario", "Marca de agua", "Numerar páginas", "Datos del documento"]),
            ("OPTIMIZAR Y PROTEGER", OK, ["Comprimir PDF", "OCR a Word o PDF", "Proteger con contraseña", "Quitar contraseña", "Aplanar PDF", "Reparar PDF"]),
            ("CREAR", INK, ["Crear PDF", "Texto a PDF"])]
    b = [label(40, 56, "28 HERRAMIENTAS"), f'  <line x1="260" y1="51" x2="1160" y2="51" stroke="{LINE}"/>']
    n = 0
    for i, (name, col, tools) in enumerate(cats):
        x = 40 + i * 226
        b.append(f'  <rect x="{x}" y="86" width="210" height="4" fill="{col}"/>')
        b.append(f'  <text x="{x}" y="118" font-family="{SANS}" font-size="13" font-weight="800" letter-spacing="1.5" fill="{INK}">{name}</text>')
        for k, t in enumerate(tools):
            y = 140 + k * 38
            b.append(f'''  <g opacity="0">{fade(0.15 + n * 0.08, 0.35)}
    <rect x="{x}" y="{y}" width="210" height="30" fill="{CARD}" stroke="{LINE}"/>
{text(x + 12, y + 20, t, 13, BODY)}
  </g>''')
            n += 1
    return svg(W, H, "Las 28 herramientas de SanPDF agrupadas en cinco categorías",
               "Cinco columnas de herramientas aparecen una a una.", "\n".join(b))


def privacidad():
    W, H = 1200, 320
    b = [label(40, 56, "PRIVACIDAD"), f'  <line x1="190" y1="51" x2="1160" y2="51" stroke="{LINE}"/>',
         title(40, 100, "Tus archivos no salen de tu ordenador.", 26, BODY, weight=600)]
    # ordenador
    b.append(f'  <rect x="120" y="140" width="300" height="140" fill="{CARD}" stroke="{INK}" stroke-width="2"/>')
    b.append(title(270, 200, "TU NAVEGADOR", 18, anchor="middle"))
    b.append(text(270, 228, "pdf.js · pdf-lib · Tesseract · qpdf", 13, BODY, "middle"))
    b.append(f'  <circle cx="270" cy="256" r="6" fill="{OK}"><animate attributeName="opacity" values="1;0.3;1" dur="1.6s" repeatCount="indefinite"/></circle>')
    b.append(doc_icon(40, 170, 0.7))
    b.append(f'  <path id="pv" d="M 86 205 C 100 205, 110 210, 128 210" fill="none" stroke="{LINE}"/>')
    b.append(dot("pv", INK, 1.6, 0.3))
    # nube tachada
    b.append(f'''  <g transform="translate(760,150)">
    <path d="M 60 80 L 220 80 A 40 40 0 0 0 200 10 A 60 60 0 0 0 90 20 A 40 40 0 0 0 60 80 Z" fill="none" stroke="{MUTED}" stroke-width="2" stroke-dasharray="6 6"/>
    <line x1="40" y1="100" x2="240" y2="-10" stroke="{RED}" stroke-width="4"/>
  </g>''')
    b.append(f'  <path id="pc" d="M 425 210 L 740 210" stroke="{LINE}" stroke-width="2" stroke-dasharray="5 5"/>')
    b.append(f'''  <circle r="5" fill="{RED}">
    <animateMotion dur="2.4s" repeatCount="indefinite" keyPoints="0;0.85;0.85" keyTimes="0;0.7;1" calcMode="linear"><mpath href="#pc"/></animateMotion>
    <animate attributeName="opacity" values="1;1;0;0" keyTimes="0;0.65;0.72;1" dur="2.4s" repeatCount="indefinite"/>
  </circle>''')
    b.append(title(1000, 300, "0 bytes enviados", 20, INK, "end"))
    return svg(W, H, "Privacidad: todo se procesa en el navegador, no se envía nada a ningún servidor",
               "Un PDF entra al navegador; un punto que intenta salir hacia la nube se detiene antes de llegar.", "\n".join(b))


def acceso_directo():
    W, H, C = 1200, 340, 7
    b = [label(40, 56, "ACCESO DIRECTO EN EL ESCRITORIO (WINDOWS)"), f'  <line x1="520" y1="51" x2="1160" y2="51" stroke="{LINE}"/>']
    # botón
    b.append(f'  <rect x="60" y="130" width="260" height="56" fill="{BG}" stroke="{INK}"/>')
    b.append(f'  <text x="190" y="164" font-family="{SANS}" font-size="14" font-weight="800" letter-spacing="1.5" fill="{INK}" text-anchor="middle">CREAR ACCESO DIRECTO</text>')
    b.append(f'''  <path d="M 0 0 L 0 18 L 5 13 L 9 21 L 12 20 L 8 12 L 14 12 Z" fill="#fff" stroke="#000" transform="translate(250,150)">
    <animateTransform attributeName="transform" type="translate" values="330,240;250,165;250,165;250,165" keyTimes="0;0.15;0.2;1" dur="{C}s" repeatCount="indefinite"/>
  </path>''')
    b.append(text(190, 220, "Botón en la barra superior", 13, BODY, "middle"))
    # archivo .cmd
    b.append(f'  <g opacity="0">{loop_show(C, 1.4, 6.8)}')
    b.append(doc_icon(470, 112, 0.9, INK, ".CMD", B2))
    b.append(text(497, 220, "Instalador", 13, BODY, "middle"))
    b.append(text(497, 240, "(doble clic)", 13, MUTED, "middle") + "\n  </g>")
    # escritorio
    b.append(f'  <rect x="760" y="100" width="380" height="200" fill="{CARD}" stroke="{LINE}"/>')
    b.append(text(950, 290, "Escritorio", 12, MUTED, "middle"))
    b.append(f'''  <g opacity="0">{loop_show(C, 3.2, 6.8)}
    <rect x="910" y="140" width="80" height="80" fill="#000" stroke="{INK}"/>
    <path d="M 932 154 L 958 154 L 968 164 L 968 204 L 932 204 Z" fill="none" stroke="#fff" stroke-width="2.5"/>
    <text x="950" y="190" font-family="{SANS}" font-size="20" font-weight="800" fill="#fff" text-anchor="middle">G</text>
    <rect x="910" y="214" width="27" height="6" fill="{B1}"/><rect x="937" y="214" width="26" height="6" fill="{B2}"/><rect x="963" y="214" width="27" height="6" fill="{RED}"/>
    <text x="950" y="244" font-family="{SANS}" font-size="14" font-weight="700" fill="#fff" text-anchor="middle">PDF G</text>
  </g>''')
    for x in (380, 640):
        b.append(f'  <text x="{x + 30}" y="168" font-family="{SANS}" font-size="28" fill="{MUTED}" text-anchor="middle">→</text>')
    return svg(W, H, "Acceso directo: el botón descarga un instalador que crea PDF G en el escritorio",
               "Un cursor pulsa el botón, aparece el instalador y después el icono de PDF G en el escritorio.", "\n".join(b))


def instalador():
    W, H, C = 1200, 400, 9
    steps = [("1", "COPIA", ["La extensión a tu", "carpeta de usuario"], B1, False),
             ("2", "ABRE", ["chrome://extensions", "con la ruta copiada"], B2, False),
             ("3", "TÚ: 2 CLICS", ["Modo desarrollador", "Cargar descomprimida"], RED, True),
             ("4", "LISTO", ["Acceso directo en", "el escritorio"], OK, False)]
    b = [label(40, 56, "INSTALAR PDF G.CMD · WINDOWS"), f'  <line x1="350" y1="51" x2="1160" y2="51" stroke="{LINE}"/>',
         title(40, 100, "Doble clic, dos clics en Chrome y listo.", 26, BODY, weight=600)]
    for i, (n, t, lines, col, you) in enumerate(steps):
        x = 40 + i * 285
        t0 = 0.3 + i * 1.6
        if i:
            pid = f"in{i}"
            b.append(f'  <path id="{pid}" d="M {x - 30} 245 L {x - 4} 245" stroke="{LINE}" stroke-width="2" stroke-dasharray="4 4"/>')
            b.append(dot(pid, col, 1.6, t0))
        b.append(f'''  <g opacity="0">{loop_show(C, t0, 8.6)}
    <rect x="{x}" y="150" width="255" height="190" fill="{CARD}" stroke="{col if you else LINE}" stroke-width="{2 if you else 1}"/>
    <rect x="{x}" y="150" width="255" height="4" fill="{col}"/>
    <circle cx="{x + 36}" cy="196" r="18" fill="none" stroke="{INK}" stroke-width="2"/>
{title(x + 36, 202, n, 16, anchor="middle")}
{title(x + 66, 203, t, 17)}
''' + "\n".join(text(x + 24, 252 + k * 26, l, 15) for k, l in enumerate(lines)) + "\n  </g>")
    # interruptor del modo desarrollador que se activa en el paso 3
    x3 = 40 + 2 * 285 + 24
    b.append(f'''  <g opacity="0">{loop_show(C, 4.0, 8.6)}
    <rect x="{x3}" y="300" width="44" height="22" rx="11" fill="{LINE}"><animate attributeName="fill" values="{LINE};{LINE};{B2};{B2}" keyTimes="0;0.5;0.55;1" dur="{C}s" repeatCount="indefinite"/></rect>
    <circle cx="{x3 + 11}" cy="311" r="8" fill="#fff"><animate attributeName="cx" values="{x3 + 11};{x3 + 11};{x3 + 33};{x3 + 33}" keyTimes="0;0.5;0.55;1" dur="{C}s" repeatCount="indefinite"/></circle>
    <rect x="{x3 + 60}" y="298" width="150" height="26" fill="none" stroke="{INK}"/>
{text(x3 + 135, 316, "Cargar descomprimida", 12, INK, "middle")}
  </g>''')
    return svg(W, H, "Instalador para Windows: copia la extensión, abre la página de extensiones, tú haces dos clics y se crea el acceso directo",
               "Cuatro tarjetas aparecen en orden; en la tercera se activa el interruptor del modo de desarrollador.", "\n".join(b))


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in {"hero": hero, "como-funciona": como_funciona, "pdf-a-word": pdf_a_word, "ocr-a-word": ocr_a_word,
                     "pdf-a-excel": pdf_a_excel, "herramientas": herramientas, "privacidad": privacidad,
                     "acceso-directo": acceso_directo, "instalador": instalador}.items():
        (OUT / f"{name}.svg").write_text(fn(), encoding="utf-8")
        print("ok", name)

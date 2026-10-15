#!/usr/bin/env python3
"""Crea los documentos de prueba en tests/fixtures (no se suben al repositorio).

Necesita: Python 3 con reportlab y Pillow, poppler-utils (pdftoppm), LibreOffice (soffice)
y Node.js con Playwright (para dibujar el boletín de ejemplo).
"""
import csv, random, subprocess, sys
from pathlib import Path
from xml.sax.saxutils import escape

HERE = Path(__file__).resolve().parent
FX = HERE / "fixtures"
FX.mkdir(exist_ok=True)


def run(*cmd):
    subprocess.run(cmd, check=True, cwd=FX, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def informe():
    """multi.html → multi.pdf (4 páginas) e informe.docx."""
    random.seed(1)
    w = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua".split()
    h = '<html><body><h1 style="color:#1a5276">Informe de prueba</h1>'
    for i in range(14):
        h += f'<h2>Sección {i}</h2><p style="text-align:justify">{" ".join(random.choice(w) for _ in range(120))}</p>'
        h += '<p>Texto <b>negrita</b> y <i>cursiva</i> y <span style="color:red">rojo</span>.</p>'
    h += '<table border=1><tr><td>A</td><td>B</td></tr><tr><td>1,5</td><td>2,5</td></tr></table></body></html>'
    (FX / "multi.html").write_text(h, encoding="utf-8")
    run("soffice", "--headless", "--convert-to", "pdf", "multi.html")
    run("soffice", "--headless", "--convert-to", "docx:MS Word 2007 XML", "multi.html")
    (FX / "multi.docx").rename(FX / "informe.docx")
    web = FX / "web"; web.mkdir(exist_ok=True)
    (web / "index.html").write_text(h, encoding="utf-8")


def factura_y_formulario():
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.pdfgen import canvas
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Table, TableStyle
    eur = lambda v: f"{v:,.2f} €".replace(",", "X").replace(".", ",").replace("X", ".")
    rows = [["Fecha", "Concepto", "Importe", "IVA %"]] + [[f"{d:02d}/03/2026", f"Servicio {d}", eur(d * 123.45), "21%"] for d in range(1, 26)]
    t = Table(rows)
    t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.5, colors.grey), ("BACKGROUND", (0, 0), (-1, 0), colors.lightblue)]))
    SimpleDocTemplate(str(FX / "tabla.pdf"), pagesize=A4).build([Paragraph("Factura de prueba", getSampleStyleSheet()["Title"]), t])
    c = canvas.Canvas(str(FX / "form.pdf"), pagesize=A4)
    c.drawString(72, 780, "Formulario"); f = c.acroForm
    c.drawString(72, 740, "Nombre:"); f.textfield(name="nombre", x=140, y=730, width=200, height=20)
    c.drawString(72, 700, "Acepto:"); f.checkbox(name="acepto", x=140, y=695, size=16)
    c.save()


def imagenes():
    from PIL import Image
    run("pdftoppm", "-r", "150", "-png", "-f", "1", "-l", "1", "multi.pdf", "scan")
    run("pdftoppm", "-r", "80", "-jpeg", "-f", "2", "-l", "2", "multi.pdf", "photo")
    Image.open(FX / "scan-1.png").convert("RGB").save(FX / "scanned.pdf", resolution=150)
    # boletín de ejemplo dibujado con Chromium y guardado como PDF de imagen (como un escaneado)
    subprocess.run(["node", str(HERE / "boletin.mjs"), str(HERE / "boletin.html"), str(FX / "boletin.png")], check=True)
    Image.open(FX / "boletin.png").convert("RGB").save(FX / "boletin_escaneado.pdf", resolution=134)


def hojas():
    with open(FX / "datos.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh, delimiter=";"); w.writerow(["Fecha", "Concepto", "Importe"])
        for i in range(1, 30): w.writerow([f"{i:02d}/01/2026", f"Línea {i}", f"{i * 10},50"])
    # .xls en formato XML de Excel 2003 (SpreadsheetML), como el que exportan muchos programas
    cells = lambda vals: "".join(f'<Cell ss:StyleID="{s}"><Data ss:Type="{t}">{escape(str(v))}</Data></Cell>' for t, v, s in vals)
    rows = [cells([("String", h, "h") for h in ("Nº", "Resumen", "Estado", "Fecha de apertura", "Importe")])]
    for i in range(1, 121):
        rows.append(cells([("String", f"REQ{10000 + i}", "s"), ("String", f"Solicitud de prueba número {i}\nSegunda línea", "s"),
                           ("String", "Cerrado" if i % 3 else "Abierto", "s"), ("DateTime", f"2026-10-{1 + i % 28:02d}T09:{i % 60:02d}:00", "d"),
                           ("Number", i * 12.5, "n")]))
    xml = f'''<?xml version="1.0" encoding="utf-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles><Style ss:ID="h"><Font ss:Bold="1"/><Interior ss:Color="#C0C0C0" ss:Pattern="Solid"/></Style><Style ss:ID="s"/>
<Style ss:ID="d"><NumberFormat ss:Format="General Date"/></Style><Style ss:ID="n"><NumberFormat ss:Format="#,##0.00"/></Style></Styles>
<Worksheet ss:Name="Lista de solicitudes"><Table>{"".join(f"<Row>{r}</Row>" for r in rows)}</Table></Worksheet></Workbook>'''
    (FX / "solicitudes.xls").write_text(xml, encoding="utf-8")


if __name__ == "__main__":
    for step in (informe, factura_y_formulario, imagenes, hojas):
        step(); print("ok", step.__name__)
    sys.exit(0)

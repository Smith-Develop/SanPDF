#!/usr/bin/env python3
"""Comprueba el contenido de lo que generó tests/run.mjs (pypdf, openpyxl y poppler-utils)."""
import sys, os, subprocess, json, zipfile, re
from pathlib import Path
from pypdf import PdfReader
D = sys.argv[1] if len(sys.argv) > 1 else str(Path(__file__).resolve().parent / 'out')
FX = str(Path(__file__).resolve().parent / 'fixtures')
FAILS = []
def txt(f): return subprocess.run(['pdftotext','-layout',f,'-'],capture_output=True,text=True).stdout
def pages(f): return len(PdfReader(f).pages)
def rot(f): return [p.get('/Rotate',0) for p in PdfReader(f).pages]
def chk(name, cond, info=''):
    print(('OK  ' if cond else 'FAIL'), name, info)
    if not cond: FAILS.append(name)
P=lambda n: os.path.join(D,n)
ex=lambda n: os.path.exists(P(n))
if ex('tabla.xlsx'):
    import openpyxl; ws=openpyxl.load_workbook(P('tabla.xlsx')).active
    vals=[[c.value for c in r] for r in ws.iter_rows()]
    nums=[v for r in vals for v in r if isinstance(v,(int,float))]
    chk('pdf2excel', len(vals)>=26 and len(nums)>=25, f'filas={len(vals)} numeros={len(nums)} ej={vals[2] if len(vals)>2 else None}')
if ex('multi.docx'):
    x=zipfile.ZipFile(P('multi.docx')).read('word/document.xml').decode(); chk('pdf2word', x.count('<w:framePr')>10 and 'Sección 13' in x, f"marcos={x.count('<w:framePr')}")
for n, k in (('scanned.docx', 'Secci'), ('boletin_escaneado.docx', 'NÓMINAS')):
    if ex(n):
        x=zipfile.ZipFile(P(n)).read('word/document.xml').decode(); chk(f'ocr->word {n}', x.count('<w:framePr')>3 and k in x, f"marcos={x.count('<w:framePr')}")
if ex('multi_p1.jpg'): chk('pdf2img', all(ex(f'multi_p{i}.jpg') for i in range(1,5)))
if ex('scanned.txt'): t=open(P('scanned.txt')).read(); chk('pdf2txt(OCR)', 'Sección' in t or 'Secci' in t, repr(t[:80]))
if ex('imagenes.pdf'): chk('img2pdf', pages(P('imagenes.pdf'))==2)
if ex('informe_word2pdf.pdf'): t=txt(P('informe_word2pdf.pdf')); chk('word2pdf', 'Sección 13' in t and 'Informe' in t, f'pags={pages(P("informe_word2pdf.pdf"))}')
if ex('solicitudes_excel2pdf.pdf'): t=txt(P('solicitudes_excel2pdf.pdf')); chk('excel2pdf(xls)', 'REQ10120' in t, f'pags={pages(P("solicitudes_excel2pdf.pdf"))}')
if ex('datos_excel2pdf.pdf'): t=txt(P('datos_excel2pdf.pdf')); chk('excel2pdf(csv)', 'Línea 29' in t, '')
for f in os.listdir(D):
    if f.endswith('.pdf') and 'Sección' in f: pass
if ex('unido.pdf'): chk('merge', pages(P('unido.pdf'))==6, pages(P('unido.pdf')))
if ex('multi_p4.pdf'): chk('split', all(pages(P(f'multi_p{i}.pdf'))==1 for i in range(1,5)))
if ex('multi_organizado.pdf'): f=P('multi_organizado.pdf'); chk('organize', pages(f)==4 and rot(f)[0]==90, f'pags={pages(f)} rot={rot(f)}')
if ex('multi_extracto.pdf'): f=P('multi_extracto.pdf'); t=txt(f); chk('extract', pages(f)==2 and 'Sección 4' in t, pages(f))
if ex('multi_girado.pdf'): chk('rotate', rot(P('multi_girado.pdf'))==[90]*4, rot(P('multi_girado.pdf')))
if ex('multi_sin_paginas.pdf'): f=P('multi_sin_paginas.pdf'); chk('delete', pages(f)==3 and 'Informe' not in txt(f))
if ex('multi_editado.pdf'): chk('edit', 'HOLA PRUEBA EDITOR' in txt(P('multi_editado.pdf')))
if ex('multi_firmado.pdf'):
    n=subprocess.run(['pdfimages','-list',P('multi_firmado.pdf')],capture_output=True,text=True).stdout.count('\n')-2; chk('sign', n>=1, f'imagenes={n}')
if ex('form_relleno.pdf'): fl=PdfReader(P('form_relleno.pdf')).get_fields(); chk('forms', fl['nombre'].get('/V')=='María López' and str(fl['acepto'].get('/V'))!='/Off', {k:v.get('/V') for k,v in fl.items()})
if ex('multi_marca_agua.pdf'): chk('watermark', all('CONFIDENCIAL' in p.extract_text() for p in PdfReader(P('multi_marca_agua.pdf')).pages))
if ex('multi_numerado.pdf'): chk('pagenum', 'Página 4 de 4' in txt(P('multi_numerado.pdf')))
if ex('multi.pdf'): chk('metadata', PdfReader(P('multi.pdf')).metadata.title=='Título de prueba')
if ex('boletin_escaneado_comprimido.pdf'): a=os.path.getsize(os.path.join(FX,'boletin_escaneado.pdf')); b=os.path.getsize(P('boletin_escaneado_comprimido.pdf')); chk('compress', b<a and pages(P('boletin_escaneado_comprimido.pdf'))==1, f'{a}->{b}')
if ex('multi_comprimido.pdf'): chk('compress(max)', pages(P('multi_comprimido.pdf'))==4)
if ex('scanned_ocr.pdf'): t=txt(P('scanned_ocr.pdf')); chk('ocr', 'Secci' in t, repr(t.strip()[:60]))
if ex('multi_protegido.pdf'): r=PdfReader(P('multi_protegido.pdf')); chk('protect', r.is_encrypted and r.decrypt('clave123')>0)
if ex('protegido_desbloqueado.pdf'): r=PdfReader(P('protegido_desbloqueado.pdf')); chk('unlock', not r.is_encrypted and pages(P('protegido_desbloqueado.pdf'))==4)
if ex('form_aplanado.pdf'): chk('flatten', not PdfReader(P('form_aplanado.pdf')).get_fields())
if ex('tabla_reparado.pdf'): chk('repair', pages(P('tabla_reparado.pdf'))==1)
if ex('nuevo.pdf'): chk('create', 'Documento nuevo' in txt(P('nuevo.pdf')))
if ex('texto.pdf'): t=txt(P('texto.pdf')); chk('text2pdf', 'áéíóú' in t and '€' in t, f'pags={pages(P("texto.pdf"))}')
web=[f for f in os.listdir(D) if f.startswith('127.0.0.1') and f.endswith('.pdf')]
for f in web: chk('web2pdf', 'Sección' in txt(P(f)), f)
print('FALLOS:', ', '.join(FAILS) if FAILS else 'ninguno')
sys.exit(1 if FAILS else 0)

# Cambios

## 1.3.0
- **OCR a Word:** una sola fuente por línea (Arial o Arial Narrow) y espaciado moderado; si el texto no cabe, la letra se reduce un poco en vez de montar letras. Se elimina Bahnschrift, que Word interpretaba distinto.
- **OCR:** tres pasadas (imagen completa y reducida) para leer también títulos grandes y texto claro sobre fondo oscuro.
- **OCR:** las palabras cortas ("a", "y", "la") y los números sueltos ya no desaparecen dejando su sombra en la imagen; los iconos leídos como letras ("O", "Q", "(A)") se quedan como imagen.
- **PDF a Word:** una línea solo se une a un bloque si está alineada con él.
- Interfaz: los resultados con nombres largos ya no se salen del panel.
- Documentación con diagramas animados y pruebas automáticas portables.

## 1.2.0
- **OCR: escaneado a Word o PDF.** Nuevo resultado *Word editable* con el diseño original: el texto reconocido se borra de la imagen y se coloca encima, editable.
- **PDF a Word:** las páginas escaneadas o hechas con imágenes usan el mismo método.

## 1.1.0
- Nuevo sistema de diseño (lienzo negro, tipografía Inter 700/300, esquinas rectas, franja tricolor) e icono nuevo.
- **Excel a PDF:** admite `.xls` en formato XML de Excel 2003 y tablas HTML; ajusta las columnas al ancho de la página y repite la cabecera.
- **Acceso directo en el escritorio** (Windows y Linux) desde la barra superior y al instalar.
- Correcciones verificadas con pruebas de las 28 herramientas.

## 1.0.0
- **PDF a Word con el diseño original:** fondo de la página y texto editable en marcos, como al abrir el PDF con Word.
- Versión inicial con 28 herramientas.

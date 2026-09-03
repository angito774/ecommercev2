"""Nexbyte — build

Inyecta src/styles.css y src/app.js dentro de src/index.template.html
y escribe index.html: un unico archivo autocontenido que funciona
con doble clic (sin servidor).

Uso:  python build.py
"""
import io

TPL = "src/index.template.html"
CSS = "src/styles.css"
JS  = "src/app.js"
OUT = "index.html"

LINK_TAG   = '<link rel="stylesheet" href="src/styles.css">'
SCRIPT_TAG = '<script type="module" src="src/app.js"></script>'

tpl = io.open(TPL, encoding="utf-8").read()
css = io.open(CSS, encoding="utf-8").read()
js  = io.open(JS,  encoding="utf-8").read()

assert LINK_TAG in tpl,   "falta el <link> de styles.css en la plantilla"
assert SCRIPT_TAG in tpl, "falta el <script> de app.js en la plantilla"

out = tpl.replace(LINK_TAG,   "<style>\n" + css + "\n</style>")
out = out.replace(SCRIPT_TAG, '<script type="module">\n' + js + "\n</script>")

io.open(OUT, "w", encoding="utf-8").write(out)
print("OK  {} -> {:,} caracteres".format(OUT, len(out)))

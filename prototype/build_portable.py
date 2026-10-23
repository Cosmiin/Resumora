from pathlib import Path
p=Path(__file__).resolve().parent
s=(p/'index.html').read_text().replace('<link rel="stylesheet" href="styles.css">','<style>\n'+(p/'styles.css').read_text()+'\n</style>').replace('<script src="app.js"></script>','<script>\n'+(p/'app.js').read_text()+'\n</script>')
(p/'review.html').write_text(s)
print('Portable local prototype written: review.html (CDN theme helpers optional; local layout styles inline)')

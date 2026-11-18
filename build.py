from pathlib import Path
import json, shutil
out=Path('dist/server')
out.mkdir(exist_ok=True,parents=True)
(out/'index.js').write_text('const html='+json.dumps(Path('index.html').read_text(),ensure_ascii=False)+';\nconst key='+Path('key.json').read_text()+';\n'+Path('worker.mjs').read_text())
shutil.copytree('.openai','dist/.openai',dirs_exist_ok=True)
shutil.copytree('drizzle','dist/.openai/drizzle',dirs_exist_ok=True)

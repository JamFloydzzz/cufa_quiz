from pathlib import Path
import json, shutil
out=Path('dist/server')
out.mkdir(exist_ok=True,parents=True)
files={'html':'index.html','editor':'editor.html','qrLibrary':'vendor/qrcode.js'}
constants=[f'const {name}='+json.dumps(Path(path).read_text(),ensure_ascii=False) for name,path in files.items()]
for name,path in [('key','key.json'),('defaults','defaults.json'),('tracks','tracks.json'),('catalog','profiles.json')]:
    constants.append(f'const {name}='+Path(path).read_text())
(out/'index.js').write_text(';\n'.join(constants)+';\n'+Path('worker.mjs').read_text())
shutil.copytree('.openai','dist/.openai',dirs_exist_ok=True)
shutil.copytree('drizzle','dist/.openai/drizzle',dirs_exist_ok=True)

from pathlib import Path
import json
root=Path(__file__).parent
src=root/'src'
assets=json.loads((src/'assets.json').read_text(encoding='utf-8'))
# The readiness checker text, so a form install writes the same playbook/pbi-builder/tools copy as PowerShell.
assets['installer']=(root/'installer'/'Install-PBIBuilder.ps1').read_text(encoding='utf-8')
# Escape HTML script end markers in embedded documents.
encoded=json.dumps(assets,ensure_ascii=False).replace('<','\\u003c').replace('>','\\u003e').replace('&','\\u0026')
html=(src/'shell.html').read_text(encoding='utf-8').replace('__ASSETS__',encoded).replace('__CORE__',(src/'core.js').read_text(encoding='utf-8')).replace('__UI__',(src/'ui.js').read_text(encoding='utf-8'))
(root/'Akzo-SDD-PBI-Builder.html').write_text(html,encoding='utf-8',newline='\n')
print('Built',root/'Akzo-SDD-PBI-Builder.html',len(html.encode('utf-8')),'bytes')

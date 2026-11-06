from html.parser import HTMLParser
from pathlib import Path
import json
root=Path(__file__).parent
class Parser(HTMLParser):
 def __init__(self):super().__init__();self.rows=[];self.select=None
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if a.get('id') or tag=='button' or 'panel' in a.get('class','').split():
   r=dict(tag=tag,id=a.get('id'),className=a.get('class',''),tab=a.get('data-tab'),value=a.get('value',''),checked='checked' in a,text='')
   if a.get('id')=='assets':r['text']=(root/'src/assets.json').read_text(encoding='utf-8')
   self.rows.append(r)
   if tag=='select':self.select=r
  if tag=='option' and self.select is not None and (not self.select['value'] or 'selected' in a):self.select['value']=a.get('value','')
 def handle_endtag(self,tag):
  if tag=='select':self.select=None
p=Parser();p.feed((root/'src/shell.html').read_text(encoding='utf-8'));(root/'dom-fixture.json').write_text(json.dumps(p.rows,ensure_ascii=False),encoding='utf-8',newline='\n')

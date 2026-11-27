"""Додає арт у гру: python3 tools_add_art.py <тека з art/> — конвертує у webp і оновлює public/art/manifest.json"""
import sys,os,json,glob
from PIL import Image
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from doorway_detect import doorway
SRC=sys.argv[1];DST=os.path.join(os.path.dirname(os.path.abspath(__file__)),'public','art')
man_p=os.path.join(DST,'manifest.json')
man=json.load(open(man_p)) if os.path.exists(man_p) else {"parts":[],"walls":{},"cards":[],"ui":[]}
def save(im,sub,name,size):
  os.makedirs(os.path.join(DST,sub),exist_ok=True)
  im.thumbnail(size,Image.LANCZOS);im.save(os.path.join(DST,sub,name+'.webp'),'WEBP',quality=86,method=6)
for f in glob.glob(os.path.join(SRC,'**','*.*'),recursive=True):
  stem=os.path.splitext(os.path.basename(f))[0].lower();kind=os.path.basename(os.path.dirname(f)).lower()
  try:im=Image.open(f)
  except Exception:continue
  if kind=='parts':
    im=im.convert('RGBA');bb=im.getchannel('A').point(lambda a:255 if a>8 else 0).getbbox();im=im.crop(bb) if bb else im;save(im,'parts',stem,(512,512));man['parts']=sorted(set(man['parts'])|{stem})
  elif kind=='walls':man['walls'][stem]=doorway(f);save(im.convert('RGB'),'walls',stem,(768,960))
  elif kind=='cards':save(im.convert('RGB'),'cards',stem,(768,960));man['cards']=sorted(set(man['cards'])|{stem})
  elif kind=='ui':save(im.convert('RGBA'),'ui',stem,(1920,1920));man['ui']=sorted(set(man.get('ui',[]))|{stem})
  print('ok',kind,stem)
json.dump(man,open(man_p,'w'),ensure_ascii=False,indent=1)
print(json.dumps(man,ensure_ascii=False))

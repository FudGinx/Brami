import sys
from PIL import Image
def dark(p):r,g,b=p[:3];return r<70 and g<60 and b<55
def doorway(path):
  im=Image.open(path).convert('RGB');w,h=im.size;px=im.load();cx=w//2;sy=int(h*0.55)
  top=sy
  while top>0 and dark(px[cx,top-1]):top-=1
  bot=sy
  while bot<h-1 and dark(px[cx,bot+1]):bot+=1
  def width(y):
    a=cx
    while a>0 and dark(px[a-1,y]):a-=1
    b=cx
    while b<w-1 and dark(px[b+1,y]):b+=1
    return a,b
  x0,x1=width(sy);wm=x1-x0+1;H=bot-top+1
  rise=0
  for y in range(top,top+int(H*0.45)):
    a,b=width(y)
    if b-a+1>=0.97*wm:rise=y-top;break
  a,b=width(top+max(1,int(H*0.01)));w0=(b-a+1)/wm
  a,b=width(top+int(rise*0.6)) if rise>4 else (x0,x1);wr=(b-a+1)/wm
  shape='rect'
  if rise/H>0.02:
    shape='trap' if w0>0.55 else 'arch'
  return dict(x=round(x0/w,4),y=round(top/h,4),w=round(wm/w,4),h=round(H/h,4),shape=shape,rise=round(rise/H,4),cut=round((1-w0)/2,4),arch=shape=='arch')
if __name__=='__main__':print(doorway(sys.argv[1]))

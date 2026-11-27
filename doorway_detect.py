import sys
from PIL import Image
def dark(p):r,g,b=p[:3];return r<70 and g<60 and b<55
def doorway(path):
  im=Image.open(path).convert('RGB');w,h=im.size;px=im.load();cx=w//2
  ys=[y for y in range(h) if dark(px[cx,y])];top,bot=min(ys),max(ys)
  y=int(top+(bot-top)*0.6);x0=cx
  while x0>0 and dark(px[x0-1,y]):x0-=1
  x1=cx
  while x1<w-1 and dark(px[x1+1,y]):x1+=1
  return dict(x=round(x0/w,4),y=round(top/h,4),w=round((x1-x0+1)/w,4),h=round((bot-top+1)/h,4))
if __name__=='__main__':print(doorway(sys.argv[1]))

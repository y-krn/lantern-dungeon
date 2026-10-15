const assert = require('node:assert/strict');
const fs = require('node:fs');
const {inflateSync} = require('node:zlib');

// Inspect the real alpha silhouettes, not just six different source rectangles.
const png = fs.readFileSync(require.resolve('../dist/art/hero-side-walk.png'));
const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
assert.equal(png[24], 8); assert.equal(png[25], 6); assert.equal(png[28], 0, 'Use non-interlaced RGBA8 artwork');
const chunks = [];
for (let at = 8; at < png.length;) {
  const length = png.readUInt32BE(at), type = png.toString('ascii', at + 4, at + 8);
  if (type === 'IDAT') chunks.push(png.subarray(at + 8, at + 8 + length));
  at += length + 12;
}
const raw = inflateSync(Buffer.concat(chunks)), stride = width * 4;
const pixels = Buffer.alloc(stride * height);
function paeth(a,b,c) {
  const p=a+b-c, da=Math.abs(p-a), db=Math.abs(p-b), dc=Math.abs(p-c);
  return da<=db && da<=dc ? a : db<=dc ? b : c;
}
for (let y=0, at=0; y<height; y++) {
  const filter=raw[at++]; assert(filter<=4);
  for (let x=0; x<stride; x++) {
    const i=y*stride+x, a=x>=4 ? pixels[i-4] : 0, b=y ? pixels[i-stride] : 0, c=y && x>=4 ? pixels[i-stride-4] : 0;
    const predictor=filter===0 ? 0 : filter===1 ? a : filter===2 ? b : filter===3 ? Math.floor((a+b)/2) : paeth(a,b,c);
    pixels[i]=(raw[at++]+predictor)&255;
  }
}
const source = fs.readFileSync(require.resolve('../dist/sprites.js'),'utf8');
const frames = JSON.parse(source.match(/const sideFrames = (\[[\s\S]*?\]);/)[1]);
assert.equal(frames.length,6);
const soles = frames.map(([fx,fy,w,h]) => {
  let min=w, max=-1, sum=0, count=0;
  for(let y=Math.floor(h*.96);y<h;y++) for(let x=0;x<w;x++) {
    if(pixels[((fy+y)*width+fx+x)*4+3] <= 90) continue;
    min=Math.min(min,x);max=Math.max(max,x);sum+=x;count++;
  }
  assert(count>0,'Every pose must have a grounded boot');
  return {width:(max-min)/w, center:sum/count/w};
});
for (const start of [0,3]) {
  assert(soles[start].width > soles[start+1].width*1.7, 'Contact must visibly open the feet before weight transfer');
  assert(soles[start+1].width < .35 && soles[start+2].width < .35, 'Support and passing must lift one foot, not repeat the wide contact drawing');
  assert(soles[start+1].center-soles[start+2].center > .08, 'The planted boot must travel backward under the hips while the other foot passes');
}
console.log('PASS: actual boot silhouettes show wide contact, single-foot support and backward planted-foot travel in both half-cycles.');

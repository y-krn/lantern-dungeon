const assert = require('node:assert/strict');
const fs = require('node:fs');
const {inflateSync} = require('node:zlib');

// Check the actual cutouts used by the articulated feet, including the leg-free body.
const png = fs.readFileSync(require.resolve('../dist/art/hero-side-rig.png'));
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
const parts = JSON.parse(source.match(/const sideParts = (\{[\s\S]*?\});/)[1].replace(/(\w+):/g, '"$1":'));
assert.deepEqual(Object.keys(parts), ['body', 'thigh', 'shin', 'boot']);
for (const [name, [fx,fy,w,h]] of Object.entries(parts)) {
  assert(fx >= 0 && fy >= 0 && fx+w <= width && fy+h <= height);
  let opaque = 0;
  for(let y=0;y<h;y++) for(let x=0;x<w;x++)
    opaque += Number(pixels[((fy+y)*width+fx+x)*4+3] > 90);
  assert(opaque > w*h*.3, `${name} must contain painted artwork, not an empty cutout`);
}
const [fx,fy,w,h] = parts.body;
for (let y=Math.floor(h*.96);y<h;y++) for(let x=Math.floor(w*.4);x<w*.65;x++)
  assert(pixels[((fy+y)*width+fx+x)*4+3] <= 90, 'The torso must not retain a third, baked-in leg');
console.log('PASS: RGBA rig contains body, thigh, shin and boot cutouts, without baked-in legs below the torso.');

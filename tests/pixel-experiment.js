import { stylize } from '../src/stylize.ts';
import { quantize } from '../src/quantize.ts';
import { MARD221 } from '../src/mard.ts';

const surface = size => { const canvas=document.createElement('canvas'); canvas.width=canvas.height=size; return canvas; };
const circle = (ctx,x,y,r,color) => { ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill(); };

function cat() {
  const image=surface(256); const ctx=image.getContext('2d');
  ctx.fillStyle='#fff7f3';ctx.fillRect(0,0,256,256);
  ctx.strokeStyle='#463c43';ctx.lineWidth=3;ctx.lineJoin='round';ctx.fillStyle='#ffc5a2';
  ctx.beginPath();ctx.moveTo(55,105);ctx.lineTo(54,44);ctx.lineTo(103,83);ctx.lineTo(153,83);ctx.lineTo(202,44);ctx.lineTo(201,105);ctx.bezierCurveTo(232,210,24,210,55,105);ctx.fill();ctx.stroke();
  ctx.fillStyle='#ec8fa3';ctx.beginPath();ctx.moveTo(63,80);ctx.lineTo(62,57);ctx.lineTo(82,77);ctx.fill();
  ctx.beginPath();ctx.moveTo(173,77);ctx.lineTo(194,57);ctx.lineTo(193,80);ctx.fill();
  circle(ctx,77,151,9,'#f2a4aa');circle(ctx,179,151,9,'#f2a4aa');
  ctx.fillStyle='#463c43';ctx.fillRect(88,128,3,10);ctx.fillRect(152,128,3,10);
  ctx.fillStyle='#e88191';ctx.beginPath();ctx.moveTo(122,143);ctx.lineTo(135,143);ctx.lineTo(128,151);ctx.fill();
  ctx.strokeStyle='#463c43';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(128,151);ctx.lineTo(128,158);ctx.quadraticCurveTo(122,168,115,158);ctx.moveTo(128,158);ctx.quadraticCurveTo(135,168,142,158);ctx.stroke();
  ctx.beginPath();ctx.moveTo(31,136);ctx.lineTo(62,142);ctx.moveTo(28,155);ctx.lineTo(61,152);ctx.moveTo(196,142);ctx.lineTo(226,136);ctx.moveTo(196,152);ctx.lineTo(228,155);ctx.stroke();
  return {name:'小猫 · 细眼睛、嘴巴和胡须',image,features:[[88,128,3,10],[152,128,3,10]]};
}

function rabbit() {
  const image=surface(256);const ctx=image.getContext('2d');
  ctx.fillStyle='#e2daf7';ctx.fillRect(0,0,256,256);
  ctx.fillStyle='#fff5ef';ctx.strokeStyle='#6f5562';ctx.lineWidth=3;
  for(const x of [96,160]){ctx.beginPath();ctx.ellipse(x,77,18,54,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#f3b8c5';ctx.beginPath();ctx.ellipse(x,76,8,40,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff5ef';}
  ctx.beginPath();ctx.ellipse(128,164,74,62,0,0,Math.PI*2);ctx.fill();ctx.stroke();
  circle(ctx,81,175,10,'#f3b8c5');circle(ctx,175,175,10,'#f3b8c5');
  ctx.fillStyle='#6f5562';ctx.fillRect(100,152,3,12);ctx.fillRect(152,152,3,12);
  circle(ctx,128,170,5,'#dd869e');
  ctx.strokeStyle='#6f5562';ctx.beginPath();ctx.moveTo(117,180);ctx.quadraticCurveTo(128,189,139,180);ctx.stroke();
  return {name:'小兔 · 浅色身体和细五官',image,features:[[100,152,3,12],[152,152,3,12]]};
}

function landscape() {
  const image=surface(256);const ctx=image.getContext('2d');
  const sky=ctx.createLinearGradient(0,0,0,256);sky.addColorStop(0,'#65799f');sky.addColorStop(.6,'#eeb798');sky.addColorStop(1,'#f6ddb0');
  ctx.fillStyle=sky;ctx.fillRect(0,0,256,256);circle(ctx,170,100,25,'#ffe4b0');
  for(const [color,points] of [['#9099a5',[[0,170],[55,103],[120,178],[185,130],[256,186]]],['#547879',[[0,186],[70,154],[132,192],[204,166],[256,193]]],['#2a555e',[[0,213],[70,195],[151,220],[232,201],[256,217]]]]){
    ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,256);for(const [x,y] of points)ctx.lineTo(x,y);ctx.lineTo(256,256);ctx.fill();
  }
  return {name:'风景 · 保留大轮廓，32 格仍会丢失纹理',image,features:[]};
}

function convert(image,width,style) {
  const sample=surface(width*(style==='pixel'?4:1));const ctx=sample.getContext('2d',{willReadFrequently:true});
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(image,0,0,sample.width,sample.height);
  let rgba=ctx.getImageData(0,0,sample.width,sample.height).data;
  if(style==='pixel')rgba=stylize(rgba,width,width);
  return quantize(rgba,width,width,24,MARD221);
}

function draw(chart) {
  const canvas=surface(chart.width);const ctx=canvas.getContext('2d');const data=ctx.createImageData(chart.width,chart.height);
  chart.indices.forEach((index,i)=>{if(index!==65535)data.data.set([...chart.palette[index],255],i*4);});ctx.putImageData(data,0,0);return canvas;
}

export const metrics=[];
for(const fixture of [cat(),rabbit(),landscape()]) {
  const section=document.createElement('section');const heading=document.createElement('h2');heading.textContent=fixture.name;section.append(heading);
  const samples=document.createElement('div');samples.className='samples';section.append(samples);
  const original=document.createElement('figure');original.append(fixture.image);const caption=document.createElement('figcaption');caption.textContent='原始合成图 · 256×256';original.append(caption);samples.append(original);
  const record={name:fixture.name};
  for(const [width,style,title] of [[32,'faithful','原算法 · 32×32'],[32,'pixel','轮廓优先 · 32×32'],[64,'faithful','原算法 · 64×64']]) {
    const chart=convert(fixture.image,width,style);const figure=document.createElement('figure');figure.append(draw(chart));const caption=document.createElement('figcaption');caption.textContent=title;figure.append(caption);samples.append(figure);
    if(fixture.features.length) {
      const values=fixture.features.map(([x,y,w,h])=>{
        let darkest=255;
        for(let yy=Math.floor(y*width/256);yy<=Math.floor((y+h-1)*width/256);yy++)for(let xx=Math.floor(x*width/256);xx<=Math.floor((x+w-1)*width/256);xx++){
          const rgb=chart.palette[chart.indices[yy*width+xx]];darkest=Math.min(darkest,rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722);
        }
        return darkest;
      });
      record[`${style}${width}`]=Math.round(values.reduce((a,b)=>a+b,0)/values.length);
    }
  }
  if(fixture.features.length){const note=document.createElement('p');note.className='metric';note.textContent=`眼睛所在格的最暗色亮度（越低越清楚）：原算法32格 ${record.faithful32} / 轮廓优先32格 ${record.pixel32} / 原算法64格 ${record.faithful64}。仅衡量测试图的细线对比度，不衡量主观可爱程度。`;section.append(note);}
  metrics.push(record);document.getElementById('results').append(section);
}
document.body.dataset.ready='true';

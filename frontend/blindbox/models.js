import * as T from '/workshop-runtime/vendor/three.module.js';

export function characterModel(character) {
  const root = new T.Group();
  const matte = color => new T.MeshPhysicalMaterial({ color, roughness: .4, metalness: .02, clearcoat: .22, clearcoatRoughness: .35 });
  const body = matte(character.color), dark = matte('#25332f'), white = matte('#fffdf1'), pink = matte('#f7aaa4'), gold = matte('#eeb84e');
  function mesh(geometry, material, x, y, z, parent = root) {
    const m = new T.Mesh(geometry, material); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  function orb(material,x,y,z,sx,sy,sz,parent) { const m=mesh(new T.SphereGeometry(1,24,16),material,x,y,z,parent);m.scale.set(sx,sy,sz);return m; }
  function cone(material,x,y,z,r,h) { return mesh(new T.ConeGeometry(r,h,24),material,x,y,z); }
  const id = character.id;
  orb(body,0,.83,0,.48,.65,.36);
  orb(body,0,1.67,0,.66,.58,.49);
  const arms=[];
  for(const side of [-1,1]) {
    const pivot=new T.Group();pivot.position.set(side*.42,1.12,0);root.add(pivot);arms.push(pivot);
    orb(body,side*.12,-.24,0,.16,.36,.17,pivot);
    orb(dark,side*.24,.18,.08,.22,.14,.31);
    orb(dark,side*.23,1.75,.45,.095,.13,.055);
    orb(white,side*.20,1.8,.494,.025,.035,.014);
    orb(pink,side*.39,1.54,.393,.1,.05,.028);
  }
  const smile=mesh(new T.TorusGeometry(.115,.023,8,20,Math.PI),dark,0,1.48,.47);smile.rotation.z=Math.PI;
  if(['imp','goblin'].includes(id)) {
    for(const side of [-1,1]) {const ear=cone(body,side*.7,1.72,0,.23,.65);ear.rotation.z=-side*1.05;}
    if(id==='imp') {for(const side of [-1,1])cone(gold,side*.38,2.2,0,.14,.4);}
    else {orb(matte('#c38257'),0,.8,.22,.37,.44,.22);for(const side of [-1,1])cone(white,side*.14,1.48,.5,.065,.18);}
  }
  if(id==='skeleton') {
    for(const side of [-1,1])orb(dark,side*.23,1.75,.43,.18,.2,.09);
    for(let i=0;i<3;i++)orb(white,0,.72+i*.16,.35,.31,.04,.04);
    orb(dark,0,1.52,.46,.07,.09,.03);
    for(let i=-1;i<=1;i++)mesh(new T.BoxGeometry(.085,.14,.07),white,i*.1,1.32,.39);
  }
  if(id==='ghost') {
    cone(body,0,.65,0,.64,1.3);
    for(let i=-2;i<=2;i++)orb(body,i*.21,.16,0,.15,.16,.28);
  }
  if(id==='reaper') {
    orb(dark,0,1.65,.38,.51,.45,.22);
    for(const side of [-1,1])orb(gold,side*.2,1.73,.59,.08,.05,.025);
    cone(body,0,2.13,-.03,.47,.57);cone(body,0,.62,0,.62,1.15);
    mesh(new T.CylinderGeometry(.035,.035,2.25,12),matte('#7a5c44'),.9,1.15,0);
    const blade=mesh(new T.TorusGeometry(.45,.065,8,22,Math.PI),white,.49,2.08,0);blade.rotation.z=.18;
  }
  if(id==='doll') {
    for(const side of [-1,1]) {orb(matte('#8f5149'),side*.58,1.7,-.02,.23,.3,.25);orb(dark,side*.23,1.75,.47,.14,.14,.05);for(const offset of [-.03,.03])orb(white,side*.23+offset,1.75,.52,.018,.02,.01);}
    cone(matte('#6a818b'),0,.76,0,.54,.72);
  }
  if(['cat','unicorn'].includes(id)) {
    for(const side of [-1,1]){cone(body,side*.4,2.17,0,.22,.53);cone(pink,side*.4,2.17,.09,.12,.34);}
    orb(white,0,1.5,.43,.3,.19,.13);orb(pink,0,1.61,.55,.075,.055,.04);
    if(id==='cat') {orb(gold,0,.94,.36,.24,.29,.06);for(const side of [-1,1])for(let i=0;i<2;i++){const w=mesh(new T.BoxGeometry(.24,.015,.02),dark,side*.45,1.48+i*.09,.46);w.rotation.z=side*(i?-.1:.1);}}
    else {cone(gold,0,2.37,.17,.12,.65);for(let i=0;i<5;i++)orb(matte(['#eb899d','#eebe64','#86cba5','#7db1d1','#b49ad4'][i]),.2-i*.11,2.13,-.13,.18,.19,.28);}
  }
  if(id==='star') {
    const shape=new T.Shape();for(let i=0;i<10;i++){const a=Math.PI/2+i*Math.PI/5,r=i%2?.43:.9;const x=Math.cos(a)*r,y=Math.sin(a)*r;i?shape.lineTo(x,y):shape.moveTo(x,y);}shape.closePath();
    const g=new T.ExtrudeGeometry(shape,{depth:.3,bevelEnabled:true,bevelThickness:.1,bevelSize:.08,bevelSegments:3,steps:1});mesh(g,body,0,1.4,-.05);
  }
  if(['fairy','matchmaker','fortune'].includes(id)) {
    const hair=matte(id==='matchmaker'?'#f9f5e9':'#624640');orb(hair,0,2.01,-.05,.66,.28,.48);
    cone(body,0,.7,0,.58,.94);
    if(id==='fairy') {for(const side of [-1,1]){const wing=orb(matte('#b6e6d4'),side*.61,1.28,-.18,.43,.64,.1);wing.rotation.z=-side*.45;}cone(gold,0,2.28,.08,.18,.3);}
    if(id==='matchmaker'){orb(white,0,1.31,.32,.28,.4,.14);const ring=mesh(new T.TorusGeometry(.24,.045,8,24),matte('#e74f69'),.63,.8,.3);ring.rotation.y=.3;}
    if(id==='fortune'){mesh(new T.BoxGeometry(1.24,.24,.55),gold,0,2.16,0);orb(gold,0,.87,.49,.43,.17,.2);}
  }
  // Sculpted secondary forms distinguish silhouettes, not just body colors.
  const leather=matte('#674b48'), rose=matte('#d85d77'), ivory=matte('#fff8e6');
  const curve=(points,radius,material)=>mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),24,radius,8,false),material,0,0,0);
  if(['imp','goblin'].includes(id)){
    for(let i=0;i<5;i++){const tuft=cone(dark,(i-2)*.16,2.14+Math.sin(i)*.06,-.06,.12,.29);tuft.rotation.z=(i-2)*.2;}
    for(const s of [-1,1]){const brow=orb(dark,s*.25,1.94,.405,.15,.035,.038);brow.rotation.z=s*.2;orb(pink,s*.74,1.78,.07,.13,.16,.045);}
    mesh(new T.CylinderGeometry(.49,.49,.11,32),leather,0,.66,0);mesh(new T.BoxGeometry(.17,.14,.045),gold,0,.66,.48);
    for(let i=0;i<3;i++)orb(gold,.18,.83+i*.14,.43,.032,.032,.02);
    curve([[0,.58,-.28],[.7,.5,-.5],[.91,.85,-.35],[.84,1.02,-.12]],.065,body);
    if(id==='imp')for(const s of [-1,1]){const wing=new T.Shape();wing.moveTo(0,0);wing.lineTo(s*.6,.5);wing.quadraticCurveTo(s*.65,.15,s*.4,-.2);wing.lineTo(0,-.12);mesh(new T.ExtrudeGeometry(wing,{depth:.06,bevelEnabled:true,bevelSize:.025,bevelThickness:.025,bevelSegments:2,steps:1}),rose,s*.3,1.0,-.3);}
    else {const satchel=orb(leather,-.46,.68,.1,.2,.24,.17);satchel.rotation.z=-.2;orb(gold,-.51,.72,.25,.055,.055,.024);}
  }
  if(id==='skeleton'){
    for(const s of [-1,1]){orb(ivory,s*.31,1.41,.28,.2,.16,.18);for(let i=0;i<3;i++)orb(dark,s*.15,1.71,.54-i*.005,.035,.035,.014);}
    for(let i=0;i<5;i++)orb(ivory,0,.57+i*.11,-.33,.06,.055,.045);
    curve([[-.43,2,.15],[-.19,2.08,.36],[-.15,1.98,.4]],.013,dark);
    mesh(new T.BoxGeometry(.4,.17,.14),rose,0,1.18,.32);
  }
  if(id==='ghost'){
    for(let i=0;i<7;i++){const a=i*Math.PI*2/7;orb(body,Math.cos(a)*.44,.36,Math.sin(a)*.38,.22,.29,.22);}
    cone(matte('#d681af'),.15,2.26,-.03,.32,.55);const brim=mesh(new T.CylinderGeometry(.44,.44,.07,32),rose,.15,2.06,-.03);brim.rotation.z=-.12;
    orb(gold,.16,2.17,.28,.08,.08,.025);
  }
  if(id==='reaper'){
    for(const s of [-1,1]){curve([[s*.43,1.9,.28],[s*.57,1.65,.31],[s*.38,1.28,.32]],.055,gold);}
    for(let i=-2;i<=2;i++)curve([[i*.12,1.06,.24],[i*.2,.66,.34],[i*.21,.2,.4]],.025,matte('#a297b8'));
    orb(gold,0,1.14,.4,.085,.085,.035);
  }
  if(id==='doll'){
    for(const s of [-1,1]){const bow=cone(rose,s*.58,1.95,.15,.12,.26);bow.rotation.z=Math.PI/2;orb(gold,s*.55,1.95,.2,.055,.06,.04);}
    for(let i=0;i<4;i++){mesh(new T.BoxGeometry(.08,.013,.02),dark,.1+i*.055,1.45+i*.025,.47).rotation.z=.9;}
    for(let i=0;i<3;i++)orb(ivory,0,.78+i*.13,.39,.045,.045,.025);
    mesh(new T.TorusGeometry(.42,.035,8,36),rose,0,.44,0).rotation.x=Math.PI/2;
  }
  if(id==='cat'){
    const collar=mesh(new T.TorusGeometry(.37,.055,10,36),rose,0,1.21,0);collar.rotation.x=Math.PI/2;orb(gold,0,1.16,.39,.1,.1,.09);
    for(const s of [-1,1])for(let i=0;i<3;i++)orb(pink,s*.25+(i-1)*.06,.18,.37,.025,.03,.012);
    curve([[0,.42,-.32],[.68,.4,-.44],[.8,.72,-.25],[.71,.94,-.2]],.105,body);
    for(let i=0;i<3;i++)orb(gold,(i-1)*.15,2.12,-.015,.045,.12,.12);
    mesh(new T.TorusGeometry(.16,.024,8,32),matte('#b47832'),0,.96,.43);
  }
  if(id==='star'){
    mesh(new T.TorusGeometry(.14,.035,10,32),ivory,-.45,1.95,.35);orb(pink,-.42,1.52,.48,.09,.05,.028);orb(pink,.42,1.52,.48,.09,.05,.028);
    cone(gold,0,2.34,0,.18,.35);
  }
  if(id==='fairy'){
    for(const s of [-1,1]){const wing=orb(matte('#88cabc'),s*.74,.87,-.21,.27,.35,.065);wing.rotation.z=s*.5;curve([[s*.3,1.26,-.1],[s*.72,1.5,-.08],[s*.84,1.7,-.12]],.018,gold);}
    for(let i=0;i<8;i++){const a=i*Math.PI/4;orb(rose,Math.cos(a)*.45,.55,Math.sin(a)*.38,.18,.24,.13);}
    for(let i=0;i<5;i++)orb(rose,(i-2)*.17,2.12,.25,.08,.08,.06);
    mesh(new T.CylinderGeometry(.022,.022,.8,12),gold,.75,1.06,.08);orb(gold,.75,1.51,.08,.1,.1,.07);
  }
  if(id==='matchmaker'){
    for(const s of [-1,1])orb(ivory,s*.28,1.47,.45,.2,.055,.09);
    for(let i=0;i<5;i++)orb(gold,.12,.59+i*.12,.36,.025,.03,.02);
    curve([[-.62,.73,.2],[-.71,1,.41],[-.33,1.06,.46],[.22,.79,.51],[.62,.94,.28]],.018,rose);
    orb(ivory,0,2.27,-.08,.2,.2,.18);mesh(new T.CylinderGeometry(.03,.03,.6,12),gold,0,2.25,-.06).rotation.z=Math.PI/2;
  }
  if(id==='fortune'){
    const robe=matte('#b63843');orb(robe,0,.83,.05,.47,.45,.34);
    for(const s of [-1,1])curve([[s*.27,1.19,.27],[s*.08,.89,.4],[s*.27,.49,.3]],.035,gold);
    for(let i=0;i<3;i++)orb(gold,0,.67+i*.13,.415,.034,.034,.02);
    orb(rose,0,2.31,.1,.24,.17,.2);orb(gold,0,2.32,.3,.08,.08,.03);
    for(const s of [-1,1])orb(gold,s*.35,.96,.46,.15,.09,.14);
  }
  if(id==='unicorn'){
    const palette=['#ed92ac','#edc967','#87cbbb','#86acd5','#ae94c8'];
    for(let i=0;i<9;i++){const a=i*.25;orb(matte(palette[i%5]),.35+Math.sin(a)*.18,2.12-i*.09,-.17,.15,.2,.29);}
    for(let i=0;i<5;i++)curve([[0,.5,-.31],[.55,.48,-.52],[.7,.76-i*.07,-.31]],.052,matte(palette[i]));
    for(const s of [-1,1])orb(gold,s*.24,.16,.08,.21,.11,.31);
    for(let i=0;i<4;i++)mesh(new T.TorusGeometry(.11-i*.02,.018,8,24),ivory,0,2.19+i*.12,.17).rotation.x=Math.PI/2;
  }
  return rigCharacter(root,arms,id);
}

function rigCharacter(source, arms, id) {
  const root=new T.Group();root.name='Character_'+id;
  const bones=[];
  function bone(name,x,y,z,parent){const b=new T.Bone();b.name=name;b.position.set(x,y,z);(parent||root).add(b);bones.push(b);return b;}
  const hips=bone('Hips',0,0,0),spine=bone('Spine',0,.8,0,hips),head=bone('Head',0,.77,0,spine);
  const left=bone('ArmL',-.42,.32,0,spine);bone('WristL',-.12,-.3,0,left);
  const right=bone('ArmR',.42,.32,0,spine);bone('WristR',.12,-.3,0,right);
  bone('FootL',-.24,.18,.08,hips);bone('FootR',.24,.18,.08,hips);
  source.updateMatrixWorld(true);root.updateMatrixWorld(true);const skeleton=new T.Skeleton(bones);
  source.traverse(node=>{
    if(!node.isMesh)return;
    const geometry=node.geometry.clone();geometry.applyMatrix4(node.matrixWorld);
    const position=geometry.attributes.position,indices=[],weights=[];
    let arm=-1;for(let p=node.parent;p&&p!==source;p=p.parent){const i=arms.indexOf(p);if(i>=0)arm=i;}
    const center=new T.Vector3();node.getWorldPosition(center);
    const base=arm===0?3:arm===1?5:center.y>1.28?2:center.y<.3?(center.x<0?7:8):1;
    for(let i=0;i<position.count;i++){
      const bend=arm>=0?T.MathUtils.clamp((1.0-position.getY(i))/.3,0,1):0;
      indices.push(base,arm>=0?base+1:base,0,0);weights.push(1-bend,bend,0,0);
    }
    geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
    const mesh=new T.SkinnedMesh(geometry,node.material);mesh.name=id+'_part_'+root.children.length;mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;root.add(mesh);mesh.bind(skeleton);
    node.geometry.dispose();
  });
  const times=Array.from({length:17},(_,i)=>i/4);
  function clip(name,energy){const tracks=[];
    for(const b of bones){const values=[];for(const t of times){const wave=Math.sin(t*Math.PI*2),isArm=b.name.startsWith('Arm'),side=b.name.endsWith('L')?-1:1;
      let x=0,y=0,z=0;
      if(b.name==='Spine')z=wave*.09*energy;
      if(b.name==='Head'){y=Math.sin(t*Math.PI)*.18*energy;x=wave*.06*energy;}
      if(isArm){z=side*(name==='Wave'?.95:.22)+wave*.45*energy;x=Math.cos(t*Math.PI*2)*.2*energy;}
      if(b.name.startsWith('Wrist'))z=side*(.12+wave*.2*energy);
      if(b.name.startsWith('Foot'))x=wave*side*.22*energy;
      const q=new T.Quaternion().setFromEuler(new T.Euler(x,y,z));values.push(q.x,q.y,q.z,q.w);
    }tracks.push(new T.QuaternionKeyframeTrack(b.name+'.quaternion',times,values));}
    return new T.AnimationClip(name,4,tracks);
  }
  root.animations=[clip('Idle',.15),clip('Dance',1),clip('Wave',.7)];
  root.userData.assetType='original-procedural-skinned';root.userData.boneCount=bones.length;
  return root;
}

export function giftModel(color='#e27659') {
  const g=new T.Group(),lid=new T.Group();const mat=c=>new T.MeshStandardMaterial({color:c,roughness:.42});
  function box(x,y,z,w,h,d,c,parent=g){const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat(c));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  box(0,.64,0,1.45,1.28,1.45,color);box(0,.64,.732,.18,1.3,.025,'#fee7a7');box(.732,.64,0,.025,1.3,.18,'#fee7a7');
  lid.position.y=1.36;g.add(lid);box(0,0,0,1.58,.22,1.58,color,lid);box(0,.12,0,.18,.025,1.59,'#fee7a7',lid);box(0,.13,0,1.59,.025,.18,'#fee7a7',lid);
  for(const side of [-1,1]){const loop=new T.Mesh(new T.TorusGeometry(.26,.06,10,30),mat('#fee7a7'));loop.position.set(side*.24,.3,0);loop.rotation.y=side*.3;loop.scale.y=.65;lid.add(loop);}
  g.userData.lid=lid;return g;
}

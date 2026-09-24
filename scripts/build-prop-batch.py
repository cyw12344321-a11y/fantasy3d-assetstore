import bpy, math, json
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / 'frontend/workshop-runtime/props-batch-01'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, color, metal=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Metallic'].default_value = metal
    bs.inputs['Roughness'].default_value = .42
    return m

wood=material('Walnut',(.25,.12,.065))
ivory=material('Ivory',(.8,.82,.79))
dark=material('Graphite',(.035,.047,.06),.35)
fabric=material('Sage upholstery',(.21,.36,.3))
gold=material('Brass',(.62,.38,.13),.7)
blue=material('Screen blue',(.025,.2,.42))
colors=[material('Book'+str(i),c) for i,c in enumerate([(.16,.3,.49),(.54,.22,.17),(.72,.6,.36),(.24,.39,.29)])]
objects=[]
def box(name, pos, size, mat, bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1,location=pos)
    obj=bpy.context.object
    obj.name=name
    obj.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    obj.data.materials.append(mat)
    if bevel:
        mod=obj.modifiers.new('Soft edges','BEVEL'); mod.width=bevel; mod.segments=3
        bpy.context.view_layer.objects.active=obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    objects.append(obj)
    return obj

def export(name):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects: obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',use_selection=True)
    for obj in objects: bpy.data.objects.remove(obj,do_unlink=True)
    objects.clear()

box('Back',(0,.26,1.1),(2.25,.08,2.2),wood)
for x in [-1.1,1.1]: box('Side',(x,0,1.1),(.09,.62,2.2),wood)
for z in [.1,.62,1.14,1.66,2.18]: box('Shelf',(0,0,z),(2.25,.62,.09),wood)
for row in range(4):
    for col in range(10):
        h=.27+(col%3)*.05
        box('Book',(-.94+col*.195,-.03,.17+row*.52+h/2),(.12,.33,h),colors[(row+col)%4],.008)
export('research-bookshelf')

for x in [-1.1,1.1]:
    for y in [-.35,.35]: box('Foot',(x,y,.13),(.1,.1,.26),gold,.01)
box('Base',(0,0,.34),(2.6,.98,.25),dark)
box('Back',(0,.38,.83),(2.6,.22,.98),fabric,.08)
for x in [-1.25,1.25]: box('Arm',(x,0,.67),(.22,1.03,.65),fabric,.08)
for x in [-.78,0,.78]:
    box('Seat',(x,-.03,.55),(.74,.76,.19),fabric,.07)
    box('Back cushion',(x,.23,.9),(.73,.22,.52),fabric,.07)
box('Accent pillow',(.7,-.03,.84),(.38,.18,.38),colors[2],.07)
export('lounge-sofa')

for x in [-.72,0,.72]:
    box('Monitor base',(x,0,.035),(.4,.24,.07),dark)
    box('Monitor stand',(x,.035,.25),(.055,.05,.45),gold)
    box('Monitor frame',(x,.02,.58),(.69,.09,.44),dark)
    box('Display',(x,-.031,.58),(.64,.008,.38),blue,.005)
    for i in range(4): box('Chart',(x-.23+i*.15,-.04,.51+i*.016),(.06,.008,.08+i*.03),ivory,.002)
box('Keyboard',(0,-.31,.035),(.53,.18,.05),dark,.015)
export('analysis-console')

box('Lamp base',(0,0,.035),(.32,.25,.07),dark)
box('Lower arm',(0,.03,.27),(.055,.055,.47),gold)
arm=box('Upper arm',(0,-.12,.56),(.045,.37,.045),gold)
arm.rotation_euler.x=math.radians(-25)
box('Light hood',(0,-.3,.64),(.3,.2,.09),dark)
box('Diffuser',(0,-.3,.591),(.25,.16,.012),ivory,.007)
export('inspection-lamp')

(OUT/'manifest.json').write_text(json.dumps({'source':'Blender procedural modeling from approved workstation reference board','reference':'reference-workstation-board.png','aiImageTo3D':False,'assets':['research-bookshelf.glb','lounge-sofa.glb','analysis-console.glb','inspection-lamp.glb']},indent=2))
print('BATCH_READY',str(OUT))

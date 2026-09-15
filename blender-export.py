import bpy
import sys
import os

argv = sys.argv
argv = argv[argv.index("--") + 1:]
output_path = argv[0]

os.makedirs(os.path.dirname(output_path), exist_ok=True)

bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format='GLB',
    export_apply=True
)
print(f"EXPORTED: {output_path}")

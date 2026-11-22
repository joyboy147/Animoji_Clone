#!/usr/bin/env python3
"""
Convert the MonkeyMoji Collada (DAE) model into standard glTF 2.0 Binary (GLB)
with full ARKit morph targets, PBR materials, and embedded textures.
"""

import os
import struct
import json
import xml.etree.ElementTree as ET
import numpy as np
from PIL import Image

ASSETS_DIR = os.path.abspath("assets/monkey")
SHARED_DIR = os.path.abspath("assets/sharedImages")
OUTPUT_GLB = os.path.abspath("assets/monkey/monkeymoji.glb")

tree = ET.parse(os.path.join(ASSETS_DIR, "monkey.dae"))
root = tree.getroot()
ns = {'c': 'http://www.collada.org/2005/11/COLLADASchema'}

def parse_dae_mesh(mesh_id):
    geom = root.find(f'.//c:geometry[@id="{mesh_id}"]', ns)
    if geom is None:
        raise ValueError(f"Geometry {mesh_id} not found")
    mesh = geom.find('.//c:mesh', ns)
    
    # Vertices
    v_src_id = mesh.find('.//c:vertices', ns).find('.//c:input', ns).attrib['source'][1:]
    v_arr = [float(x) for x in mesh.find(f'.//c:source[@id="{v_src_id}"]//c:float_array', ns).text.split()]
    vertices = np.array(v_arr, dtype=np.float32).reshape(-1, 3)
    
    # UVs
    uv_inp = mesh.find('.//c:triangles/c:input[@semantic="TEXCOORD"]', ns)
    uv_src_id = uv_inp.attrib['source'][1:]
    uv_arr = [float(x) for x in mesh.find(f'.//c:source[@id="{uv_src_id}"]//c:float_array', ns).text.split()]
    uvs = np.array(uv_arr, dtype=np.float32).reshape(-1, 2)
    # glTF expects UV with origin at top-left: V = 1.0 - V
    uvs[:, 1] = 1.0 - uvs[:, 1]
    
    # Triangles
    p = [int(x) for x in mesh.find('.//c:triangles/c:p', ns).text.split()]
    indices = np.array(p, dtype=np.uint32)
    
    return vertices, uvs, indices

def parse_morph_targets(controller_source, num_base_vertices):
    morph = root.find(f'.//c:morph[@source="{controller_source}"]', ns)
    if morph is None:
        return {}, []
    
    targets_elem = morph.find('.//c:IDREF_array', ns)
    target_ids = targets_elem.text.split()
    
    morph_deltas = {}
    morph_names = []
    
    for tid in target_ids:
        tgeom = root.find(f'.//c:geometry[@id="{tid}"]', ns)
        if tgeom is None:
            continue
        name = tgeom.attrib.get('name', tid)
        
        mesh = tgeom.find('.//c:mesh', ns)
        float_elem = mesh.find('.//c:float_array', ns)
        if float_elem is None:
            continue
        sparse_coords = np.array([float(x) for x in float_elem.text.split()], dtype=np.float32).reshape(-1, 3)
        
        lines = mesh.find('.//c:lines', ns)
        full_delta = np.zeros((num_base_vertices, 3), dtype=np.float32)
        if lines is not None:
            p_elem = lines.find('.//c:p', ns)
            if p_elem is not None:
                p = [int(x) for x in p_elem.text.split()]
                offset = 0
                for i in range(0, len(p), 2):
                    start_idx = p[i]
                    end_idx = p[i+1]
                    cnt = end_idx - start_idx
                    full_delta[start_idx:end_idx] = sparse_coords[offset:offset+cnt]
                    offset += cnt
        else:
            full_delta[:len(sparse_coords)] = sparse_coords
            
        morph_deltas[name] = full_delta
        morph_names.append(name)
        
    return morph_deltas, morph_names

def compute_smooth_normals(vertices, indices):
    normals = np.zeros_like(vertices)
    triangles = vertices[indices.reshape(-1, 3)]
    v0, v1, v2 = triangles[:, 0], triangles[:, 1], triangles[:, 2]
    face_normals = np.cross(v1 - v0, v2 - v0)
    
    for i in range(len(indices) // 3):
        i0, i1, i2 = indices[i*3], indices[i*3+1], indices[i*3+2]
        fn = face_normals[i]
        normals[i0] += fn
        normals[i1] += fn
        normals[i2] += fn
        
    norms = np.linalg.norm(normals, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    normals = normals / norms
    return normals.astype(np.float32)

print("Parsing DAE meshes and morph targets...")
# 1. Head
head_v, head_uv, head_idx = parse_dae_mesh("head_GES")
head_norm = compute_smooth_normals(head_v, head_idx)
head_morphs, head_morph_names = parse_morph_targets("#head_GES", len(head_v))
print(f"Head: {len(head_v)} vertices, {len(head_idx)//3} tris, {len(head_morph_names)} morph targets")

# 2. Left Eye
leye_v, leye_uv, leye_idx = parse_dae_mesh("L_eye_GES")
leye_norm = compute_smooth_normals(leye_v, leye_idx)
leye_morphs, leye_morph_names = parse_morph_targets("#L_eye_GES", len(leye_v))
print(f"L_eye: {len(leye_v)} vertices, {len(leye_morph_names)} morph targets")

# 3. Right Eye
reye_v, reye_uv, reye_idx = parse_dae_mesh("R_eye_GES")
reye_norm = compute_smooth_normals(reye_v, reye_idx)
reye_morphs, reye_morph_names = parse_morph_targets("#R_eye_GES", len(reye_v))
print(f"R_eye: {len(reye_v)} vertices, {len(reye_morph_names)} morph targets")

# 4. Lower Teeth
lteeth_v, lteeth_uv, lteeth_idx = parse_dae_mesh("lowerTeeth_GES")
lteeth_norm = compute_smooth_normals(lteeth_v, lteeth_idx)
lteeth_morphs, lteeth_morph_names = parse_morph_targets("#lowerTeeth_GES", len(lteeth_v))

# 5. Upper Teeth
uteeth_v, uteeth_uv, uteeth_idx = parse_dae_mesh("upperTeeth_GES")
uteeth_norm = compute_smooth_normals(uteeth_v, uteeth_idx)
uteeth_morphs, uteeth_morph_names = parse_morph_targets("#upperTeeth_GES", len(uteeth_v))

# 6. Tongue
tongue_v, tongue_uv, tongue_idx = parse_dae_mesh("tongue_GES")
tongue_norm = compute_smooth_normals(tongue_v, tongue_idx)
tongue_morphs, tongue_morph_names = parse_morph_targets("#tongue_GES", len(tongue_v))

print("DAE meshes and morph targets parsed successfully.")

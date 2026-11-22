#!/usr/bin/env python3
"""
Robust GLB Builder for MonkeyMoji.
Packages base meshes, morph targets, textures, and materials into a standard glTF 2.0 binary.
"""

import os
import struct
import json
import xml.etree.ElementTree as ET
import numpy as np
from PIL import Image

class GLBBuilder:
    def __init__(self):
        self.bin_data = bytearray()
        self.buffer_views = []
        self.accessors = []
        self.images = []
        self.textures = []
        self.materials = []
        self.meshes = []
        self.nodes = []

    def _pad4(self):
        remainder = len(self.bin_data) % 4
        if remainder != 0:
            self.bin_data.extend(b'\x00' * (4 - remainder))

    def add_buffer_view(self, data: bytes, target: int = None):
        self._pad4()
        byte_offset = len(self.bin_data)
        byte_length = len(data)
        self.bin_data.extend(data)
        
        bv = {
            "buffer": 0,
            "byteOffset": byte_offset,
            "byteLength": byte_length
        }
        if target is not None:
            bv["target"] = target
        bv_index = len(self.buffer_views)
        self.buffer_views.append(bv)
        return bv_index

    def add_accessor(self, buffer_view_index: int, component_type: int, count: int, 
                     type_str: str, min_val=None, max_val=None, byte_offset: int = 0):
        acc = {
            "bufferView": buffer_view_index,
            "byteOffset": byte_offset,
            "componentType": component_type,
            "count": count,
            "type": type_str
        }
        if min_val is not None:
            acc["min"] = min_val
        if max_val is not None:
            acc["max"] = max_val
        acc_index = len(self.accessors)
        self.accessors.append(acc)
        return acc_index

    def add_vec3_array(self, np_arr: np.ndarray):
        assert np_arr.dtype == np.float32 and np_arr.shape[1] == 3
        data = np_arr.tobytes()
        bv = self.add_buffer_view(data, target=34962) # ARRAY_BUFFER
        min_v = np_arr.min(axis=0).tolist()
        max_v = np_arr.max(axis=0).tolist()
        return self.add_accessor(bv, 5126, len(np_arr), "VEC3", min_val=min_v, max_val=max_v)

    def add_vec2_array(self, np_arr: np.ndarray):
        assert np_arr.dtype == np.float32 and np_arr.shape[1] == 2
        data = np_arr.tobytes()
        bv = self.add_buffer_view(data, target=34962)
        min_v = np_arr.min(axis=0).tolist()
        max_v = np_arr.max(axis=0).tolist()
        return self.add_accessor(bv, 5126, len(np_arr), "VEC2", min_val=min_v, max_val=max_v)

    def add_indices(self, np_arr: np.ndarray):
        if np_arr.max() < 65535:
            arr = np_arr.astype(np.uint16)
            ctype = 5123 # UNSIGNED_SHORT
        else:
            arr = np_arr.astype(np.uint32)
            ctype = 5125 # UNSIGNED_INT
        data = arr.tobytes()
        bv = self.add_buffer_view(data, target=34963) # ELEMENT_ARRAY_BUFFER
        return self.add_accessor(bv, ctype, len(arr), "SCALAR", min_val=[int(arr.min())], max_val=[int(arr.max())])

    def add_image_from_file(self, filepath: str):
        with open(filepath, "rb") as f:
            data = f.read()
        mime = "image/jpeg" if filepath.lower().endswith(('.jpg', '.jpeg')) else "image/png"
        bv = self.add_buffer_view(data)
        img_idx = len(self.images)
        self.images.append({
            "bufferView": bv,
            "mimeType": mime
        })
        tex_idx = len(self.textures)
        self.textures.append({
            "source": img_idx
        })
        return tex_idx

    def build_glb(self, output_path: str):
        self._pad4()
        gltf_dict = {
            "asset": {"version": "2.0", "generator": "MonkeyMojiGLBBuilder"},
            "scene": 0,
            "scenes": [{"nodes": list(range(len(self.nodes)))}],
            "nodes": self.nodes,
            "meshes": self.meshes,
            "materials": self.materials,
            "textures": self.textures,
            "images": self.images,
            "accessors": self.accessors,
            "bufferViews": self.buffer_views,
            "buffers": [{"byteLength": len(self.bin_data)}]
        }

        json_bytes = json.dumps(gltf_dict, separators=(',', ':')).encode('utf-8')
        # Pad JSON to 4-byte boundary with spaces
        json_remainder = len(json_bytes) % 4
        if json_remainder != 0:
            json_bytes += b' ' * (4 - json_remainder)

        # Pad BIN to 4-byte boundary
        bin_bytes = bytes(self.bin_data)
        bin_remainder = len(bin_bytes) % 4
        if bin_remainder != 0:
            bin_bytes += b'\x00' * (4 - bin_remainder)

        total_length = 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)

        with open(output_path, "wb") as f:
            # Header
            f.write(b'glTF')
            f.write(struct.pack('<I', 2)) # version 2
            f.write(struct.pack('<I', total_length))

            # Chunk 0 (JSON)
            f.write(struct.pack('<I', len(json_bytes)))
            f.write(b'JSON')
            f.write(json_bytes)

            # Chunk 1 (BIN)
            f.write(struct.pack('<I', len(bin_bytes)))
            f.write(b'BIN\x00')
            f.write(bin_bytes)

        print(f"Exported GLB to {output_path} ({total_length / 1024 / 1024:.2f} MB)")

def create_monkeymoji_glb():
    builder = GLBBuilder()
    
    # Textures
    head_diffuse = builder.add_image_from_file("assets/monkey/monkey_head_BAKED.jpg")
    head_ao = builder.add_image_from_file("assets/monkey/monkey_head_AO.jpg")
    mouth_diffuse = builder.add_image_from_file("assets/monkey/monkey_mouth_BAKED.jpg")
    eye_diffuse = builder.add_image_from_file("assets/sharedImages/eye_uvs_REFLECTIVE_front.jpg")

    # Materials
    # 1. Head material
    builder.materials.append({
        "name": "HeadMaterial",
        "pbrMetallicRoughness": {
            "baseColorTexture": {"index": head_diffuse},
            "roughnessFactor": 0.65,
            "metallicFactor": 0.05
        },
        "occlusionTexture": {"index": head_ao},
        "doubleSided": False
    })
    head_mat_idx = 0

    # 2. Eye material
    builder.materials.append({
        "name": "EyeMaterial",
        "pbrMetallicRoughness": {
            "baseColorTexture": {"index": eye_diffuse},
            "roughnessFactor": 0.1,
            "metallicFactor": 0.1
        },
        "doubleSided": False
    })
    eye_mat_idx = 1

    # 3. Mouth/Teeth/Tongue material
    builder.materials.append({
        "name": "MouthMaterial",
        "pbrMetallicRoughness": {
            "baseColorTexture": {"index": mouth_diffuse},
            "roughnessFactor": 0.85,
            "metallicFactor": 0.0
        },
        "doubleSided": True
    })
    mouth_mat_idx = 2

    # Load and parse Collada
    from convert_monkeymoji_to_glb import (
        head_v, head_uv, head_idx, head_norm, head_morphs, head_morph_names,
        leye_v, leye_uv, leye_idx, leye_norm, leye_morphs, leye_morph_names,
        reye_v, reye_uv, reye_idx, reye_norm, reye_morphs, reye_morph_names,
        lteeth_v, lteeth_uv, lteeth_idx, lteeth_norm, lteeth_morphs, lteeth_morph_names,
        uteeth_v, uteeth_uv, uteeth_idx, uteeth_norm,
        tongue_v, tongue_uv, tongue_idx, tongue_norm, tongue_morphs, tongue_morph_names
    )

    # Function to add a mesh primitive
    def add_mesh_object(name, v, uv, norm, idx, mat_idx, morphs=None, morph_names=None):
        pos_acc = builder.add_vec3_array(v)
        uv_acc = builder.add_vec2_array(uv)
        norm_acc = builder.add_vec3_array(norm)
        idx_acc = builder.add_indices(idx)

        prim = {
            "attributes": {
                "POSITION": pos_acc,
                "NORMAL": norm_acc,
                "TEXCOORD_0": uv_acc
            },
            "indices": idx_acc,
            "material": mat_idx
        }

        mesh_dict = {
            "name": name,
            "primitives": [prim]
        }

        if morphs and morph_names:
            targets = []
            target_names = []
            for mname in morph_names:
                delta = morphs[mname]
                d_acc = builder.add_vec3_array(delta)
                targets.append({"POSITION": d_acc})
                target_names.append(mname)
            prim["targets"] = targets
            mesh_dict["extras"] = {"targetNames": target_names}
            mesh_dict["weights"] = [0.0] * len(target_names)

        mesh_idx = len(builder.meshes)
        builder.meshes.append(mesh_dict)

        node_idx = len(builder.nodes)
        builder.nodes.append({
            "name": name,
            "mesh": mesh_idx
        })
        return node_idx

    print("Adding head mesh...")
    add_mesh_object("head", head_v, head_uv, head_norm, head_idx, head_mat_idx, head_morphs, head_morph_names)

    print("Adding eyes...")
    add_mesh_object("L_eye", leye_v, leye_uv, leye_norm, leye_idx, eye_mat_idx, leye_morphs, leye_morph_names)
    add_mesh_object("R_eye", reye_v, reye_uv, reye_norm, reye_idx, eye_mat_idx, reye_morphs, reye_morph_names)

    print("Adding teeth and tongue...")
    add_mesh_object("upperTeeth", uteeth_v, uteeth_uv, uteeth_norm, uteeth_idx, mouth_mat_idx)
    add_mesh_object("lowerTeeth", lteeth_v, lteeth_uv, lteeth_norm, lteeth_idx, mouth_mat_idx, lteeth_morphs, lteeth_morph_names)
    add_mesh_object("tongue", tongue_v, tongue_uv, tongue_norm, tongue_idx, mouth_mat_idx, tongue_morphs, tongue_morph_names)

    builder.build_glb("assets/monkey/monkeymoji.glb")

if __name__ == "__main__":
    create_monkeymoji_glb()

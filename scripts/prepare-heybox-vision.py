"""Prepare reproducible WebGL models from the existing, checksummed FP16 ONNX files.
No training, user-photo data, network access, eval, Workers or Wasm are used.
"""
from pathlib import Path
import base64,gzip,json,hashlib,argparse
import onnx
from onnx import numpy_helper,TensorProto,helper
import numpy as np
repo=Path(__file__).resolve().parents[1]
DEFAULT_MAX_NODES=20
DEFAULT_MAX_OUTPUT_BYTES=32*1024*1024
parser=argparse.ArgumentParser()
parser.add_argument('--output',required=True)
parser.add_argument('--candidate',default='a',help='candidate label recorded in the manifest (a/b/c)')
parser.add_argument('--max-nodes',type=int,default=DEFAULT_MAX_NODES)
parser.add_argument('--max-output-bytes',type=int,default=DEFAULT_MAX_OUTPUT_BYTES)
args=parser.parse_args()
assert args.max_nodes>0 and 8*1024*1024<=args.max_output_bytes<=64*1024*1024,'Unsafe segmentation budget'
out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
for old in out.glob('*.js'):old.unlink()
manifest={'schemaVersion':2,'candidate':args.candidate,'splitPolicy':{'maxNodes':args.max_nodes,'maxOutputBytes':args.max_output_bytes},'generatorSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'segmenterSha256':hashlib.sha256((Path(__file__).parent/'split_vision_model.py').read_bytes()).hexdigest(),'models':{}}
for kind,name in [('main','mahjong-small-fp16.onnx'),('aux','mahjong-nano-fp16.onnx')]:
 config=json.loads((repo/'wechat-miniprogram/utils'/('vision-model.json' if kind=='main' else 'vision-aux-model.json')).read_text())
 source=repo/'vision-models'/name
 raw_source=source.read_bytes() if source.exists() else b''.join((repo/'wechat-miniprogram'/part['path']).read_bytes() for part in config['parts'])
 assert hashlib.sha256(raw_source).hexdigest()==config['sha256'],'Source model checksum mismatch'
 m=onnx.load_from_string(raw_source)
 for t in m.graph.initializer:
  if t.data_type==TensorProto.FLOAT16:
   t.CopyFrom(numpy_helper.from_array(numpy_helper.to_array(t).astype(np.float32),t.name))
 for info in list(m.graph.value_info)+list(m.graph.input)+list(m.graph.output):
  if info.type.tensor_type.elem_type==TensorProto.FLOAT16:info.type.tensor_type.elem_type=TensorProto.FLOAT
 alias={n.output[0]:n.input[0] for n in m.graph.node if n.op_type=='Cast' and next(a.i for a in n.attribute if a.name=='to') in [1,10]}
 def resolve(name):
  while name in alias:name=alias[name]
  return name
 nodes=[]
 for n in m.graph.node:
  if n.output[0] in alias:continue
  for i,name in enumerate(n.input):n.input[i]=resolve(name)
  nodes.append(n)
 del m.graph.node[:];m.graph.node.extend(nodes)
 for info in m.graph.output:info.name=resolve(info.name)
 m=onnx.shape_inference.infer_shapes(m)
 shapes={info.name:[d.dim_value for d in info.type.tensor_type.shape.dim] for info in list(m.graph.value_info)+list(m.graph.input)}
 initializers={t.name:numpy_helper.to_array(t) for t in m.graph.initializer}
 revised=[]
 for n in m.graph.node:
  if n.op_type!='Resize':revised.append(n);continue
  attrs={a.name:helper.get_attribute_value(a) for a in n.attribute}
  assert attrs.get('mode')==b'nearest' and attrs.get('coordinate_transformation_mode')==b'asymmetric',attrs
  assert attrs.get('nearest_mode',b'round_prefer_floor') in [b'floor',b'round_prefer_floor']
  assert np.array_equal(initializers[n.input[2]],[1,1,2,2])
  batch,channels,height,width=shapes[n.input[0]]
  assert all([batch,channels,height,width])
  names=[n.name+'__shape',n.name+'__repeats',n.name+'__result_shape']
  vals=[[batch,channels,height,1,width,1],[1,1,1,2,1,2],[batch,channels,height*2,width*2]]
  for key,val in zip(names,vals):m.graph.initializer.append(numpy_helper.from_array(np.array(val,dtype=np.int64),key))
  a=n.name+'__reshape';b=n.name+'__tile'
  revised.extend([helper.make_node('Reshape',[n.input[0],names[0]],[a],name=a),helper.make_node('Tile',[a,names[1]],[b],name=b),helper.make_node('Reshape',[b,names[2]],list(n.output),name=n.name+'__final')])
 del m.graph.node[:];m.graph.node.extend(revised)
 for t in m.graph.initializer:
  if t.data_type==1 and len(t.dims)==2 and t.dims[0]==1:
   uses=[n for n in m.graph.node if t.name in n.input]
   if uses and all(n.op_type in ['Add','Sub','Mul','Div'] and all(len(shapes.get(x,[]))>=3 for x in n.input if x!=t.name) for n in uses):
    t.dims.insert(0,1)
    for info in m.graph.value_info:
     if info.name==t.name:info.CopyFrom(helper.make_tensor_value_info(t.name,TensorProto.FLOAT,list(t.dims)))
 used={name for n in m.graph.node for name in n.input}|{info.name for info in m.graph.output}
 kept=[t for t in m.graph.initializer if t.name in used]
 del m.graph.initializer[:];m.graph.initializer.extend(kept)
 onnx.checker.check_model(m)
 from split_vision_model import write_segments
 manifest['models'][kind]=write_segments(m,kind,out,config,max_nodes=args.max_nodes,max_output_bytes=args.max_output_bytes)
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')

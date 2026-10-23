"""Lossless topological segmentation: no resizing, retraining or weight changes."""
import base64, gzip, hashlib, json, math
from copy import deepcopy
import onnx
from onnx import helper

# Candidate A (production default) keeps the 0.3.11 segmentation: at most 20 nodes per subgraph and at
# most 32 MiB of activation outputs. Candidate B raises the node budget to 40 (fewer session creations,
# same 32 MiB activation ceiling); the safety boundary rules below are unchanged for every candidate.
MAX_NODES = 20
MAX_OUTPUT_BYTES = 32 * 1024 * 1024


def write_segments(model, kind, out, config, max_nodes=MAX_NODES, max_output_bytes=MAX_OUTPUT_BYTES):
    """Split a complete, converted graph into lossless GPU subgraphs.

    `max_nodes` and `max_output_bytes` are the *only* tunables: the safe-boundary rule, the 640 input,
    every weight and every operator stay exactly as they are, so a candidate can differ in segment
    count but never in numerical meaning.
    """
    assert max_nodes > 0 and max_output_bytes > 0
    model = onnx.shape_inference.infer_shapes(model)
    nodes = list(model.graph.node)
    values = {v.name: v for v in [*model.graph.input, *model.graph.value_info, *model.graph.output]}
    weights = {v.name: v for v in model.graph.initializer}
    final_names = [v.name for v in model.graph.output]
    def size(name):
        shape = values[name].type.tensor_type.shape.dim
        assert all(v.dim_value > 0 for v in shape), name
        return math.prod(v.dim_value for v in shape) * 4
    consumers = {}
    for index, node in enumerate(nodes):
        for name in node.input: consumers.setdefault(name, []).append(index)
    def safe_boundary(start, end):
        # ORT WebGL fuses Conv + activation without preserving an intermediate
        # graph output. Export sinks only; keep the complete activation/fanout
        # inside one subgraph. Otherwise CPU can pass while GPU returns a fused
        # activation in place of a pre-activation boundary value.
        for node in nodes[start:end]:
            for name in node.output:
                uses = consumers.get(name, [])
                if any(start <= i < end for i in uses) and (any(i >= end for i in uses) or name in final_names):
                    return False
        return True
    groups, start = [], 0
    while start < len(nodes):
        used, candidates = 0, []
        for end in range(start+1, len(nodes)+1):
            used += sum(size(name) for name in nodes[end-1].output)
            safe = safe_boundary(start, end)
            over = end-start > max_nodes or used > max_output_bytes
            if over and candidates: break
            if safe: candidates.append(end)
            if over and safe: break
        assert candidates, 'No safe GPU boundary'
        end = candidates[-1]; groups.append(nodes[start:end]); start = end
    segments, loaders, produced = [], [], set()
    for index, group in enumerate(groups):
        own = {name for n in group for name in n.output}
        future = {name for g in groups[index+1:] for n in g for name in n.input} | set(final_names)
        inputs = list(dict.fromkeys(name for n in group for name in n.input if name and name not in own and name not in weights))
        outputs = [name for n in group for name in n.output if name in future]
        assert all(name in produced or name in [v.name for v in model.graph.input] for name in inputs)
        used_weights = {name for n in group for name in n.input if name in weights}
        graph = helper.make_graph(deepcopy(group), f'{kind}_segment_{index}',
            [deepcopy(values[name]) for name in inputs], [deepcopy(values[name]) for name in outputs],
            initializer=[deepcopy(v) for name, v in weights.items() if name in used_weights])
        part = helper.make_model(graph, opset_imports=deepcopy(model.opset_import), producer_name='hela-lossless-segmentation')
        part.ir_version = model.ir_version
        onnx.checker.check_model(part)
        raw = part.SerializeToString(); data = gzip.compress(raw, compresslevel=6, mtime=0)
        encoded = base64.b64encode(data).decode(); files = []
        for chunk, start in enumerate(range(0, len(encoded), 524288)):
            file = f'{kind}-s{index:03}-{chunk:03}.js'; files.append(file)
            (out/file).write_text('export default '+json.dumps(encoded[start:start+524288])+';\n')
        loaders.append('['+','.join("()=>import('./"+name+"')" for name in files)+']')
        keep = sorted((produced | own) & future)
        segments.append({'index':index, 'inputs':inputs, 'outputs':outputs, 'keep':keep,
            'nodes':len(group), 'bytes':len(raw), 'gzipBytes':len(data), 'parts':len(files), 'resources':files,
            'sha256':hashlib.sha256(raw).hexdigest(), 'gzipSha256':hashlib.sha256(data).hexdigest(),
            'activationOutputBytes':sum(size(name) for n in group for name in n.output),
            'boundaryBytes':sum(size(name) for name in keep)})
        produced |= own
    # Every node and initializer is byte-identical to the converted complete graph.
    assert sum(s['nodes'] for s in segments) == len(nodes)
    (out/(kind+'.js')).write_text('export default ['+','.join(loaders)+'];\n')
    print(kind, 'lossless segments:', len(segments), 'max nodes/segment:', max(s['nodes'] for s in segments),
          'max activation output MiB:', round(max(s['activationOutputBytes'] for s in segments)/2**20, 2))
    return {'source':config['source'], 'sourceCommit':config['sourceCommit'], 'sourceSha256':config['sha256'],
        'splitPolicy':{'maxNodes':max_nodes, 'maxOutputBytes':max_output_bytes},
        'wholeGraphSha256':hashlib.sha256(model.SerializeToString()).hexdigest(), 'inputName':model.graph.input[0].name,
        'outputName':model.graph.output[0].name, 'shape':[1,3,640,640], 'inputSize':640, 'license':'AGPL-3.0',
        'segments':segments, 'totalNodes':len(nodes),
        'wholeActivationOutputBytes':sum(size(name) for n in nodes for name in n.output)}

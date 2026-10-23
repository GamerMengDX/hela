// Single source of truth for the local model-candidate selection.
//
// Exactly one candidate is selected at a time and its resources live in `src/vision/generated`, which is what
// the production recognizer imports. `scripts/build-vision.mjs` (generation) and `scripts/verify-dist.mjs`
// (audit) both read this module, so a build and its audit can never disagree about which candidate is
// supposed to be shipped.
//
// Only the two approved segmentation policies are selectable:
//   A = 20 nodes / 32 MiB (default, currently selected)
//   B = 40 nodes / 32 MiB
// C (80 nodes) exists as a DEV comparison set only and is deliberately not selectable here.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SELECTION_FILE = 'vision-selection.json';
export const SELECTION_ENV = 'HELA_VISION_SELECTION';
export const DEFAULT_SELECTION = 'a';
export const PRODUCTION_DIR = 'src/vision/generated';

// The graph itself is fixed: every approved candidate segments the same converted weights and operators, so
// these constants are the guard against "the models changed while only the segmentation was supposed to move".
export const EXPECTED_GRAPH = {
  main: {
    totalNodes: 325,
    wholeGraphSha256: '4bc7e1b9ea81c224a88979b00df7daf68c7516c63203e055d6c60980d8e4fe92',
  },
  aux: {
    totalNodes: 325,
    wholeGraphSha256: '49f0eb0fafd22102d879ca5270dfb2779318e0edc8e672cf5b63413919126d1d',
  },
};
export const EXPECTED_INPUT = {shape: [1, 3, 640, 640], inputSize: 640};

/**
 * The only selectable candidates. `devDir` is where the DEV comparison pages keep that candidate, and it never
 * moves when the production selection changes; `prodDir` is the selected candidate's production location.
 */
export const APPROVED_CANDIDATES = {
  a: {
    name: 'a',
    label: 'A · 20 节点 / 32 MiB',
    maxNodes: 20,
    maxOutputBytes: 32 * 1024 * 1024,
    devDir: 'dev-models/a',
    prodDir: PRODUCTION_DIR,
  },
  b: {
    name: 'b',
    label: 'B · 40 节点 / 32 MiB',
    maxNodes: 40,
    maxOutputBytes: 32 * 1024 * 1024,
    devDir: 'dev-models/b',
    prodDir: PRODUCTION_DIR,
  },
};

export const APPROVED_NAMES = Object.keys(APPROVED_CANDIDATES);

/** Path of the selection file, honouring an explicit override (used by tests and by the controller). */
export function selectionFilePath(project = PROJECT_ROOT, env = process.env) {
  const override = env?.[SELECTION_ENV];
  if (override) return path.resolve(project, override);
  return path.join(project, SELECTION_FILE);
}

export function candidatePolicy(name) {
  const candidate = APPROVED_CANDIDATES[name];
  if (!candidate) {
    throw new Error(`未知的模型候选 "${name}"；只允许 ${APPROVED_NAMES.join(' / ')}`);
  }
  return candidate;
}

/**
 * Read the selection. A missing or malformed file is a hard error rather than a silent default, unless the
 * caller explicitly allows the default (the first run after cloning the candidate).
 */
export async function readSelection(project = PROJECT_ROOT, {allowDefault = true, env = process.env} = {}) {
  const file = selectionFilePath(project, env);
  let raw;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (!allowDefault) throw new Error(`缺少模型选择文件 ${path.relative(project, file)}（首次可用 npm run vision:select -- a 创建）`);
    return {selected: DEFAULT_SELECTION, candidate: candidatePolicy(DEFAULT_SELECTION), source: 'default', file};
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`模型选择文件 ${path.relative(project, file)} 不是合法 JSON：${error.message}`);
  }
  const selected = String(parsed.selected ?? '');
  if (!selected) throw new Error(`模型选择文件 ${path.relative(project, file)} 缺少 "selected" 字段`);
  const candidate = candidatePolicy(selected);
  return {selected, candidate, source: 'file', file, config: parsed};
}

/** Write the selection. Unknown candidates are rejected before anything is written. */
export async function writeSelection(project, name, {note, env = process.env} = {}) {
  const candidate = candidatePolicy(name);
  // Honour the same override the readers use, so a test (or the controller) can write elsewhere.
  const file = selectionFilePath(project, env);
  const previous = await readSelection(project, {allowDefault: true, env}).catch(() => null);
  const config = {
    schemaVersion: 1,
    selected: candidate.name,
    label: candidate.label,
    splitPolicy: {maxNodes: candidate.maxNodes, maxOutputBytes: candidate.maxOutputBytes},
    productionDir: candidate.prodDir,
    devDir: candidate.devDir,
    note:
      note ??
      '本地测试包选择（可用 npm run vision:select -- a|b 切换）。只决定 src/vision/generated 里打包哪一套分段；DEV 对照固定使用 dev-models/<候选>。',
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(file, JSON.stringify(config, null, 2) + '\n');
  return {candidate, file, previous: previous?.selected ?? null};
}

/** Compare a generated manifest with the expectations for the selected candidate. Returns a list of problems. */
export function auditManifest(manifest, candidate) {
  const problems = [];
  const policy = candidatePolicy(candidate);
  if (manifest.candidate !== policy.name) {
    problems.push(`产物 manifest.candidate=${manifest.candidate} 与选择 ${policy.name} 不一致`);
  }
  const split = manifest.splitPolicy ?? {};
  if (split.maxNodes !== policy.maxNodes) {
    problems.push(`产物分段策略 maxNodes=${split.maxNodes}，应为 ${policy.maxNodes}`);
  }
  if (split.maxOutputBytes !== policy.maxOutputBytes) {
    problems.push(`产物分段策略 maxOutputBytes=${split.maxOutputBytes}，应为 ${policy.maxOutputBytes}`);
  }
  for (const [kind, expected] of Object.entries(EXPECTED_GRAPH)) {
    const model = manifest.models?.[kind];
    if (!model) {
      problems.push(`产物缺少 ${kind} 模型`);
      continue;
    }
    if (JSON.stringify(model.shape) !== JSON.stringify(EXPECTED_INPUT.shape)) {
      problems.push(`${kind} 输入形状 ${JSON.stringify(model.shape)}，应为 ${JSON.stringify(EXPECTED_INPUT.shape)}`);
    }
    if (model.inputSize !== EXPECTED_INPUT.inputSize) {
      problems.push(`${kind} inputSize=${model.inputSize}，应为 ${EXPECTED_INPUT.inputSize}`);
    }
    if (model.totalNodes !== expected.totalNodes) {
      problems.push(`${kind} 总节点 ${model.totalNodes}，应为 ${expected.totalNodes}（权重/算子固定）`);
    }
    if (model.wholeGraphSha256 !== expected.wholeGraphSha256) {
      problems.push(`${kind} wholeGraphSha256 与固定的完整图不一致（权重或算子被改动）`);
    }
    for (const segment of model.segments) {
      if (segment.nodes > policy.maxNodes) {
        problems.push(`${kind} 段 ${segment.index} 含 ${segment.nodes} 节点，超过策略上限 ${policy.maxNodes}`);
      }
      if (segment.activationOutputBytes > policy.maxOutputBytes) {
        problems.push(`${kind} 段 ${segment.index} 激活输出超过 ${policy.maxOutputBytes} 字节`);
      }
      if ((segment.boundaryBytes ?? 0) > policy.maxOutputBytes) {
        problems.push(`${kind} 段 ${segment.index} 边界输出超过 ${policy.maxOutputBytes} 字节`);
      }
    }
  }
  return problems;
}

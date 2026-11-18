import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, ensureDir } from '../config.ts';
import { MAX_BATCH, type Embedder } from './embedder.ts';

export const MINILM_MODEL = 'Xenova/all-MiniLM-L6-v2';
export const MODELS_DIR = process.env.BMA_MODELS_DIR ?? join(ROOT, 'models');

type Extractor = (texts: string[], opts: { pooling: 'mean'; normalize: boolean }) => Promise<{ data: Float32Array; dims: number[] }>;

/** True when the quantized model is already in models/ (tests skip the download otherwise). */
export function minilmCached(): boolean {
  return existsSync(join(MODELS_DIR, MINILM_MODEL, 'onnx', 'model_quantized.onnx'));
}

/** all-MiniLM-L6-v2 (384 dims, quantized ONNX) through transformers.js on CPU. Downloads once into models/. */
export class MiniLmEmbedder implements Embedder {
  readonly name = 'minilm-l6-v2-q8';
  readonly dims = 384;
  private extractor?: Promise<Extractor>;

  private load(): Promise<Extractor> {
    this.extractor ??= (async () => {
      const tf = await import('@huggingface/transformers');
      tf.env.cacheDir = ensureDir(MODELS_DIR);
      return (await tf.pipeline('feature-extraction', MINILM_MODEL, { dtype: 'q8' })) as unknown as Extractor;
    })();
    return this.extractor;
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    const ex = await this.load();
    const out: Float32Array[] = [];
    for (let s = 0; s < texts.length; s += MAX_BATCH) {
      const batch = texts.slice(s, s + MAX_BATCH);
      const res = await ex(batch, { pooling: 'mean', normalize: true });
      for (let i = 0; i < batch.length; i++) out.push(Float32Array.from(res.data.subarray(i * this.dims, (i + 1) * this.dims)));
    }
    return out;
  }
}

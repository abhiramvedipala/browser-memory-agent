// npm run model:fetch: downloads the quantized MiniLM once into models/ (gitignored) and smoke-tests it.
import { MiniLmEmbedder } from '../src/embeddings/minilm.ts';
import { cosine } from '../src/embeddings/embedder.ts';

const m = new MiniLmEmbedder();
const t0 = Date.now();
const [a, b, c] = await m.embed(['Add to cart', 'Add to basket', 'Place a hold']);
console.log(`dims=${a!.length} cos(cart,basket)=${cosine(a!, b!).toFixed(3)} cos(cart,hold)=${cosine(a!, c!).toFixed(3)} in ${Date.now() - t0} ms`);

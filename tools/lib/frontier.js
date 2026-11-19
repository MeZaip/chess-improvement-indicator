// Bounded pool of usernames the random walk can jump to next.
// When full, a random old entry is replaced, so the pool keeps mixing.
export class Frontier {
  constructor(max = 5000, rng = Math.random) {
    this.max = max;
    this.rng = rng;
    this.items = [];
  }

  add(id) {
    if (this.items.length < this.max) this.items.push(id);
    else this.items[Math.floor(this.rng() * this.max)] = id;
  }

  pick() {
    if (this.items.length === 0) return null;
    return this.items[Math.floor(this.rng() * this.items.length)];
  }

  get size() {
    return this.items.length;
  }
}

export function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

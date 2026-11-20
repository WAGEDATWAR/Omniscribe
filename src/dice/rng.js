/** Random sources for the roll engine. Each has one method, `int(max)`: a whole number from 1 to `max`, uniform (D-10). */

const UINT32 = 0x100000000;

function checkMax(max) {
  if (!Number.isInteger(max) || max < 1 || max > UINT32) {
    throw new RangeError("A die needs between 1 and 4,294,967,296 sides");
  }
}

/** Uniform integer in `[0, max)` from a 32-bit source, rejecting the biased tail instead of using a remainder. */
function uniform(next32, max) {
  const limit = UINT32 - (UINT32 % max);
  let value = next32();

  while (value >= limit) {
    value = next32();
  }

  return value % max;
}

export function cryptoRng(source = globalThis.crypto) {
  const buffer = new Uint32Array(1);

  return {
    int(max) {
      checkMax(max);
      return (
        uniform(() => {
          source.getRandomValues(buffer);
          return buffer[0];
        }, max) + 1
      );
    }
  };
}

/** A repeatable generator (mulberry32) for tests and fixtures. */
export function seededRng(seed = 1) {
  let state = seed >>> 0;

  const next32 = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0);
  };

  return {
    int(max) {
      checkMax(max);
      return uniform(next32, max) + 1;
    }
  };
}

/** Returns the listed values in order; asking for more, or for a value outside `1..max`, throws. */
export function scriptedRng(values) {
  const queue = [...values];

  return {
    int(max) {
      checkMax(max);

      if (!queue.length) {
        throw new Error("The scripted source ran out of values");
      }

      const value = queue.shift();

      if (!Number.isInteger(value) || value < 1 || value > max) {
        throw new RangeError(`Scripted value ${value} is not between 1 and ${max}`);
      }

      return value;
    },
    get remaining() {
      return queue.length;
    }
  };
}

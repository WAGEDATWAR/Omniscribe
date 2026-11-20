const WORDS = ["Sworn enemy", "Hateful", "Hostile", "Unfriendly", "Wary", "Neutral", "Friendly", "Warm", "Loyal", "Devoted", "Inseparable"];

/** -5..+5 as a word, so attitude never relies on colour. */
export function attitudeWord(value) {
  return WORDS[Math.min(5, Math.max(-5, Math.trunc(value))) + 5];
}

/**
 * Relations from other characters that point at this one. Nothing is stored twice (the reciprocal rule):
 * this reads every character's own relations and returns the ones aimed at `characterId`.
 */
export function reciprocalRelations(characters, characterId) {
  const found = [];

  for (const character of characters) {
    if (character.id === characterId) {
      continue;
    }

    for (const relation of character.relations ?? []) {
      if (relation.targetType === "character" && relation.targetId === characterId) {
        found.push({ from: { id: character.id, name: character.name }, relation });
      }
    }
  }

  return found;
}

/** Whether a character relation still points at a character in the library. */
export function targetExists(characters, relation) {
  return relation.targetType !== "character" || !relation.targetId || characters.some((character) => character.id === relation.targetId);
}

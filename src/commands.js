/**
 * Pure command-palette filtering. A command is `{ id, title, hint, keywords, run }`; `run` is opaque here.
 * Every query word must appear in the title or keywords; earlier and prefix matches rank higher.
 */
export function filterCommands(commands, query = "") {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);

  if (!words.length) {
    return commands;
  }

  const scored = [];

  commands.forEach((command, order) => {
    const title = command.title.toLowerCase();
    const haystack = `${title} ${(command.keywords ?? "").toLowerCase()}`;

    if (!words.every((word) => haystack.includes(word))) {
      return;
    }

    let score = 0;

    for (const word of words) {
      const index = title.indexOf(word);
      score += index === -1 ? 50 : index === 0 ? 0 : index < 12 ? 5 : 10;
    }

    scored.push({ command, score, order });
  });

  return scored.sort((left, right) => left.score - right.score || left.order - right.order).map((item) => item.command);
}

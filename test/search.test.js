import assert from "node:assert/strict";
import test from "node:test";
import { createCampaign } from "../src/campaigns.js";
import { createRecord } from "../src/records/normalize.js";
import { createCharacter } from "../src/schema.js";
import { buildIndex, fold, search } from "../src/search.js";

function library() {
  const mira = createCharacter({ name: "Mira Vale", player: "Sam", summary: "A cartographer of the Réseau", tags: ["scout"] });
  mira.inventory = { ...mira.inventory, items: [createRecord("inventory", { name: "Lantern", notes: "burns bright" })] };
  mira.journal = [createRecord("journal", { title: "The bridge", text: "We crossed the river at dawn" })];
  const bram = createCharacter({ name: "Bram" });
  const camp = createCampaign({ name: "Riverfall", description: "A river campaign" });
  camp.sessions = [createRecord("sessions", { title: "Night at the lantern inn", notes: "Mira lit a lantern", secretNotes: "the innkeeper is the villain" })];
  return { characters: [mira, bram], campaigns: [camp] };
}

test("folding ignores case and accents", () => {
  assert.equal(fold("Réseau CAFÉ"), "reseau cafe");
});

test("every word must match, and the title beats the body", () => {
  const { characters, campaigns } = library();
  const index = buildIndex(characters, campaigns);
  const result = search(index, "lantern");

  assert.ok(result.hits.some((hit) => hit.kind === "Inventory" && hit.title === "Lantern"));
  assert.equal(result.hits[0].foldedTitle.includes("lantern"), true);
  assert.equal(search(index, "lantern dawn").hits.length, 0);
  assert.equal(search(index, "river dawn").hits[0].title, "The bridge");
});

test("accents and case do not matter in the query", () => {
  const { characters, campaigns } = library();
  const index = buildIndex(characters, campaigns);

  assert.equal(search(index, "RESEAU").hits[0].title, "Mira Vale");
});

test("secret session notes are never indexed", () => {
  const { characters, campaigns } = library();
  const index = buildIndex(characters, campaigns);

  assert.equal(search(index, "innkeeper villain").hits.length, 0);
  assert.ok(search(index, "inn").hits.some((hit) => hit.kind === "Sessions"));
});

test("hits point at the page that holds them", () => {
  const { characters, campaigns } = library();
  const index = buildIndex(characters, campaigns);
  const bridge = search(index, "bridge").hits[0];
  const session = search(index, "night inn").hits[0];

  assert.deepEqual(bridge.route, { view: "character", id: characters[0].id, sub: "journal" });
  assert.deepEqual(session.route, { view: "campaign", id: campaigns[0].id, sub: "sessions" });
});

test("results are capped and say so", () => {
  const characters = Array.from({ length: 60 }, (_, index) => createCharacter({ name: `Guard ${index}` }));
  const result = search(buildIndex(characters, []), "guard", 50);

  assert.equal(result.hits.length, 50);
  assert.equal(result.total, 60);
  assert.equal(result.truncated, true);
  assert.deepEqual(search(buildIndex([], []), "   "), { hits: [], total: 0, truncated: false });
});

test("values of your own fields are searchable under their label, orphaned ones are not", () => {
  const { characters, campaigns } = library();
  characters[0].inventory.items[0].fields = { cf_rarity: "Legendary", cf_gone: "Hidden word" };
  const index = buildIndex(characters, campaigns, new Map([["cf_rarity", "Rarity"]]));

  assert.equal(search(index, "legendary").hits[0].title, "Lantern");
  assert.equal(search(index, "rarity legendary").hits.length, 1);
  assert.equal(search(index, "hidden word").hits.length, 0);
});

test("game systems are searchable by name, description and the labels of their parts", () => {
  const { characters, campaigns } = library();
  const index = buildIndex(characters, campaigns, new Map(), [{ id: "risus", name: "Risus", version: 1, system: "Risus", description: "The Anything RPG", labels: ["Clichés", "Lucky Shots"] }]);
  const hit = search(index, "lucky shots").hits[0];

  assert.equal(hit.kind, "Game system");
  assert.deepEqual(hit.route, { view: "system", id: "risus", sub: null });
  assert.equal(search(index, "anything").hits[0].title, "Risus");
  assert.equal(search(index, "cliches").hits.length, 1);
});

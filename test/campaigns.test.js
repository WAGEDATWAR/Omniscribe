import assert from "node:assert/strict";
import test from "node:test";
import { campaignsOf, createCampaign, isShared, normalizeCampaign, normalizeCampaigns, recapText, relinkCharacter, rosterCount, withoutCharacter } from "../src/campaigns.js";
import { migrateProject } from "../src/migrations.js";
import { normalizeCharacter } from "../src/schema.js";
import { createStore } from "../src/store.js";

const char = (id, name = id) => normalizeCharacter({ id, name });
const row = (characterId, extra = {}) => ({ id: `rost_${characterId}`, characterId, role: "PC", ...extra });

test("a campaign normalizes hostile data and keeps what it can", () => {
  assert.equal(normalizeCampaign(null), null);
  const campaign = normalizeCampaign({
    id: "camp_a",
    name: 5,
    status: "bogus",
    roster: [row("char_a"), row("char_a"), { characterId: "bad id" }, 7],
    sessions: [{ title: "One", attendeeIds: ["char_a", "char_a", "x y", 3] }],
    initiative: { round: -4, turn: 99, entries: [{ name: "Orc", value: "x" }] },
    mystery: 1
  });
  assert.equal(campaign.name, "");
  assert.equal(campaign.status, "planning");
  assert.equal(campaign.roster.length, 1);
  assert.deepEqual(campaign.sessions[0].attendeeIds, ["char_a"]);
  assert.equal(campaign.initiative.round, 1);
  assert.equal(campaign.initiative.turn, 0);
  assert.deepEqual(campaign.extensions.unknown, { mystery: 1 });
  assert.deepEqual(normalizeCampaign(campaign), campaign);
  assert.equal(normalizeCampaigns([campaign, campaign]).length, 1);
});

test("migration 6 adds an empty campaign list", () => {
  assert.deepEqual(migrateProject({ version: 5, characters: [] }).campaigns, []);
});

test("a character's campaigns are derived and counted", () => {
  const a = createCampaign({ name: "A", roster: [row("char_a")] });
  const b = createCampaign({ name: "B" });
  assert.equal(campaignsOf([a, b], "char_a").length, 1);
  assert.equal(rosterCount([a, b], "char_a"), 1);
  assert.equal(rosterCount([a, b], "char_z"), 0);
});

test("deleting a character removes every trace and undo relinks it", () => {
  const campaign = createCampaign({
    roster: [row("char_a"), row("char_b")],
    sessions: [{ id: "sess_1", title: "S", attendeeIds: ["char_a", "char_b"] }],
    initiative: { round: 2, turn: 1, entries: [{ id: "init_a", characterId: "char_a", name: "A" }, { id: "init_b", characterId: "char_b", name: "B" }] }
  });
  const cleaned = withoutCharacter(campaign, "char_a");
  assert.equal(cleaned.roster.length, 1);
  assert.deepEqual(cleaned.sessions[0].attendeeIds, ["char_b"]);
  assert.equal(cleaned.initiative.entries.length, 1);
  assert.equal(withoutCharacter(campaign, "char_z"), campaign);
  const back = relinkCharacter(cleaned, campaign, "char_a");
  assert.equal(back.roster.length, 2);
  assert.equal(back.initiative.entries.length, 2);
  assert.deepEqual(back.sessions[0].attendeeIds.sort(), ["char_a", "char_b"]);
});

test("the store keeps campaigns beside characters with one history", () => {
  const store = createStore({ characters: [char("char_a")] });
  const campaign = store.addCampaign({ name: "Saga" });
  store.addCampaignRecord(campaign.id, "roster", { characterId: "char_a", role: "Hero" });
  store.addCampaignRecord(campaign.id, "roster", { characterId: "char_a", role: "Dup" });
  assert.equal(store.getCampaign(campaign.id).roster.length, 1);

  const before = store.getState().campaigns;
  store.deleteCharacter("char_a");
  assert.equal(store.getCampaign(campaign.id).roster.length, 0);
  store.undo();
  assert.equal(store.getState().characters.length, 1);
  assert.equal(store.getCampaign(campaign.id).roster.length, 1);
  assert.equal(before.length, 1);

  const dirty = store.takeDirty();
  assert.equal(dirty.campaignUpserts.length, 1);
  assert.equal(store.hasDirty(), false);
  store.deleteCampaign(campaign.id);
  assert.deepEqual(store.takeDirty().campaignDeletedIds, [campaign.id]);
});

test("restoreCharacter with the earlier campaigns puts the roster back", () => {
  const store = createStore({ characters: [char("char_a")] });
  const campaign = store.addCampaign({ name: "Saga" });
  store.addCampaignRecord(campaign.id, "roster", { characterId: "char_a" });
  const campaignsBefore = store.getState().campaigns;
  const gone = store.deleteCharacter("char_a");
  store.restoreCharacter(gone, { campaigns: campaignsBefore });
  assert.equal(store.getCampaign(campaign.id).roster.length, 1);
});

test("campaign records add, edit, move and remove, and duplication drops the fight", () => {
  const store = createStore({ characters: [] });
  const campaign = store.addCampaign({ name: "Saga", initiative: { round: 3, turn: 0, entries: [{ name: "Orc", value: 12 }] } });
  const one = store.addCampaignRecord(campaign.id, "sessions", { title: "One" });
  const two = store.addCampaignRecord(campaign.id, "sessions", { title: "Two" });
  store.moveCampaignRecord(campaign.id, "sessions", two.id, -1);
  assert.equal(store.getCampaign(campaign.id).sessions[0].id, two.id);
  assert.equal(store.updateCampaignRecord(campaign.id, "sessions", one.id, { notes: "Hi" }).notes, "Hi");
  const removed = store.removeCampaignRecord(campaign.id, "sessions", one.id);
  store.restoreCampaignList(campaign.id, "sessions", removed.before);
  assert.equal(store.getCampaign(campaign.id).sessions.length, 2);
  const copy = store.duplicateCampaign(campaign.id);
  assert.equal(copy.initiative, null);
  assert.equal(copy.sessions.length, 2);
  assert.equal(store.addCampaignRecord(campaign.id, "initiative", { name: "Goblin", value: 5 }).name, "Goblin");
});

test("secret things are never shared and a recap leaves them out", () => {
  assert.equal(isShared({ kind: "secret" }), false);
  assert.equal(isShared({ secret: true }), false);
  assert.equal(isShared({ kind: "note" }), true);
  const campaign = createCampaign({ name: "Saga" });
  const text = recapText(campaign, { title: "Night", date: "2026-01-01", attendeeIds: ["char_a"], notes: "Fought.", secretNotes: "The butler did it." }, [char("char_a", "Ava")]);
  assert.match(text, /Present: Ava/);
  assert.match(text, /Fought\./);
  assert.doesNotMatch(text, /butler/);
});

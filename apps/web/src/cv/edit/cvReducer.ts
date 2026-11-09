import {
  MAX_ACHIEVEMENTS,
  MAX_BULLETS,
  MAX_ITEMS,
  MAX_JOB_NOTES,
  MAX_NOTES,
  MAX_TITLES,
  SKILL_GROUPS,
  isCopiedDescription,
  isSectionEmpty,
  newId,
  normalizeLayout,
  notesHash,
  type CvContent,
  type Note,
  type RoleFacts,
  type SectionKey,
  type SkillGroup,
} from "@resumora/shared";
import {
  emptyItem,
  getBullets,
  getItems,
  roleListOf,
  withBullets,
  withItems,
  type BulletOwner,
  type ListKey,
  type LineList,
  type RoleList,
} from "./lists.ts";

export type { BulletOwner, ListKey } from "./lists.ts";

const ROLE_LISTS = ["experience", "projects", "volunteering"] as const satisfies readonly RoleList[];

type Basics = CvContent["basics"];

export type CvAction =
  | { type: "setBasics"; field: Exclude<keyof Basics, "photo">; value: string }
  | { type: "setBasics"; field: "photo"; value: NonNullable<Basics["photo"]> | null }
  | { type: "setTitles"; index: 0 | 1; value: string }
  | { type: "setItemField"; list: ListKey; itemId: string; field: string; value: string | boolean }
  | { type: "addItem"; list: ListKey; id: string }
  | { type: "removeItem"; list: ListKey; itemId: string }
  | { type: "moveItem"; list: ListKey; from: number; to: number }
  | { type: "setBullet"; owner: BulletOwner; bulletId: string; text: string }
  | { type: "splitBullet"; owner: BulletOwner; bulletId: string; at: number; newId: string }
  | { type: "joinBullet"; owner: BulletOwner; bulletId: string }
  | { type: "addBullet"; owner: BulletOwner; newId: string }
  | { type: "addSkill"; group: SkillGroup; name: string }
  | { type: "removeSkill"; group: SkillGroup; skillId: string }
  | { type: "moveSkill"; skillId: string; to: SkillGroup }
  | { type: "moveSkills"; moves: { skillId: string; group: SkillGroup }[] }
  | { type: "addInterest"; name: string }
  | { type: "removeInterest"; itemId: string }
  | { type: "setSummary"; value: string }
  | { type: "setSectionTitle"; key: SectionKey; value: string }
  | { type: "toggleHidden"; key: SectionKey }
  | { type: "moveSection"; from: number; to: number }
  | { type: "addSection"; key: SectionKey; id: string }
  | { type: "addCustomSection"; id: string; title: string }
  | { type: "replaceBullet"; roleId: string; bulletId: string; text: string }
  | { type: "addBullets"; roleId: string; texts: string[] }
  /** Lines picked for a course, award, publication or interest in the guided path (3B). */
  | { type: "addLines"; list: LineList; itemId: string; texts: string[] }
  /** Hides a course, award, publication or interest on this CV (kept in the data), or shows it again. */
  | { type: "setItemHidden"; list: LineList; itemId: string; hidden: boolean }
  | { type: "setFacts"; roleId: string; facts: RoleFacts | null }
  | { type: "setNote"; roleId: string; note: Note }
  | { type: "setCurrent"; list: RoleList; itemId: string; current: boolean }
  /** Empties role descriptions that only repeat the company and/or location (old imports). */
  | { type: "clearCopiedDescriptions" }
  /** Key achievements picked in the guided path (4A), added in one go. */
  | { type: "addAchievements"; texts: string[] }
  /** Skills the guided path found in the roles (5A), added in one go with ids the caller keeps for Undo. */
  | { type: "addSkills"; skills: { id: string; name: string; group: SkillGroup }[] }
  | { type: "removeSkills"; ids: string[] }
  /** The guided path ended at an average of 80 or more. Once set, it stays. */
  | { type: "markEnriched"; at: string };

/**
 * Sections the CV has (or the user just added), in layout order, hidden ones included.
 * An added empty list section counts because it holds one empty entry.
 */
export function sectionsOnCv(cv: CvContent): SectionKey[] {
  return normalizeLayout(cv.layout).order.filter((key) =>
    key === "achievements" ? cv.achievements.length > 0 : !isSectionEmpty(cv, key),
  );
}

function maxBullets(owner: BulletOwner): number {
  return owner.list === "achievements" ? MAX_ACHIEVEMENTS : MAX_BULLETS;
}

function reorder<T>(list: T[], from: number, to: number): T[] | null {
  const inside = (i: number) => Number.isInteger(i) && i >= 0 && i < list.length;
  if (!inside(from) || !inside(to) || from === to) return null;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved as T);
  return next;
}

function setLayout(cv: CvContent, layout: CvContent["layout"]): CvContent {
  return { ...cv, layout };
}

function unhide(cv: CvContent, key: SectionKey): CvContent {
  if (!cv.layout.hidden.includes(key)) return cv;
  return setLayout(cv, { ...cv.layout, hidden: cv.layout.hidden.filter((k) => k !== key) });
}

function addItem(cv: CvContent, list: ListKey, id: string): CvContent {
  const items = getItems(cv, list);
  if (items.length >= MAX_ITEMS) return cv;
  return withItems(cv, list, [...items, emptyItem(list, id)]);
}

function addSection(cv: CvContent, key: SectionKey, id: string): CvContent {
  switch (key) {
    case "summary":
    case "skills":
      return unhide(cv, key);
    case "achievements":
      return unhide(cvReducer(cv, { type: "addBullet", owner: { list: "achievements" }, newId: id }), key);
    case "other":
      return unhide(addItem(cv, "custom", id), key);
    default:
      return unhide(addItem(cv, key, id), key);
  }
}

function moveSection(cv: CvContent, from: number, to: number): CvContent {
  const layout = normalizeLayout(cv.layout);
  const present = sectionsOnCv(cv);
  const moved = reorder(present, from, to);
  if (!moved) return cv;
  // Sections not on the CV keep their slot; present ones fill the other slots in the new order.
  let next = 0;
  const order = layout.order.map((key) => (present.includes(key) ? (moved[next++] as SectionKey) : key));
  return setLayout(cv, { ...layout, order });
}

function addSkill(cv: CvContent, group: SkillGroup, raw: string, id = newId()): CvContent {
  const name = raw.trim();
  if (name === "" || cv[group].length >= MAX_ITEMS) return cv;
  const lower = name.toLowerCase();
  const exists = SKILL_GROUPS.some((g) => cv[g].some((s) => s.name.trim().toLowerCase() === lower));
  if (exists) return cv;
  return { ...cv, [group]: [...cv[group], { id, name }] };
}

function moveSkill(cv: CvContent, skillId: string, to: SkillGroup): CvContent {
  const from = SKILL_GROUPS.find((g) => cv[g].some((s) => s.id === skillId));
  if (!from || from === to || cv[to].length >= MAX_ITEMS) return cv;
  const skill = cv[from].find((s) => s.id === skillId)!;
  return { ...cv, [from]: cv[from].filter((s) => s.id !== skillId), [to]: [...cv[to], skill] };
}

function setItemField(cv: CvContent, list: ListKey, itemId: string, field: string, value: string | boolean): CvContent {
  const items = getItems(cv, list);
  const item = items.find((i) => i.id === itemId);
  if (!item || field === "id" || field === "bullets" || !(field in item) || item[field] === value) return cv;
  return withItems(cv, list, items.map((i) => (i === item ? { ...i, [field]: value } : i)));
}

function bulletAction(cv: CvContent, action: Extract<CvAction, { owner: BulletOwner }>): CvContent {
  const { owner } = action;
  const bullets = getBullets(cv, owner);
  if (!bullets) return cv;
  const index = action.type === "addBullet" ? bullets.length : bullets.findIndex((b) => b.id === action.bulletId);
  if (index < 0) return cv;
  const full = bullets.length >= maxBullets(owner);
  switch (action.type) {
    case "setBullet":
      if (bullets[index]!.text === action.text) return cv;
      return withBullets(cv, owner, bullets.map((b, i) => (i === index ? { ...b, text: action.text } : b)));
    case "addBullet":
      return full ? cv : withBullets(cv, owner, [...bullets, { id: action.newId, text: "" }]);
    case "splitBullet": {
      if (full) return cv;
      const text = bullets[index]!.text;
      const at = Math.max(0, Math.min(action.at, text.length));
      const split = [
        { ...bullets[index]!, text: text.slice(0, at) },
        { id: action.newId, text: text.slice(at) },
      ];
      return withBullets(cv, owner, [...bullets.slice(0, index), ...split, ...bullets.slice(index + 1)]);
    }
    case "joinBullet": {
      if (index === 0) return cv;
      const joined = { ...bullets[index - 1]!, text: bullets[index - 1]!.text + bullets[index]!.text };
      return withBullets(cv, owner, [...bullets.slice(0, index - 1), joined, ...bullets.slice(index + 1)]);
    }
  }
}

/** Every CV edit as one small action. Pure; returns the same object when nothing changes. */
export function cvReducer(cv: CvContent, action: CvAction): CvContent {
  switch (action.type) {
    case "setBasics": {
      const { field, value } = action;
      if (field === "titles" || cv.basics[field] === value) return cv;
      return { ...cv, basics: { ...cv.basics, [field]: value } };
    }
    case "setTitles": {
      if (action.index >= MAX_TITLES) return cv;
      const titles = [...cv.basics.titles];
      while (titles.length < action.index) titles.push("");
      titles[action.index] = action.value;
      while (titles.length > 0 && titles[titles.length - 1] === "") titles.pop();
      if (titles.length === cv.basics.titles.length && titles.every((t, i) => t === cv.basics.titles[i])) return cv;
      return { ...cv, basics: { ...cv.basics, titles } };
    }
    case "setItemField":
      return setItemField(cv, action.list, action.itemId, action.field, action.value);
    case "addItem":
      return addItem(cv, action.list, action.id);
    case "removeItem": {
      const items = getItems(cv, action.list);
      if (!items.some((i) => i.id === action.itemId)) return cv;
      return withItems(cv, action.list, items.filter((i) => i.id !== action.itemId));
    }
    case "moveItem": {
      const moved = reorder(getItems(cv, action.list), action.from, action.to);
      return moved ? withItems(cv, action.list, moved) : cv;
    }
    case "setBullet":
    case "splitBullet":
    case "joinBullet":
    case "addBullet":
      return bulletAction(cv, action);
    case "addSkill":
      return addSkill(cv, action.group, action.name);
    case "removeSkill":
      if (!cv[action.group].some((s) => s.id === action.skillId)) return cv;
      return { ...cv, [action.group]: cv[action.group].filter((s) => s.id !== action.skillId) };
    case "moveSkill":
      return moveSkill(cv, action.skillId, action.to);
    case "moveSkills":
      return action.moves.reduce((next, m) => moveSkill(next, m.skillId, m.group), cv);
    case "addInterest": {
      const name = action.name.trim();
      if (name === "" || cv.interests.some((i) => i.name.trim().toLowerCase() === name.toLowerCase())) return cv;
      if (cv.interests.length >= MAX_ITEMS) return cv;
      return { ...cv, interests: [...cv.interests, { id: newId(), name }] };
    }
    case "removeInterest":
      return cvReducer(cv, { type: "removeItem", list: "interests", itemId: action.itemId });
    case "setSummary":
      return cvReducer(cv, { type: "setBasics", field: "summary", value: action.value });
    case "setSectionTitle": {
      const { [action.key]: old, ...rest } = cv.layout.titles;
      const titles: CvContent["layout"]["titles"] = action.value.trim() === "" ? rest : { ...rest, [action.key]: action.value };
      if (titles[action.key] === old) return cv;
      return setLayout(cv, { ...cv.layout, titles });
    }
    case "toggleHidden": {
      const hidden = cv.layout.hidden.includes(action.key)
        ? cv.layout.hidden.filter((k) => k !== action.key)
        : [...cv.layout.hidden, action.key];
      return setLayout(cv, { ...cv.layout, hidden });
    }
    case "moveSection":
      return moveSection(cv, action.from, action.to);
    case "addSection":
      return addSection(cv, action.key, action.id);
    case "addCustomSection": {
      const next = addItem(cv, "custom", action.id);
      if (next === cv) return cv;
      const custom = next.custom.map((c) => (c.id === action.id ? { ...c, title: action.title } : c));
      return unhide({ ...next, custom }, "other");
    }
    case "replaceBullet": {
      const list = roleListOf(cv, action.roleId);
      if (!list) return cv;
      return bulletAction(cv, { type: "setBullet", owner: { list, itemId: action.roleId }, bulletId: action.bulletId, text: action.text });
    }
    case "addBullets": {
      const list = roleListOf(cv, action.roleId);
      if (!list) return cv;
      const owner = { list, itemId: action.roleId };
      const bullets = getBullets(cv, owner);
      if (!bullets || !action.texts.length || bullets.length >= MAX_BULLETS) return cv;
      const added = action.texts.slice(0, MAX_BULLETS - bullets.length).map((text) => ({ id: newId(), text }));
      return withBullets(cv, owner, [...bullets, ...added]);
    }
    case "addLines": {
      const owner = { list: action.list, itemId: action.itemId };
      const lines = getBullets(cv, owner);
      if (!lines || !action.texts.length || lines.length >= MAX_BULLETS) return cv;
      const added = action.texts.slice(0, MAX_BULLETS - lines.length).map((text) => ({ id: newId(), text }));
      return withBullets(cv, owner, [...lines, ...added]);
    }
    case "setItemHidden": {
      const items = getItems(cv, action.list);
      const item = items.find((i) => i.id === action.itemId);
      if (!item || !!item.hidden === action.hidden) return cv;
      // Shown again = the field goes, so the item reads as before it was hidden.
      const rest = { ...item };
      delete rest.hidden;
      return withItems(cv, action.list, items.map((i) => (i === item ? (action.hidden ? { ...rest, hidden: true } : rest) : i)));
    }
    case "setFacts": {
      const list = roleListOf(cv, action.roleId);
      const role = list && cv[list].find((r) => r.id === action.roleId);
      if (!list || !role) return cv;
      const before = role.facts ?? null;
      const facts = action.facts;
      if (facts && notesHash(role.notes) !== facts.fromNotes) return cv;
      if (before === facts || (before && facts && before.fromNotes === facts.fromNotes && before.updatedAt === facts.updatedAt
        && before.items.length === facts.items.length && before.items.every((item, i) => item === facts.items[i]))) return cv;
      return { ...cv, [list]: cv[list].map((r) => (r === role ? { ...r, facts } : r)) };
    }
    case "setNote": {
      const list = roleListOf(cv, action.roleId);
      const role = list && cv[list].find((r) => r.id === action.roleId);
      if (!list || !role) return cv;
      const exists = role.notes.some((n) => n.id === action.note.id);
      let kept = role.notes;
      const sameKind = kept.filter((n) => (n.jobId === undefined) === (action.note.jobId === undefined));
      const limit = action.note.jobId === undefined ? MAX_NOTES : MAX_JOB_NOTES;
      if (!exists && sameKind.length >= limit) {
        // Full: the oldest notes of the same kind make room for the new answer.
        const oldestFirst = [...sameKind].sort((a, b) => (a.askedAt < b.askedAt ? -1 : a.askedAt > b.askedAt ? 1 : 0));
        const drop = new Set(oldestFirst.slice(0, sameKind.length - limit + 1));
        kept = kept.filter((n) => !drop.has(n));
      }
      const notes = exists ? kept.map((n) => (n.id === action.note.id ? action.note : n)) : [...kept, action.note];
      return { ...cv, [list]: cv[list].map((r) => (r === role ? { ...r, notes } : r)) };
    }
    case "setCurrent": {
      const items = cv[action.list];
      const item = items.find((r) => r.id === action.itemId);
      if (!item || (item.current === action.current && !action.current)) return cv;
      const endDate = action.current ? "" : item.endDate;
      if (item.current === action.current && item.endDate === endDate) return cv;
      return { ...cv, [action.list]: items.map((r) => (r === item ? { ...r, current: action.current, endDate } : r)) };
    }
    case "addSkills":
      return action.skills.reduce((next, s) => addSkill(next, s.group, s.name, s.id), cv);
    case "removeSkills": {
      const gone = new Set(action.ids);
      if (!SKILL_GROUPS.some((g) => cv[g].some((s) => gone.has(s.id)))) return cv;
      return SKILL_GROUPS.reduce((next, g) => ({ ...next, [g]: next[g].filter((s) => !gone.has(s.id)) }), cv);
    }
    case "markEnriched":
      return cv.enrichedAt ? cv : { ...cv, enrichedAt: action.at };
    case "addAchievements": {
      const room = MAX_ACHIEVEMENTS - cv.achievements.length;
      if (!action.texts.length || room <= 0) return cv;
      return { ...cv, achievements: [...cv.achievements, ...action.texts.slice(0, room).map((text) => ({ id: newId(), text }))] };
    }
    case "clearCopiedDescriptions": {
      const lists = ROLE_LISTS.filter((l) => cv[l].some(isCopiedDescription));
      if (!lists.length) return cv;
      return lists.reduce((next, l) => ({ ...next, [l]: next[l].map((r) => (isCopiedDescription(r) ? { ...r, description: "" } : r)) }), cv);
    }
  }
}

import {
  MAX_ACHIEVEMENTS,
  MAX_BULLETS,
  MAX_ITEMS,
  MAX_NOTES,
  MAX_TITLES,
  SKILL_GROUPS,
  isSectionEmpty,
  newId,
  normalizeLayout,
  type CvContent,
  type Note,
  type SectionKey,
  type SkillGroup,
} from "@resumora/shared";
import {
  emptyItem,
  getBullets,
  getItems,
  withBullets,
  withItems,
  type BulletOwner,
  type ListKey,
} from "./lists.ts";

export type { BulletOwner, ListKey } from "./lists.ts";

type Basics = CvContent["basics"];

export type CvAction =
  | { type: "setBasics"; field: keyof Basics; value: string }
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
  | { type: "setNote"; roleId: string; note: Note }
  | { type: "applyProposals"; roleId: string; accepted: { replaces: string | null; text: string }[] }
  | { type: "setCurrent"; list: "experience" | "volunteering"; itemId: string; current: boolean };

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

function addSkill(cv: CvContent, group: SkillGroup, raw: string): CvContent {
  const name = raw.trim();
  if (name === "" || cv[group].length >= MAX_ITEMS) return cv;
  const lower = name.toLowerCase();
  const exists = SKILL_GROUPS.some((g) => cv[g].some((s) => s.name.trim().toLowerCase() === lower));
  if (exists) return cv;
  return { ...cv, [group]: [...cv[group], { id: newId(), name }] };
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

/**
 * Accepted AI proposals for one role, as one change (one undo step). A proposal whose bullet
 * is gone is skipped; new bullets are appended while there is room.
 */
function applyProposals(cv: CvContent, action: Extract<CvAction, { type: "applyProposals" }>): CvContent {
  const owner = { list: "experience", itemId: action.roleId } as const;
  const bullets = getBullets(cv, owner);
  if (!bullets) return cv;
  const replace = new Map<string, string>();
  for (const p of action.accepted) if (p.replaces !== null) replace.set(p.replaces, p.text);
  let changed = false;
  const next = bullets.map((b) => {
    const text = replace.get(b.id);
    if (text === undefined || text === b.text) return b;
    changed = true;
    return { ...b, text };
  });
  for (const p of action.accepted) {
    if (p.replaces !== null || next.length >= MAX_BULLETS) continue;
    next.push({ id: newId(), text: p.text });
    changed = true;
  }
  return changed ? withBullets(cv, owner, next) : cv;
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
    case "setNote": {
      const role = cv.experience.find((r) => r.id === action.roleId);
      if (!role) return cv;
      const exists = role.notes.some((n) => n.id === action.note.id);
      let kept = role.notes;
      if (!exists && kept.length >= MAX_NOTES) {
        // Full: the newest answers win, so the oldest notes make room (as when notes are carried over).
        const oldestFirst = [...kept].sort((a, b) => (a.askedAt < b.askedAt ? -1 : a.askedAt > b.askedAt ? 1 : 0));
        const drop = new Set(oldestFirst.slice(0, kept.length - MAX_NOTES + 1));
        kept = kept.filter((n) => !drop.has(n));
      }
      const notes = exists ? kept.map((n) => (n.id === action.note.id ? action.note : n)) : [...kept, action.note];
      return { ...cv, experience: cv.experience.map((r) => (r === role ? { ...r, notes } : r)) };
    }
    case "applyProposals":
      return applyProposals(cv, action);
    case "setCurrent": {
      const items = cv[action.list];
      const item = items.find((r) => r.id === action.itemId);
      if (!item || (item.current === action.current && !action.current)) return cv;
      const endDate = action.current ? "" : item.endDate;
      if (item.current === action.current && item.endDate === endDate) return cv;
      return { ...cv, [action.list]: items.map((r) => (r === item ? { ...r, current: action.current, endDate } : r)) };
    }
  }
}

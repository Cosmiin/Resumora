import { useState } from "react";
import { X } from "lucide-react";
import {
  importedFact,
  isSkillCandidate,
  importSkillChoice,
  pendingImportSkills,
  chooseImportSkill,
  type ImportSkillChoice,
} from "@resumora/contracts/editor/import";
import type { BaseDraft, Fact } from "../base/model";
import { SkillTagRows } from "./SkillTagRows";
import { Button, useCopy } from "./ui";
export function ImportSkills({
  draft,
  change,
  disabled,
}: {
  draft: BaseDraft;
  change: (d: BaseDraft) => void;
  disabled: boolean;
}) {
  const t = useCopy(),
    [active, setActive] = useState<string>(),
    [undo, setUndo] = useState<{
      id: string;
      category: ImportSkillChoice | "review";
      field?: Fact<string>;
    }>();
  const items =
    draft.importReview?.extraction.candidates.filter(isSkillCandidate) ?? [];
  if (!items.length) return null;
  const categories = [
    {
      key: "technicalSkills" as const,
      label: t("Competențe tehnice", "Technical skills"),
    },
    {
      key: "professionalSkills" as const,
      label: t("Competențe profesionale", "Professional skills"),
    },
  ];
  const excluded = items.filter((c) => importSkillChoice(draft, c) === "omit");
  const unresolved = pendingImportSkills(draft);
  const selected = items.find((c) => c.id === active);
  const label = (id: string) => {
    const c = items.find((c) => c.id === id)!;
    return String(importedFact(draft, c)?.value ?? c.value);
  };
  function choose(id: string, category: ImportSkillChoice | "review") {
    setActive(undefined);
    change(chooseImportSkill(draft, id, category));
    if (category !== "omit")
      requestAnimationFrame(() =>
        document
          .getElementById(`skill-${draft.importReview!.id}-${id}`)
          ?.focus(),
      );
  }
  return (
    <section
      className="import-skills stack"
      aria-label={t("Clasificarea competențelor", "Skill classification")}
    >
      <header>
        <h3>{t("Competențe", "Skills")}</h3>
        <p className="small muted">
          {t(
            "Apasă o etichetă pentru a o muta. × o elimină din acest import.",
            "Click a tag to move it. × removes it from this import.",
          )}
        </p>
      </header>
      {unresolved.length > 0 && (
        <section
          className="import-skill-unclassified stack"
          aria-label={t("Alege categoria", "Choose a category")}
        >
          <h4>
            {t("Competențe de clasificat", "Skills to categorise")} (
            {unresolved.length})
          </h4>
          <p className="small">
            {t(
              "Aceste competențe sunt păstrate. Alege o categorie sau elimină-le explicit înainte de confirmare.",
              "These skills are retained. Choose a category or explicitly remove them before confirming.",
            )}
          </p>
          {unresolved.length > 1 && (
            <Button
              disabled={disabled}
              onClick={() =>
                change(
                  unresolved.reduce(
                    (next, c) =>
                      chooseImportSkill(next, c.id, "professionalSkills"),
                    draft,
                  ),
                )
              }
            >
              {t(
                "Păstrează toate ca profesionale",
                "Keep all as professional skills",
              )}
            </Button>
          )}
          {unresolved.map((c) => (
            <div className="skill-unclassified-row" key={c.id}>
              <strong>{c.value}</strong>
              <div className="actions">
                {categories.map((category) => (
                  <Button
                    key={category.key}
                    disabled={disabled}
                    aria-label={`${category.label}: ${c.value}`}
                    onClick={() => choose(c.id, category.key)}
                  >
                    {category.label}
                  </Button>
                ))}
                <Button
                  variant="ghost"
                  disabled={disabled}
                  aria-label={`${t("Elimină", "Remove")}: ${c.value}`}
                  onClick={() => {
                    setUndo({ id: c.id, category: "review" });
                    choose(c.id, "omit");
                  }}
                >
                  {t("Elimină", "Remove")}
                </Button>
              </div>
            </div>
          ))}
        </section>
      )}
      <div className="import-skill-groups">
        {categories.map((category) => {
          const rows = items.filter(
            (c) => importSkillChoice(draft, c) === category.key,
          );
          return (
            <section
              className="import-skill-category"
              key={category.key}
              aria-label={category.label}
            >
              <h4>
                {category.label}{" "}
                <span className="small muted">({rows.length})</span>
              </h4>
              <SkillTagRows
                items={rows.map((c) => ({ id: c.id, label: label(c.id) }))}
                render={(id) => (
                  <>
                    <button
                      type="button"
                      id={`skill-${draft.importReview!.id}-${id}`}
                      className="skill-tag-label"
                      title={label(id)}
                      disabled={disabled}
                      aria-label={`${t("Mută", "Move")}: ${label(id)}`}
                      aria-expanded={active === id}
                      onClick={() => setActive(active === id ? undefined : id)}
                    >
                      {label(id)}
                    </button>
                    <button
                      type="button"
                      className="skill-tag-remove"
                      disabled={disabled}
                      aria-label={`${t("Elimină", "Remove")}: ${label(id)}`}
                      onClick={() => {
                        setUndo({
                          id,
                          field: structuredClone(
                            importedFact(
                              draft,
                              items.find((c) => c.id === id)!,
                            ),
                          ) as Fact<string> | undefined,
                          category: importSkillChoice(
                            draft,
                            items.find((c) => c.id === id)!,
                          ),
                        });
                        choose(id, "omit");
                      }}
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </>
                )}
              />
              {!rows.length && (
                <p className="small muted">
                  {t(
                    "Nu sunt competențe în această categorie.",
                    "No skills in this category.",
                  )}
                </p>
              )}
            </section>
          );
        })}
      </div>
      {selected && (
        <div
          className="skill-tag-actions"
          role="group"
          aria-label={`${t("Acțiuni", "Actions")}: ${label(selected.id)}`}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setActive(undefined);
              document
                .getElementById(
                  `skill-${draft.importReview!.id}-${selected.id}`,
                )
                ?.focus();
            }
          }}
        >
          <strong>{label(selected.id)}</strong>
          {categories
            .filter((c) => c.key !== importSkillChoice(draft, selected))
            .map((c) => (
              <Button
                disabled={disabled}
                key={c.key}
                onClick={() => choose(selected.id, c.key)}
              >
                {t("Mută la ", "Move to ") + c.label.toLocaleLowerCase()}
              </Button>
            ))}
          <Button variant="ghost" onClick={() => setActive(undefined)}>
            {t("Închide", "Close")}
          </Button>
        </div>
      )}
      {undo && (
        <p className="small" role="status">
          {t(
            `„${label(undo.id)}” a fost eliminată.`,
            `“${label(undo.id)}” removed.`,
          )}{" "}
          <Button
            variant="ghost"
            disabled={disabled}
            onClick={() => {
              let next = chooseImportSkill(draft, undo.id, undo.category);
              if (
                undo.field &&
                undo.category !== "omit" &&
                undo.category !== "review"
              ) {
                const candidate = items.find((c) => c.id === undo.id)!;
                const restored = importedFact(next, candidate);
                next[undo.category] = next[undo.category].map((f) =>
                  f.fieldId === restored?.fieldId
                    ? structuredClone(undo.field!)
                    : f,
                );
              }
              change(next);
              setActive(undefined);
              setUndo(undefined);
            }}
          >
            {t("Anulează eliminarea", "Undo removal")}
          </Button>
        </p>
      )}
      {excluded.length > 0 && (
        <details className="import-skill-excluded">
          <summary>
            {t(
              `${excluded.length} excluse · Verifică`,
              `${excluded.length} excluded · Review`,
            )}
          </summary>
          <div className="stack">
            {excluded.map((c) => (
              <div key={c.id} className="skill-excluded-row">
                <span>{c.value}</span>
                {categories.map((category) => (
                  <Button
                    key={category.key}
                    variant="ghost"
                    disabled={disabled}
                    onClick={() => choose(c.id, category.key)}
                  >
                    {t("Restabilește la ", "Restore to ") +
                      category.label.toLocaleLowerCase()}
                  </Button>
                ))}
              </div>
            ))}
          </div>
        </details>
      )}
      <p className="small muted">
        {t(
          "Propunerea se aplică după confirmare. Competențele deja salvate în profil se păstrează.",
          "Applies after confirmation. Skills already saved in your Profile are kept.",
        )}
      </p>
    </section>
  );
}

"use client";

import { ArrowRight } from "lucide-react";
import { WeekNote } from "@/components/community-panel";
import type { CommunityBoard } from "@/lib/community";
import type { Recipe } from "@/lib/recipe-types";
import type { WeekPlan } from "@/lib/planner";
import { MEAL_SIDES } from "@/lib/meals";

type SideOption = { sideId: string; name: string; suggested?: boolean };

type Props = {
  day: WeekPlan["days"][number];
  board: CommunityBoard | null;
  plateSrc: (recipe: Recipe, board: CommunityBoard | null) => string;
  keepImage: (event: { currentTarget: HTMLImageElement }) => void;
  locked: boolean;
  sideChoices: SideOption[];
  onOpen: (recipe: Recipe) => void;
  onRandomise: () => void;
  onChangeSide: (sideId: string) => void;
  onPickDinner: (classicId: string, regionId: string) => void;
  onToggleLock: () => void;
};

export function WeekDayPlate({
  day,
  board,
  plateSrc,
  keepImage,
  locked,
  sideChoices,
  onOpen,
  onRandomise,
  onChangeSide,
  onPickDinner,
  onToggleLock,
}: Props) {
  const recipe = day.recipe;
  const sideLabel = recipe?.kind === "meal"
    ? MEAL_SIDES.find((item) => item.id === recipe.sideId)?.name
      || recipe.components?.side
      || null
    : null;
  const vegLabel = recipe?.kind === "meal" && recipe.components?.vegetables
    ? recipe.components.vegetables
    : null;

  return (
    <article className={`week-day plate-card ${locked ? "plate-locked" : ""}`}>
      <div className="plate-card-top">
        <h3>Day {day.day}</h3>
        <button
          type="button"
          className={`text-button plate-lock ${locked ? "is-locked" : ""}`}
          aria-pressed={locked}
          onClick={onToggleLock}
        >
          {locked ? "Locked" : "Lock"}
        </button>
      </div>
      {recipe ? (
        <>
          <WeekNote recipe={recipe} board={board} />
          <img className="week-plate" src={plateSrc(recipe, null)} alt="" onError={keepImage} />
          <div className="plate-main-block">
            <p className="plate-label">Main</p>
            <p><strong>{recipe.title}</strong></p>
            {sideLabel && (
              <div className="plate-side-block">
                <p className="plate-label">Side</p>
                <p className="subtle-small">
                  {sideLabel}{vegLabel ? ` with ${vegLabel}` : ""}.
                </p>
              </div>
            )}
          </div>
          <p>
            {recipe.sourceLabel}.{" "}
            {recipe.allergens.length
              ? `Lists ${recipe.allergens.join(", ")}.`
              : "No allergen is listed on this template."}{" "}
            Check the packet. No shelf price is on file.
          </p>
          <div className="week-day-actions">
            <button className="text-button" type="button" onClick={() => onOpen(recipe)}>
              Open recipe <ArrowRight size={14} />
            </button>
            <button className="text-button" type="button" disabled={locked} onClick={onRandomise}>
              Randomise dinner
            </button>
          </div>
          {recipe.kind === "meal" && sideChoices.length > 0 && (
            <div className="week-options plate-side-options" role="group" aria-label={`Change side for day ${day.day}`}>
              <span>Change side</span>
              {sideChoices.map((option) => (
                <button
                  key={option.sideId}
                  type="button"
                  disabled={locked}
                  className={option.suggested ? "suggested-side" : undefined}
                  onClick={() => onChangeSide(option.sideId)}
                  title={option.suggested ? "Suggested for this region" : undefined}
                >
                  {option.name}
                </button>
              ))}
            </div>
          )}
          {recipe.kind === "meal" && sideChoices.length === 0 && (
            <p className="subtle-small plate-side-empty" role="status">
              No other side matches your allergens and dislikes for this dinner. The main stays as it is.
            </p>
          )}
          {day.options.length > 0 && (
            <div className="week-options" role="group" aria-label={`Swap dinner for day ${day.day}`}>
              <span>Swap dinner</span>
              {day.options.map((option) => (
                <button
                  key={`${option.classicId}:${option.regionId}`}
                  type="button"
                  disabled={locked}
                  onClick={() => onPickDinner(option.classicId, option.regionId)}
                >
                  {option.title}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <p>{day.reason}</p>
      )}
    </article>
  );
}

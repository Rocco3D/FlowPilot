import { FlowPilotError } from "./errors.js";
import type { ProjectInfo } from "./schemas.js";

/**
 * The one project `ref` names: its id, or its exact name (case aside). A partial name never matches, and a name two
 * projects share is refused with their ids, so a destructive action cannot hit the wrong project.
 */
export function pickProject(projects: ProjectInfo[], ref: string): ProjectInfo {
  const wanted = ref.trim();
  const byId = projects.find((p) => p.id === wanted);
  if (byId) return byId;
  const byName = projects.filter((p) => p.name.trim().toLowerCase() === wanted.toLowerCase());
  if (byName.length === 1) return byName[0]!;
  if (byName.length > 1) {
    throw new FlowPilotError("project_ambiguous", "core.projects.ambiguous", {
      name: wanted,
      ids: byName.map((p) => p.id).join(", "),
    });
  }
  throw new FlowPilotError("project_not_found", "flow.nav.projectNotFound", { project: wanted });
}

import type { Project } from './opportunity-types';

/** Local filtering is instant and never hides why a project matched. */
export function filterProjects(
  projects: readonly Project[],
  query: string,
  contributorsOnly: boolean,
): Project[] {
  const needle = query.trim().toLowerCase();
  return projects.filter((project) => {
    if (contributorsOnly && !project.lookingForContributors) return false;
    if (needle.length === 0) return true;
    const searchable = [project.name, project.tagline, project.description, ...project.tech]
      .join(' ')
      .toLowerCase();
    return searchable.includes(needle);
  });
}

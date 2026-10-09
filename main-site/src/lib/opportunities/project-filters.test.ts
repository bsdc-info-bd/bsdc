import { describe, expect, it } from 'vitest';
import { filterProjects } from './project-filters';
import type { Project } from './opportunity-types';

const projects: Project[] = [
  {
    id: '1',
    slug: 'padma-monitor',
    name: 'Padma Monitor',
    tagline: 'Open river-level readings.',
    description: 'A small Rust device measures the river and publishes readings.',
    repoUrl: 'https://github.com/bsdc-info-bd/padma-monitor',
    demoUrl: '',
    coverUrl: '',
    tech: ['Rust', 'Postgres'],
    license: 'Apache-2.0',
    lookingForContributors: true,
    ownerUid: 'owner-1',
    stars: 8,
    starred: false,
    createdAt: '2026-10-09T00:00:00Z',
    updatedAt: '2026-10-09T00:00:00Z',
  },
  {
    id: '2',
    slug: 'dhaka-weather',
    name: 'Dhaka Weather',
    tagline: 'A local forecast.',
    description: 'Weather for the city.',
    repoUrl: '',
    demoUrl: '',
    coverUrl: '',
    tech: ['TypeScript'],
    license: 'MIT',
    lookingForContributors: false,
    ownerUid: 'owner-2',
    stars: 3,
    starred: false,
    createdAt: '2026-10-08T00:00:00Z',
    updatedAt: '2026-10-08T00:00:00Z',
  },
];

describe('project directory filters', () => {
  it('searches the project name, description and stack case-insensitively', () => {
    expect(filterProjects(projects, 'POSTGRES', false).map((project) => project.slug)).toEqual([
      'padma-monitor',
    ]);
    expect(filterProjects(projects, 'forecast', false).map((project) => project.slug)).toEqual([
      'dhaka-weather',
    ]);
  });

  it('can narrow the directory to projects seeking contributors', () => {
    expect(filterProjects(projects, '', true).map((project) => project.slug)).toEqual([
      'padma-monitor',
    ]);
  });

  it('does not hide projects for a blank search', () => {
    expect(filterProjects(projects, '   ', false)).toHaveLength(2);
  });
});

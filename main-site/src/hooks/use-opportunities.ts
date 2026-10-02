import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  EMPTY_JOB_FILTERS,
  filterJobs,
  skillFacets,
  type Gig,
  type JobFilters,
  type JobListing,
  type Project,
  type Sketch,
  type SketchLanguage,
} from '@/lib/opportunities/opportunity-types';
import { useAuthStore } from '@/store/auth-store';

const repository = () => import('@/lib/opportunities/opportunity-repository');

export interface JobBoardResult {
  jobs: JobListing[];
  facets: string[];
  filters: JobFilters;
  setFilters: (next: JobFilters) => void;
  isLoading: boolean;
  isError: boolean;
  apply: (jobId: string, coverLetter: string) => Promise<void>;
  isApplying: boolean;
}

/**
 * The job board. Work mode and skill are pushed down to Postgres; free text
 * and level are narrowed in the browser so typing stays instant.
 */
export function useJobBoard(): JobBoardResult {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<JobFilters>(EMPTY_JOB_FILTERS);

  const query = useQuery({
    queryKey: ['job-board', uid, filters.workMode, filters.skill],
    queryFn: async () => (await repository()).fetchJobBoard(filters.workMode, filters.skill),
    staleTime: 60_000,
  });

  const all = useMemo(() => query.data ?? [], [query.data]);
  const jobs = useMemo(() => filterJobs(all, filters), [all, filters]);
  const facets = useMemo(() => skillFacets(all), [all]);

  const mutation = useMutation({
    mutationFn: async ({ jobId, coverLetter }: { jobId: string; coverLetter: string }) =>
      (await repository()).applyToJob(jobId, coverLetter),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['job-board'] });
    },
  });

  return {
    jobs,
    facets,
    filters,
    setFilters,
    isLoading: query.isLoading,
    isError: query.isError,
    apply: async (jobId, coverLetter) => {
      await mutation.mutateAsync({ jobId, coverLetter });
    },
    isApplying: mutation.isPending,
  };
}

export interface GigBoardResult {
  gigs: Gig[];
  isLoading: boolean;
  isError: boolean;
  propose: (gigId: string, pitch: string, bid: number, days: number) => Promise<void>;
  isProposing: boolean;
}

export function useGigBoard(): GigBoardResult {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['gig-board'],
    queryFn: async () => (await repository()).fetchGigs(),
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: async (input: { gigId: string; pitch: string; bid: number; days: number }) =>
      (await repository()).submitProposal(input.gigId, input.pitch, input.bid, input.days),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['gig-board'] });
    },
  });

  return {
    gigs: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    propose: async (gigId, pitch, bid, days) => {
      await mutation.mutateAsync({ gigId, pitch, bid, days });
    },
    isProposing: mutation.isPending,
  };
}

export interface ProjectShowcaseResult {
  projects: Project[];
  isLoading: boolean;
  isError: boolean;
  star: (projectId: string) => void;
}

export function useProjects(): ProjectShowcaseResult {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const queryClient = useQueryClient();
  const queryKey = ['projects', uid];

  const query = useQuery({
    queryKey,
    queryFn: async () => (await repository()).fetchProjects(uid),
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: async (projectId: string) => (await repository()).toggleProjectStar(projectId),
    onMutate: (projectId) => {
      const previous = queryClient.getQueryData<Project[]>(queryKey);
      queryClient.setQueryData<Project[]>(queryKey, (current = []) =>
        current.map((project) =>
          project.id === projectId
            ? {
                ...project,
                starred: !project.starred,
                stars: project.starred ? Math.max(project.stars - 1, 0) : project.stars + 1,
              }
            : project,
        ),
      );
      return { previous };
    },
    onError: (_error, _projectId, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    projects: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    star: (projectId) => {
      mutation.mutate(projectId);
    },
  };
}

export interface PlaygroundResult {
  sketches: Sketch[];
  isLoading: boolean;
  save: (sketch: {
    id?: string;
    title: string;
    language: SketchLanguage;
    code: string;
  }) => Promise<Sketch>;
  remove: (id: string) => Promise<void>;
  isSaving: boolean;
}

export function usePlayground(): PlaygroundResult {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const queryClient = useQueryClient();
  const queryKey = ['sketches', uid];

  const query = useQuery({
    queryKey,
    queryFn: async () => (await repository()).fetchSketches(uid ?? ''),
    enabled: uid !== null,
    staleTime: 60_000,
  });

  const saveMutation = useMutation({
    mutationFn: async (sketch: {
      id?: string;
      title: string;
      language: SketchLanguage;
      code: string;
    }) => (await repository()).saveSketch(uid ?? '', sketch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => (await repository()).deleteSketch(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    sketches: query.data ?? [],
    isLoading: query.isLoading,
    save: (sketch) => saveMutation.mutateAsync(sketch),
    remove: async (id) => {
      await deleteMutation.mutateAsync(id);
    },
    isSaving: saveMutation.isPending,
  };
}

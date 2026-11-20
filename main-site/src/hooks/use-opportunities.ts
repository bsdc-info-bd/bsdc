import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  EMPTY_JOB_FILTERS,
  filterJobs,
  skillFacets,
  type Gig,
  type GigUpdate,
  type JobUpdate,
  type JobDetail,
  type JobFilters,
  type JobListing,
  type Project,
  type ProjectDetail,
  type ProjectSort,
  type Sketch,
  type SketchLanguage,
} from '@/lib/opportunities/opportunity-types';
import { useAuthStore } from '@/store/auth-store';
// Types only: the repository itself is loaded on demand by `repository()`, and a
// type import is erased from the bundle, so this does not pull the module in.
import type {
  ProjectScreenshotDraft,
  ProjectUpdate,
} from '@/lib/opportunities/opportunity-repository';
import type { JobApplicationSubmission } from '@/lib/opportunities/job-application';
import type {
  ApplicationStatus,
  GigProposal,
  JobApplication,
  MyJobApplication,
  ProposalStatus,
} from '@/lib/opportunities/opportunity-types';

const repository = () => import('@/lib/opportunities/opportunity-repository');

export interface JobBoardResult {
  jobs: JobListing[];
  facets: string[];
  filters: JobFilters;
  setFilters: (next: JobFilters) => void;
  isLoading: boolean;
  isError: boolean;
  apply: (jobId: string, application: JobApplicationSubmission) => Promise<void>;
  isApplying: boolean;
  refetch: () => Promise<void>;
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
  const applicationMutation = useMutation({
    mutationFn: async ({
      jobId,
      application,
    }: {
      jobId: string;
      application: JobApplicationSubmission;
    }) => (await repository()).applyToJob(jobId, application, uid ?? ''),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['job-board'] });
      void queryClient.invalidateQueries({ queryKey: ['job-detail'] });
      void queryClient.invalidateQueries({ queryKey: ['my-job-applications'] });
    },
  });

  return {
    jobs,
    facets,
    filters,
    setFilters,
    isLoading: query.isLoading,
    isError: query.isError,
    apply: async (jobId, application) => {
      await applicationMutation.mutateAsync({ jobId, application });
    },
    isApplying: applicationMutation.isPending,
    refetch: async () => {
      await query.refetch();
    },
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
  sort: ProjectSort;
  setSort: (sort: ProjectSort) => void;
  isLoading: boolean;
  isError: boolean;
  star: (projectId: string) => void;
}

export function useProjects(): ProjectShowcaseResult {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const queryClient = useQueryClient();
  const [sort, setSort] = useState<ProjectSort>('popular');
  const queryKey = ['projects', uid, sort];

  const query = useQuery({
    queryKey,
    queryFn: async () => (await repository()).fetchProjects(uid, 40, sort),
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
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  return {
    projects: query.data ?? [],
    sort,
    setSort,
    isLoading: query.isLoading,
    isError: query.isError,
    star: (projectId) => {
      mutation.mutate(projectId);
    },
  };
}

export interface ProjectDetailResult {
  project: ProjectDetail | null;
  isLoading: boolean;
  isError: boolean;
  star: () => void;
  isStarring: boolean;
  /** Re-reads the project. Used after a write the database refused. */
  refetch: () => void;
}

/** Loads a project directly by slug; details do not depend on the list's 40-row window. */
export function useProject(slug: string): ProjectDetailResult {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const queryClient = useQueryClient();
  const queryKey = ['project', slug, uid];

  const query = useQuery({
    queryKey,
    queryFn: async () => (await repository()).fetchProjectBySlug(slug, uid),
    enabled: slug.length > 0,
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: async (projectId: string) => (await repository()).toggleProjectStar(projectId),
    onMutate: (projectId) => {
      const previous = queryClient.getQueryData<ProjectDetail | null>(queryKey);
      queryClient.setQueryData<ProjectDetail | null>(queryKey, (current) =>
        current && current.id === projectId
          ? {
              ...current,
              starred: !current.starred,
              stars: current.starred ? Math.max(current.stars - 1, 0) : current.stars + 1,
            }
          : current,
      );
      return { previous };
    },
    onError: (_error, _projectId, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  return {
    project: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    star: () => {
      if (query.data) mutation.mutate(query.data.id);
    },
    isStarring: mutation.isPending,
    refetch: () => {
      void query.refetch();
    },
  };
}

export interface MyProjectsResult {
  projects: Project[];
  isLoading: boolean;
  isError: boolean;
}

/**
 * The projects one member owns.
 *
 * Separate from the directory query on purpose: the directory is sorted by
 * stars, capped at forty rows and shared with every visitor, so an author with a
 * modest project would not find their own work there. This one is keyed by uid
 * and reads only their rows.
 */
export function useMyProjects(): MyProjectsResult {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const queryKey = ['my-projects', uid];

  const query = useQuery({
    queryKey,
    queryFn: async () => (await repository()).fetchMyProjects(uid ?? ''),
    enabled: uid !== null && uid.length > 0,
    staleTime: 30_000,
  });

  return {
    projects: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

export interface ProjectOwnerActions {
  /** Corrects the project and writes its gallery. Resolves with the slug. */
  save: (
    projectId: string,
    draft: ProjectUpdate,
    screenshots: readonly ProjectScreenshotDraft[],
  ) => Promise<string>;
  /** Takes the project down. The gallery and the stars cascade with it. */
  remove: (projectId: string) => Promise<void>;
  isSaving: boolean;
  isRemoving: boolean;
}

/**
 * What an owner can do to a project after publishing it.
 *
 * Both writes invalidate every cache that could hold the old values — the
 * project itself, the directory, the owner's own list and search — because a
 * corrected project that still reads wrong on the page it was corrected from is
 * indistinguishable, to the author, from a save that failed.
 */
export function useProjectOwnerActions(): ProjectOwnerActions {
  const queryClient = useQueryClient();

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['project'] });
    void queryClient.invalidateQueries({ queryKey: ['projects'] });
    void queryClient.invalidateQueries({ queryKey: ['my-projects'] });
    void queryClient.invalidateQueries({ queryKey: ['search'] });
  };

  const save = useMutation({
    mutationFn: async ({
      projectId,
      draft,
      screenshots,
    }: {
      projectId: string;
      draft: ProjectUpdate;
      screenshots: readonly ProjectScreenshotDraft[];
    }) => {
      const { updateProject, replaceProjectScreenshots } = await repository();
      // The row first, then the gallery: a gallery written against a project
      // whose correction failed would leave the two disagreeing, and the
      // correction is the part the author pressed save for.
      const slug = await updateProject(projectId, draft);
      await replaceProjectScreenshots(projectId, screenshots);
      return slug;
    },
    onSuccess: invalidateAll,
    onError: invalidateAll,
  });

  const remove = useMutation({
    mutationFn: async (projectId: string) => {
      const { deleteProject } = await repository();
      await deleteProject(projectId);
    },
    onSuccess: invalidateAll,
    onError: invalidateAll,
  });

  return {
    save: (projectId, draft, screenshots) => save.mutateAsync({ projectId, draft, screenshots }),
    remove: (projectId) => remove.mutateAsync(projectId),
    isSaving: save.isPending,
    isRemoving: remove.isPending,
  };
}

export interface GigOwnerActions {
  /** Corrects the gig and returns the address it now lives at. */
  save: (gigId: string, draft: GigUpdate) => Promise<string>;
  close: (gigId: string) => Promise<void>;
  remove: (gigId: string, confirmBids: boolean) => Promise<void>;
  isSaving: boolean;
  isClosing: boolean;
  isRemoving: boolean;
}

/**
 * What the client of a gig may do to it (migration 0128).
 *
 * Every call re-checks ownership on the server, so this hook is a convenience
 * and not a permission: offering the buttons to the wrong person would produce
 * a refusal, never a write.
 */
export function useGigOwnerActions(): GigOwnerActions {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['gig-detail'] });
    void queryClient.invalidateQueries({ queryKey: ['gig-board'] });
    void queryClient.invalidateQueries({ queryKey: ['my-gigs'] });
    void queryClient.invalidateQueries({ queryKey: ['search'] });
  };

  const save = useMutation({
    mutationFn: async ({ gigId, draft }: { gigId: string; draft: GigUpdate }) =>
      (await repository()).updateGig(gigId, draft),
    onSuccess: invalidate,
    onError: invalidate,
  });

  const close = useMutation({
    mutationFn: async (gigId: string) => (await repository()).closeGig(gigId),
    onSuccess: invalidate,
    onError: invalidate,
  });

  const remove = useMutation({
    mutationFn: async ({ gigId, confirm }: { gigId: string; confirm: boolean }) =>
      (await repository()).deleteGig(gigId, confirm),
    onSuccess: invalidate,
    onError: invalidate,
  });

  return {
    save: (gigId, draft) => save.mutateAsync({ gigId, draft }),
    close: (gigId) => close.mutateAsync(gigId),
    remove: (gigId, confirmBids) => remove.mutateAsync({ gigId, confirm: confirmBids }),
    isSaving: save.isPending,
    isClosing: close.isPending,
    isRemoving: remove.isPending,
  };
}

export interface JobOwnerActions {
  save: (jobId: string, draft: JobUpdate) => Promise<string>;
  close: (jobId: string) => Promise<void>;
  remove: (jobId: string, confirmApplications: boolean) => Promise<void>;
  isSaving: boolean;
  isClosing: boolean;
  isRemoving: boolean;
}

/** What the poster of a job may do to it. The server re-checks every call. */
export function useJobOwnerActions(): JobOwnerActions {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['job-detail'] });
    void queryClient.invalidateQueries({ queryKey: ['job-board'] });
    void queryClient.invalidateQueries({ queryKey: ['job-applications'] });
    void queryClient.invalidateQueries({ queryKey: ['search'] });
  };

  const save = useMutation({
    mutationFn: async ({ jobId, draft }: { jobId: string; draft: JobUpdate }) =>
      (await repository()).updateJob(jobId, draft),
    onSuccess: invalidate,
    onError: invalidate,
  });

  const close = useMutation({
    mutationFn: async (jobId: string) => (await repository()).closeJob(jobId),
    onSuccess: invalidate,
    onError: invalidate,
  });

  const remove = useMutation({
    mutationFn: async ({ jobId, confirm }: { jobId: string; confirm: boolean }) =>
      (await repository()).deleteJob(jobId, confirm),
    onSuccess: invalidate,
    onError: invalidate,
  });

  return {
    save: (jobId, draft) => save.mutateAsync({ jobId, draft }),
    close: (jobId) => close.mutateAsync(jobId),
    remove: (jobId, confirmApplications) =>
      remove.mutateAsync({ jobId, confirm: confirmApplications }),
    isSaving: save.isPending,
    isClosing: close.isPending,
    isRemoving: remove.isPending,
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

export interface JobDetailResult {
  job: JobDetail | null;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => Promise<void>;
  /** True when the reader may not see this job: closed, expired, or no such slug. */
  isNotFound: boolean;
  apply: (jobId: string, application: JobApplicationSubmission) => Promise<void>;
  isApplying: boolean;
}

/**
 * One job page. Counts a view once per mount, and refreshes the board and the
 * application state after an application is sent.
 */
export function useJobDetail(slug: string): JobDetailResult {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['job-detail', uid, slug],
    queryFn: async () => (await repository()).fetchJobDetail(slug),
    staleTime: 60_000,
  });

  const jobId = query.data?.id ?? null;
  const counted = useRef<string | null>(null);
  useEffect(() => {
    if (jobId === null || counted.current === jobId) return;
    counted.current = jobId;
    // A view that fails to count is not worth an error on the page.
    void repository()
      .then((repo) => repo.recordJobView(jobId))
      .catch(() => undefined);
  }, [jobId]);

  const mutation = useMutation({
    mutationFn: async ({
      jobId: target,
      application,
    }: {
      jobId: string;
      application: JobApplicationSubmission;
    }) => (await repository()).applyToJob(target, application, uid ?? ''),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['job-detail'] });
      void queryClient.invalidateQueries({ queryKey: ['job-board'] });
      void queryClient.invalidateQueries({ queryKey: ['my-job-applications'] });
    },
  });

  return {
    job: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: async () => {
      await query.refetch();
    },
    isNotFound: !query.isLoading && !query.isError && query.data === null,
    apply: async (target, application) => {
      await mutation.mutateAsync({ jobId: target, application });
    },
    isApplying: mutation.isPending,
  };
}

export interface GigProposalsResult {
  proposals: GigProposal[];
  isLoading: boolean;
  isError: boolean;
  /** Move one proposal to a decided status; resolves when the server has written it. */
  decide: (proposalId: string, status: ProposalStatus) => Promise<void>;
  isDeciding: boolean;
  decidingId: string | null;
}

/**
 * The proposal queue for one gig the reader posted.
 *
 * Never fetched for a gig the reader does not own: `gig_proposal_queue()` refuses
 * it on the server, and asking would turn an ordinary page view into a 403.
 */
export function useGigProposals(gigId: string | null, enabled: boolean): GigProposalsResult {
  const queryClient = useQueryClient();
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['gig-proposals', gigId],
    queryFn: async () => (await repository()).fetchGigProposals(gigId ?? ''),
    enabled: enabled && gigId !== null,
    staleTime: 30_000,
  });

  async function decide(proposalId: string, status: ProposalStatus): Promise<void> {
    setDecidingId(proposalId);
    try {
      await (await repository()).decideGigProposal(proposalId, status);
      await queryClient.invalidateQueries({ queryKey: ['gig-proposals', gigId] });
      await queryClient.invalidateQueries({ queryKey: ['gig-detail'] });
    } finally {
      setDecidingId(null);
    }
  }

  return {
    proposals: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    decide,
    isDeciding: decidingId !== null,
    decidingId,
  };
}

export interface GigDetailResult {
  gig: Gig | null;
  /** The signed-in reader's proposal status on this gig, or null. */
  myProposalStatus: string | null;
  isLoading: boolean;
  isError: boolean;
  isNotFound: boolean;
  propose: (pitch: string, bid: number, days: number) => Promise<void>;
  isProposing: boolean;
}

/** One gig in full, and the reader's own proposal on it. */
export function useGigDetail(slug: string): GigDetailResult {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['gig-detail', uid, slug],
    queryFn: async () => (await repository()).fetchGigDetail(slug),
    staleTime: 60_000,
  });

  const gigId = query.data?.id ?? null;
  const mine = useQuery({
    queryKey: ['gig-proposal', uid, gigId],
    queryFn: async () => (await repository()).fetchMyProposalStatus(gigId ?? '', uid ?? ''),
    enabled: gigId !== null && uid !== null,
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: async (input: { gigId: string; pitch: string; bid: number; days: number }) =>
      (await repository()).submitProposal(input.gigId, input.pitch, input.bid, input.days),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['gig-detail'] });
      void queryClient.invalidateQueries({ queryKey: ['gig-proposal'] });
      void queryClient.invalidateQueries({ queryKey: ['gig-board'] });
    },
  });

  return {
    gig: query.data ?? null,
    myProposalStatus: mine.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    isNotFound: !query.isLoading && !query.isError && query.data === null,
    propose: async (pitch, bid, days) => {
      if (gigId === null) throw new Error('no gig loaded');
      await mutation.mutateAsync({ gigId, pitch, bid, days });
    },
    isProposing: mutation.isPending,
  };
}

export interface JobApplicationsResult {
  applications: JobApplication[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  /** Move one application to a decided status; resolves when the server has written it. */
  decide: (applicationId: string, status: ApplicationStatus, reason?: string) => Promise<void>;
  /** Retry an explicit queue read failure. */
  refetch: () => Promise<void>;
  isDeciding: boolean;
  decidingId: string | null;
}

/**
 * The applicant queue for one job the reader posted.
 *
 * Never fetched for a job the reader does not own: `job_application_queue()`
 * refuses it on the server, and asking would turn an ordinary page view into a
 * 403. `decide_application()` re-checks the same rule, so a forged decision is
 * refused rather than trusted.
 */
export function useJobApplications(jobId: string | null, enabled: boolean): JobApplicationsResult {
  const queryClient = useQueryClient();
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['job-applications', jobId],
    queryFn: async () => (await repository()).fetchJobApplications(jobId ?? ''),
    enabled: enabled && jobId !== null,
    staleTime: 30_000,
  });

  async function decide(
    applicationId: string,
    status: ApplicationStatus,
    reason = '',
  ): Promise<void> {
    setDecidingId(applicationId);
    try {
      await (await repository()).decideApplication(applicationId, status, reason);
      await queryClient.invalidateQueries({ queryKey: ['job-applications', jobId] });
      await queryClient.invalidateQueries({ queryKey: ['job-detail'] });
      await queryClient.invalidateQueries({ queryKey: ['my-job-applications'] });
    } finally {
      setDecidingId(null);
    }
  }

  return {
    applications: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    decide,
    refetch: async () => {
      await query.refetch();
    },
    isDeciding: decidingId !== null,
    decidingId,
  };
}

export interface MyJobApplicationsResult {
  applications: MyJobApplication[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => Promise<void>;
}

/** The signed-in member's own application history; the RPC returns no contact fields. */
export function useMyJobApplications(enabled: boolean): MyJobApplicationsResult {
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const query = useQuery({
    queryKey: ['my-job-applications', uid],
    queryFn: async () => (await repository()).fetchMyJobApplications(),
    enabled: enabled && uid !== null,
    staleTime: 30_000,
  });
  return {
    applications: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: async () => {
      await query.refetch();
    },
  };
}

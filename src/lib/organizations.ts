import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  where,
  type DocumentData,
} from 'firebase/firestore';
import { COL, fsDb } from './firestore';
import type { Organization, OrganizationMember, OrganizationMemberRole, OrganizationType } from '@/types/domain';
import type { UserProfile } from '@/types/user';
import { slugify } from './utils';

export interface CreateOrganizationInput {
  name: string;
  type: OrganizationType;
  description: string;
  website: string;
  industry: string;
  size: Organization['size'];
}

function normalizeOrganization(data: DocumentData, id: string): Organization {
  return {
    id,
    name: String(data.name || ''),
    slug: String(data.slug || id),
    type: data.type === 'business' ? 'business' : 'organization',
    description: String(data.description || ''),
    logo: String(data.logo || ''),
    website: String(data.website || ''),
    industry: String(data.industry || ''),
    size: (data.size || 'small') as Organization['size'],
    ownerId: String(data.ownerId || ''),
    memberCount: Number(data.memberCount || 0),
    createdByName: String(data.createdByName || ''),
    createdAt: Number(data.createdAt || 0),
    updatedAt: Number(data.updatedAt || 0),
  };
}

function normalizeMember(data: DocumentData, id: string): OrganizationMember {
  return {
    id,
    organizationId: String(data.organizationId || ''),
    userId: String(data.userId || ''),
    displayName: String(data.displayName || ''),
    username: String(data.username || ''),
    avatar: String(data.avatar || ''),
    role: (data.role || 'member') as OrganizationMemberRole,
    joinedAt: Number(data.joinedAt || 0),
    createdAt: Number(data.createdAt || 0),
    updatedAt: Number(data.updatedAt || 0),
  };
}

export async function createOrganization(input: CreateOrganizationInput, owner: UserProfile): Promise<Organization> {
  const now = Date.now();
  const data = {
    ...input,
    name: input.name.trim(),
    slug: `${slugify(input.name) || 'workspace'}-${owner.uid.slice(0, 6)}`,
    description: input.description.trim(),
    ownerId: owner.uid,
    createdByName: owner.displayName,
    memberCount: 1,
    logo: '',
    createdAt: now,
    updatedAt: now,
  };
  const ref = await addDoc(collection(fsDb(), COL.organizations), data);
  await setDoc(doc(fsDb(), COL.organizationMembers, `${ref.id}_${owner.uid}`), {
    organizationId: ref.id,
    userId: owner.uid,
    displayName: owner.displayName,
    username: owner.username,
    avatar: owner.avatar,
    role: 'owner',
    joinedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  return normalizeOrganization(data, ref.id);
}

export async function listOrganizationsForUser(uid: string): Promise<{ organization: Organization; membership: OrganizationMember }[]> {
  const membershipSnap = await getDocs(query(collection(fsDb(), COL.organizationMembers), where('userId', '==', uid)));
  if (membershipSnap.empty) return [];
  const entries = await Promise.all(membershipSnap.docs.map(async (memberDoc) => {
    const member = normalizeMember(memberDoc.data(), memberDoc.id);
    const organizationSnap = await getDocs(query(collection(fsDb(), COL.organizations), where('__name__', '==', member.organizationId)));
    if (organizationSnap.empty) return null;
    return { organization: normalizeOrganization(organizationSnap.docs[0].data(), organizationSnap.docs[0].id), membership: member };
  }));
  return entries.filter((entry): entry is { organization: Organization; membership: OrganizationMember } => entry !== null);
}
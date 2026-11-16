import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { projects, legalEntities } from '@/drizzle/schema'
import { eq, and, asc } from 'drizzle-orm'
import { TENANT_ID } from '@/lib/constants'
import { getMdmChangeHistory } from '@/lib/mdm-audit'
import { ProjectClient } from './components/ProjectClient'
import type { ProjectRow } from './components/ProjectDrawer'

export const metadata = { title: 'Projects' }

export default async function ProjectsPage() {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')
  if (!['HR_ADMIN', 'HR_DIRECTOR', 'SUPER_ADMIN'].includes(session.user.role)) {
    redirect('/dashboard')
  }

  const [rawProjects, allEntities, auditHistory] = await Promise.all([
    db
      .select({
        id:            projects.id,
        legalEntityId: projects.legalEntityId,
        code:          projects.code,
        nameEn:        projects.nameEn,
        nameAr:        projects.nameAr,
        projectType:   projects.projectType,
        glMappingCode: projects.glMappingCode,
        description:   projects.description,
        startDate:     projects.startDate,
        endDate:       projects.endDate,
        isActive:      projects.isActive,
        entityName:    legalEntities.nameEn,
      })
      .from(projects)
      .leftJoin(legalEntities, eq(projects.legalEntityId, legalEntities.id))
      .where(eq(projects.tenantId, TENANT_ID))
      .orderBy(asc(projects.code)),

    db
      .select({ id: legalEntities.id, nameEn: legalEntities.nameEn })
      .from(legalEntities)
      .where(and(eq(legalEntities.tenantId, TENANT_ID), eq(legalEntities.isActive, true)))
      .orderBy(asc(legalEntities.nameEn)),

    getMdmChangeHistory('projects', 30),
  ])

  const initialData: ProjectRow[] = rawProjects.map(p => ({
    id:            p.id,
    legalEntityId: p.legalEntityId ?? null,
    code:          p.code,
    nameEn:        p.nameEn,
    nameAr:        p.nameAr ?? null,
    projectType:   p.projectType ?? null,
    glMappingCode: p.glMappingCode ?? null,
    description:   p.description ?? null,
    startDate:     p.startDate ?? null,
    endDate:       p.endDate ?? null,
    isActive:      p.isActive,
    entityName:    p.entityName ?? undefined,
  }))

  return (
    <ProjectClient
      initialData={initialData}
      auditHistory={auditHistory}
      legalEntities={allEntities}
    />
  )
}

import { Controller, Get, Inject, Module, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  organization,
  person,
  staffRole,
  userAccount,
  withContext,
  type Database,
} from '@sportgather/db';
import type { MeResponse } from '@sportgather/shared';
import { and, asc, eq, ne } from 'drizzle-orm';
import { AuthGuard, CurrentUser } from '../auth/auth.guard.js';
import type { AuthUser } from '../common/request.js';
import { DB } from '../db/db.module.js';

@ApiTags('me')
@Controller('me')
@UseGuards(AuthGuard)
export class MeController {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Profil + daftar klub tempat orang ini menjadi staf (untuk pemilih klub & redirect). */
  @Get()
  async me(@CurrentUser() user: AuthUser): Promise<MeResponse> {
    return withContext(this.db, { personId: user.personId }, async (tx) => {
      const [u] = await tx
        .select({
          id: userAccount.id,
          personId: person.id,
          fullName: person.fullName,
          phone: userAccount.phone,
          email: userAccount.email,
        })
        .from(userAccount)
        .innerJoin(person, eq(person.id, userAccount.personId))
        .where(eq(userAccount.id, user.userId));
      const clubs = await tx
        .select({
          orgId: organization.id,
          slug: organization.slug,
          name: organization.name,
          role: staffRole.role,
          status: staffRole.status,
        })
        .from(staffRole)
        .innerJoin(organization, eq(organization.id, staffRole.orgId))
        .where(and(eq(staffRole.personId, user.personId), ne(staffRole.status, 'removed')))
        .orderBy(asc(organization.name));
      return { user: u!, clubs };
    });
  }
}

@Module({ controllers: [MeController] })
export class MeModule {}

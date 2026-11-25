import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { AppRequest, AuthUser } from '../common/request.js';
import { SESSION_COOKIE, SessionService } from './session.service.js';

/** Wajib login: membaca cookie sesi (atau header Authorization: Bearer untuk klien non-browser). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AppRequest>();
    const header = req.headers.authorization;
    const token =
      req.cookies?.[SESSION_COOKIE] ??
      (header?.startsWith('Bearer ') ? header.slice(7) : undefined);
    if (!token) throw new UnauthorizedException('Silakan masuk terlebih dahulu');
    const user = await this.sessions.resolve(token);
    if (!user) throw new UnauthorizedException('Sesi berakhir, silakan masuk lagi');
    req.user = user;
    return true;
  }
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const user = ctx.switchToHttp().getRequest<AppRequest>().user;
  if (!user) throw new UnauthorizedException();
  return user;
});

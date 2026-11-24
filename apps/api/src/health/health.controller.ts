import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { formatTanggal } from '@sportgather/shared';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOkResponse({ description: 'API hidup' })
  check(): { status: 'ok'; tanggal: string } {
    return { status: 'ok', tanggal: formatTanggal(new Date()) };
  }
}
